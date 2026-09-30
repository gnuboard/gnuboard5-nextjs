// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { firstLegacyParam, legacyYoungcartRedirect } from "../../shop/_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleMobileContent(request);
}

export function POST(request: NextRequest) {
  return handleMobileContent(request);
}

function handleMobileContent(request: NextRequest) {
  const contentPrefix = request.nextUrl.searchParams.get("service") === "shop" ? "/shop/content" : "/content";
  const contentId = firstLegacyParam(request, ["co_id"]);
  if (contentId) {
    return legacyYoungcartRedirect(request, `${contentPrefix}/${encodeURIComponent(contentId)}`, {
      drop: ["co_id", "co_seo_title", "service"],
      permanent: false,
    });
  }

  const seoTitle = firstLegacyParam(request, ["co_seo_title"]);
  if (seoTitle) {
    return legacyYoungcartRedirect(request, `${contentPrefix}/${encodeURIComponent(seoTitle)}/`, {
      drop: ["co_id", "co_seo_title", "service"],
      permanent: false,
    });
  }

  return legacyYoungcartRedirect(request, contentPrefix === "/shop/content" ? "/shop" : "/", {
    drop: ["co_id", "co_seo_title", "service"],
    permanent: false,
  });
}
