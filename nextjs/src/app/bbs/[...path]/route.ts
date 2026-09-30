// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import {
  firstLegacyParam,
  legacyYoungcartPhpRedirect,
  legacyYoungcartRedirect,
} from "../../shop/_legacy-youngcart-redirect";
import {
  relativeRedirectTargetsShop,
  safeRelativeRedirect,
} from "@/lib/g5-short-url-utils";

export const dynamic = "force-dynamic";

type BbsParams = {
  path?: string[];
};

const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

export async function GET(request: NextRequest, context: { params: Promise<BbsParams> }) {
  return handleBbs(request, context.params);
}

export async function POST(request: NextRequest, context: { params: Promise<BbsParams> }) {
  return handleBbs(request, context.params);
}

async function handleBbs(request: NextRequest, params: Promise<BbsParams>) {
  const resolved = await params;
  const segments = cleanSegments(resolved.path || []);

  if (segments.length !== 1) {
    return redirectToOriginalBbsPhp(request, segments);
  }

  const file = normalizeSegment(segments[0]);

  switch (file) {
    case "login.php": {
      const redirect = safeRelativeRedirect(firstLegacyParam(request, ["redirect", "url"]));
      const shopLogin =
        request.nextUrl.searchParams.get("service") === "shop" ||
        relativeRedirectTargetsShop(redirect);
      return legacyYoungcartRedirect(request, shopLogin ? "/shop/login" : "/login", {
        drop: ["redirect", "url", "rewrite"],
        set: redirect ? { redirect } : {},
        permanent: false,
      });
    }
    case "register.php":
    case "register_form.php":
      return legacyYoungcartRedirect(request, "/register", { drop: ["rewrite"], permanent: false });
    case "register_result.php":
      return legacyYoungcartRedirect(request, "/register/result", { drop: ["rewrite"], permanent: false });
    case "password_lost.php":
      return legacyYoungcartRedirect(request, "/forgot-password", { drop: ["rewrite"], permanent: false });
    case "poll_result.php":
      return legacyYoungcartRedirect(request, "/polls", { drop: ["rewrite"], permanent: false });
    case "qalist.php":
      return legacyYoungcartRedirect(request, "/mypage/qas", { drop: ["rewrite"], permanent: false });
    case "qaview.php": {
      const qaId = firstLegacyParam(request, ["qa_id"]);
      return legacyYoungcartRedirect(request, /^[0-9]+$/.test(qaId) ? `/mypage/qas/${qaId}` : "/mypage/qas", {
        drop: ["qa_id", "rewrite"],
        permanent: false,
      });
    }
    case "qawrite.php": {
      const qaId = firstLegacyParam(request, ["qa_id"]);
      const mode = firstLegacyParam(request, ["w"]).toLowerCase();
      if (mode === "r" && /^[0-9]+$/.test(qaId)) {
        return legacyYoungcartRedirect(request, "/mypage/qas/new", {
          drop: ["qa_id", "w", "rewrite"],
          set: { reply_to: qaId },
          permanent: false,
        });
      }
      return legacyYoungcartRedirect(
        request,
        mode === "u" && /^[0-9]+$/.test(qaId) ? `/mypage/qas/${qaId}` : "/mypage/qas/new",
        {
          drop: ["qa_id", "w", "rewrite"],
          permanent: false,
        }
      );
    }
    case "memo.php": {
      const type = memoListType(request);
      return legacyYoungcartRedirect(request, "/mypage/memos", {
        drop: ["kind", "type", "rewrite"],
        set: type === "send" ? { type } : {},
        permanent: false,
      });
    }
    case "memo_form.php": {
      const recv = firstLegacyParam(request, ["recv", "me_recv_mb_id", "mb_id"]);
      return legacyYoungcartRedirect(request, "/mypage/memos/new", {
        drop: ["recv", "me_recv_mb_id", "mb_id", "rewrite"],
        set: recv ? { recv } : {},
        permanent: false,
      });
    }
    case "memo_view.php": {
      const memoId = firstLegacyParam(request, ["me_id"]);
      const type = memoListType(request);
      return legacyYoungcartRedirect(
        request,
        /^[0-9]+$/.test(memoId) ? `/mypage/memos/${memoId}` : "/mypage/memos",
        {
          drop: ["me_id", "kind", "type", "rewrite"],
          set: type === "send" ? { type } : {},
          permanent: false,
        }
      );
    }
    case "profile.php": {
      const mbId = firstLegacyParam(request, ["mb_id"]);
      return legacyYoungcartRedirect(
        request,
        SAFE_SEGMENT_RE.test(mbId) ? `/members/${encodeURIComponent(mbId)}` : "/",
        {
          drop: ["mb_id", "rewrite"],
          permanent: false,
        }
      );
    }
    case "point.php":
      return legacyYoungcartRedirect(request, "/mypage/points", { drop: ["rewrite"], permanent: false });
    case "scrap.php":
      return legacyYoungcartRedirect(request, "/mypage/scraps", { drop: ["rewrite"], permanent: false });
    case "board.php":
      return legacyYoungcartRedirect(request, legacyBoardPath(request), {
        drop: ["bo_table", "wr_id", "wr_seo_title", "rewrite"],
        permanent: false,
      });
    case "write.php": {
      const boTable = firstLegacyParam(request, ["bo_table"]);
      return legacyYoungcartRedirect(request, boTable ? `/${encodeURIComponent(boTable)}/write` : "/boards", {
        drop: ["bo_table", "rewrite"],
        permanent: false,
      });
    }
    case "content.php": {
      const contentPrefix = request.nextUrl.searchParams.get("service") === "shop" ? "/shop/content" : "/content";
      const contentId = firstLegacyParam(request, ["co_id"]);
      if (contentId) {
        return legacyYoungcartRedirect(request, `${contentPrefix}/${encodeURIComponent(contentId)}`, {
          drop: ["co_id", "co_seo_title", "rewrite", "service"],
          permanent: false,
        });
      }

      const seoTitle = firstLegacyParam(request, ["co_seo_title"]);
      return legacyYoungcartRedirect(
        request,
        seoTitle
          ? `${contentPrefix}/${encodeURIComponent(seoTitle)}/`
          : contentPrefix === "/shop/content" ? "/shop" : "/content",
        {
          drop: ["co_id", "co_seo_title", "rewrite", "service"],
          permanent: false,
        }
      );
    }
    case "group.php": {
      const groupId = firstLegacyParam(request, ["gr_id"]);
      return legacyYoungcartRedirect(request, "/boards", {
        drop: ["gr_id", "rewrite"],
        set: groupId ? { group: groupId } : {},
        permanent: false,
      });
    }
    case "faq.php":
      return legacyYoungcartRedirect(request, "/faq", { drop: ["rewrite"], permanent: false });
    case "new.php":
      return legacyYoungcartRedirect(request, "/recent", { drop: ["rewrite"], permanent: false });
    case "search.php": {
      const keyword = firstLegacyParam(request, ["q", "stx"]);
      return legacyYoungcartRedirect(request, "/search", {
        drop: ["stx", "rewrite"],
        set: keyword ? { q: keyword } : {},
        permanent: false,
      });
    }
    default:
      return redirectToOriginalBbsPhp(request, segments);
  }
}

