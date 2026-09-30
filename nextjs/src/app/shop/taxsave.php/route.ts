// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { legacyYoungcartPhpRedirect } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return legacyYoungcartPhpRedirect(request, "/shop/taxsave.php", {
    permanent: false,
  });
}
