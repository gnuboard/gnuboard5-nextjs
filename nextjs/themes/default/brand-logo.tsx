"use client";

import { useCallback, useState } from "react";
import { g5BaseUrlForRuntime, g5PathForRuntime } from "@/lib/config";

/**
 * 로고 그림 주소. 정적 테마는 그누보드와 같은 도메인이라 경로만(하위 폴더면 그 앞이 붙는다) 쓰고,
 * 서버 실행 방식(Vercel 등)은 그누보드가 다른 도메인이라 그누보드 주소(NEXT_PUBLIC_G5_URL)를 앞에 붙인다 —
 * 데모에서 쇼핑몰 로고(data/common/logo_img)를 프런트 도메인에서 찾아 404 가 났다.
 */
function brandLogoSrc(src: string): string {
  if (process.env.G5_NEXT_RUNTIME === "server") {
    return `${g5BaseUrlForRuntime()}${src.startsWith("/") ? src : `/${src}`}`;
  }
  return g5PathForRuntime(src);
}

/** 그누보드 기본 로고와, 관리자가 쇼핑몰 설정에서 올리는 영카트 로고(없으면 설치 때 넣은 기본 그림). */
export const G5_COMMUNITY_LOGO = "/img/logo.png";
export const G5_SHOP_LOGO = "/data/common/logo_img";

interface SoluneBrandLogoProps {
  /** 그누보드 설치 경로 기준 경로. 하위 폴더 설치면 그 경로가 앞에 붙는다. */
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * 원본 solune 테마(head.layout.php, shop.head.php)처럼 그누보드 쪽 로고 그림을 그대로 쓴다.
 * 관리자가 로고를 갈면 여기도 같이 바뀐다. 그림을 못 불러오면(로고를 지운 설치 등) alt 글자를 보여 준다.
 */
export function SoluneBrandLogo({ src, alt, width, height, className }: SoluneBrandLogoProps) {
  const [failed, setFailed] = useState(false);
  // 하이드레이션 전에 이미 실패한 그림은 onError 가 다시 오지 않으므로 붙을 때 한 번 더 본다.
  const checkLoaded = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <span className="solune-brand-name">{alt}</span>;

  return (
    <img
      ref={checkLoaded}
      className={className ? `solune-brand-logo ${className}` : "solune-brand-logo"}
      src={brandLogoSrc(src)}
      alt={alt}
      width={width}
      height={height}
      onError={() => setFailed(true)}
    />
  );
}
