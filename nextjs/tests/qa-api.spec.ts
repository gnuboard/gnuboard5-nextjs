import { expect, request as playwrightRequest, test } from "@playwright/test";

/*
 * 1:1 문의 API 권한 · 저장 규칙 — 실제 사이트의 /api/v1/qas 에 대고 돈다. 시험이 직접 만든 문의만 쓰고 끝에 지운다.
 *
 *   QA_SMOKE_MEMBER_ID / QA_SMOKE_MEMBER_PASSWORD   일반 회원
 *   QA_SMOKE_ADMIN_ID  / QA_SMOKE_ADMIN_PASSWORD    최고관리자
 *   QA_SMOKE_API_URL(선택)                          API 주소. 없으면 PLAYWRIGHT_BASE_URL 의 api/v1/
 *   예: PLAYWRIGHT_BASE_URL=http://localhost QA_SMOKE_MEMBER_ID=… QA_SMOKE_ADMIN_ID=… npm run test:qa-api
 *
 * 지키는 것: 회원은 남(여기서는 관리자)의 문의를 읽기 · 고치기 · 지우기 · 답변할 수 없고, scope=admin 을 붙여도
 * 자기 문의만 받으며, 이전글 · 다음글도 자기 문의만 가리킨다. qa_html 없이 고쳐도 에디터 글의 형식이 남는다.
 * 같은 질문에 답변이 동시에 두 번 와도 답변은 하나다.
 */

const env = process.env;
const accounts = {
  member: { id: env.QA_SMOKE_MEMBER_ID, password: env.QA_SMOKE_MEMBER_PASSWORD },
  admin: { id: env.QA_SMOKE_ADMIN_ID, password: env.QA_SMOKE_ADMIN_PASSWORD },
};
const configured = Boolean(accounts.member.id && accounts.member.password && accounts.admin.id && accounts.admin.password);

function apiUrl(path: string): string {
  const site = (env.PLAYWRIGHT_BASE_URL || env.LOCAL_APP_URL || "").replace(/\/?$/, "/");
  const base = (env.QA_SMOKE_API_URL || new URL("api/v1/", site).href).replace(/\/?$/, "/");
  return new URL(path, base).href;
}

type Json = { success?: boolean; data?: Record<string, unknown> & { qa_id?: number } };

/**
 * 앱처럼 토큰만 보내는 요청. 요청마다 쿠키 없는 새 문맥을 쓴다 — 로그인 응답이 심는 쿠키가 남으면 API 가 쿠키 로그인으로
 * 보고 쓰기 요청에 Origin 을 요구한다(CSRF 방지). 그건 이 시험이 보려는 것이 아니다.
 */
