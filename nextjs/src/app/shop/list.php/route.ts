// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { firstLegacyParam, legacyYoungcartRedirect } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const caId = firstLegacyParam(request, ["ca_id"]);
  return legacyYoungcartRedirect(request, caId ? `/shop/list-${encodeURIComponent(caId)}` : "/shop/products", {
    drop: ["ca_id"],
  });
}
