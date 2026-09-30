"use client";

import { g5ShortHref } from "@/lib/g5-short-url";
import { themeConfig } from "@g5-theme/theme.config";
import { clientSeoConfig, clientSiteName } from "@/lib/config";

// 설치본의 사이트 제목(런타임 설정 siteName = cf_title). 없으면 테마 기본값.
const currentSiteName = () => clientSiteName(themeConfig.site.name || "그누보드5");

export function plainTextSummary(value: string | null | undefined, fallback: string): string {
  const text = (value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (text || fallback).slice(0, 160);
}

export function clientAbsoluteUrl(value: string): string | undefined {
  if (/^(data|blob):/i.test(value)) return undefined;

  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return undefined;
  }
}

export function applyClientJsonLd(id: string, payload: object | object[] | null) {
  if (typeof window === "undefined") return;

  const existing = Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"][data-g5-json-ld]'
    )
  ).find((script) => script.dataset.g5JsonLd === id);

  if (!payload) {
    existing?.remove();
    return;
  }

  const script = existing ?? document.createElement("script");
  script.type = "application/ld+json";
  script.dataset.g5JsonLd = id;
  script.textContent = JSON.stringify(payload).replace(/</g, "\\u003c");

  if (!existing) document.head.appendChild(script);
}

/**
 * 같은 이름의 태그를 모두 찾는다. **지우지 않는다.**
 *
 * 정적 셸의 상세 화면에는 같은 태그가 두 벌 생긴다. PHP 브리지가 서버 HTML 의 태그를 실제 값으로
 * 바꿔 두고, 하이드레이션 때 React 가 셸에 구워진 값(noindex, canonical=/shop/products)으로 한 벌을
 * 더 넣기 때문이다. 뒤의 한 벌은 React 의 것이다 — 지우면 다음 클라이언트 이동에서 React 가 이미
 * 빠진 노드를 떼려다 removeChild(null) 오류를 내고 화면 교체가 멈춘다(주소만 바뀌고 화면은 그대로).
 * 그래서 중복은 두고 전부 같은 값으로 맞춘다. robots 가 둘이어도 둘 다 index 면 검색엔진 문제는 없다.
 */
function headTags<T extends Element>(selector: string): T[] {
  return Array.from(document.head.querySelectorAll<T>(selector));
}

function upsertMeta(
  selector: string,
  configure: (meta: HTMLMetaElement) => void,
  content: string
) {
  const existing = headTags<HTMLMetaElement>(selector);
  if (existing.length > 0) {
    existing.forEach((meta) => meta.setAttribute("content", content));
    return;
  }

  const meta = document.createElement("meta");
  configure(meta);
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
}

function upsertCanonical(href: string) {
  const existing = headTags<HTMLLinkElement>('link[rel="canonical"]');
  if (existing.length > 0) {
    existing.forEach((link) => link.setAttribute("href", href));
    return;
  }

  const link = document.createElement("link");
  link.setAttribute("rel", "canonical");
  link.setAttribute("href", href);
  document.head.appendChild(link);
}

/**
 * 실제 기록을 찾은 상세 페이지는 색인을 열고, 못 찾은 셸은 닫는다. 단 검색엔진 노출 설정(G5_NEXTJS_SEO)이
 * 꺼져 있거나 제외된 게시판(G5_NEXTJS_SEO_EXCLUDE_BOARDS)이면 열지 않는다 — 서버(테마 브리지·Next 서버)가
 * 같은 설정으로 정한 값과 어긋나지 않게.
 */
export function applyClientRobots(index: boolean, boTable?: string) {
  if (typeof window === "undefined") return;
  const seo = clientSeoConfig();
  const excluded = !!boTable && seo.excludedBoards.includes(boTable.trim().toLowerCase());
  const allowed = index && seo.enabled && !excluded;
  upsertMeta('meta[name="robots"]', (meta) => {
    meta.setAttribute("name", "robots");
  }, allowed ? "index, follow" : "noindex, nofollow");
}

export function applyClientPageMetadata(input: {
  title: string;
  description?: string | null;
  path: string;
  image?: string | null;
  siteName?: string;
  /** 주면 robots 메타를 그 값으로 맞춘다(같은 이름이 여럿이면 전부). 안 주면 손대지 않는다 — 장바구니처럼
   *  비공개 화면도 이 함수를 쓰므로 기본값으로 색인을 열지 않는다. */
  index?: boolean;
  /** 게시판 화면이면 그 게시판 이름 — 색인 제외 게시판인지 확인한다. */
  boTable?: string;
}) {
  if (typeof window === "undefined") return;
  if (input.index !== undefined) applyClientRobots(input.index, input.boTable);

  const siteName = input.siteName ?? currentSiteName();
  const title = input.title.endsWith(` — ${siteName}`)
    ? input.title
    : `${input.title} — ${siteName}`;
  const description = plainTextSummary(input.description, input.title);
  const canonical = new URL(g5ShortHref(input.path), window.location.origin).toString();

  document.title = title;
  upsertCanonical(canonical);
  upsertMeta('meta[name="description"]', (meta) => {
    meta.setAttribute("name", "description");
  }, description);
  upsertMeta('meta[property="og:title"]', (meta) => {
    meta.setAttribute("property", "og:title");
  }, title);
  upsertMeta('meta[property="og:description"]', (meta) => {
    meta.setAttribute("property", "og:description");
  }, description);
  upsertMeta('meta[property="og:url"]', (meta) => {
    meta.setAttribute("property", "og:url");
  }, canonical);
  upsertMeta('meta[name="twitter:title"]', (meta) => {
    meta.setAttribute("name", "twitter:title");
  }, title);
  upsertMeta('meta[name="twitter:description"]', (meta) => {
    meta.setAttribute("name", "twitter:description");
  }, description);

  const image = input.image ? clientAbsoluteUrl(input.image) : undefined;
  if (!image) return;

  upsertMeta('meta[property="og:image"]', (meta) => {
    meta.setAttribute("property", "og:image");
  }, image);
  upsertMeta('meta[name="twitter:image"]', (meta) => {
    meta.setAttribute("name", "twitter:image");
  }, image);
}