async function call(method: string, path: string, token: string, data?: unknown) {
  const context = await playwrightRequest.newContext();
  try {
    const response = await context.fetch(apiUrl(path), {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = (await response.json().catch(() => ({}))) as Json;
    return { status: response.status(), body };
  } finally {
    await context.dispose();
  }
}

async function login(account: { id?: string; password?: string }): Promise<string> {
  const { body } = await call("POST", "auth/login", "", { mb_id: account.id, mb_password: account.password });
  const data = body.data as { token?: string; access_token?: string } | undefined;
  const token = data?.token || data?.access_token || "";
  expect(token, `login ${account.id}`).not.toBe("");
  return token;
}

test.describe("qa api permissions", () => {
  test.skip(!configured, "QA_SMOKE_MEMBER_* · QA_SMOKE_ADMIN_* 계정을 주면 돈다");

  test("members cannot touch others' questions; formats and answers stay consistent", async () => {
    const member = await login(accounts.member);
    const admin = await login(accounts.admin);
    const created: number[] = [];
    const config = await call("GET", "qas/config", member);
    const category = ((config.body.data?.categories as string[] | undefined) ?? [])[0] ?? "";

    try {
      const adminQuestion = await call("POST", "qas", admin, { qa_category: category, qa_subject: "qa-api-spec admin", qa_content: "admin" });
      expect(adminQuestion.status).toBe(201);
      const adminId = adminQuestion.body.data!.qa_id!;
      created.push(adminId);

      const html = "<p>에디터 <strong>굵게</strong></p>";
      const memberQuestion = await call("POST", "qas", member, { qa_category: category, qa_subject: "qa-api-spec member", qa_content: html, qa_html: 1 });
      expect(memberQuestion.status).toBe(201);
      const memberId = memberQuestion.body.data!.qa_id!;
      created.push(memberId);

      // 남의 문의: 읽기 · 고치기 · 지우기 · 답변
      expect((await call("GET", `qas/${adminId}`, member)).status).toBe(404);
      expect([403, 404]).toContain((await call("PATCH", `qas/${adminId}`, member, { qa_category: category, qa_subject: "x", qa_content: "x" })).status);
      expect([403, 404]).toContain((await call("DELETE", `qas/${adminId}`, member)).status);
      expect((await call("POST", `qas/${memberId}/answer`, member, { qa_subject: "x", qa_content: "x" })).status).toBe(403);
      expect((await call("GET", `qas/${adminId}`, admin)).body.data?.qa_subject).toBe("qa-api-spec admin");

      // scope=admin 을 붙여도 회원에게는 자기 문의만
      const list = await call("GET", "qas?scope=admin&per_page=100", member);
      const rows = (list.body.data as unknown as Array<{ qa_id: number; mb_id: string }>) ?? [];
      expect(rows.some((row) => row.qa_id === memberId)).toBe(true);
      expect(rows.every((row) => row.mb_id === accounts.member.id)).toBe(true);

      // 이전글 · 다음글도 자기 문의만(관리자가 바로 앞에 쓴 문의를 가리키면 안 된다)
      const detail = (await call("GET", `qas/${memberId}`, member)).body.data!;
      for (const neighbor of [detail.prev, detail.next] as Array<{ qa_id: number } | null | undefined>) {
        if (!neighbor) continue;
        expect(neighbor.qa_id).not.toBe(adminId);
        expect((await call("GET", `qas/${neighbor.qa_id}`, member)).status).toBe(200);
      }

      // qa_html 없이 고쳐도(예전 화면 · 앱) 에디터 글의 형식이 남는다
      const patched = await call("PATCH", `qas/${memberId}`, member, { qa_category: category, qa_subject: "qa-api-spec member", qa_content: html });
      expect(patched.status).toBe(200);
      expect(patched.body.data?.qa_html).toBe(1);
      expect(String(patched.body.data?.qa_content)).toContain("<strong>굵게</strong>");

      // 같은 질문에 답변이 동시에 두 번 와도 답변은 하나다. 보이는 답변을 지운 뒤 다시 답하면 새 답변(더 큰 번호)이
      // 생겨야 한다 — 중복이 남아 있었다면 API 가 그 옛 답변(더 작은 번호)을 고쳐 쓴다.
      await Promise.all([
        call("POST", `qas/${memberId}/answer`, admin, { qa_subject: "첫째", qa_content: "a" }),
        call("POST", `qas/${memberId}/answer`, admin, { qa_subject: "둘째", qa_content: "b" }),
      ]);
      const shown = (await call("GET", `qas/${memberId}`, admin)).body.data!.answer as { qa_id: number } | null;
      expect(shown).not.toBeNull();
      expect((await call("DELETE", `qas/${shown!.qa_id}`, admin)).status).toBe(200);
      const again = (await call("POST", `qas/${memberId}/answer`, admin, { qa_subject: "셋째", qa_content: "c" })).body.data!;
      const next = again.answer as { qa_id: number } | null;
      expect(next?.qa_id ?? 0, "a duplicate answer was left behind by the concurrent posts").toBeGreaterThan(shown!.qa_id);
    } finally {
      for (const id of created) {
        await call("DELETE", `qas/${id}`, admin);
      }
    }
  });
});
