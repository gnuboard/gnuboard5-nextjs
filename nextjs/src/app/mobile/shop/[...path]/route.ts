// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import {
  firstLegacyParam,
  hasLegacyFlag,
  legacyProductPath,
  legacyYoungcartPhpRedirect,
  legacyYoungcartRedirect,
} from "../../../shop/_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

type MobileShopParams = {
  path?: string[];
};

const ORIGINAL_PHP_ROOTS = new Set([
  "inicis",
  "kakaopay",
  "kcp",
  "lg",
  "mail",
  "nicepay",
  "price",
  "samsungpay",
  "toss",
]);

const PASS_THROUGH_ROOT_FILES = new Set([
  "ajax.action.php",
  "ajax.coupondownload.php",
  "ajax.list.php",
  "ajax.orderdatasave.php",
  "ajax.orderstock.php",
  "cartoption.php",
  "cartupdate.php",
  "itemoption.php",
  "itemqalist.php",
  "itemqaformupdate.php",
  "itemuselist.php",
  "itemuseformupdate.php",
  "itemrecommendmail.php",
  "itemstocksmsupdate.php",
  "orderaddressupdate.php",
  "ordercoupon.php",
  "orderformupdate.php",
  "orderitemcoupon.php",
  "ordersendcost.php",
  "ordersendcostcoupon.php",
  "personalpayformupdate.php",
  "taxsave.php",
  "wishupdate.php",
]);

const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

export async function GET(request: NextRequest, context: { params: Promise<MobileShopParams> }) {
  return handleMobileShop(request, context.params);
}

export async function POST(request: NextRequest, context: { params: Promise<MobileShopParams> }) {
  return handleMobileShop(request, context.params);
}

