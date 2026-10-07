"use client";

import { useEffect, useState, useCallback, useId, useRef, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import { useRuntimeRouteParam } from "@/hooks/use-runtime-route-param";
import { useAuthStore } from "@/store/auth";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { ShopOrder } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { shouldBypassImageOptimization } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import { formatPrice, formatDate, cn, formatCartOption } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { ArrowLeft, Check, X } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";
import { cancelMyOrder, getMyOrder } from "@/services/member";
import { getClientPublicSettings } from "@/services/settings";
import { getShopCartShippingPaymentLabel } from "@/lib/shop-shipping-label";

// 백엔드의 그누보드5 표준 상태값을 그대로 사용 — UI 라벨만 친절하게 매핑.
const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  "준비": { label: "결제대기", variant: "bg-gray-100 text-gray-700" },
  "주문": { label: "입금대기", variant: "bg-amber-100 text-amber-700" },
  "입금": { label: "입금완료", variant: "bg-blue-100 text-blue-700" },
  "배송": { label: "배송중", variant: "bg-indigo-100 text-indigo-700" },
  "완료": { label: "배송완료", variant: "bg-green-100 text-green-700" },
  "취소": { label: "취소", variant: "bg-red-100 text-red-700" },
};

const TIMELINE_STEPS = ["주문", "입금", "배송", "완료"];

