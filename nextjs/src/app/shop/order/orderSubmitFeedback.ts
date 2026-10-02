import type { PgService } from "@/lib/payment";
import type { PaymentNotice } from "./orderPaymentHelpers";
import type { CreatedOrderResponse } from "./orderSubmitTypes";

export const PAYMENT_PREPARING_NOTICE: PaymentNotice = {
  tone: "info",
  title: "결제 준비 중입니다.",
  message: "주문 정보를 확인하고 결제창을 여는 중입니다.",
};

export function getCreatedOrderPath(
  data: CreatedOrderResponse | undefined
): string {
  const odId = data?.order?.od_id ?? data?.od_id ?? "";
  const uid = data?.order?.uid ?? data?.uid ?? "";
  if (!odId) {
    throw new Error(
      "주문 생성 응답에서 주문번호를 확인하지 못했습니다. 주문 내역을 새로고침해 확인해 주세요."
    );
  }

  return `/shop/orders/${odId}${uid ? `?uid=${encodeURIComponent(uid)}` : ""}`;
}

export function getPaymentProgressNotice(pgService: PgService): PaymentNotice {
  return {
    tone: "info",
    title:
      pgService === "kcp"
        ? "NHN KCP 결제 진행 중입니다."
        : pgService === "kakaopay"
          ? "KAKAOPAY 결제 진행 중입니다."
          : "결제 진행 중입니다.",
    message:
      pgService === "kcp"
        ? "결제창에서 인증을 완료해주세요. 완료되면 자동으로 주문 내역으로 이동합니다."
        : "결제창에서 인증을 완료해주세요.",
  };
}

export function isPaymentCancelMessage(message: string): boolean {
  return message.includes("취소");
}

/** 주문서를 띄운 뒤 다른 탭 · 기기에서 장바구니가 바뀌어 다시 불러올 때의 안내. */
export const CART_CHANGED_MESSAGE =
  "장바구니가 바뀌어 주문할 상품을 다시 불러왔습니다. 확인한 뒤 다시 주문해 주세요.";

/**
 * 주문 · 결제 준비가 주문서가 보여 준 줄이 없어 멈췄는가(서버 409, errors.code CART_CHANGED —
 * shop_api_cart_require_shown_rows). 그러면 입력한 내용은 두고 상품 줄만 다시 불러온다.
 */
export function isCartChangedError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: unknown }).code === "CART_CHANGED";
}
