// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { legacyProductPath, legacyYoungcartRedirect } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return legacyYoungcartRedirect(request, legacyProductPath(request), {
    drop: ["it_id", "it_seo_title"],
  });
}
