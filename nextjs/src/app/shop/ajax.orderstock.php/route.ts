// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { runLegacyYoungcartTextAction } from "../_legacy-text-action";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return runLegacyYoungcartTextAction(request, { endpoint: "/shop/cart/order-stock" });
}

export function POST(request: NextRequest) {
  return runLegacyYoungcartTextAction(request, { endpoint: "/shop/cart/order-stock" });
}
