// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import { firstLegacyParam } from "../_legacy-youngcart-redirect";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return redirectToPersonalPay(request);
}

export async function POST(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);

  try {
    const form = await request.formData();
    form.forEach((value, key) => {
      if (typeof value === "string") {
        params.append(key, value);
      }
    });
  } catch {
    // Query-string fallback covers non-form legacy requests.
  }

  return alertRedirect(
    request,
    "Personal payment results must be completed on the Gnuboard payment server. Please retry the payment.",
    personalPayTarget(request, params)
  );
}

function redirectToPersonalPay(request: NextRequest) {
  return NextResponse.redirect(new URL(personalPayTarget(request), request.nextUrl.origin), 303);
}

function personalPayTarget(request: NextRequest, params?: URLSearchParams) {
  const ppId = params
    ? firstValue(params, ["pp_id", "order_id", "orderId", "od_id"])
    : firstLegacyParam(request, ["pp_id", "order_id", "orderId", "od_id"]);

  return ppId ? `/shop/personalpay/${encodeURIComponent(ppId)}/pay` : "/shop/personalpay";
}

function firstValue(params: URLSearchParams, keys: string[]) {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

function alertRedirect(request: NextRequest, message: string, targetPath: string) {
  const target = new URL(targetPath, request.nextUrl.origin).toString();
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Personal payment</title></head>
<body>
<script>
alert(${JSON.stringify(message)});
location.replace(${JSON.stringify(target)});
</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
