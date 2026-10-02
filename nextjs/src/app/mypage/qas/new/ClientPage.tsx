"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { QaConfig, QaItem } from "@/lib/types";
import { createQa, createQaWithFiles, getQa, getQaConfig } from "@/services/qas";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QaContentInput, qaContentForEditor, useQaEditor } from "@/components/qa/qa-editor";
import { htmlToText } from "@/lib/html-text";
import { toastError, toastSuccess } from "@/lib/toast";

type NewQaPageProps = {
  detailBaseHref?: string;
  detailSearch?: string;
  listHref?: string;
  loginHref?: string;
  newHref?: string;
  title?: string;
};

function followUpContent(source: QaItem) {
  return `\n\n\n\n====== 이전 문의 내용 =======\n${source.qa_content}`;
}

/** 에디터로 쓸 때의 추가질문 첫 내용 — 그누보드 qawrite.php(w=r)처럼 빈 줄 몇 개 뒤에 이전 내용을 붙인다. */
function followUpEditorContent(source: QaItem) {
  return `<p></p><p></p><p>====== 이전 문의 내용 =======</p>${qaContentForEditor(source.qa_content, source.qa_html)}`;
}

function withSearch(path: string, search?: string) {
  const cleanSearch = search?.replace(/^\?/, "");
  return cleanSearch ? `${path}?${cleanSearch}` : path;
}

export default function NewQaPage({
  detailBaseHref = "/mypage/qas",
  detailSearch,
  listHref = "/mypage/qas",
  loginHref,
  newHref = "/mypage/qas/new",
  title = "1:1 문의하기",
}: NewQaPageProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isInitialized, user } = useAuthStore();
  const replyTo = Math.max(0, Number(searchParams.get("reply_to") || "0")) || 0;
  const [config, setConfig] = useState<QaConfig | null>(null);
  const [replySource, setReplySource] = useState<QaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<Array<File | null>>([null, null]);
  const [form, setForm] = useState({
    qa_category: "",
    qa_email: user?.mb_email || "",
    qa_hp: "",
    qa_subject: "",
    qa_content: "",
    qa_email_recv: true,
    qa_sms_recv: false,
  });

  useEffect(() => {
    if (loginHref && (!isInitialized || !user)) {
      return;
    }

    (async () => {
      try {
        const [nextConfig, nextReplySource] = await Promise.all([
          getQaConfig(),
          replyTo > 0 ? getQa(replyTo) : Promise.resolve(null),
        ]);
        setConfig(nextConfig);
        setReplySource(nextReplySource);
        setForm((prev) => ({
          ...prev,
          qa_category:
            prev.qa_category || nextReplySource?.qa_category || nextConfig.categories[0] || "",
          qa_email: prev.qa_email || user?.mb_email || "",
        }));
      } catch (error) {
        toastError(error instanceof Error ? error.message : "1:1 문의 설정을 불러오지 못했습니다.");
        if (replyTo > 0) {
          runtimeRouterPush(router, newHref);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isInitialized, loginHref, newHref, replyTo, router, user, user?.mb_email]);

  useEffect(() => {
    if (loginHref && isInitialized && !user) {
      runtimeRouterPush(router, loginHref);
    }
  }, [isInitialized, loginHref, router, user]);

  // 첫 내용(추가질문의 이전 내용 · 설정의 기본 문구)은 에디터를 쓰는지 안 뒤에 한 번 채운다.
  const useEditor = useQaEditor(config);
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || loading || useEditor === null) return;
    const initial = replySource
      ? useEditor
        ? followUpEditorContent(replySource)
        : followUpContent(replySource)
      : config?.qa_insert_content || "";
    setForm((prev) => ({ ...prev, qa_content: prev.qa_content || initial }));
    setPrefilled(true);
  }, [config, loading, prefilled, replySource, useEditor]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const contentText = useEditor ? htmlToText(form.qa_content) : form.qa_content.trim();
    if (!form.qa_subject.trim() || (!contentText && !/<img\b/i.test(form.qa_content))) {
      toastError("제목과 내용을 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        qa_html: useEditor ? 1 : 0,
        ...(replyTo > 0 ? { qa_reply_to: replyTo } : {}),
      };
      const created = files.some(Boolean)
        ? await createQaWithFiles(payload, { files })
        : await createQa(payload);
      toastSuccess("문의가 등록되었습니다.");
      runtimeRouterPush(router, withSearch(`${detailBaseHref}/${created.qa_id}`, detailSearch));
    } catch (error) {
      toastError(error instanceof Error ? error.message : "문의 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if ((loginHref && (!isInitialized || !user)) || loading || !prefilled) {
    return <div className="skeleton h-64 rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={() => runtimeRouterPush(router, listHref)}>
          <ArrowLeft className="mr-2 size-4" />
          목록
        </Button>
      </CardHeader>
      <CardContent>
        {replySource && (
          <div className="mb-4 rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">기존 문의</p>
            <p className="mt-1 break-words text-muted-foreground">{replySource.qa_subject}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
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
                type="email"
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
              maxLength={255}
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
            {[0, 1].map((index) => (
              <div key={index} className="space-y-2">
                <Label htmlFor={`bf_file_${index + 1}`}>첨부파일 #{index + 1}</Label>
                <Input
                  id={`bf_file_${index + 1}`}
                  type="file"
                  onChange={(event) => {
                    const next = [...files];
                    next[index] = event.target.files?.[0] || null;
                    setFiles(next);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => runtimeRouterPush(router, listHref)}
            >
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "등록 중" : "등록"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
