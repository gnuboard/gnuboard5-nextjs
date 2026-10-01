"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { currentPathForRuntime } from "@/lib/config";
import { g5ShortHref } from "@/lib/g5-short-url";
import { boardPostHref } from "@/lib/board-url";
import { useRuntimeRouteParam } from "@/hooks/use-runtime-route-param";
import { runtimeRouterReplace } from "@/lib/runtime-router";
import { useAuthStore } from "@/store/auth";
import { getClientPublicSettings } from "@/services/settings";
import type { Board, WritePost } from "@/lib/types";
import { canWriteToBoard } from "@/lib/board-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { toastInfo } from "@/lib/toast";
import { htmlToPlainText } from "@/lib/sanitize";
import { PostTemplates } from "./PostTemplates";
import { FileAttachments, type Attachment, type ExistingAttachment } from "@/components/FileAttachments";

const DRAFT_PREFIX = "draft_";

function getDraftKey(boTable: string): string {
  return `${DRAFT_PREFIX}${boTable}`;
}

function saveDraft(boTable: string, data: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getDraftKey(boTable), JSON.stringify({ ...data, saved_at: Date.now() }));
  } catch { /* storage full */ }
}

function loadDraft(boTable: string): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getDraftKey(boTable));
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expire drafts older than 24 hours
    if (data.saved_at && Date.now() - data.saved_at > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(getDraftKey(boTable));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function clearDraft(boTable: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getDraftKey(boTable));
}

const TiptapEditor = dynamic(
  () => import("@/components/editor/TiptapEditor").then((mod) => ({ default: mod.TiptapEditor })),
  {
    ssr: false,
    loading: () => <div className="skeleton min-h-[300px] rounded-lg border" />,
  }
);

interface WritePageProps {
  boTable?: string;
}

interface ExistingAttachmentApi {
  bf_no: number;
  bf_source: string;
  bf_filesize: number;
  bf_url: string;
  bf_type: number;
}

