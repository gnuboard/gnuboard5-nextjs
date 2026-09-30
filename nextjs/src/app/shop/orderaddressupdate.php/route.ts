// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { runLegacyYoungcartAction } from "../_legacy-action";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return legacyOrderAddressUpdate(request);
}

export function POST(request: NextRequest) {
  return legacyOrderAddressUpdate(request);
}

function legacyOrderAddressUpdate(request: NextRequest) {
  return runLegacyYoungcartAction(request, {
    endpoint: "/shop/addresses/legacy-update",
    fallbackRedirect: "/mypage/addresses",
    loginOnUnauthorized: true,
  });
}
