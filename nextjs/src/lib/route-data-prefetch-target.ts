import { isG5ClientNavigablePath } from "@/lib/config";

/**
 * 링크 주소(짧은 주소, 설치 경로 없이)를 보고, 이동하기 전에 미리 불러도 되는 데이터를 정한다.
 *
 * 미리 부르는 것은 부르기만 해서는 아무것도 바뀌지 않는 읽기 전용 API 뿐이다.
 * 글 보기(/api/v1/posts/…)는 부르는 순간 조회수를 올리고 게시판 설정에 따라 읽기 포인트를 깎으므로
 * 절대 미리 부르지 않는다 — 글 주소에서는 게시판 정보만 부른다.
 */
export type RouteDataPrefetchTarget =
  | { kind: "product"; itId: string }
  | { kind: "category"; caId: string; params: Record<string, string> }
  | { kind: "board"; boTable: string };

/** 분류 화면(src/app/shop/categories/[ca_id]/ClientPage.tsx)이 첫 요청에 쓰는 값과 같아야 캐시가 맞는다. */
export const CATEGORY_PAGE_SIZE = "20";

export function categoryPageParams(search: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {
    page: String(Number(search.get("page") || "1") || 1),
    per_page: CATEGORY_PAGE_SIZE,
  };
  const sort = search.get("sort");
  const sortodr = search.get("sortodr");
  if (sort) params.sort = sort;
  if (sortodr) params.sortodr = sortodr;
  return params;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function routeDataPrefetchTarget(href: string): RouteDataPrefetchTarget | null {
  const [pathPart, queryPart = ""] = href.split("#")[0].split("?");
  const path = pathPart || "/";
  if (!isG5ClientNavigablePath(path)) return null;

  const parts = path.replace(/^\/+|\/+$/g, "").split("/").map(decode);

  if (parts[0] === "shop") {
    const category = parts.length === 2 ? /^list-([0-9a-z]+)$/i.exec(parts[1]) : null;
    if (category) {
      return { kind: "category", caId: category[1], params: categoryPageParams(new URLSearchParams(queryPart)) };
    }
    if (parts.length === 3 && parts[1] === "categories") {
      return { kind: "category", caId: parts[2], params: categoryPageParams(new URLSearchParams(queryPart)) };
    }
    if (parts.length === 3 && parts[1] === "products") return { kind: "product", itId: parts[2] };
    if (parts.length === 2 && !/^type-/i.test(parts[1])) return { kind: "product", itId: parts[1] };
    return null;
  }

  // 짧은 게시판 주소 /free, /free/4161 — 게시판 정보만(글은 부르지 않는다).
  if (/^[0-9A-Za-z_]+$/.test(parts[0]) && (parts.length === 1 || /^[0-9]+$/.test(parts[1] ?? ""))) {
    if (parts[0] === "boards" || parts[0] === "content") return null;
    return { kind: "board", boTable: parts[0] };
  }

  return null;
}
