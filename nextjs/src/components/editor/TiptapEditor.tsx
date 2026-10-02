"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import LinkExtension from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { EDITOR_IMAGE_ACCEPT, useEditorImageUpload } from "./useEditorImageUpload";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Code2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  ImageIcon,
  Upload,
  Minus,
  Undo,
  Redo,
  Palette,
  Loader2,
  TableIcon,
  Columns,
  Rows,
  Trash2,
} from "lucide-react";

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  /**
   * 댓글 · 후기 · 상품문의처럼 짧은 글 — 예전 댓글 전용 에디터처럼 가볍게(아이콘 14px · 단추 22px · 얇은 도구 모음 ·
   * 입력칸 80px), 도구 모음은 저장 · 표시 후에도 남는 서식만(굵게 · 기울임 · 밑줄 · 취소선 · 목록 · 링크 · 사진 · 되돌리기).
   * 이 글들은 저장할 때 style 속성을(정렬 · 색),
   * 보여 줄 때 제목 · 표 · 구분선을 지우므로 그 기능은 아예 켜지 않는다(단축 입력 "# " · "---" 로도 생기지 않게).
   */
  compact?: boolean;
  /** 본문 안에 박힌 사진(data: base64)을 받을지. 기본은 짧은 글이 아닐 때만 — 후기 · 상품문의 API 는 data: 주소를 지워 빈 사진이 된다. */
  allowBase64Images?: boolean;
  /** 화면 낭독기용 입력칸 이름. 없으면 placeholder. (contenteditable 이라 <label htmlFor> 가 닿지 않는다) */
  ariaLabel?: string;
}

