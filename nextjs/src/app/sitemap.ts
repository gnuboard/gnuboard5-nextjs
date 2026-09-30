/**
 * 동적 sitemap — 게시판 목록을 PHP API 에서 받아와 sitemap.xml 생성.
 *
 * 깊은 게시판 글까지 다 넣으면 너무 큼. 1차로:
 *  - 정적 페이지 (/, /boards, /faq, /recent, /search)
 *  - 게시판 목록 페이지 (/boards/{bo_table})
 * 게시글 개별 URL은 /sitemap-posts.xml 에서 제한 수량으로 분리 제공.
 */
import type { MetadataRoute } from 'next';
import { APP_BASE_URL, API_BASE_URL } from '@/lib/config';
import { toG5ShortPath } from '@/lib/g5-short-url';
import { shopProductPath } from '@/lib/product-url';
import { DEFAULT_CONTENT_LINKS } from '@/lib/content-links';
import { getBoards } from '@/services/boards';
import { getPublicSettings } from '@/services/settings';
import { serverSeoSettings } from '@/lib/seo-config';

export const dynamic = 'force-static';

interface ShopListItem {
  it_id: string;
  it_seo_title?: string;
  ca_id: string;
}

interface ShopCategory {
  ca_id: string;
  children?: ShopCategory[];
}

interface ShopEvent {
  ev_id: number;
}

interface ContentItem {
  co_id: string;
}

const FALLBACK_CONTENT_ITEMS: ContentItem[] = DEFAULT_CONTENT_LINKS.map((link) => ({ co_id: link.co_id }));
const SHOP_CONTENT_IDS = new Set(DEFAULT_CONTENT_LINKS.map((link) => link.co_id));

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API_BASE_URL}${path}`, { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    const body = (await r.json()) as { success?: boolean; data?: T };
    return body.success ? (body.data ?? null) : null;
  } catch {
    return null;
  }
}

function flattenShopCategories(categories: ShopCategory[]): ShopCategory[] {
  const seen = new Set<string>();
  const flattened: ShopCategory[] = [];

  function visit(category: ShopCategory) {
    if (!category.ca_id || seen.has(category.ca_id)) return;
    seen.add(category.ca_id);
    flattened.push(category);
    category.children?.forEach(visit);
  }

  categories.forEach(visit);
  return flattened;
}

export const revalidate = 3600; // 1시간 캐시

/**
 * Vercel(Next 서버)용. 테마 설치본에서는 테마 브리지가 요청 때 설치본의 DB 로 다시 만든다.
 * G5_NEXTJS_SEO off(기본값) → 비움, G5_NEXTJS_SEO_SITEMAP off(기본값) → 고정 페이지만(API 를 부르지 않음).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = serverSeoSettings();
  if (!seo.enabled) return [];

  const base = APP_BASE_URL.replace(/\/+$/, '');
  const url = (path: string) => `${base}${toG5ShortPath(path)}`;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: url('/'),        changeFrequency: 'daily',  priority: 1.0 },
    { url: url('/boards'),  changeFrequency: 'hourly', priority: 0.9 },
    { url: url('/faq'),     changeFrequency: 'weekly', priority: 0.6 },
    { url: url('/recent'),  changeFrequency: 'hourly', priority: 0.7 },
    { url: url('/shop'),    changeFrequency: 'daily',  priority: 0.8 },
    { url: url('/shop/products'), changeFrequency: 'hourly', priority: 0.8 },
    { url: url('/shop/events'),   changeFrequency: 'daily',  priority: 0.7 },
    { url: url('/shop/couponzone'), changeFrequency: 'daily', priority: 0.6 },
    { url: url('/polls'),   changeFrequency: 'weekly', priority: 0.5 },
  ];

  if (!seo.sitemap) return staticRoutes;

  let boards: Awaited<ReturnType<typeof getBoards>> = [];
  let rewriteMode: number | string | undefined = 0;
  try {
    const [boardRows, settings] = await Promise.all([getBoards(3600), getPublicSettings(3600)]);
    boards = boardRows;
    rewriteMode = settings.cf_bbs_rewrite;
  } catch {
    // API 일시 오류 — 정적 sitemap 만 반환 (배포 시점에 API 죽어있어도 빌드 진행)
  }

  const boardRoutes: MetadataRoute.Sitemap = boards
    .filter((b) => !seo.excludedBoards.includes(b.bo_table.toLowerCase()))
    .map((b) => ({
    url: url(`/boards/${encodeURIComponent(b.bo_table)}`),
    changeFrequency: 'hourly',
    priority: 0.7,
  }));

  // 쇼핑 — 상품 (per_page=200), 카테고리, 이벤트. 상품이 너무 많으면 1000개로 cap.
  const products = await fetchJson<ShopListItem[]>(`/shop/products?per_page=${Math.min(1000, seo.sitemapLimit)}`);
  const productRoutes: MetadataRoute.Sitemap = (products ?? []).map((p) => ({
    url: url(shopProductPath(p, rewriteMode)),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const cats = flattenShopCategories((await fetchJson<ShopCategory[]>('/shop/categories')) ?? []);
  const catRoutes: MetadataRoute.Sitemap = cats.map((c) => ({
    url: url(`/shop/list-${encodeURIComponent(c.ca_id)}`),
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const events = await fetchJson<ShopEvent[]>('/shop/events');
  const eventRoutes: MetadataRoute.Sitemap = (events ?? []).map((e) => ({
    url: url(`/shop/events/${e.ev_id}`),
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const fetchedContents = await fetchJson<ContentItem[]>('/content');
  const contents = fetchedContents && fetchedContents.length > 0 ? fetchedContents : FALLBACK_CONTENT_ITEMS;
  const contentRoutes: MetadataRoute.Sitemap = contents
    .filter((content) => content.co_id)
    .map((content) => ({
      url: url(`/content/${encodeURIComponent(content.co_id)}`),
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  const shopContentRoutes: MetadataRoute.Sitemap = contents
    .filter((content) => SHOP_CONTENT_IDS.has(content.co_id))
    .map((content) => ({
      url: url(`/shop/content/${encodeURIComponent(content.co_id)}`),
      changeFrequency: 'monthly',
      priority: 0.5,
    }));

  // 큰 사이트 보호 — G5_NEXTJS_SEO_SITEMAP_LIMIT 개까지만. 중요한 것부터(테마 브리지 seo.php 와 같은 순서).
  return [
    ...staticRoutes,
    ...boardRoutes,
    ...catRoutes,
    ...productRoutes,
    ...eventRoutes,
    ...contentRoutes,
    ...shopContentRoutes,
  ].slice(0, seo.sitemapLimit);
}
