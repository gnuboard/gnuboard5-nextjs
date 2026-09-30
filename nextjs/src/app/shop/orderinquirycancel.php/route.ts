// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DROP_PARAMS = new Set(["od_id", "token", "cancel_memo"]);

function firstParam(params: URLSearchParams, keys: string[]) {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

function orderCancelTarget(request: NextRequest, params = request.nextUrl.searchParams) {
  const orderId = firstParam(params, ["od_id"]);
  const pathname = orderId ? `/shop/orders/${encodeURIComponent(orderId)}` : "/shop/orders";
  const target = new URL(pathname, request.nextUrl.origin);

  params.forEach((value, key) => {
    if (!DROP_PARAMS.has(key)) {
      target.searchParams.append(key, value);
    }
  });

  return target;
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(orderCancelTarget(request), 307);
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
    // Some legacy clients may post an empty or non-form body; query params still work.
  }

  return NextResponse.redirect(orderCancelTarget(request, params), 303);
}
