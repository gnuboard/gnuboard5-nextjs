// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { firstLegacyParam, legacyYoungcartRedirect } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const ppId = firstLegacyParam(request, ["pp_id"]);
  return legacyYoungcartRedirect(
    request,
    ppId ? `/shop/personalpay/${encodeURIComponent(ppId)}/pay` : "/shop/personalpay",
    { drop: ["pp_id"], permanent: false }
  );
}
