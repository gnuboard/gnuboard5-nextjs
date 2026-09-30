// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { runLegacyYoungcartAction } from "../_legacy-action";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return runLegacyYoungcartAction(request, {
    endpoint: "/shop/wishlist/legacy-update",
    fallbackRedirect: "/shop/wishlist",
    guardMutation: true,
    loginOnUnauthorized: true,
  });
}

export function POST(request: NextRequest) {
  return runLegacyYoungcartAction(request, {
    endpoint: "/shop/wishlist/legacy-update",
    fallbackRedirect: "/shop/wishlist",
    guardMutation: true,
    loginOnUnauthorized: true,
  });
}
