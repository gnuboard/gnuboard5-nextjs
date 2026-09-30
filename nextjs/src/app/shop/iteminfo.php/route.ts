// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import { legacyOptionParams } from "../_legacy-option-html";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return legacyItemInfoRedirect(request);
}

export async function POST(request: NextRequest) {
  return legacyItemInfoRedirect(request);
}

async function legacyItemInfoRedirect(request: NextRequest) {
  const params = await legacyOptionParams(request);
  const itemId = cleanId(params.get("it_id") || "");
  const info = String(params.get("info") || "").toLowerCase();
  const target = new URL(itemId ? `/shop/${encodeURIComponent(itemId)}` : "/shop/products", request.nextUrl.origin);

  if (info === "use" || info === "review" || info === "reviews") {
    target.searchParams.set("tab", "reviews");
  } else if (info === "qa" || info === "qna") {
    target.searchParams.set("tab", "qa");
  }

  return NextResponse.redirect(target, request.method === "GET" ? 307 : 303);
}

function cleanId(value: string) {
  return value.replace(/[^0-9a-z_-]/gi, "");
}
