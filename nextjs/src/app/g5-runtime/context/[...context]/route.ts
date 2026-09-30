// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import {
  legacyShopTypeRedirectPath,
  shopLoginContextPath,
  shopServiceContextPath,
  type RouteSearchParams,
} from "@/lib/server-route-context";

export const dynamic = "force-dynamic";

type ContextParams = {
  context?: string[];
};

function routeSearchParams(request: NextRequest): RouteSearchParams {
  const result: RouteSearchParams = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    const current = result[key];
    result[key] = current === undefined ? value : [...(Array.isArray(current) ? current : [current]), value];
  });
  return result;
}

function redirectTo(destination: string, status: 307 | 308) {
  return new NextResponse(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Location: destination,
    },
  });
}

function notFound() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<ContextParams> }
) {
  const [kind = "", value = ""] = (await routeContext.params).context || [];
  const params = routeSearchParams(request);

  if (kind === "login") {
    const destination = shopLoginContextPath(params);
    return destination ? redirectTo(destination, 307) : notFound();
  }

  if (kind === "register") {
    const destination = shopServiceContextPath(params, "/shop/register");
    return destination ? redirectTo(destination, 307) : notFound();
  }

  if (kind === "qas-new") {
    const destination = shopServiceContextPath(params, "/shop/qas/new");
    return destination ? redirectTo(destination, 307) : notFound();
  }

  if (kind === "qas-detail") {
    if (!/^[0-9]+$/.test(value)) return notFound();
    const destination = shopServiceContextPath(
      params,
      `/shop/qas/my/${encodeURIComponent(value)}`
    );
    return destination ? redirectTo(destination, 307) : notFound();
  }

  if (kind === "shop-type") {
    if (!/^[1-5]$/.test(value) || params[`it_type${value}`] !== "1") return notFound();
    const destination = legacyShopTypeRedirectPath(params);
    return destination ? redirectTo(destination, 308) : notFound();
  }

  return notFound();
}

export const HEAD = GET;
