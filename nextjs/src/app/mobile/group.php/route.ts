// @g5-server-runtime-only
import { NextRequest } from "next/server";
import { firstLegacyParam, legacyYoungcartRedirect } from "../../shop/_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleMobileGroup(request);
}

export function POST(request: NextRequest) {
  return handleMobileGroup(request);
}

function handleMobileGroup(request: NextRequest) {
  const groupId = firstLegacyParam(request, ["gr_id"]);

  return legacyYoungcartRedirect(request, "/boards", {
    drop: ["gr_id"],
    set: groupId ? { group: groupId } : {},
    permanent: false,
  });
}
