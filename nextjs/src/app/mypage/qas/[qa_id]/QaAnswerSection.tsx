"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { QaItem } from "@/lib/types";
import { answerQa, answerQaWithFiles, deleteQa } from "@/services/qas";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QaAttachmentList } from "@/components/qa/qa-detail-extras";
import { QaBody } from "@/components/qa/qa-content";
import { QaContentInput, qaContentForEditor } from "@/components/qa/qa-editor";
import { htmlToText } from "@/lib/html-text";
import { toastError, toastSuccess } from "@/lib/toast";

/*
 * 1:1 문의 답변 — 그누보드 qa 스킨의 view.answer.skin.php · view.answerform.skin.php 와 같은 일:
 * 답변이 있으면 보여 주고(최고관리자는 답변수정 · 답변삭제), 없으면 최고관리자에게 답변등록 폼을,
 * 회원에게는 "답변을 준비 중입니다"를 보여 준다. 저장은 POST /v1/qas/{질문}/answer(등록 · 수정 겸용).
 */

interface QaAnswerSectionProps {
  question: QaItem;
  isAdmin: boolean;
  /** 웹 에디터로 답변을 쓰는지(useQaEditor). null 이면 아직 모름 — 폼을 그리지 않고 기다린다. */
  useEditor: boolean | null;
  /** 답변을 저장하면 갱신된 질문(답변 포함)을, 지우면 null 을 넘긴다 — null 이면 다시 불러온다. */
  onChanged: (updated: QaItem | null) => void;
}

export function QaAnswerSection({ question, isAdmin, useEditor, onChanged }: QaAnswerSectionProps) {
  const answer = question.answer;
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    if (!answer || !confirm("답변을 삭제하시겠습니까?\n질문은 답변대기 상태로 돌아갑니다.")) return;
    try {
      await deleteQa(answer.qa_id);
      toastSuccess("답변을 삭제했습니다.");
      onChanged(null);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "답변을 삭제하지 못했습니다.");
    }
  }

  const showForm = isAdmin && (!answer || editing);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{showForm ? (answer ? "답변수정" : "답변등록") : "답변"}</CardTitle>
        {isAdmin && answer && !editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 size-4" aria-hidden />
              답변수정
            </Button>
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-2 size-4" aria-hidden />
              답변삭제
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {showForm && useEditor === null ? (
          <div className="skeleton h-48 rounded-md" />
        ) : showForm ? (
          <QaAnswerForm
            question={question}
            useEditor={Boolean(useEditor)}
            onCancel={answer ? () => setEditing(false) : undefined}
            onSaved={(updated) => {
              setEditing(false);
              onChanged(updated);
            }}
          />
        ) : answer ? (
          <div className="space-y-3">
            <div>
              <p className="font-medium">{answer.qa_subject}</p>
              <p className="text-xs text-muted-foreground">
                {answer.qa_name} · {formatDate(answer.qa_datetime)}
              </p>
            </div>
            <QaBody content={answer.qa_content} html={answer.qa_html} />
            <QaAttachmentList item={answer} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">고객님의 문의에 대한 답변을 준비 중입니다.</p>
        )}
      </CardContent>
    </Card>
  );
}

function QaAnswerForm({
  question,
  useEditor,
  onCancel,
  onSaved,
}: {
  question: QaItem;
  useEditor: boolean;
  onCancel?: () => void;
  onSaved: (updated: QaItem) => void;
}) {
  const answer = question.answer;
  const [subject, setSubject] = useState(answer?.qa_subject ?? "");
  const [content, setContent] = useState(() => {
    if (!answer) return "";
    return useEditor ? qaContentForEditor(answer.qa_content, answer.qa_html) : answer.qa_content;
  });
  const [files, setFiles] = useState<Array<File | null>>([null, null]);
  const [deleteFiles, setDeleteFiles] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const contentText = useEditor ? htmlToText(content) : content.trim();
    if (!subject.trim() || (!contentText && !/<img\b/i.test(content))) {
      toastError("답변 제목과 내용을 입력하세요.");
      return;
    }
    // 에디터로 쓰면 HTML(1). 글자 입력칸이면 새 답변은 글자(0), 고칠 때는 원래 형식을 지킨다.
    const payload = { qa_subject: subject.trim(), qa_content: content, qa_html: useEditor ? 1 : (answer?.qa_html ?? 0) };
    setSaving(true);
    try {
      const hasFiles = files.some(Boolean) || deleteFiles.length > 0;
      const updated = hasFiles
        ? await answerQaWithFiles(question.qa_id, payload, { files, deleteFiles })
        : await answerQa(question.qa_id, payload);
      toastSuccess(answer ? "답변을 수정했습니다." : "답변을 등록했습니다.");
      onSaved(updated);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "답변을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="qa_answer_subject">제목</Label>
        <Input id="qa_answer_subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={255} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa_answer_content">내용</Label>
        <QaContentInput id="qa_answer_content" value={content} onChange={setContent} useEditor={useEditor} rows={8} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2].map((slot) => {
          const source = slot === 1 ? answer?.qa_source1 : answer?.qa_source2;
          return (
            <div key={slot} className="space-y-2 rounded-md border p-3">
              <Label htmlFor={`qa_answer_file_${slot}`}>첨부파일 #{slot}</Label>
              {source ? (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={deleteFiles.includes(slot)}
                    onChange={(event) =>
                      setDeleteFiles((previous) =>
                        event.target.checked ? [...new Set([...previous, slot])] : previous.filter((value) => value !== slot)
                      )
                    }
                  />
                  현재 파일 삭제: {source}
                </label>
              ) : null}
              <Input
                id={`qa_answer_file_${slot}`}
                type="file"
                onChange={(event) =>
                  setFiles((previous) => previous.map((file, index) => (index === slot - 1 ? event.target.files?.[0] || null : file)))
                }
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "저장 중" : answer ? "답변수정" : "답변등록"}
        </Button>
      </div>
    </form>
  );
}
