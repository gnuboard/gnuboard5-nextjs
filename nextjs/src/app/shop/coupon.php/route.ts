// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { legacyYoungcartRedirect } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return legacyYoungcartRedirect(request, "/mypage/coupons", { permanent: false });
}
