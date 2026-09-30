// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { legacyNaverPayOrder } from "../../_legacy-naverpay";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return legacyNaverPayOrder(request);
}
