// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { firstLegacyParam, legacyYoungcartRedirect } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const odId = firstLegacyParam(request, ["od_id"]);
  return legacyYoungcartRedirect(request, odId ? `/shop/orders/${encodeURIComponent(odId)}` : "/shop/orders", {
    drop: ["od_id"],
  });
}
