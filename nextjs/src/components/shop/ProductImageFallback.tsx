import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductImageFallback({
  compact = false,
  label = "이미지 준비중",
}: {
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "g5-product-image-fallback flex h-full w-full flex-col items-center justify-center gap-3 bg-muted text-center text-muted-foreground",
        compact ? "gap-1.5 text-[11px]" : "text-sm"
      )}
    >
      <span
        className={cn(
          "g5-product-image-fallback-icon grid place-items-center rounded-full border bg-background text-primary shadow-sm",
          compact ? "size-8" : "size-14"
        )}
        aria-hidden="true"
      >
        <ImageIcon className={compact ? "size-4" : "size-6"} />
      </span>
      <span className="font-semibold">{label}</span>
    </div>
  );
}
