// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { legacyReviewList } from "../_legacy-review-list";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return legacyReviewList(request, "review");
}

export function POST(request: NextRequest) {
  return legacyReviewList(request, "review");
}
