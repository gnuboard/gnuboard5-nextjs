"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { shouldBypassImageOptimization } from "@/lib/image";

interface GalleryThumbnailProps {
  src: string;
  alt: string;
  sizes: string;
  /** 페이지 상단 LCP 후보 (첫 3개 정도) 면 priority=true. fetchPriority='high' 자동. */
  priority?: boolean;
}

export function GalleryThumbnail({ src, alt, sizes, priority = false }: GalleryThumbnailProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
      </div>
    );
  }

  // 사용자 게시글 본문/썸네일 — 임의 외부 호스트 가능. unoptimized 로 raw 렌더해
  // next/image 의 remotePatterns 검사 우회 + SSRF 경로 차단.
  const unoptimized = shouldBypassImageOptimization(src);

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover group-hover:scale-105 transition-transform duration-300"
      sizes={sizes}
      onError={() => setError(true)}
      priority={priority}
      unoptimized={unoptimized}
    />
  );
}
