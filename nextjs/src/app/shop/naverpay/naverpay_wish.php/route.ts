// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { legacyNaverPayWish } from "../../_legacy-naverpay";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return legacyNaverPayWish(request);
}
