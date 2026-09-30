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
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
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

// SmartEditor2 규격 상수
const UPLOAD_MAX_SIZE = 20 * 1024 * 1024; // 20MB
const UPLOAD_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/x-ms-bmp"];
const UPLOAD_ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

export function TiptapEditor({
  content,
  onChange,
  placeholder = "내용을 입력하세요",
  className,
}: TiptapEditorProps) {
  const [showSource, setShowSource] = useState(false);
  const [sourceHtml, setSourceHtml] = useState(content);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lowlight = createLowlight(common);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false, // replaced by CodeBlockLowlight
      }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      Image.configure({
        allowBase64: true,
        HTMLAttributes: { class: "max-w-full h-auto rounded" },
      }),
      Placeholder.configure({ placeholder }),
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
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external content changes (e.g. edit mode loading)
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      editor.commands.setContent(content);
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

  const uploadImageFile = useCallback(
    async (file: File) => {
      if (!editor) return;

      // Validate file type
      if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (!UPLOAD_ALLOWED_EXTS.includes(ext)) {
          setUploadError(`허용되지 않는 파일 형식입니다. (${UPLOAD_ALLOWED_EXTS.join(", ")})`);
          return;
        }
      }

      // Validate file size
      if (file.size > UPLOAD_MAX_SIZE) {
        setUploadError(`파일 크기가 20MB를 초과합니다. (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
        return;
      }

      setUploading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.upload<{ file_url: string }>("/upload", formData);
        if (res.success && res.data?.file_url) {
          editor.chain().focus().setImage({ src: res.data.file_url }).run();
        } else {
          setUploadError("이미지 업로드에 실패했습니다.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.";
        setUploadError(message);
      } finally {
        setUploading(false);
      }
    },
    [editor]
  );

  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadImageFile(file);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [uploadImageFile]
  );

  const handleImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("이미지 URL을 입력하세요", "https://");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  // Handle drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files?.length) return;

      const imageFiles = Array.from(files).filter(
        (f) => f.type.startsWith("image/") || UPLOAD_ALLOWED_EXTS.includes(f.name.split(".").pop()?.toLowerCase() || "")
      );

      if (imageFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        imageFiles.forEach((file) => uploadImageFile(file));
      }
    },
    [uploadImageFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
    }
  }, []);

  // Handle paste
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            uploadImageFile(file);
          }
          return;
        }
      }
    },
    [uploadImageFile]
  );

  if (!editor) {
    return (
      <div className="skeleton min-h-[300px] rounded-lg border" />
    );
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-muted/30">
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
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive("code")}
          title="인라인 코드"
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Headings */}
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
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="인용"
        >
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="코드 블록"
        >
          <Code2 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Alignment */}
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
                  handleImageUpload();
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
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="구분선"
        >
          <Minus className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Table */}
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

        <ToolbarSeparator />

        {/* Source toggle */}
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
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        aria-label="파일 첨부"
        accept={UPLOAD_ALLOWED_EXTS.map((e) => `.${e}`).join(",")}
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-center justify-between px-3 py-2 text-xs text-destructive bg-destructive/10 border-b">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
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
          className="w-full min-h-[300px] p-4 font-mono text-sm bg-background resize-y focus:outline-none"
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
            className="min-h-[300px] p-4 [&_.tiptap]:min-h-[280px] [&_.tiptap]:focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
