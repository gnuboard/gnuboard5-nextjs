"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  QaAttachmentList,
  QaAttachments,
  QaRelatedQuestions,
} from "@/components/qa/qa-detail-extras";
import { toastError, toastSuccess } from "@/lib/toast";
import { useAuthStore } from "@/store/auth";

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
  const qaId = Math.max(
    0,
    Number(useRuntimeRouteParam("qa_id", routePattern, fallbackQaId)) || 0
  );
  const [item, setItem] = useState<QaItem | null>(null);
  const [config, setConfig] = useState<QaConfig | null>(null);
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

    (async () => {
      setLoading(true);
      try {
        const [nextItem, nextConfig] = await Promise.all([getQa(qaId), getQaConfig()]);
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
        toastError(error instanceof Error ? error.message : "문의 내용을 불러오지 못했습니다.");
        runtimeRouterPush(router, listHref);
      } finally {
        setLoading(false);
      }
    })();
  }, [isInitialized, listHref, loginHref, qaId, router, user]);

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
      const updated = hasAttachmentChanges
        ? await updateQaWithFiles(item.qa_id, form, { files, deleteFiles })
        : await updateQa(item.qa_id, form);
      setItem(updated);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => runtimeRouterPush(router, listHref)}>
          <ArrowLeft className="mr-2 size-4" />
          목록
        </Button>
        <div className="flex gap-2">
          {item.can_edit && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
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
                <Textarea
                  id="qa_content"
                  value={form.qa_content}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, qa_content: event.target.value }))
                  }
                  rows={10}
                  required
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
            <p className="whitespace-pre-wrap break-words text-sm leading-7">
              {item.qa_content}
            </p>
          )}
        </CardContent>
      </Card>

      {!editing && <QaAttachments item={item} />}

      <Card>
        <CardHeader>
          <CardTitle>답변</CardTitle>
        </CardHeader>
        <CardContent>
          {item.answer ? (
            <div className="space-y-3">
              <div>
                <p className="font-medium">{item.answer.qa_subject}</p>
                <p className="text-xs text-muted-foreground">
                  {item.answer.qa_name} · {formatDate(item.answer.qa_datetime)}
                </p>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-7">
                {item.answer.qa_content}
              </p>
              <QaAttachmentList item={item.answer} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              아직 등록된 답변이 없습니다.
            </p>
          )}
        </CardContent>
      </Card>

      {!editing && (
        <QaRelatedQuestions
          items={item.related_questions}
          onSelect={(nextQaId) => runtimeRouterPush(router, `/mypage/qas/${nextQaId}`)}
        />
      )}
    </div>
  );
}
