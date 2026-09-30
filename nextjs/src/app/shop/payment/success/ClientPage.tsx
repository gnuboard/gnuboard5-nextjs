"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { gaPurchase } from "@/lib/analytics";
import {
  parsePaymentSuccessParams,
  paymentErrorHostPayload,
  paymentOrderDetailUrl,
  paymentSuccessHostPayload,
  type PaymentHostResultPayload,
} from "@/lib/payment-return";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

function PaymentSuccessContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing"
  );
  const [message, setMessage] = useState("결제 승인 처리 중...");
  // Guard against React Strict Mode / re-render double-invocation: the confirm
  // POST and the gaPurchase event must fire exactly once per page load,
  // otherwise GA4 records duplicate revenue and the server sees a replayed
  // confirm.
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;

    // Detect popup/iframe mode. KCP can return inside an embedded payment frame.
    const isPopup =
      typeof window !== "undefined" &&
      !!window.opener &&
      !window.opener.closed;
    const isEmbedded =
      typeof window !== "undefined" &&
      !!window.parent &&
      window.parent !== window;

    const notifyHost = (payload: PaymentHostResultPayload) => {
      try {
        if (isPopup) {
          window.opener.postMessage(
            { type: "shop-payment-result", ...payload },
            window.location.origin
          );
        }
        if (isEmbedded) {
          window.parent.postMessage(
            { type: "shop-payment-result", ...payload },
            window.location.origin
          );
        }
      } catch {
        // Ignore cross-origin / detached host errors
      }
    };

    const confirm = async () => {
      const parsed = parsePaymentSuccessParams(sp);

      if (!parsed.ok) {
        setStatus("error");
        const m = parsed.message;
        setMessage(m);
        notifyHost(paymentErrorHostPayload(m));
        if (isPopup) setTimeout(() => window.close(), 1500);
        return;
      }

      try {
        const { orderId, amount, body } = parsed;

        const confirmed = await api.post<{
          order_id: string;
          uid?: string;
          status: string;
        }>("/shop/payment/confirm", body);
        const uid = confirmed.data?.uid ?? "";
        const orderDetailUrl = paymentOrderDetailUrl(orderId, uid);
        // GA4 purchase — KRW. items 상세 미보유라 transaction_id + value 만.
        gaPurchase({
          transaction_id: orderId,
          value: amount,
        });
        setStatus("success");
        setMessage("결제가 완료되었습니다.");
        notifyHost(paymentSuccessHostPayload(orderId, uid));
        if (isPopup) {
          setTimeout(() => window.close(), 800);
        } else if (!isEmbedded) {
          setTimeout(() => {
            runtimeRouterPush(router, orderDetailUrl);
          }, 1500);
        }
      } catch (err: unknown) {
        setStatus("error");
        const m =
          err instanceof Error ? err.message : "결제 승인에 실패했습니다.";
        setMessage(m);
        notifyHost(paymentErrorHostPayload(m));
        if (isPopup) setTimeout(() => window.close(), 2000);
      }
    };
    confirm();
  }, [sp, router]);

  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-16">
      <div className="text-center">
        {status === "processing" && (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
            <h1 className="text-xl font-bold">{message}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              잠시만 기다려주세요
            </p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-600" />
            <h1 className="text-xl font-bold">{message}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              주문 상세 페이지로 이동합니다...
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="mx-auto mb-4 h-16 w-16 text-red-600" />
            <h1 className="text-xl font-bold">결제 실패</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <button
              onClick={() => runtimeRouterPush(router, "/shop/cart")}
              className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[#08783a]"
            >
              장바구니로 돌아가기
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
