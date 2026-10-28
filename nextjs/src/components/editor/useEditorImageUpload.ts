"use client";

import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { api } from "@/lib/api";

// SmartEditor2 규격 상수
const UPLOAD_MAX_SIZE = 20 * 1024 * 1024; // 20MB
const UPLOAD_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/x-ms-bmp"];
const UPLOAD_ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

/** 웹 에디터 사진은 임시로 올린다 — 글을 저장할 때 서버가 옮긴다(POST /upload 의 stage). */
export const EDITOR_UPLOAD_STAGE = "tmp";

/** 숨은 파일 입력칸의 accept — 올릴 수 있는 확장자. */
export const EDITOR_IMAGE_ACCEPT = UPLOAD_ALLOWED_EXTS.map((ext) => `.${ext}`).join(",");

export type EditorUploadProgress = { done: number; total: number };

/** 올리기 전에 형식 · 크기를 본다 — 걸리면 그 까닭, 괜찮으면 null. */
function checkImageFile(file: File): string | null {
  if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!UPLOAD_ALLOWED_EXTS.includes(ext)) {
      return `허용되지 않는 파일 형식입니다. (${UPLOAD_ALLOWED_EXTS.join(", ")})`;
    }
  }
  if (file.size > UPLOAD_MAX_SIZE) {
    return `파일 크기가 20MB를 초과합니다. (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
  }
  return null;
}

/**
 * 웹 에디터의 사진 올리기 — 파일 고르기(여러 장) · 끌어 놓기 · 붙여 넣기로 받은 사진을 /upload 로 올리고 본문에 넣는다.
 * 형식(jpg · png · gif · webp · bmp)과 크기(20MB)를 먼저 본다. TiptapEditor 가 쓴다.
 * /upload 는 한 번에 한 장이라, 받은 사진을 대기열에 넣고 고른 순서대로 한 장씩 올려 그 순서로 본문에 넣는다.
 * 한 장이 실패해도 나머지는 계속 올리고, 실패한 것만 모아 알린다.
 * 사진은 stage=tmp 로 올린다 — 서버가 data/tmp 에 두었다가 그 글(글 · 댓글 · 후기 · 문의)을 저장할 때 data/editor 로
 * 옮기고, 글을 지우면 함께 지운다(api/lib/editor-uploads.php).
 */
export function useEditorImageUpload(editor: Editor | null) {
  const [progress, setProgress] = useState<EditorUploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 대기열 — 앞 묶음이 올라가는 중에 또 고르거나 끌어 놓아도 뒤에 이어 올린다.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const countRef = useRef<EditorUploadProgress>({ done: 0, total: 0 });
  const failuresRef = useRef<string[]>([]);

  const uploadOne = useCallback(
    async (file: File): Promise<string | null> => {
      if (!editor) return "에디터가 준비되지 않았습니다.";
      const invalid = checkImageFile(file);
      if (invalid) return invalid;
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("stage", EDITOR_UPLOAD_STAGE);
        const res = await api.upload<{ file_url: string }>("/upload", formData);
        if (res.success && res.data?.file_url) {
          const src = res.data.file_url;
          const { selection } = editor.state;
          // 방금 넣은 사진은 골라진 채(NodeSelection)로 남는다 — 그대로 setImage 하면 그 사진을 바꿔 버리니 뒤에 넣는다.
          if ("node" in selection) {
            editor.chain().focus().insertContentAt(selection.to, { type: "image", attrs: { src } }).run();
          } else {
            editor.chain().focus().setImage({ src }).run();
          }
          return null;
        }
        return "이미지 업로드에 실패했습니다.";
      } catch (err) {
        return err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.";
      }
    },
    [editor]
  );

  const uploadImageFiles = useCallback(
    (files: File[]) => {
      if (!editor || files.length === 0) return;
      if (countRef.current.total === 0) {
        failuresRef.current = [];
        setError(null);
      }
      countRef.current = { ...countRef.current, total: countRef.current.total + files.length };
      setProgress({ ...countRef.current });

      queueRef.current = queueRef.current.then(async () => {
        for (const file of files) {
          const failure = await uploadOne(file);
          if (failure) failuresRef.current.push(files.length > 1 ? `${file.name}: ${failure}` : failure);
          countRef.current = { ...countRef.current, done: countRef.current.done + 1 };
          setProgress({ ...countRef.current });
        }
        if (countRef.current.done < countRef.current.total) return;
        // 대기열이 비었다 — 진행 표시를 닫고 실패를 한 번에 알린다.
        const failures = failuresRef.current;
        countRef.current = { done: 0, total: 0 };
        setProgress(null);
        if (failures.length === 1) setError(failures[0]);
        else if (failures.length > 1) setError(`${failures.length}장을 올리지 못했습니다. ${failures[0]} 외`);
      });
    },
    [editor, uploadOne]
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      uploadImageFiles(Array.from(e.target.files ?? []));
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [uploadImageFiles]
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
        uploadImageFiles(imageFiles);
      }
    },
    [uploadImageFiles]
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

      const imageFiles = Array.from(items)
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (imageFiles.length > 0) {
        e.preventDefault();
        uploadImageFiles(imageFiles);
      }
    },
    [uploadImageFiles]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    uploading: progress !== null,
    progress,
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
