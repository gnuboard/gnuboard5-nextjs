// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { hasLegacyFlag, legacyYoungcartRedirect } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const direct = hasLegacyFlag(request, ["sw_direct", "direct"]);
  return legacyYoungcartRedirect(request, "/shop/order", {
    drop: ["sw_direct"],
    set: direct ? { direct: 1 } : {},
    permanent: false,
  });
}