const COLORS = [
  "#000000", "#434343", "#666666", "#999999",
  "#e03131", "#c2255c", "#9c36b5", "#6741d9",
  "#3b5bdb", "#1971c2", "#0c8599", "#099268",
  "#2f9e44", "#66a80f", "#f08c00", "#e8590c",
];

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40",
        isActive && "bg-muted text-primary"
      )}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <div className="w-px h-6 bg-border mx-1" />;
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = "내용을 입력하세요",
  className,
  compact = false,
  allowBase64Images,
  ariaLabel,
}: TiptapEditorProps) {
  const [showSource, setShowSource] = useState(false);
  const [sourceHtml, setSourceHtml] = useState(content);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);

  const lowlight = createLowlight(common);

  const editor = useEditor({
    extensions: [
      StarterKit.configure(
        compact
          ? { heading: false, horizontalRule: false, codeBlock: false, blockquote: false }
          : {
              heading: { levels: [1, 2, 3] },
              codeBlock: false, // replaced by CodeBlockLowlight
            }
      ),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      Image.configure({
        allowBase64: allowBase64Images ?? !compact,
        HTMLAttributes: { class: "max-w-full h-auto rounded" },
      }),
      Placeholder.configure({ placeholder }),
      ...(compact
        ? []
        : [
            TextAlign.configure({
              types: ["heading", "paragraph"],
            }),
            TextStyle,
            Color,
            Table.configure({
              resizable: true,
              HTMLAttributes: { class: "tiptap-table" },
            }),
            TableRow,
            TableCell,
            TableHeader,
            CodeBlockLowlight.configure({
              lowlight,
              HTMLAttributes: { class: "tiptap-code-block" },
            }),
          ]),
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": ariaLabel || placeholder },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });
  const {
    uploading,
    error: uploadError,
    clearError: clearUploadError,
    fileInputRef,
    openFilePicker,
    handleFileInputChange,
    handleDrop,
    handleDragOver,
    handlePaste,
  } = useEditorImageUpload(editor);

  // Sync external content changes (e.g. edit mode loading). 빈 값도 따라간다 — 댓글을 등록한 뒤 입력칸을 비울 때.
  // 에디터가 이미 비어 있으면(<p></p>) 다시 넣지 않는다.
  useEffect(() => {
    if (!editor) return;
    if (content) {
      if (editor.getHTML() !== content) editor.commands.setContent(content);
    } else if (!editor.isEmpty) {
      editor.commands.setContent("");
    }
  }, [content, editor]);

  // Source mode sync
  useEffect(() => {
    if (showSource && editor) {
      setSourceHtml(editor.getHTML());
    }
  }, [showSource, editor]);

  const handleSourceChange = useCallback(
    (html: string) => {
      setSourceHtml(html);
      onChange(html);
    },
    [onChange]
  );

  const applySource = useCallback(() => {
    if (editor) {
      editor.commands.setContent(sourceHtml);
      onChange(sourceHtml);
    }
    setShowSource(false);
  }, [editor, sourceHtml, onChange]);

  const handleLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("링크 URL을 입력하세요", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const handleImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("이미지 URL을 입력하세요", "https://");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  if (!editor) {
    return (
      <div className={cn("skeleton rounded-lg border", compact ? "min-h-[80px]" : "min-h-[300px]")} />
    );
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {/* Toolbar */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-0.5 border-b bg-muted/30",
          // 짧은 글: 얇은 줄 · 작은 단추(p-1) · 14px 아이콘 · 짧은 구분선 — 예전 댓글 에디터와 같은 크기
          compact ? "px-2 py-1 [&_button]:p-1 [&_svg]:h-3.5 [&_svg]:w-3.5 [&>.w-px]:mx-0.5 [&>.w-px]:h-4" : "p-2"
        )}
      >
        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="굵게"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="기울임"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="밑줄"
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          title="취소선"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        {!compact && (
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
            title="인라인 코드"
          >
            <Code className="w-4 h-4" />
          </ToolbarButton>
        )}

        <ToolbarSeparator />

        {/* Headings — 짧은 글에는 없다 */}
        {!compact && (
          <>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="제목 1"
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="제목 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="제목 3"
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarSeparator />
          </>
        )}

        {/* Lists & blocks */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="글머리 기호"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="번호 매기기"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        {!compact && (
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive("blockquote")}
            title="인용"
          >
            <Quote className="w-4 h-4" />
          </ToolbarButton>
        )}
        {!compact && (
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive("codeBlock")}
            title="코드 블록"
          >
            <Code2 className="w-4 h-4" />
          </ToolbarButton>
        )}

        <ToolbarSeparator />

        {/* Alignment · Color — 짧은 글에는 없다(저장할 때 style 이 지워진다) */}
        {!compact && (
          <>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
          title="왼쪽 정렬"
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
          title="가운데 정렬"
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
          title="오른쪽 정렬"
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          isActive={editor.isActive({ textAlign: "justify" })}
          title="양쪽 정렬"
        >
          <AlignJustify className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Color */}
        <div className="relative">
          <ToolbarButton
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="글자 색상"
          >
            <Palette className="w-4 h-4" />
          </ToolbarButton>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 p-2 bg-popover border rounded-lg shadow-lg z-50 grid grid-cols-4 gap-1 w-fit">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    editor.chain().focus().setColor(color).run();
                    setShowColorPicker(false);
                  }}
                  title={color}
                />
              ))}
              <button
                type="button"
                className="w-6 h-6 rounded border border-border text-xs hover:bg-muted col-span-4 mt-1"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowColorPicker(false);
                }}
              >
                초기화
              </button>
            </div>
          )}
        </div>

        <ToolbarSeparator />
          </>
        )}

        {/* Insert */}
        <ToolbarButton
          onClick={handleLink}
          isActive={editor.isActive("link")}
          title="링크"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>
        <div className="relative">
          <ToolbarButton
            onClick={() => setShowImageMenu(!showImageMenu)}
            title="이미지 삽입"
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
          </ToolbarButton>
          {showImageMenu && (
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 w-36 py-1">
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-muted transition-colors text-left"
                onClick={() => {
                  setShowImageMenu(false);
                  openFilePicker();
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                파일 업로드
              </button>
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-muted transition-colors text-left"
                onClick={() => {
                  setShowImageMenu(false);
                  handleImage();
                }}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                URL 입력
              </button>
            </div>
          )}
        </div>
        {!compact && (
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="구분선"
          >
            <Minus className="w-4 h-4" />
          </ToolbarButton>
        )}

        <ToolbarSeparator />

        {/* Table — 짧은 글에는 없다 */}
        {!compact && (
          <>
        <div className="relative">
          <ToolbarButton
            onClick={() => {
              if (editor.isActive("table")) {
                // Show table context menu idea - for now just toggle
              } else {
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
              }
            }}
            isActive={editor.isActive("table")}
            title="표 삽입 (3x3)"
          >
            <TableIcon className="w-4 h-4" />
          </ToolbarButton>
        </div>
        {editor.isActive("table") && (
          <>
            <ToolbarButton
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              title="열 추가"
            >
              <Columns className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().addRowAfter().run()}
              title="행 추가"
            >
              <Rows className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteTable().run()}
              title="표 삭제"
            >
              <Trash2 className="w-4 h-4" />
            </ToolbarButton>
          </>
        )}

        <ToolbarSeparator />
          </>
        )}

        {/* History */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="실행 취소"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="다시 실행"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>

        {/* Source toggle — 짧은 글에는 없다 */}
        {!compact && <ToolbarSeparator />}
        {!compact && (
        <ToolbarButton
          onClick={() => {
            if (showSource) {
              applySource();
            } else {
              setShowSource(true);
            }
          }}
          isActive={showSource}
          title="HTML 소스"
        >
          <span className="text-xs font-mono px-0.5">&lt;/&gt;</span>
        </ToolbarButton>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        aria-label="파일 첨부"
        accept={EDITOR_IMAGE_ACCEPT}
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-center justify-between px-3 py-2 text-xs text-destructive bg-destructive/10 border-b">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={clearUploadError}
            className="ml-2 hover:text-destructive/80"
          >
            &times;
          </button>
        </div>
      )}

      {/* Uploading indicator */}
      {uploading && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/50 border-b">
          <Loader2 className="w-3 h-3 animate-spin" />
          이미지 업로드 중...
        </div>
      )}

      {/* Editor / Source */}
      {showSource ? (
        <textarea
          value={sourceHtml}
          onChange={(e) => handleSourceChange(e.target.value)}
          className={cn(
            "w-full p-4 font-mono text-sm bg-background resize-y focus:outline-none",
            compact ? "min-h-[80px]" : "min-h-[300px]"
          )}
          spellCheck={false}
        />
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onPaste={handlePaste}
        >
          <EditorContent
            editor={editor}
            className={cn(
              "[&_.tiptap]:focus:outline-none",
              compact
                ? "min-h-[80px] px-3 py-2 [&_.tiptap]:min-h-[60px] [&_.tiptap]:text-sm"
                : "min-h-[300px] p-4 [&_.tiptap]:min-h-[280px]"
            )}
          />
        </div>
      )}
    </div>
  );
}
