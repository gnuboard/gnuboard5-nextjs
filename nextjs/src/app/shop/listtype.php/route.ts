// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { firstLegacyParam, legacyYoungcartRedirect } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const type = firstLegacyParam(request, ["type"]);
  const pathname = /^[1-5]$/.test(type) ? `/shop/type-${type}` : "/shop/products";
  return legacyYoungcartRedirect(request, pathname, { drop: ["type"] });
}
