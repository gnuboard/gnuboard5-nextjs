// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { legacyProviderPhpRedirect } from "../../_legacy-provider-php";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return legacyProviderPhpRedirect(request, context.params, "kakaopay");
}

export function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return legacyProviderPhpRedirect(request, context.params, "kakaopay");
}
