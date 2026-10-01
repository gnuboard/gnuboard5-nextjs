"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shouldBypassImageOptimization } from "@/lib/image";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

export interface MemberMediaRule {
  size?: number;
  width?: number;
  height?: number;
}

interface MemberMediaFieldProps {
  label: string;
  description: string;
  url?: string | null;
  fallback: string;
  rule?: MemberMediaRule;
  shape: "circle" | "square";
  previewSize: number;
  /** 받을 형식 — 회원이미지는 그누보드처럼 gif · jpg · png 만. */
  accept: string;
  onUpload: (file: File) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onChanged: () => Promise<void>;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function ruleHint(rule: MemberMediaRule | undefined): string {
  const parts: string[] = [];
  if (rule?.width && rule?.height) parts.push(`${rule.width}×${rule.height}px 보다 크면 잘라서 줄입니다`);
  if (rule?.size) parts.push(`${rule.size.toLocaleString("ko-KR")}바이트 이하`);
  return parts.join(" · ");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 마이페이지의 그림 한 칸 — 회원이미지와 회원아이콘이 같은 모양으로 쓴다. */
export function MemberMediaField({
  label,
  description,
  url,
  fallback,
  rule,
  shape,
  previewSize,
  accept,
  onUpload,
  onDelete,
  onChanged,
}: MemberMediaFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // 같은 주소로 다시 올려도 새 그림이 보이게 올린 뒤에는 시각을 붙인다.
  const [version, setVersion] = useState(0);
  const src = url ? (version ? `${url}${url.includes("?") ? "&" : "?"}v=${version}` : url) : "";
  const maxBytes = rule?.size && rule.size > 0 ? rule.size : DEFAULT_MAX_BYTES;
  const hint = ruleHint(rule);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toastError("그림 파일만 올릴 수 있습니다.");
      return;
    }
    if (file.size > maxBytes) {
      toastError(`${label}은(는) ${maxBytes.toLocaleString("ko-KR")}바이트 이하로 올려 주세요.`);
      return;
    }
    setBusy(true);
    try {
      await onUpload(file);
      await onChanged();
      setVersion(Date.now());
      toastSuccess(`${label}을(를) 바꿨습니다.`);
    } catch (error) {
      toastError(errorMessage(error, `${label}을(를) 올리지 못했습니다.`));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDelete();
      await onChanged();
      setVersion(0);
      toastSuccess(`${label}을(를) 지웠습니다.`);
    } catch (error) {
      toastError(errorMessage(error, `${label}을(를) 지우지 못했습니다.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden border-2 border-border bg-muted",
          shape === "circle" ? "rounded-full" : "rounded-md"
        )}
        style={{ width: previewSize, height: previewSize }}
      >
        {src ? (
          <Image
            src={src}
            alt={label}
            width={previewSize}
            height={previewSize}
            className="h-full w-full object-cover"
            unoptimized={shouldBypassImageOptimization(src)}
          />
        ) : (
          <span className="text-lg font-bold text-muted-foreground">{fallback}</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-muted-foreground">{description}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            {url ? "바꾸기" : "올리기"}
          </Button>
          {url ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void handleDelete()}>
              <Trash2 className="h-3.5 w-3.5" />
              지우기
            </Button>
          ) : null}
        </div>
      </div>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
    </div>
  );
}