function legacyBoardPath(request: NextRequest) {
  const boTable = firstLegacyParam(request, ["bo_table"]);
  if (!boTable) return "/boards";

  const boardPath = `/${encodeURIComponent(boTable)}`;
  const seoTitle = firstLegacyParam(request, ["wr_seo_title"]);
  if (seoTitle) return `${boardPath}/${encodeURIComponent(seoTitle)}/`;

  const wrId = firstLegacyParam(request, ["wr_id"]);
  if (/^[0-9]+$/.test(wrId)) return `${boardPath}/${wrId}`;

  return boardPath;
}

function memoListType(request: NextRequest) {
  const kind = firstLegacyParam(request, ["kind", "type"]).toLowerCase();
  return kind === "send" ? "send" : "recv";
}

function redirectToOriginalBbsPhp(request: NextRequest, segments: string[]) {
  if (segments.length === 0 || segments.length > 3) {
    return NextResponse.redirect(new URL("/", request.nextUrl.origin), 307);
  }

  return legacyYoungcartPhpRedirect(request, `/bbs/${segments.map(encodeURIComponent).join("/")}`, {
    permanent: false,
    fallbackPathname: "/",
  });
}

function cleanSegments(segments: string[]) {
  const cleaned: string[] = [];

  for (const segment of segments) {
    const value = decodeSegment(segment);
    if (!value || value === "." || value === ".." || !SAFE_SEGMENT_RE.test(value)) {
      return [];
    }
    cleaned.push(value);
  }

  return cleaned;
}

function normalizeSegment(segment: string) {
  return decodeSegment(segment).toLowerCase();
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(String(segment || "")).trim();
  } catch {
    return String(segment || "").trim();
  }
}
