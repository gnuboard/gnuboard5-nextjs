"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { commentEditorOn, contentForEditor, looksLikeHtml, siteUsesEditor } from "@/lib/editor-content";
import { getClientPublicSettings } from "@/services/settings";

/*
 * 사이트 에디터를 따르는 본문 입력 — 관리자 > 기본환경설정 > "에디터 선택"(cf_editor)이 "사용안함"이면 글자 입력칸,
 * 에디터가 골라져 있으면 게시판 글쓰기와 같은 웹 에디터(Tiptap). 그누보드는 어느 에디터(스마트에디터 · CK 등)를
 * 골랐는지에 따라 다른 에디터를 띄우지만, 이 화면은 무엇이 골라져 있든 같은 웹 에디터를 쓴다.
 * 상품후기 · 상품문의 · 댓글 · 1:1 문의가 쓴다(게시판 글쓰기는 게시판 설정까지 보므로 따로 고른다).
 */

const TiptapEditor = dynamic(
  () => import("@/components/editor/TiptapEditor").then((mod) => ({ default: mod.TiptapEditor })),
  {
    ssr: false,
    loading: () => <div className="skeleton min-h-[80px] rounded-lg border" />,
  }
);

type EditorSettings = { cfEditor: unknown; commentEditor: unknown };

/** 공개 설정에서 에디터 관련 값만. 받기 전에는 null, 못 받으면 둘 다 꺼진 값. */
function useEditorSettings(): EditorSettings | null {
  const [settings, setSettings] = useState<EditorSettings | null>(null);

  useEffect(() => {
    let alive = true;
    getClientPublicSettings()
      .then((value) => {
        if (alive) setSettings({ cfEditor: value?.cf_editor, commentEditor: value?.comment_editor });
      })
      .catch(() => {
        if (alive) setSettings({ cfEditor: "", commentEditor: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  return settings;
}

/**
 * 사이트 에디터를 쓰는지(cf_editor 가 비어 있지 않은지). 설정을 받기 전에는 null — 그동안 입력칸을 그리거나
 * 채우지 않는다(글자 입력칸으로 채운 뒤 에디터로 바뀌면 줄바꿈이 사라진다). 설정을 못 받으면 글자 입력칸(false).
 */
export function useSiteEditor(): boolean | null {
  const settings = useEditorSettings();
  return settings === null ? null : siteUsesEditor(settings.cfEditor);
}

/** 댓글을 웹 에디터로 쓰는지 — 사이트 에디터에 더해 api/.env 의 G5_COMMENT_EDITOR_USE 까지(commentEditorOn). */
export function useCommentEditor(): boolean | null {
  const settings = useEditorSettings();
  return settings === null ? null : commentEditorOn(settings.cfEditor, settings.commentEditor);
}

export function RichTextField({
  id,
  value,
  onChange,
  useEditor,
  rows = 4,
  placeholder = "내용을 입력하세요",
  compact = true,
  className,
  ariaLabel,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** useSiteEditor() 의 값. null(아직 모름)이면 자리만 잡아 둔다. */
  useEditor: boolean | null;
  rows?: number;
  placeholder?: string;
  /** 웹 에디터의 입력 영역을 낮게 — 짧은 글(댓글 · 후기)은 true, 긴 글(1:1 문의)은 false. */
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  // 에디터로 여는데 본문이 글자 글이면(설정을 받기 전에 "수정"을 눌렀거나 예전 글) 줄마다 문단으로 바꿔 넣고,
  // 부모의 값도 같은 HTML 로 맞춘다 — 그대로 넣으면 줄바꿈이 사라지고 "<" 가 태그로 읽힌다.
  const needsConversion = useEditor === true && value !== "" && !looksLikeHtml(value);
  useEffect(() => {
    if (needsConversion) onChange(contentForEditor(value));
  }, [needsConversion, onChange, value]);

  if (useEditor === null) {
    return <div className={cn("skeleton rounded-md border", compact ? "min-h-[80px]" : "min-h-[300px]")} />;
  }
  if (useEditor) {
    return (
      <TiptapEditor
        content={needsConversion ? contentForEditor(value) : value}
        onChange={onChange}
        placeholder={placeholder}
        compact={compact}
        // 사진은 올리기로만 — 본문에 박힌 사진(data:)은 후기 · 상품문의 API 가 지워 빈 사진이 된다.
        allowBase64Images={false}
        ariaLabel={ariaLabel}
        className={className}
      />
    );
  }
  return (
    <Textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={className}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
    />
  );
}
