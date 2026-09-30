// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { firstLegacyParam, legacyYoungcartRedirect } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const evId = firstLegacyParam(request, ["ev_id"]);
  return legacyYoungcartRedirect(request, evId ? `/shop/events/${encodeURIComponent(evId)}` : "/shop/events", {
    drop: ["ev_id"],
  });
}
