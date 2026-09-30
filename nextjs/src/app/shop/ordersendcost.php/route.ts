// @g5-server-runtime-only
import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";
import { fetchWithTimeout } from "@/lib/server/fetch-timeout";

export const dynamic = "force-dynamic";

function plainCost(value: number | string) {
  return new NextResponse(String(Math.max(0, Number(value) || 0)), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readLegacyZipcode(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);

  if (request.method === "POST") {
    try {
      const form = await request.formData();
      form.forEach((value, key) => {
        if (typeof value === "string") {
          params.append(key, value);
        }
      });
    } catch {
      // Query string fallback covers empty/non-form legacy requests.
    }
  }

  const value =
    params.get("zipcode") || params.get("zip") || `${params.get("zip1") || ""}${params.get("zip2") || ""}`;

  return value.replace(/[^0-9]/g, "");
}

async function legacyShippingExtra(request: NextRequest) {
  const zipcode = await readLegacyZipcode(request);
  if (!zipcode) {
    return plainCost(0);
  }

  const response = await fetchWithTimeout(apiUrl(`/shop/shipping/extra?zipcode=${encodeURIComponent(zipcode)}`), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload.data as { extra?: number; send_cost?: number } | undefined)
      : undefined;

  return plainCost(data?.extra ?? data?.send_cost ?? 0);
}

export function GET(request: NextRequest) {
  return legacyShippingExtra(request);
}

export function POST(request: NextRequest) {
  return legacyShippingExtra(request);
}
