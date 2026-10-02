"use client";

import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { api } from "@/lib/api";

// SmartEditor2 규격 상수
const UPLOAD_MAX_SIZE = 20 * 1024 * 1024; // 20MB
const UPLOAD_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/x-ms-bmp"];
const UPLOAD_ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

/** 숨은 파일 입력칸의 accept — 올릴 수 있는 확장자. */
export const EDITOR_IMAGE_ACCEPT = UPLOAD_ALLOWED_EXTS.map((ext) => `.${ext}`).join(",");

/**
 * 웹 에디터의 사진 올리기 — 파일 고르기 · 끌어 놓기 · 붙여 넣기로 받은 사진을 /upload 로 올리고 본문에 넣는다.
 * 형식(jpg · png · gif · webp · bmp)과 크기(20MB)를 먼저 본다. TiptapEditor 가 쓴다.
 */
export function useEditorImageUpload(editor: Editor | null) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadImageFile = useCallback(
    async (file: File) => {
      if (!editor) return;

      // Validate file type
      if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (!UPLOAD_ALLOWED_EXTS.includes(ext)) {
          setError(`허용되지 않는 파일 형식입니다. (${UPLOAD_ALLOWED_EXTS.join(", ")})`);
          return;
        }
      }

      // Validate file size
      if (file.size > UPLOAD_MAX_SIZE) {
        setError(`파일 크기가 20MB를 초과합니다. (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
        return;
      }

      setUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.upload<{ file_url: string }>("/upload", formData);
        if (res.success && res.data?.file_url) {
          editor.chain().focus().setImage({ src: res.data.file_url }).run();
        } else {
          setError("이미지 업로드에 실패했습니다.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.";
        setError(message);
      } finally {
        setUploading(false);
      }
    },
    [editor]
  );

  const openFilePicker = useCallback(() => {
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

  const clearError = useCallback(() => setError(null), []);

  return {
    uploading,
    error,
    clearError,
    fileInputRef,
    openFilePicker,
    handleFileInputChange,
    handleDrop,
    handleDragOver,
    handlePaste,
  };
}
