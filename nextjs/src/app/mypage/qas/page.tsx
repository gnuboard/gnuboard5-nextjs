"use client";

import { useCallback, useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter, useSearchParams } from "next/navigation";
import { HelpCircle, PenSquare, Settings, Trash2 } from "lucide-react";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { ApiMeta } from "@/lib/api-response";
import type { QaConfig, QaItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { g5PathForRuntime } from "@/lib/config";
import { g5ShortHref } from "@/lib/g5-short-url";
import { deleteQa, getQaConfig, getQas } from "@/services/qas";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { SafeHtml } from "@/components/SafeHtml";
import { toastError, toastSuccess } from "@/lib/toast";
import { MypagePanel } from "../MypagePanel";
import { QaCategoryTabs, QaListRow, QaSearchForm, qaSearchField, type QaSearchField } from "./QaListParts";

/*
 * 1:1 문의 목록 — 그누보드 bbs/qalist.php 와 같은 규칙:
 * - 최고관리자는 모든 회원의 문의를 보고(글쓴이 · 회원아이디 검색 · 선택삭제), 회원은 자기 문의만 본다.
 * - 제목 · 분류 · 쪽당 줄 수 · 제목 길이 · 목록 위아래 내용은 관리자의 1:1문의 설정(qa_config)을 따른다.
 * 답변 상태 탭(전체 · 답변대기 · 답변완료)은 이 화면에만 있는 편의 기능이다.
 */

const DEFAULT_TITLE = "1:1 문의";

export default function MyQasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const statusParam = searchParams.get("status");
  const status = statusParam === "0" || statusParam === "1" ? Number(statusParam) : "all";
  const sca = searchParams.get("sca") || undefined;
  const stx = searchParams.get("stx") || searchParams.get("q") || undefined;
  const sfl = qaSearchField(searchParams.get("sfl"));
  const isSuperAdmin = useAuthStore((state) => state.user?.is_super_admin === true);

  const [config, setConfig] = useState<QaConfig | null>(null);
  const [items, setItems] = useState<QaItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getQaConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const loadQas = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      // 쪽당 줄 수는 보내지 않는다 — API 가 관리자 설정(qa_page_rows)을 쓴다.
      const result = await getQas({
        page,
        scope: isSuperAdmin ? "admin" : "mine",
        status: status as 0 | 1 | "all",
        sca,
        sfl,
        stx,
      });
      setItems(result.items);
      setMeta(result.meta);
    } catch (error) {
      setItems([]);
      setMeta(undefined);
      toastError(error instanceof Error ? error.message : "1:1 문의를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, page, sca, sfl, status, stx]);

  useEffect(() => {
    loadQas();
  }, [loadQas]);

  /** 주소의 조건을 바꾼다(쪽은 처음으로). undefined 는 지운다. */
  function updateQuery(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("q");
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    runtimeRouterPush(router, `/mypage/qas${query ? `?${query}` : ""}`);
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) {
      toastError("삭제할 문의를 하나 이상 선택하세요.");
      return;
    }
    if (!confirm(`선택한 문의 ${ids.length}건을 정말 삭제하시겠습니까?\n답변도 함께 삭제됩니다.`)) return;

    setDeleting(true);
    let failed = 0;
    for (const id of ids) {
      try {
        await deleteQa(id);
      } catch {
        failed += 1;
      }
    }
    setDeleting(false);
    if (failed > 0) toastError(`${ids.length}건 중 ${failed}건을 삭제하지 못했습니다.`);
    else toastSuccess(`${ids.length}건을 삭제했습니다.`);
    await loadQas();
  }

  const lastPage = meta?.last_page ?? 1;
  const perPage = meta?.per_page || items.length;
  const total = meta?.total ?? items.length;
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.qa_id));

  return (
    <MypagePanel
      title={config?.qa_title || DEFAULT_TITLE}
      description={isSuperAdmin ? "모든 회원의 문의를 봅니다(최고관리자)." : "문의를 남기고 답변 상태를 확인합니다."}
      actions={
        <div className="flex gap-2">
          {isSuperAdmin ? (
            <Button asChild variant="outline" size="icon" title="1:1문의 설정">
              <a href={g5PathForRuntime("/adm/qa_config.php")}>
                <Settings className="size-4" aria-hidden />
                <span className="sr-only">1:1문의 설정</span>
              </a>
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/mypage/qas/new">
              <PenSquare className="mr-2 size-4" />
              문의하기
            </Link>
          </Button>
        </div>
      }
    >
      <ContentBlock pc={config?.qa_content_head ?? ""} mobile={config?.qa_mobile_content_head ?? ""} />

      <QaCategoryTabs categories={config?.categories ?? []} current={sca} onSelect={(category) => updateQuery({ sca: category })} />

      <div className="g5-tabs flex flex-wrap gap-2 border-b">
        {[
          { value: "all" as const, label: "전체" },
          { value: 0 as const, label: "답변대기" },
          { value: 1 as const, label: "답변완료" },
        ].map((item) => (
          <button
            key={String(item.value)}
            type="button"
            onClick={() => updateQuery({ status: item.value === "all" ? undefined : String(item.value) })}
            aria-pressed={status === item.value}
            className={cn(
              "g5-tab border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              status === item.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
        {meta && (
          <span className="ml-auto self-center text-xs text-muted-foreground">
            총 {meta.total.toLocaleString()}건 · {page} 페이지
          </span>
        )}
      </div>

      <QaSearchForm
        key={`${sfl}:${stx ?? ""}`}
        field={sfl}
        keyword={stx}
        isAdmin={isSuperAdmin}
        onSearch={(field: QaSearchField, keyword) => updateQuery({ sfl: field, stx: keyword })}
        onReset={() => updateQuery({ sfl: undefined, stx: undefined })}
      />

      {isSuperAdmin && items.length > 0 ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => setSelected(event.target.checked ? new Set(items.map((item) => item.qa_id)) : new Set())}
              className="rounded"
            />
            현재 페이지 전체선택
          </label>
          <Button variant="outline" size="sm" onClick={deleteSelected} disabled={deleting || selected.size === 0}>
            <Trash2 className="mr-1 size-4" aria-hidden />
            선택삭제{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </div>
      ) : null}

      <div>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-20 rounded-md" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HelpCircle className="mb-3 size-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{stx ? "검색 결과가 없습니다." : "등록된 문의가 없습니다."}</p>
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((item, index) => (
              <QaListRow
                key={item.qa_id}
                item={item}
                number={total - (page - 1) * perPage - index}
                subjectLength={config?.qa_subject_len ?? 0}
                showWriter={isSuperAdmin}
                selectable={isSuperAdmin}
                checked={selected.has(item.qa_id)}
                onCheckedChange={(checked) =>
                  setSelected((previous) => {
                    const next = new Set(previous);
                    if (checked) next.add(item.qa_id);
                    else next.delete(item.qa_id);
                    return next;
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>

      <Pagination
        currentPage={Math.min(page, lastPage)}
        totalPages={lastPage}
        baseUrl={g5ShortHref("/mypage/qas")}
        searchParams={{
          status: status === "all" ? undefined : String(status),
          sca,
          sfl: stx ? sfl : undefined,
          stx,
        }}
      />

      <ContentBlock pc={config?.qa_content_tail ?? ""} mobile={config?.qa_mobile_content_tail ?? ""} />
    </MypagePanel>
  );
}

/** 관리자가 1:1문의 설정에 넣은 목록 위 · 아래 내용. 그누보드처럼 작은 화면은 모바일용을 쓴다. */
function ContentBlock({ pc, mobile }: { pc: string; mobile: string }) {
  if (!pc && !mobile) return null;
  return (
    <>
      {pc ? <SafeHtml html={pc} className="g5-content hidden md:block" /> : null}
      {mobile ? <SafeHtml html={mobile} className="g5-content md:hidden" /> : null}
    </>
  );
}
