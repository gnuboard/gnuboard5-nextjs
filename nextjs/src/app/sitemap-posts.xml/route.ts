import { boardPostPath } from "@/lib/board-url";
import { APP_BASE_URL } from "@/lib/config";
import { toG5ShortPath } from "@/lib/g5-short-url";
import { getBoards, getBoardPosts } from "@/services/boards";
import { getPublicSettings } from "@/services/settings";
import { serverSeoSettings } from "@/lib/seo-config";

export const dynamic = "force-static";
export const revalidate = 3600;

const DEFAULT_BOARD_LIMIT = 30;
const DEFAULT_POSTS_PER_BOARD = 50;
const MAX_BOARD_LIMIT = 100;
const MAX_POSTS_PER_BOARD = 100;

function boundedEnvInt(name: string, fallback: number, max: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absoluteUrl(path: string): string {
  const base = APP_BASE_URL.replace(/\/+$/, "");
  return `${base}${toG5ShortPath(path)}`;
}

function isoDate(value: string | null | undefined): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(normalized)
      ? `${normalized.replace(" ", "T")}+09:00`
      : normalized
  );

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function urlEntry(url: string, lastmod: string): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(url)}</loc>`,
    lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : "",
    "    <changefreq>weekly</changefreq>",
    "    <priority>0.5</priority>",
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Vercel(Next 서버)용 글 사이트맵. 테마 설치본에서는 테마 브리지가 요청 때 설치본의 DB 로 다시 만든다.
 * G5_NEXTJS_SEO 와 G5_NEXTJS_SEO_SITEMAP 이 둘 다 on 일 때만 글을 담는다(기본값은 둘 다 off → 빈 목록).
 * 로그인 없이 API 를 부르므로 비회원이 못 보는 게시판·글은 처음부터 오지 않고, 비밀글은 여기서 뺀다.
 */
export async function GET() {
  const seo = serverSeoSettings();
  const boardLimit = boundedEnvInt(
    "G5_SITEMAP_POST_BOARD_LIMIT",
    DEFAULT_BOARD_LIMIT,
    MAX_BOARD_LIMIT
  );
  const postsPerBoard = boundedEnvInt(
    "G5_SITEMAP_POSTS_PER_BOARD",
    DEFAULT_POSTS_PER_BOARD,
    MAX_POSTS_PER_BOARD
  );

  let entries: string[] = [];

  try {
    if (!seo.sitemap) throw new Error("sitemap disabled");
    const [boards, settings] = await Promise.all([getBoards(3600), getPublicSettings(3600)]);
    const selectedBoards = boards
      .filter((board) => !seo.excludedBoards.includes(board.bo_table.toLowerCase()))
      .slice(0, boardLimit);
    const boardResults = await Promise.all(
      selectedBoards.map(async (board) => {
        const posts = await getBoardPosts({
          boTable: board.bo_table,
          page: 1,
          perPage: postsPerBoard,
          revalidate: 3600,
        });

        return posts.list
          .filter((post) => !post.is_secret)
          .map((post) =>
            urlEntry(
              absoluteUrl(boardPostPath(board.bo_table, post, settings.cf_bbs_rewrite)),
              isoDate(post.wr_last || post.wr_datetime)
            )
          );
      })
    );

    entries = boardResults.flat().slice(0, seo.sitemapLimit);
  } catch {
    entries = [];
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