function OrderTimeline({ currentStatus }: { currentStatus: string }) {
  const isCancelled = currentStatus === "취소";
  const currentIdx = TIMELINE_STEPS.indexOf(currentStatus);

  return (
    <div className="py-4">
      <div className="flex items-center justify-between">
        {TIMELINE_STEPS.map((step, idx) => {
          const isCompleted = !isCancelled && currentIdx > idx;
          const isCurrent = !isCancelled && currentIdx === idx;

          return (
            <div key={step} className="flex flex-1 items-center">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    isCancelled
                      ? "border-red-300 bg-red-50 text-red-700"
                      : isCompleted
                        ? "border-green-500 bg-green-500 text-white"
                        : isCurrent
                          ? "border-primary bg-primary/10 text-primary ring-4 ring-primary/20"
                          : "border-muted-foreground/30 bg-muted text-muted-foreground"
                  )}
                >
                  {isCancelled ? (
                    <X className="h-4 w-4" />
                  ) : isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium whitespace-nowrap",
                    isCancelled
                      ? "text-red-700"
                      : isCompleted
                        ? "text-green-700"
                        : isCurrent
                          ? "text-primary font-semibold"
                          : "text-muted-foreground"
                  )}
                >
                  {step}
                </span>
              </div>

              {/* Connecting line (not after last step) */}
              {idx < TIMELINE_STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-1 h-0.5 flex-1 rounded-full transition-colors",
                    isCancelled
                      ? "bg-red-200"
                      : isCompleted
                        ? "bg-green-500"
                        : "bg-muted-foreground/20"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {isCancelled && (
        <p className="mt-3 text-center text-sm font-medium text-red-700">
          주문이 취소되었습니다
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    variant: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.variant
      )}
    >
      {config.label}
    </span>
  );
}

export default function OrderDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const od_id = useRuntimeRouteParam("od_id", "/shop/orders/:od_id");
  const guestUid = searchParams.get("uid") ?? "";
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  const cancellingRef = useRef(false);
  const cancelReasonId = useId();

  useEffect(() => {
    let alive = true;
    getClientPublicSettings()
      .then((settings) => {
        if (alive) setProductRewriteMode(settings.cf_bbs_rewrite);
      })
      .catch(() => {
        if (alive) setProductRewriteMode(0);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    if (!od_id) {
      setLoading(false);
      return;
    }

    const loadOrder = async () => {
      try {
        setLoading(true);
        const loadedOrder = await getMyOrder(od_id, guestUid);
        if (!loadedOrder) throw new Error("Order not found");
        setOrder(loadedOrder);
      } catch {
        toastError("주문 정보를 불러올 수 없습니다.");
        runtimeRouterPush(router, "/shop/orders");
      } finally {
        setLoading(false);
      }
    };
    loadOrder();
  }, [guestUid, isInitialized, od_id, router, user]);

  const openCancelDialog = useCallback(() => {
    setCancelReason("");
    setCancelError("");
    setCancelDialogOpen(true);
  }, []);

  const closeCancelDialog = useCallback(() => {
    if (cancelling) return;
    setCancelDialogOpen(false);
    setCancelReason("");
    setCancelError("");
  }, [cancelling]);

  const submitCancel = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (cancellingRef.current) return;

    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError("취소사유를 입력해 주세요.");
      return;
    }
    if (reason.length > 100) {
      setCancelError("취소사유는 100자 이내로 입력해 주세요.");
      return;
    }

    cancellingRef.current = true;
    setCancelling(true);
    setCancelError("");
    try {
      await cancelMyOrder(od_id, reason, guestUid);
      const refreshedOrder = await getMyOrder(od_id, guestUid);
      if (refreshedOrder) {
        setOrder(refreshedOrder);
      }
      setCancelDialogOpen(false);
      setCancelReason("");
      toastSuccess("주문이 취소되었습니다.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "주문 취소에 실패했습니다.";
      setCancelError(message);
      toastError(message);
    } finally {
      cancellingRef.current = false;
      setCancelling(false);
    }
  }, [cancelReason, guestUid, od_id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-60 rounded" />
        <div className="skeleton h-40 rounded-lg" />
        <div className="skeleton h-40 rounded-lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg font-medium">주문을 찾을 수 없습니다</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/shop/orders">주문목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const canCancel = order.can_cancel === true;
  const shippingName = order.od_b_name || order.od_name;
  const shippingContact = order.od_b_hp || order.od_b_tel || order.od_hp || order.od_tel;
  const shippingZip = order.od_b_zip || order.od_zip;
  const shippingAddr1 = order.od_b_addr1 || order.od_addr1;
  const shippingAddr2 = order.od_b_addr2 || order.od_addr2;
  const shippingAddr3 = order.od_b_addr3 || order.od_addr3;
  const cartPrice =
    order.od_cart_price ?? Math.max(0, order.od_receipt_price - order.od_send_cost);
  const cartCoupon = order.od_cart_coupon ?? 0;
  const orderCoupon = order.od_coupon ?? 0;
  const sendCost = order.od_send_cost ?? 0;
  const extraSendCost = order.od_send_cost2 ?? 0;
  const sendCoupon = order.od_send_coupon ?? 0;
  const cancelPrice = order.od_cancel_price ?? 0;
  const receiptPoint = order.od_receipt_point ?? 0;
  const refundPrice = order.od_refund_price ?? 0;
  const totalPrice =
    order.od_total_price ??
    Math.max(
      0,
      cartPrice + sendCost + extraSendCost - cartCoupon - orderCoupon - sendCoupon - cancelPrice
    );
  const receiptTotal =
    order.od_receipt_total ?? Math.max(0, order.od_receipt_price + receiptPoint);
  const misuPrice =
    order.od_misu_price ?? Math.max(0, totalPrice - receiptTotal);
  const isFullyPaid =
    order.od_is_fully_paid ?? (misuPrice === 0 && cartPrice > cancelPrice);
  const receiptUrl = order.receipt_url || order.od_payment_receipt_url || "";
  const cashReceiptUrl = order.cash_receipt_url || order.od_cash_receipt_url || "";
  const cashReceiptIssueUrl =
    order.cash_receipt_issue_url || order.od_cash_receipt_issue_url || "";
  const deliveryInquiryUrl =
    order.delivery_inquiry_url || order.od_delivery_inquiry_url || "";
  const hasInvoice =
    !!order.od_invoice &&
    !!order.od_delivery_company &&
    order.od_delivery_company !== "0";
  const displayBankInfo = order.od_payment_display_bank !== false;
  const receiptDisplay =
    order.od_receipt_price > 0
      ? formatPrice(order.od_receipt_price)
      : "아직 입금되지 않았거나 입금정보를 입력하지 못하였습니다.";
  const orderTime = order.od_time || order.od_receipt_time;

  return (
    <div className="shop-order-detail">
      <div className="shop-order-detail-head mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/shop/orders">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">주문 상세</h1>
          <p className="text-sm text-muted-foreground">
            주문번호: {order.od_id}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Order Status */}
        <section className="shop-order-section rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">주문 상태</h2>
                <StatusBadge status={order.od_status} />
              </div>
              <p className="text-sm text-muted-foreground">
                주문일시: {formatDate(orderTime)}
              </p>
              <p className="text-sm text-muted-foreground">
                결제방법: {order.od_settle_case}
                {order.od_pg ? ` (${order.od_pg.toUpperCase()})` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                title="결제 영수증 인쇄/PDF"
              >
                영수증 인쇄
              </Button>
              {receiptUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                    결제 영수증
                  </a>
                </Button>
              )}
              {cashReceiptUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={cashReceiptUrl} target="_blank" rel="noopener noreferrer">
                    현금영수증
                  </a>
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={openCancelDialog}
                  disabled={cancelling}
                >
                  {cancelling ? "취소 중..." : "주문 취소"}
                </Button>
              )}
            </div>
          </div>
          {!canCancel && order.cancel_block_reason && (
            <p className="mt-3 text-right text-xs text-muted-foreground">
              {order.cancel_block_reason}
            </p>
          )}

          {/* Order Timeline */}
          <div className="mt-6 border-t pt-4">
            <OrderTimeline currentStatus={order.od_status} />
          </div>

          {/* 입금 안내 — YoungCart 기준 '주문' 상태가 입금 대기이고, '입금'은 결제 완료입니다. */}
          {order.od_status === "주문" && order.od_bank_account && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-900/10">
              <p className="font-medium text-amber-900 dark:text-amber-100">입금 안내</p>
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                아래 계좌로 <strong>{formatPrice(misuPrice)}</strong>{" "}
                입금해 주세요. 입금 확인 후 배송이 시작됩니다.
              </p>
              <p className="mt-2 font-mono text-amber-900 dark:text-amber-100">
                {order.od_bank_account}
              </p>
              {order.od_deposit_name && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  입금자명: {order.od_deposit_name}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Order Items */}
        <section className="shop-order-section rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-bold">주문 상품</h2>
          <div className="space-y-3">
            {order.items?.map((item) => (
              <div
                key={item.ct_id}
                className="flex items-center gap-4 rounded-md border p-3"
              >
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.it_name}
                      fill
                      className="object-cover"
                      sizes="64px"
                      unoptimized={shouldBypassImageOptimization(item.image_url)}
                    />
                  ) : (
                    <ProductImageFallback compact />
                  )}
                </div>
                <div className="flex-1">
                  <a
                    href={shopProductHref(item, productRewriteMode)}
                    className="text-sm font-medium hover:text-primary"
                  >
                    {item.it_name}
                  </a>
                  {formatCartOption(item.ct_option, item.it_name) && (
                    <p className="text-xs text-muted-foreground">
                      옵션: {formatCartOption(item.ct_option, item.it_name)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(item.ct_price)} x {item.ct_qty}개
                  </p>
                  <p
                    className="text-xs text-muted-foreground"
                    data-shop-order-item-send-cost-label="1"
                  >
                    배송비: {getShopCartShippingPaymentLabel(item, order.items ?? [])}
                  </p>
                </div>
                <span className="text-sm font-bold">
                  {formatPrice(item.line_total ?? item.ct_price * item.ct_qty)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Shipping Info */}
        <section className="shop-order-section rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-bold">배송 정보</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">받으시는 분</dt>
              <dd className="font-medium">{shippingName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">연락처</dt>
              <dd className="font-medium">{shippingContact}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">배송지</dt>
              <dd className="font-medium">
                [{shippingZip}] {shippingAddr1} {shippingAddr2}{" "}
                {shippingAddr3}
              </dd>
            </div>
            {hasInvoice ? (
              <div className="sm:col-span-2 mt-2 rounded-md border bg-muted/30 p-3">
                <dt className="mb-1 text-xs text-muted-foreground">송장 정보</dt>
                <dd className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{order.od_delivery_company}</span>
                  <span className="font-mono">{order.od_invoice}</span>
                  {deliveryInquiryUrl && (
                    <a
                      href={deliveryInquiryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-xs text-primary hover:underline"
                    >
                      배송 조회 →
                    </a>
                  )}
                </dd>
                {order.od_invoice_time &&
                  order.od_invoice_time !== "0000-00-00 00:00:00" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      발송일: {formatDate(order.od_invoice_time)}
                    </p>
                  )}
              </div>
            ) : (
              <div className="sm:col-span-2 mt-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                아직 배송하지 않았거나 배송정보를 입력하지 못하였습니다.
              </div>
            )}
          </dl>
        </section>

        {/* Payment Summary */}
        <section className="shop-order-section rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-bold">결제 정보</h2>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3 text-sm">
              <dl className="grid gap-2 sm:grid-cols-[120px_1fr]">
                <dt className="text-muted-foreground">주문번호</dt>
                <dd className="font-medium">{order.od_id}</dd>
                <dt className="text-muted-foreground">주문일시</dt>
                <dd>{orderTime ? formatDate(orderTime) : "-"}</dd>
                <dt className="text-muted-foreground">결제방식</dt>
                <dd>
                  {order.od_settle_case}
                  {order.od_pg ? ` (${order.od_pg.toUpperCase()})` : ""}
                </dd>
                <dt className="text-muted-foreground">결제금액</dt>
                <dd>{receiptDisplay}</dd>
                {order.od_receipt_price > 0 && order.od_receipt_time && (
                  <>
                    <dt className="text-muted-foreground">결제일시</dt>
                    <dd>{formatDate(order.od_receipt_time)}</dd>
                  </>
                )}
                {order.od_payment_app_label && order.od_payment_app_value && (
                  <>
                    <dt className="text-muted-foreground">
                      {order.od_payment_app_label}
                    </dt>
                    <dd className="font-mono">{order.od_payment_app_value}</dd>
                  </>
                )}
                {displayBankInfo && (
                  <>
                    {order.od_deposit_name && (
                      <>
                        <dt className="text-muted-foreground">입금자명</dt>
                        <dd>{order.od_deposit_name}</dd>
                      </>
                    )}
                    {order.od_bank_account && (
                      <>
                        <dt className="text-muted-foreground">입금계좌</dt>
                        <dd className="font-mono">{order.od_bank_account}</dd>
                      </>
                    )}
                  </>
                )}
                {receiptPoint > 0 && (
                  <>
                    <dt className="text-muted-foreground">포인트사용</dt>
                    <dd>{receiptPoint.toLocaleString()}점</dd>
                  </>
                )}
                {refundPrice > 0 && (
                  <>
                    <dt className="text-muted-foreground">환불 금액</dt>
                    <dd className="text-red-600">{formatPrice(refundPrice)}</dd>
                  </>
                )}
              </dl>

              {(receiptUrl || cashReceiptUrl || cashReceiptIssueUrl) && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {receiptUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                        영수증 출력
                      </a>
                    </Button>
                  )}
                  {cashReceiptUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={cashReceiptUrl} target="_blank" rel="noopener noreferrer">
                        현금영수증 확인
                      </a>
                    </Button>
                  )}
                  {!cashReceiptUrl && cashReceiptIssueUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={cashReceiptIssueUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        현금영수증 발급
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">주문총액</span>
                <span>{formatPrice(cartPrice)}</span>
              </div>
              {cartCoupon > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>개별상품 쿠폰할인</span>
                  <span>-{formatPrice(cartCoupon)}</span>
                </div>
              )}
              {orderCoupon > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>주문금액 쿠폰할인</span>
                  <span>-{formatPrice(orderCoupon)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">배송비</span>
                <span>{sendCost === 0 ? "무료" : formatPrice(sendCost)}</span>
              </div>
              {sendCoupon > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>배송비 쿠폰할인</span>
                  <span>-{formatPrice(sendCoupon)}</span>
                </div>
              )}
              {extraSendCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">추가배송비</span>
                  <span>+{formatPrice(extraSendCost)}</span>
                </div>
              )}
              {cancelPrice > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>취소금액</span>
                  <span>-{formatPrice(cancelPrice)}</span>
                </div>
              )}
              {typeof order.od_total_point === "number" && order.od_total_point > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">적립포인트</span>
                  <span>{order.od_total_point.toLocaleString()}점</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>총 구매액</span>
                <span>{formatPrice(totalPrice)}</span>
              </div>
              {misuPrice > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>미결제액</span>
                  <span>{formatPrice(misuPrice)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>결제액</span>
                <span className={isFullyPaid ? "text-primary" : ""}>
                  {isFullyPaid ? "완불" : formatPrice(receiptTotal)}
                </span>
              </div>
              {receiptPoint > 0 && (
                <div className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>포인트 결제</span>
                    <span>{receiptPoint.toLocaleString()}점</span>
                  </div>
                  <div className="flex justify-between">
                    <span>실결제</span>
                    <span>{formatPrice(order.od_receipt_price)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 현금영수증 — od_cash=1 면 발급된 상태. od_cash_no 가 영수증 번호. */}
          {order.od_cash === 1 && order.od_cash_no && (
            <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
              <p className="text-xs text-muted-foreground">현금영수증</p>
              <p className="mt-1 font-mono">{order.od_cash_no}</p>
              {order.od_cash_info && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.od_cash_info}
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {cancelDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-cancel-title"
            aria-describedby="order-cancel-description"
            className="w-full max-w-md rounded-[8px] bg-background p-5 shadow-lg"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeCancelDialog();
            }}
          >
            <form onSubmit={submitCancel} className="space-y-4">
              <div>
                <h2 id="order-cancel-title" className="text-lg font-bold">
                  주문 취소
                </h2>
                <p
                  id="order-cancel-description"
                  className="mt-1 text-sm text-muted-foreground"
                >
                  취소사유를 입력한 뒤 주문 취소를 확정해 주세요.
                </p>
              </div>
              <div>
                <label htmlFor={cancelReasonId} className="text-sm font-medium">
                  취소사유
                </label>
                <textarea
                  id={cancelReasonId}
                  value={cancelReason}
                  onChange={(event) => {
                    setCancelReason(event.target.value);
                    if (cancelError) setCancelError("");
                  }}
                  maxLength={100}
                  rows={4}
                  autoFocus
                  className="mt-2 w-full rounded-[4px] border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="예: 주문 정보 변경"
                />
                <div className="mt-1 flex justify-between gap-3 text-xs">
                  <p className="text-destructive" role="alert">
                    {cancelError}
                  </p>
                  <span className="shrink-0 text-muted-foreground">
                    {cancelReason.length}/100
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCancelDialog}
                  disabled={cancelling}
                >
                  닫기
                </Button>
                <Button type="submit" variant="destructive" disabled={cancelling}>
                  {cancelling ? "취소 처리 중..." : "주문 취소 확정"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
