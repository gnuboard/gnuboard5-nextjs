// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { legacyYoungcartRedirect } from "../../shop/_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return legacyYoungcartRedirect(request, "/shop", { permanent: false });
}

export function POST(request: NextRequest) {
  return legacyYoungcartRedirect(request, "/shop", { permanent: false });
}
