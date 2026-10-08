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
    // GET 으로도 배송지를 지우거나 고친다. 다른 사이트의 <img>/링크가 방문자 세션으로 실행하지 못하게 출처를 본다.
    guardMutation: true,
    loginOnUnauthorized: true,
  });
}
