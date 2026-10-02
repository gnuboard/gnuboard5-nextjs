"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useRuntimeRouteParam } from "@/hooks/use-runtime-route-param";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { QaConfig, QaItem } from "@/lib/types";
import { deleteQa, getQa, getQaConfig, updateQa, updateQaWithFiles } from "@/services/qas";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QaContentInput, qaContentForEditor, useQaEditor } from "@/components/qa/qa-editor";
import { QaAttachments, QaRelatedQuestions } from "@/components/qa/qa-detail-extras";
import { QaBody, QaConfigContent } from "@/components/qa/qa-content";
import { toastError, toastSuccess } from "@/lib/toast";
import { useAuthStore } from "@/store/auth";
import { QaAnswerSection } from "./QaAnswerSection";

interface QaDetailPageProps {
  qaId?: string;
  listHref?: string;
  loginHref?: string;
  newHref?: string;
  routePattern?: string | string[];
}

function StatusBadge({ status }: { status: number }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        status === 1 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}
    >
      {status === 1 ? "답변완료" : "답변대기"}
    </span>
  );
}

export default function QaDetailPage({
  qaId: fallbackQaId,
  listHref = "/mypage/qas",
  loginHref,
  newHref = "/mypage/qas/new",
  routePattern = "/mypage/qas/:qa_id",
}: QaDetailPageProps) {
  const router = useRouter();
  const { isInitialized, user } = useAuthStore();
  const isSuperAdmin = user?.is_super_admin === true;
  const [reloadKey, setReloadKey] = useState(0);
  // 다른 문의로 갈 주소 — 마이페이지(/mypage/qas/:qa_id)와 쇼핑몰(/shop/qas/my/:qa_id)이 이 화면을 함께 쓴다.
  const detailPattern = Array.isArray(routePattern) ? routePattern[0] : routePattern;
  const detailHref = (id: number) => detailPattern.replace(":qa_id", String(id));
  const qaId = Math.max(
    0,
    Number(useRuntimeRouteParam("qa_id", routePattern, fallbackQaId)) || 0
  );
  const [item, setItem] = useState<QaItem | null>(null);
  const [config, setConfig] = useState<QaConfig | null>(null);
  const useEditor = useQaEditor(config);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<Array<File | null>>([null, null]);
  const [deleteFiles, setDeleteFiles] = useState<number[]>([]);
  const [form, setForm] = useState({
    qa_category: "",
    qa_email: "",
    qa_hp: "",
    qa_subject: "",
    qa_content: "",
    qa_email_recv: false,
    qa_sms_recv: false,
  });

  useEffect(() => {
    if (loginHref && (!isInitialized || !user)) {
      return;
    }

    if (!qaId) return;

    // 다른 문의로 넘어오면(이전글 · 다음글, 브라우저 뒤로가기) 수정 폼을 닫는다 — 열린 채면 다른 문의가 수정 상태로
    // 뜨고, 에디터 변환(qaContentForEditor)을 거치지 않은 본문이 폼에 들어간다.
    setEditing(false);
    // 늦게 온 앞 문의의 응답이 지금 문의를 덮지 않게 한다(빠르게 넘길 때).
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [nextItem, nextConfig] = await Promise.all([getQa(qaId), getQaConfig()]);
        if (!alive) return;
        setItem(nextItem);
        setConfig(nextConfig);
        setForm({
          qa_category: nextItem.qa_category,
          qa_email: nextItem.qa_email,
          qa_hp: nextItem.qa_hp,
          qa_subject: nextItem.qa_subject,
          qa_content: nextItem.qa_content,
          qa_email_recv: nextItem.qa_email_recv === 1,
          qa_sms_recv: nextItem.qa_sms_recv === 1,
        });
        setFiles([null, null]);
        setDeleteFiles([]);
      } catch (error) {
        if (!alive) return;
        toastError(error instanceof Error ? error.message : "문의 내용을 불러오지 못했습니다.");
        runtimeRouterPush(router, listHref);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isInitialized, listHref, loginHref, qaId, reloadKey, router, user]);

  useEffect(() => {
    if (loginHref && isInitialized && !user) {
      runtimeRouterPush(router, loginHref);
    }
  }, [isInitialized, loginHref, router, user]);

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!item) return;

    setSaving(true);
    try {
      const hasAttachmentChanges = files.some(Boolean) || deleteFiles.length > 0;
      // 에디터로 고치면 HTML(1). 글자 입력칸이면 원래 형식(qa_html)을 지킨다 — 보내지 않으면 API 가 0 으로 저장해
      // 에디터로 쓴 글의 태그가 글자로 보인다.
      const payload = { ...form, qa_html: useEditor ? 1 : item.qa_html };
      const updated = hasAttachmentChanges
        ? await updateQaWithFiles(item.qa_id, payload, { files, deleteFiles })
        : await updateQa(item.qa_id, payload);
      setItem({ ...updated, prev: item.prev, next: item.next });
      setEditing(false);
      setFiles([null, null]);
      setDeleteFiles([]);
      toastSuccess("문의가 수정되었습니다.");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "문의 수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item || !confirm("이 문의를 삭제하시겠습니까?")) return;
    try {
      await deleteQa(item.qa_id);
      toastSuccess("문의가 삭제되었습니다.");
      runtimeRouterPush(router, listHref);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "문의 삭제에 실패했습니다.");
    }
  }

  if ((loginHref && (!isInitialized || !user)) || loading || !item) {
    return <div className="skeleton h-72 rounded-lg" />;
  }

  return (
    <div className="space-y-5">
      <QaConfigContent pc={config?.qa_content_head} mobile={config?.qa_mobile_content_head} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => runtimeRouterPush(router, listHref)}>
          <ArrowLeft className="mr-2 size-4" />
          목록
        </Button>
        <div className="flex gap-2">
          {item.can_edit && !editing && (
            <Button
              variant="outline"
              size="sm"
              disabled={useEditor === null}
              onClick={() => {
                // 에디터면 저장된 본문을 에디터용 HTML 로(글자 글은 줄마다 문단으로) 바꿔 채운다.
                setForm((prev) => ({
                  ...prev,
                  qa_content: useEditor ? qaContentForEditor(item.qa_content, item.qa_html) : item.qa_content,
                }));
                setEditing(true);
              }}
            >
              <Pencil className="mr-2 size-4" />
              수정
            </Button>
          )}
          {item.answer && !editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                runtimeRouterPush(router, `${newHref}?reply_to=${item.qa_id}`)
              }
            >
              <Plus className="mr-2 size-4" />
              추가질문
            </Button>
          )}
          {item.can_delete && (
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-2 size-4" />
              삭제
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.qa_status} />
            {item.qa_category && (
              <span className="text-xs text-muted-foreground">{item.qa_category}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDate(item.qa_datetime)}
            </span>
          </div>
          <CardTitle className="break-words">{item.qa_subject}</CardTitle>
          {/* 그누보드 view.skin.php 처럼 작성자 · 연락처 — 답변하는 관리자가 누구에게 어떻게 알릴지 본다. */}
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {item.qa_name || item.mb_id}
              {isSuperAdmin && item.mb_id && item.qa_name !== item.mb_id ? ` (${item.mb_id})` : ""}
            </span>
            {item.qa_email ? <span>{item.qa_email}</span> : null}
            {item.qa_hp ? <span>{item.qa_hp}</span> : null}
          </p>
        </CardHeader>
        <CardContent>
          {editing ? (
            <form onSubmit={handleUpdate} className="space-y-4">
              {config && config.categories.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="qa_category">분류</Label>
                  <select
                    id="qa_category"
                    value={form.qa_category}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, qa_category: event.target.value }))
                    }
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    required
                  >
                    {config.categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {config?.qa_use_email === 1 && (
                <div className="space-y-2">
                  <Label htmlFor="qa_email">이메일</Label>
                  <Input
                    id="qa_email"
                    value={form.qa_email}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, qa_email: event.target.value }))
                    }
                    required={config.qa_req_email === 1}
                  />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      checked={form.qa_email_recv}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, qa_email_recv: event.target.checked }))
                      }
                    />
                    답변 등록 시 이메일 알림 받기
                  </label>
                </div>
              )}
              {config?.qa_use_hp === 1 && (
                <div className="space-y-2">
                  <Label htmlFor="qa_hp">휴대폰</Label>
                  <Input
                    id="qa_hp"
                    value={form.qa_hp}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, qa_hp: event.target.value }))
                    }
                    required={config.qa_req_hp === 1}
                  />
                  {config.qa_use_sms === 1 && (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={form.qa_sms_recv}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, qa_sms_recv: event.target.checked }))
                        }
                      />
                      답변 등록 시 SMS 알림 받기
                    </label>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="qa_subject">제목</Label>
                <Input
                  id="qa_subject"
                  value={form.qa_subject}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, qa_subject: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qa_content">내용</Label>
                <QaContentInput
                  id="qa_content"
                  value={form.qa_content}
                  onChange={(value) => setForm((prev) => ({ ...prev, qa_content: value }))}
                  useEditor={Boolean(useEditor)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1].map((index) => {
                  const slot = index + 1;
                  const source = slot === 1 ? item.qa_source1 : item.qa_source2;
                  return (
                    <div key={slot} className="space-y-2 rounded-md border p-3">
                      <Label htmlFor={`bf_file_${slot}`}>첨부파일 #{slot}</Label>
                      {source && (
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Checkbox
                            checked={deleteFiles.includes(slot)}
                            onChange={(event) =>
                              setDeleteFiles((prev) =>
                                event.target.checked
                                  ? Array.from(new Set([...prev, slot]))
                                  : prev.filter((value) => value !== slot)
                              )
                            }
                          />
                          현재 파일 삭제: {source}
                        </label>
                      )}
                      <Input
                        id={`bf_file_${slot}`}
                        type="file"
                        onChange={(event) => {
                          const next = [...files];
                          next[index] = event.target.files?.[0] || null;
                          setFiles(next);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setFiles([null, null]);
                    setDeleteFiles([]);
                  }}
                >
                  취소
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "저장 중" : "저장"}
                </Button>
              </div>
            </form>
          ) : (
            <QaBody content={item.qa_content} html={item.qa_html} />
          )}
        </CardContent>
      </Card>

      {!editing && <QaAttachments item={item} />}

      {!editing && (item.prev || item.next) ? (
        <nav aria-label="이전글 다음글" className="flex flex-wrap justify-between gap-2">
          {item.prev ? (
            <Button variant="outline" size="sm" className="max-w-full" onClick={() => runtimeRouterPush(router, detailHref(item.prev!.qa_id))}>
              <ChevronLeft className="mr-1 size-4" aria-hidden />
              <span className="truncate">이전글 · {item.prev.qa_subject}</span>
            </Button>
          ) : <span />}
          {item.next ? (
            <Button variant="outline" size="sm" className="max-w-full" onClick={() => runtimeRouterPush(router, detailHref(item.next!.qa_id))}>
              <span className="truncate">다음글 · {item.next.qa_subject}</span>
              <ChevronRight className="ml-1 size-4" aria-hidden />
            </Button>
          ) : null}
        </nav>
      ) : null}

      {item.qa_type === 0 && (
        <QaAnswerSection
          question={item}
          isAdmin={isSuperAdmin}
          useEditor={useEditor}
          onChanged={(updated) =>
            updated ? setItem({ ...updated, prev: item.prev, next: item.next }) : setReloadKey((key) => key + 1)
          }
        />
      )}

      {!editing && (
        <QaRelatedQuestions
          items={item.related_questions}
          onSelect={(nextQaId) => runtimeRouterPush(router, detailHref(nextQaId))}
        />
      )}

      <QaConfigContent pc={config?.qa_content_tail} mobile={config?.qa_mobile_content_tail} />
    </div>
  );
}
