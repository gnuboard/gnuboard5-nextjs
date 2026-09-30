"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import LinkExtension from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  ImageIcon,
  Upload,
  Undo,
  Redo,
  Loader2,
} from "lucide-react";

interface CommentEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

const UPLOAD_MAX_SIZE = 20 * 1024 * 1024;
const UPLOAD_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/x-ms-bmp"];
const UPLOAD_ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

function ToolbarBtn({
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
        "p-1 rounded hover:bg-muted transition-colors disabled:opacity-40",
        isActive && "bg-muted text-primary"
      )}
    >
      {children}
    </button>
  );
}

export function CommentEditor({
  content,
  onChange,
  placeholder = "댓글을 입력하세요",
  className,
}: CommentEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        blockquote: false,
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
      TextStyle,
      Color,
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== undefined && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

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

      if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (!UPLOAD_ALLOWED_EXTS.includes(ext)) {
          setUploadError(`허용되지 않는 파일 형식입니다. (${UPLOAD_ALLOWED_EXTS.join(", ")})`);
          return;
        }
      }

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

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadImageFile(file);
      e.target.value = "";
    },
    [uploadImageFile]
  );

  const handleImageUrl = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("이미지 URL을 입력하세요", "https://");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

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

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) uploadImageFile(file);
          return;
        }
      }
    },
    [uploadImageFile]
  );

  if (!editor) {
    return <div className="skeleton min-h-[80px] rounded-lg border" />;
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b bg-muted/30">
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="굵게"
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="기울임"
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="밑줄"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          title="취소선"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <div className="w-px h-4 bg-border mx-0.5" />

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="글머리 기호"
        >
          <List className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="번호 매기기"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <div className="w-px h-4 bg-border mx-0.5" />

        <ToolbarBtn
          onClick={handleLink}
          isActive={editor.isActive("link")}
          title="링크"
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>

        {/* Image */}
        <div className="relative">
          <ToolbarBtn
            onClick={() => setShowImageMenu(!showImageMenu)}
            title="이미지 삽입"
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
          </ToolbarBtn>
          {showImageMenu && (
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 w-32 py-1">
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                onClick={() => {
                  setShowImageMenu(false);
                  fileInputRef.current?.click();
                }}
              >
                <Upload className="w-3 h-3" />
                파일 업로드
              </button>
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                onClick={() => {
                  setShowImageMenu(false);
                  handleImageUrl();
                }}
              >
                <LinkIcon className="w-3 h-3" />
                URL 입력
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-border mx-0.5" />

        <ToolbarBtn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="실행 취소"
        >
          <Undo className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="다시 실행"
        >
          <Redo className="w-3.5 h-3.5" />
        </ToolbarBtn>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ALLOWED_EXTS.map((e) => `.${e}`).join(",")}
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-destructive bg-destructive/10 border-b">
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
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 border-b">
          <Loader2 className="w-3 h-3 animate-spin" />
          이미지 업로드 중...
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onPaste={handlePaste}
      >
        <EditorContent
          editor={editor}
          className="min-h-[80px] px-3 py-2 [&_.tiptap]:min-h-[60px] [&_.tiptap]:focus:outline-none [&_.tiptap]:text-sm"
        />
      </div>
    </div>
  );
}
