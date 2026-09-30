import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";

const TOKEN_COOKIE = "g5_token";

export type LegacyCoupon = {
  cp_id: string;
  cp_subject: string;
  discount: number;
};

export type LegacyCouponPayload = {
  coupons?: LegacyCoupon[];
  message?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

type PickerOptions = {
  outerWrap?: boolean;
  formId: string;
  title: string;
  caption: string;
  prefix: "f" | "o" | "s";
  applyClass: string;
  closeId: string;
  emptyClass?: string;
};

export async function legacyCouponParams(request: NextRequest) {
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
      // Query-string fallback covers empty/non-form legacy requests.
    }
  }

  return params;
}

export async function fetchLegacyCoupons(
  request: NextRequest,
  endpoint: "legacy-item" | "legacy-order" | "legacy-sendcost",
  params: URLSearchParams
): Promise<LegacyCouponPayload & { authenticated: boolean }> {
  const token = request.cookies.get(TOKEN_COOKIE)?.value || "";
  if (!token) {
    return { authenticated: false, coupons: [] };
  }

  const url = new URL(apiUrl(`/shop/coupons/${endpoint}`));
  params.forEach((value, key) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    return { authenticated: false, coupons: [] };
  }

  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<LegacyCouponPayload> | null;
  if (!response.ok || !envelope?.success) {
    return {
      authenticated: true,
      coupons: [],
      message: envelope?.message || "쿠폰 정보를 불러오지 못했습니다.",
    };
  }

  return {
    authenticated: true,
    coupons: Array.isArray(envelope.data?.coupons) ? envelope.data.coupons : [],
    message: envelope.data?.message || "",
  };
}

export function legacyCouponResponse(html: string) {
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function renderLegacyCouponPicker(payload: LegacyCouponPayload & { authenticated?: boolean }, options: PickerOptions) {
  if (payload.authenticated === false) {
    return "";
  }

  const coupons = Array.isArray(payload.coupons) ? payload.coupons : [];
  const body = coupons.length > 0
    ? renderCouponTable(coupons, options)
    : renderEmpty(payload.message || "사용 가능한 쿠폰이 없습니다.", options.emptyClass);

  const content = `
<div id="${escapeHtml(options.formId)}" class="od_coupon">
  <h3>${escapeHtml(options.title)}</h3>
  ${body}
  <div class="btn_confirm">
    <button type="button" id="${escapeHtml(options.closeId)}" class="btn_close"><span class="sound_only">닫기</span></button>
  </div>
</div>`.trim();

  return options.outerWrap === false
    ? content
    : `<div class="od_coupon_wrap">\n${content}\n</div>`;
}

function renderCouponTable(coupons: LegacyCoupon[], options: PickerOptions) {
  const rows = coupons
    .map((coupon) => {
      const subject = escapeHtml(coupon.cp_subject || "");
      const discount = Math.max(0, Number(coupon.discount) || 0);
      return `
      <tr>
        <td>
          <input type="hidden" name="${options.prefix}_cp_id[]" value="${escapeHtml(coupon.cp_id || "")}">
          <input type="hidden" name="${options.prefix}_cp_prc[]" value="${discount}">
          <input type="hidden" name="${options.prefix}_cp_subj[]" value="${subject}">
          ${subject}
        </td>
        <td class="td_numbig">${formatNumber(discount)}</td>
        <td class="td_mngsmall"><button type="button" class="${escapeHtml(options.applyClass)}">적용</button></td>
      </tr>`.trim();
    })
    .join("\n");

  return `
  <div class="tbl_head02 tbl_wrap">
    <table>
      <caption>${escapeHtml(options.caption)}</caption>
      <thead>
        <tr>
          <th scope="col">쿠폰명</th>
          <th scope="col">할인금액</th>
          <th scope="col">적용</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>`.trim();
}

function renderEmpty(message: string, className = "") {
  const escaped = escapeHtml(message);
  return className
    ? `<div class="${escapeHtml(className)}">${escaped}</div>`
    : `<p>${escaped}</p>`;
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.max(0, value));
}