export default function WritePage({ boTable: fallbackBoTable }: WritePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeBoTable = useRuntimeRouteParam(
    "bo_table",
    ["/boards/:bo_table/write", "/:bo_table/write"],
    fallbackBoTable
  );
  const { user, isInitialized } = useAuthStore();

  const [boTable, setBoTable] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [replyTo, setReplyTo] = useState<{ wr_id: number; wr_subject: string } | null>(null);

  const [formData, setFormData] = useState({
    ca_name: "",
    wr_subject: "",
    wr_content: "",
    wr_link1: "",
    wr_link2: "",
    wr_secret: false,
    html: "0",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Redirect if not logged in (wait for auth initialization)
  useEffect(() => {
    if (isInitialized && !user) {
      const redirect = encodeURIComponent(currentPathForRuntime(routeBoTable ? `/${routeBoTable}/write` : "/"));
      runtimeRouterReplace(router, `/login?redirect=${redirect}`);
    }
  }, [routeBoTable, router, user, isInitialized]);

  // Resolve params and load board info
  useEffect(() => {
    (async () => {
      setError("");
      if (!routeBoTable) {
        setLoading(true);
        return;
      }

      setLoading(true);
      setBoTable(routeBoTable);

      try {
        const res = await apiClient.get<Board>(`/boards/${routeBoTable}`);
        setBoard(res.data ?? null);
        if (res.data?.bo_use_dhtml_editor === 1) {
          setFormData((prev) => ({ ...prev, html: "1" }));
        }
      } catch {
        setError("게시판 정보를 불러올 수 없습니다.");
      }

      // Reply mode: prefill "Re:" subject from the parent and remember it for the payload.
      const replyToParam = Number(searchParams.get("reply_to") || "0");
      if (replyToParam > 0) {
        try {
          const res = await apiClient.get<WritePost>(`/posts/${routeBoTable}/${replyToParam}`);
          const parent = res.data as WritePost;
          setReplyTo({ wr_id: replyToParam, wr_subject: parent.wr_subject || "" });
          setFormData((prev) => ({
            ...prev,
            ca_name: parent.ca_name || prev.ca_name,
            wr_subject: /^re:/i.test(parent.wr_subject || "") ? parent.wr_subject : `Re: ${parent.wr_subject || ""}`,
          }));
        } catch {
          setError("답글을 달 원글을 불러올 수 없습니다.");
        }
      }

      // Check edit mode
      const editWrId = searchParams.get("wr_id");
      if (editWrId) {
        setIsEdit(true);
        try {
          // /boards/{bo_table}/posts/{id} 는 LIST 반환이므로 단건 endpoint 사용
          const res = await apiClient.get<WritePost>(
            `/posts/${routeBoTable}/${editWrId}`
          );
          const post = res.data as WritePost;
          setFormData({
            ca_name: post.ca_name || "",
            wr_subject: post.wr_subject || "",
            wr_content: post.wr_content || "",
            wr_link1: post.wr_link1 || "",
            wr_link2: post.wr_link2 || "",
            wr_secret: !!post.wr_option?.includes("secret"),
            html: post.wr_option?.includes("html1")
              ? "1"
              : post.wr_option?.includes("html2")
                ? "2"
                : "0",
          });
        } catch {
          setError("게시글 정보를 불러올 수 없습니다.");
        }

        // Load existing attachments for this post.
        try {
          const filesRes = await apiClient.get<ExistingAttachmentApi[]>(
            `/boards/${routeBoTable}/${editWrId}/files`
          );
          const list = (filesRes.data ?? []).map<ExistingAttachment>((f) => ({
            kind: "existing",
            id: `existing-${f.bf_no}`,
            bf_no: f.bf_no,
            bf_source: f.bf_source,
            bf_filesize: f.bf_filesize,
            bf_url: f.bf_url,
            bf_type: f.bf_type,
          }));
          setAttachments(list);
        } catch {
          // 첨부 조회 실패는 무시 (글 자체는 보임)
        }
      }

      // Restore draft for new posts (not edit or reply mode)
      if (!searchParams.get("wr_id") && !(replyToParam > 0)) {
        const draft = loadDraft(routeBoTable);
        if (draft && (draft.wr_subject || draft.wr_content)) {
          setFormData((prev) => ({
            ...prev,
            ca_name: draft.ca_name || prev.ca_name,
            wr_subject: draft.wr_subject || prev.wr_subject,
            wr_content: draft.wr_content || prev.wr_content,
            wr_link1: draft.wr_link1 || prev.wr_link1,
            wr_link2: draft.wr_link2 || prev.wr_link2,
          }));
          toastInfo("임시저장된 글을 불러왔습니다.");
        }
      }

      setLoading(false);
    })();
  }, [routeBoTable, searchParams]);

  // Autosave draft every 10 seconds (new posts only)
  useEffect(() => {
    if (isEdit || !boTable) return;
    const timer = setInterval(() => {
      if (formData.wr_subject || formData.wr_content) {
        saveDraft(boTable, formData);
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [isEdit, boTable, formData]);

  const categories = board?.bo_category_list
    ? board.bo_category_list.split("|").filter(Boolean)
    : [];

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");

    if (!formData.wr_subject.trim()) {
      submittingRef.current = false;
      setError("제목을 입력해주세요.");
      return;
    }
    const contentText = board?.bo_use_dhtml_editor === 1
      ? htmlToPlainText(formData.wr_content)
      : formData.wr_content.trim();
    if (!contentText) {
      submittingRef.current = false;
      setError("내용을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ca_name: formData.ca_name || undefined,
        wr_subject: formData.wr_subject,
        wr_content: formData.wr_content,
        wr_link1: formData.wr_link1 || undefined,
        wr_link2: formData.wr_link2 || undefined,
        secret: formData.wr_secret ? "secret" : "",
        html: formData.html,
        reply_to: replyTo ? replyTo.wr_id : undefined,
      };

      const editWrId = searchParams.get("wr_id");
      let targetWrId: number | undefined;
      let targetPost: Partial<WritePost> | undefined;

      if (isEdit && editWrId) {
        // posts.php는 PATCH /posts/{bo_table}/{wr_id} 를 받음
        const res = await apiClient.patch<WritePost>(`/posts/${boTable}/${editWrId}`, payload);
        targetWrId = Number(editWrId);
        targetPost = res.data;
      } else {
        clearDraft(boTable);
        const res = await apiClient.post<WritePost>(`/boards/${boTable}/posts`, payload);
        targetWrId = res.data?.wr_id;
        targetPost = res.data;
      }

      // Sync attachments (new + edit). Skip if nothing to do AND it's a brand
      // new post — saves a round trip when the user posted text-only.
      const hasNewFiles = attachments.some((a) => a.kind === "new");
      const editedFiles = isEdit; // edit always reconciles to handle deletes
      if (targetWrId && (hasNewFiles || editedFiles)) {
        const fd = new FormData();
        attachments.forEach((att) => {
          if (att.kind === "existing") {
            fd.append("order[]", String(att.bf_no));
          } else {
            // index within only "new" entries
            const newIdx = attachments
              .filter((a) => a.kind === "new")
              .findIndex((a) => a.id === att.id);
            fd.append("order[]", `new:${newIdx}`);
            fd.append("files[]", att.file);
          }
        });

        await apiClient.upload(`/boards/${boTable}/${targetWrId}/files`, fd);
      }

      const settings = await getClientPublicSettings().catch(() => null);
      window.location.href = targetWrId
        ? boardPostHref(
            boTable,
            { wr_id: targetWrId, wr_seo_title: targetPost?.wr_seo_title },
            settings?.cf_bbs_rewrite
          )
        : g5ShortHref(`/boards/${boTable}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "게시글 저장에 실패했습니다.";
      setError(message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!isInitialized || !user) return null;

  if (loading) {
    return (
      <div role="status" aria-label="게시글 작성 화면 로딩 중" className="container mx-auto space-y-4 px-4 py-8">
        <span className="sr-only">게시글 작성 화면 로딩 중</span>
        <div aria-hidden="true" className="skeleton h-8 w-48 rounded" />
        <div aria-hidden="true" className="skeleton h-11 w-full rounded-md" />
        <div aria-hidden="true" className="skeleton h-72 w-full rounded-lg" />
        <div aria-hidden="true" className="skeleton h-10 w-24 rounded-md" />
      </div>
    );
  }

  // 새 글 · 답글은 들어올 때 권한을 본다 — 다 쓰고 저장을 누른 뒤에야 거절당하지 않게(그누보드 write.php 와 같다).
  // 글 수정은 게시판 레벨이 아니라 글쓴이 · 관리자 여부로 정해지므로 여기서 막지 않는다(서버가 판단).
  const writeKind = replyTo || Number(searchParams.get("reply_to") || "0") > 0 ? "reply" : "write";
  if (board && !isEdit && !canWriteToBoard(board, user, writeKind)) {
    return (
      <div className="board-write-page container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>
            {writeKind === "reply" ? "이 게시판에 답글을 쓸 권한이 없습니다." : "이 게시판에 글을 쓸 권한이 없습니다."}
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button asChild variant="outline">
            <a href={g5ShortHref(`/boards/${boTable || routeBoTable}`)}>목록으로</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="board-write-page container mx-auto px-4 py-8">
      {board && (
        <Breadcrumb
          items={[
            { label: board.bo_subject, href: g5ShortHref(`/boards/${boTable}`) },
            { label: isEdit ? "글 수정" : replyTo ? "답글 쓰기" : "글 쓰기" },
          ]}
        />
      )}
      <Card className="board-write-card">
        <CardHeader className="board-write-head">
          <div className="flex items-center justify-between">
            <CardTitle className="board-write-title">{isEdit ? "글 수정" : replyTo ? "답글 쓰기" : "글 쓰기"}</CardTitle>
            {!isEdit && (
              <PostTemplates
                onApply={(prefix, content) => {
                  setFormData((prev) => ({
                    ...prev,
                    wr_subject: prefix + prev.wr_subject.replace(/^\[(질문|후기|공지)\]\s*/, ""),
                    wr_content: content,
                  }));
                }}
              />
            )}
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          {replyTo && (
            <div className="board-write-reply-banner mx-6 mt-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
              <span className="text-muted-foreground">답글 대상:</span>{" "}
              <a href={g5ShortHref(`/boards/${boTable}/${replyTo.wr_id}`)} className="font-medium hover:underline">
                {replyTo.wr_subject || `#${replyTo.wr_id}`}
              </a>
            </div>
          )}
          <CardContent className="board-write-body space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Category */}
            {categories.length > 0 && (
              <div className="board-write-field board-write-category space-y-2">
                <Label>분류</Label>
                <Select
                  value={formData.ca_name}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, ca_name: v }))
                  }
                >
                  <SelectTrigger aria-label="분류">
                    <SelectValue placeholder="분류를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Subject */}
            <div className="board-write-field board-write-subject space-y-2">
              <Label htmlFor="wr_subject">제목</Label>
              <Input
                id="wr_subject"
                name="wr_subject"
                value={formData.wr_subject}
                onChange={handleChange}
                placeholder="제목을 입력하세요"
                required
              />
            </div>

            {/* Content */}
            <div className="board-write-field board-write-content space-y-2">
              <Label htmlFor="wr_content">내용</Label>
              {board?.bo_use_dhtml_editor === 1 ? (
                <TiptapEditor
                  content={formData.wr_content}
                  onChange={(html) =>
                    setFormData((prev) => ({ ...prev, wr_content: html }))
                  }
                  placeholder="내용을 입력하세요"
                />
              ) : (
                <Textarea
                  id="wr_content"
                  name="wr_content"
                  value={formData.wr_content}
                  onChange={handleChange}
                  placeholder="내용을 입력하세요"
                  rows={15}
                  required
                />
              )}
            </div>

            {/* File attachments */}
            <div className="board-write-field board-write-files space-y-2">
              <Label>첨부파일</Label>
              <FileAttachments
                value={attachments}
                onChange={setAttachments}
                maxCount={board?.bo_upload_count ?? 0}
                maxSize={board?.bo_upload_size ?? 0}
                disabled={submitting}
              />
            </div>

            {/* Links */}
            <div className="board-write-field board-write-link space-y-2">
              <Label htmlFor="wr_link1">링크 1</Label>
              <Input
                id="wr_link1"
                name="wr_link1"
                type="url"
                value={formData.wr_link1}
                onChange={handleChange}
                placeholder="https://"
              />
            </div>
            <div className="board-write-field board-write-link space-y-2">
              <Label htmlFor="wr_link2">링크 2</Label>
              <Input
                id="wr_link2"
                name="wr_link2"
                type="url"
                value={formData.wr_link2}
                onChange={handleChange}
                placeholder="https://"
              />
            </div>

            {/* Options */}
            <div className="board-write-options flex flex-wrap items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wr_secret"
                  checked={formData.wr_secret}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      wr_secret: e.target.checked,
                    }))
                  }
                />
                <Label htmlFor="wr_secret" className="text-sm font-normal">
                  비밀글
                </Label>
              </div>
              {board?.bo_use_dhtml_editor !== 1 && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-normal">HTML</Label>
                  <Select
                    value={formData.html}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, html: v }))
                    }
                  >
                    <SelectTrigger className="w-[140px]" aria-label="HTML 옵션">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">사용안함</SelectItem>
                      <SelectItem value="1">HTML 허용</SelectItem>
                      <SelectItem value="2">HTML 자동줄바꿈</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="board-write-actions flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  window.location.href = g5ShortHref(`/boards/${boTable}`);
                }}
                disabled={submitting}
              >
                취소
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "저장 중..."
                  : isEdit
                    ? "수정 완료"
                    : "작성 완료"}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
