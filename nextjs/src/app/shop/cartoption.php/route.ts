// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { renderLegacyCartOptionResponse } from "../_legacy-option-html";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return renderLegacyCartOptionResponse(request);
}

export function POST(request: NextRequest) {
  return renderLegacyCartOptionResponse(request);
}
