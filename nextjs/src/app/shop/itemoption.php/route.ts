// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { renderLegacyItemOptionResponse } from "../_legacy-option-html";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return renderLegacyItemOptionResponse(request);
}

export function POST(request: NextRequest) {
  return renderLegacyItemOptionResponse(request);
}
