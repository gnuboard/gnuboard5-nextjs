"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  parsePaymentFailParams,
  paymentErrorHostPayload,
} from "@/lib/payment-return";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { XCircle } from "lucide-react";

function PaymentFailContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { code, message } = parsePaymentFailParams(sp);

  // If this page was opened as a popup or embedded payment frame, notify the
  // order page so the user sees the failure on the form.
  useEffect(() => {
    const isPopup =
      typeof window !== "undefined" &&
      !!window.opener &&
      !window.opener.closed;
    const isEmbedded =
      typeof window !== "undefined" &&
      !!window.parent &&
      window.parent !== window;
    if (!isPopup && !isEmbedded) return;
    try {
      if (isPopup) {
        window.opener.postMessage(
          { type: "shop-payment-result", ...paymentErrorHostPayload(message) },
          window.location.origin
        );
      }
      if (isEmbedded) {
        window.parent.postMessage(
          { type: "shop-payment-result", ...paymentErrorHostPayload(message) },
          window.location.origin
        );
      }
    } catch {
      // Ignore cross-origin errors
    }
    if (isPopup) {
      const t = setTimeout(() => window.close(), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [message]);

  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-16">
      <div className="text-center">
        <XCircle className="mx-auto mb-4 h-16 w-16 text-red-600" />
        <h1 className="text-xl font-bold">결제 실패</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {code && (
          <p className="mt-1 text-xs text-muted-foreground">코드: {code}</p>
        )}
        <button
          onClick={() => runtimeRouterPush(router, "/shop/order")}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[#08783a]"
        >
          주문 페이지로 돌아가기
        </button>
      </div>
    </div>
  );
}

export default function PaymentFailPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center">로딩...</div>}>
      <PaymentFailContent />
    </Suspense>
  );
}