async function handleMobileShop(
  request: NextRequest,
  params: Promise<MobileShopParams>
) {
  const resolved = await params;
  const segments = cleanSegments(resolved.path || []);

  if (segments.length === 0) {
    return legacyYoungcartRedirect(request, "/shop", { permanent: false });
  }

  const first = normalizeSegment(segments[0]);
  const file = normalizeSegment(segments[segments.length - 1]);

  if (ORIGINAL_PHP_ROOTS.has(first)) {
    return redirectToOriginalMobilePhp(request, segments);
  }

  if (segments.length > 1) {
    return redirectToOriginalMobilePhp(request, segments);
  }

  if (PASS_THROUGH_ROOT_FILES.has(file)) {
    return legacyYoungcartRedirect(request, `/shop/${file}`, { permanent: false });
  }

  switch (file) {
    case "index.php":
      return legacyYoungcartRedirect(request, "/shop", { permanent: false });
    case "cart.php":
      return legacyYoungcartRedirect(request, "/shop/cart", { permanent: false });
    case "category.php":
    case "list.php": {
      const caId = firstLegacyParam(request, ["ca_id"]);
      return legacyYoungcartRedirect(request, caId ? `/shop/list-${encodeURIComponent(caId)}` : "/shop/products", {
        drop: ["ca_id"],
        permanent: false,
      });
    }
    case "coupon.php":
      return legacyYoungcartRedirect(request, "/mypage/coupons", { permanent: false });
    case "event.php": {
      const evId = firstLegacyParam(request, ["ev_id"]);
      return legacyYoungcartRedirect(request, evId ? `/shop/events/${encodeURIComponent(evId)}` : "/shop/events", {
        drop: ["ev_id"],
        permanent: false,
      });
    }
    case "item.php":
      return legacyYoungcartRedirect(request, legacyProductPath(request), {
        drop: ["it_id", "it_seo_title"],
        permanent: false,
      });
    case "iteminfo.php": {
      const itemId = firstLegacyParam(request, ["it_id"]);
      const info = firstLegacyParam(request, ["info"]).toLowerCase();
      const tab =
        info === "use" || info === "review" || info === "reviews"
          ? "reviews"
          : info === "qa" || info === "qna"
            ? "qa"
            : "";

      return legacyYoungcartRedirect(request, itemId ? `/shop/${encodeURIComponent(itemId)}` : "/shop/products", {
        drop: ["it_id", "info"],
        set: tab ? { tab } : {},
        permanent: false,
      });
    }
    case "itemqa.php":
      return legacyYoungcartRedirect(request, legacyProductPath(request), {
        drop: ["it_id", "it_seo_title"],
        set: { tab: "qa" },
        permanent: false,
      });
    case "itemqaform.php":
      return legacyYoungcartRedirect(request, legacyProductPath(request), {
        drop: ["it_id", "it_seo_title"],
        set: { tab: "qa", form: "qa" },
        permanent: false,
      });
    case "itemrecommend.php":
      return legacyYoungcartRedirect(request, legacyProductPath(request), {
        drop: ["it_id", "it_seo_title"],
        set: { modal: "recommend" },
        permanent: false,
      });
    case "itemstocksms.php":
      return legacyYoungcartRedirect(request, legacyProductPath(request), {
        drop: ["it_id", "it_seo_title"],
        set: { modal: "restock" },
        permanent: false,
      });
    case "itemuse.php":
      return legacyYoungcartRedirect(request, legacyProductPath(request), {
        drop: ["it_id", "it_seo_title"],
        set: { tab: "reviews" },
        permanent: false,
      });
    case "itemuseform.php":
      return legacyYoungcartRedirect(request, legacyProductPath(request), {
        drop: ["it_id", "it_seo_title"],
        set: { tab: "reviews", form: "review" },
        permanent: false,
      });
    case "largeimage.php":
      return legacyYoungcartRedirect(request, "/shop/largeimage", { permanent: false });
    case "listtype.php": {
      const type = firstLegacyParam(request, ["type"]);
      const pathname = /^[1-5]$/.test(type) ? `/shop/type-${type}` : "/shop/products";
      return legacyYoungcartRedirect(request, pathname, { drop: ["type"], permanent: false });
    }
    case "mypage.php":
      return legacyYoungcartRedirect(request, "/mypage", { permanent: false });
    case "orderaddress.php":
      return legacyYoungcartRedirect(request, "/mypage/addresses", { permanent: false });
    case "orderform.php": {
      const direct = hasLegacyFlag(request, ["sw_direct", "direct"]);
      return legacyYoungcartRedirect(request, "/shop/order", {
        drop: ["sw_direct"],
        set: direct ? { direct: 1 } : {},
        permanent: false,
      });
    }
    case "orderinquiry.php":
      return legacyYoungcartRedirect(request, "/shop/orders", { permanent: false });
    case "orderinquiryview.php": {
      const odId = firstLegacyParam(request, ["od_id"]);
      return legacyYoungcartRedirect(request, odId ? `/shop/orders/${encodeURIComponent(odId)}` : "/shop/orders", {
        drop: ["od_id"],
        permanent: false,
      });
    }
    case "personalpay.php":
      return legacyYoungcartRedirect(request, "/shop/personalpay", { permanent: false });
    case "personalpayform.php": {
      const ppId = firstLegacyParam(request, ["pp_id"]);
      return legacyYoungcartRedirect(
        request,
        ppId ? `/shop/personalpay/${encodeURIComponent(ppId)}/pay` : "/shop/personalpay",
        { drop: ["pp_id"], permanent: false }
      );
    }
    case "personalpayresult.php": {
      const ppId = firstLegacyParam(request, ["pp_id"]);
      return legacyYoungcartRedirect(
        request,
        ppId ? `/shop/personalpay/${encodeURIComponent(ppId)}` : "/shop/personalpay",
        { drop: ["pp_id"], permanent: false }
      );
    }
    case "search.php":
      return legacyYoungcartRedirect(request, "/shop/search", { permanent: false });
    case "wishlist.php":
      return legacyYoungcartRedirect(request, "/shop/wishlist", { permanent: false });
    default:
      return NextResponse.redirect(new URL("/shop", request.nextUrl.origin), 307);
  }
}

function redirectToOriginalMobilePhp(request: NextRequest, segments: string[]) {
  if (segments.length === 0 || segments.length > 5) {
    return NextResponse.redirect(new URL("/shop", request.nextUrl.origin), 307);
  }

  return legacyYoungcartPhpRedirect(request, `/mobile/shop/${segments.map(encodeURIComponent).join("/")}`, {
    permanent: false,
    fallbackPathname: "/shop",
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
