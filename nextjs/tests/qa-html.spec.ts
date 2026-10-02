import { expect, test } from "@playwright/test";
import { qaBodyHtml, qaContentForEditor } from "../src/lib/qa-html";
import { qaConfigSchema, qaItemSchema } from "../src/lib/schemas";

/*
 * 1:1 문의 본문 형식(src/lib/qa-html.ts)과 응답 스키마.
 * - 그누보드 qa_html: 0 글자, 1 HTML, 2 HTML + 자동 줄바꿈 — 화면 표시 · 에디터 채우기가 이 규칙을 따른다.
 * - 예전 API(prev · next · qa_use_editor 없음)의 응답도 그대로 읽힌다(화면과 API 를 따로 올려도 깨지지 않게).
 */

test.describe("qa html rules", () => {
  test("body html follows Gnuboard conv_content", () => {
    expect(qaBodyHtml("<p>a</p>", 0)).toBeNull();
    expect(qaBodyHtml("<p>a</p>\nb", 1)).toBe("<p>a</p>\nb");
    expect(qaBodyHtml("a\r\nb\nc", 2)).toBe("a<br>b<br>c");
  });

  test("plain content becomes one paragraph per line in the editor, tags escaped", () => {
    expect(qaContentForEditor("첫 줄\r\n둘째 줄", 0)).toBe("<p>첫 줄</p><p>둘째 줄</p>");
    expect(qaContentForEditor("a\n\nb", 0)).toBe("<p>a</p><p></p><p>b</p>");
    expect(qaContentForEditor('<script>alert("x")</script> & co', 0)).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co</p>"
    );
  });

  test("HTML content goes into the editor as is; auto line breaks become <br>", () => {
    expect(qaContentForEditor("<p>그대로</p>", 1)).toBe("<p>그대로</p>");
    expect(qaContentForEditor("<b>a</b>\nb", 2)).toBe("<b>a</b><br>b");
  });
});

test.describe("qa response schemas", () => {
  const item = {
    qa_id: 1, qa_num: -1, qa_parent: 1, qa_related: 1, mb_id: "m", qa_name: "n", qa_email: "", qa_hp: "",
    qa_type: 0, qa_category: "", qa_email_recv: 0, qa_sms_recv: 0, qa_html: 1, qa_subject: "s", qa_content: "c",
    qa_status: 0, qa_file1: "", qa_source1: "", qa_file2: "", qa_source2: "", qa_file1_url: "", qa_file2_url: "",
    qa_datetime: "2026-10-02 00:00:00", can_edit: true, can_delete: true, answer: null, related_questions: [],
  };

  test("detail responses carry prev and next when the API sends them", () => {
    const parsed = qaItemSchema.parse({ ...item, prev: { qa_id: "3", qa_subject: "이전" }, next: null });
    expect(parsed.prev).toEqual({ qa_id: 3, qa_subject: "이전" });
    expect(parsed.next).toBeNull();
  });

  test("an older API without prev and next still parses", () => {
    const parsed = qaItemSchema.parse(item);
    expect(parsed.prev).toBeUndefined();
    expect(parsed.qa_html).toBe(1);
  });

  test("config without qa_use_editor reads as editor off", () => {
    const config = qaConfigSchema.parse({ qa_title: "1:1문의", qa_category: "", categories: [] });
    expect(config.qa_use_editor).toBe(0);
    expect(qaConfigSchema.parse({ qa_use_editor: "1" }).qa_use_editor).toBe(1);
  });
});
