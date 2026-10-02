"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import { api, type ShopCartItem, type ShopPolicy } from "@/lib/api";
import type { ShopNaverPayConfig } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { formatPrice, formatCartOption } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { CreditCard, Minus, Plus, Trash2, ShoppingBag, Ticket } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { toastError, toastSuccess } from "@/lib/toast";
import { shouldBypassImageOptimization } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import {
  getCart,
  removeCartItem,
  updateCartItemQuantity,
} from "@/services/cart";
import {
  estimateShopShippingCost,
  getShopNaverPayConfig,
  getShopPolicy,
  getShopShippingFreeThreshold,
  registerShopNaverPayOrder,
} from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { getShopCartShippingPaymentLabel } from "@/lib/shop-shipping-label";
import { isTelInquiry } from "@/lib/shop-product-state";

interface ApplicableCoupon {
  cp_id: string;
  cp_subject: string;
  cp_method: number;     // 0 상품, 1 카테고리
  cp_type: number;       // 0 정액, 1 정률
  cp_price: number;
  cp_minimum: number;
  cp_maximum: number;
  discount: number;      // 이 행에 적용 시 실제 할인액
}

function cartItemLineTotal(item: ShopCartItem): number {
  return typeof item.line_total === "number"
    ? item.line_total
    : item.ct_price * item.ct_qty;
}

function naverPayCartBlockReason(item: ShopCartItem): string {
  const itemName = item.it_name || "상품";

  if (item.it_use !== undefined && String(item.it_use) !== "1") {
    return `${itemName}은(는) 판매중지 상품이라 네이버페이로 구매할 수 없습니다.`;
  }
  if (String(item.it_soldout ?? "0") === "1") {
    return `${itemName}은(는) 품절 상품이라 네이버페이로 구매할 수 없습니다.`;
  }
  if (isTelInquiry(item)) {
    return `${itemName}은(는) 전화문의 상품이라 네이버페이로 구매할 수 없습니다.`;
  }
  if (Number(item.io_type ?? 0) === 1 && Number(item.io_price ?? 0) < 0) {
    return `${itemName}의 차감 추가옵션은 네이버페이로 구매할 수 없습니다.`;
  }
  if (Number(item.io_type ?? 0) !== 1 && item.it_basic_price + Number(item.io_price ?? 0) <= 0) {
    return `${itemName}은(는) 결제 금액이 없어 네이버페이로 구매할 수 없습니다.`;
  }

  return "";
}

/** 영카트 cart.php 의 단계 표시 — 장바구니 › 주문/결제 › 주문완료. 여기서는 첫 단계다. */
const CART_STEPS = ["장바구니", "주문/결제", "주문완료"];

function CartSteps() {
  return (
    <ol className="cart-steps mb-8 grid grid-cols-3 overflow-hidden rounded-lg border text-sm" aria-label="주문 단계">
      {CART_STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === 0 ? "step" : undefined}
          className={
            index === 0
              ? "cart-step is-current flex items-center justify-center gap-2 bg-foreground py-3 font-semibold text-background"
              : "cart-step flex items-center justify-center gap-2 border-l py-3 text-muted-foreground"
          }
        >
          <span className="cart-step-num inline-grid h-5 w-5 place-items-center rounded-full border text-xs" aria-hidden>
            {index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export default function CartPage() {
  const [items, setItems] = useState<ShopCartItem[]>([]);
  const [cartCoupon, setCartCoupon] = useState(0);
  const [shippingPolicy, setShippingPolicy] = useState<ShopPolicy | null>(null);
  const [cartShippingCost, setCartShippingCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [naverPayConfig, setNaverPayConfig] = useState<ShopNaverPayConfig | null>(null);
  const [naverPaySubmitting, setNaverPaySubmitting] = useState(false);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  const [pendingRemoveItem, setPendingRemoveItem] = useState<ShopCartItem | null>(null);
  // 행별로 lazy-load 한 사용 가능 쿠폰 — 한번 펼치면 캐시.
  const [applicableMap, setApplicableMap] = useState<Record<string, ApplicableCoupon[]>>({});
  const applicableLoadingRef = useRef<Set<string>>(new Set());

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
    applyClientPageMetadata({
      title: "장바구니",
      description: "장바구니에 담긴 상품과 적용 가능한 쿠폰을 확인하세요.",
      path: "/shop/cart",
    });
  }, []);

  useEffect(() => {
    let alive = true;

    getShopNaverPayConfig()
      .then((config) => {
        if (alive) setNaverPayConfig(config);
      })
      .catch(() => {
        if (alive) setNaverPayConfig(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  const loadCart = useCallback(async () => {
    setLoadError("");
    try {
      const [cart, policy] = await Promise.all([
        getCart(),
        getShopPolicy().catch(() => null),
      ]);
      setItems(cart.items);
      setCartCoupon((cart as { cart_coupon?: number }).cart_coupon ?? 0);
      setCartShippingCost(
        typeof cart.shipping_cost === "number"
          ? cart.shipping_cost
          : typeof cart.send_cost === "number"
            ? cart.send_cost
            : null
      );
      setShippingPolicy(policy);
    } catch {
      setItems([]);
      setCartCoupon(0);
      setCartShippingCost(null);
      setShippingPolicy(null);
      setLoadError("장바구니를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadApplicable = useCallback(async (ct_id: string) => {
    if (applicableMap[ct_id] || applicableLoadingRef.current.has(ct_id)) return;
    applicableLoadingRef.current.add(ct_id);
    try {
      const res = await api.get<ApplicableCoupon[]>(
        `/shop/coupons/applicable?ct_id=${encodeURIComponent(ct_id)}`
      );
      setApplicableMap((prev) => ({ ...prev, [ct_id]: (res.data as ApplicableCoupon[]) ?? [] }));
    } catch {
      setApplicableMap((prev) => ({ ...prev, [ct_id]: [] }));
    } finally {
      applicableLoadingRef.current.delete(ct_id);
    }
  }, [applicableMap]);

  const applyCoupon = useCallback(async (ct_id: string, cp_id: string) => {
    setUpdatingIds((prev) => new Set(prev).add(ct_id));
    try {
      await api.post("/shop/coupons/apply-to-cart", { ct_id: Number(ct_id), cp_id });
      if (cp_id) toastSuccess("쿠폰이 적용되었습니다.");
      else toastSuccess("쿠폰을 해제했습니다.");
      await loadCart();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "쿠폰 적용에 실패했습니다.";
      toastError(message);
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(ct_id);
        return next;
      });
    }
  }, [loadCart]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  const naverPayBlockReason = items.map(naverPayCartBlockReason).find(Boolean) || "";
  const canUseNaverPay =
    !!naverPayConfig?.enabled && items.length > 0 && naverPayBlockReason === "";

  const updateQuantity = useCallback(
    async (ct_id: string, newQty: number) => {
      if (newQty < 1) return;
      setUpdatingIds((prev) => new Set(prev).add(ct_id));
      try {
        await updateCartItemQuantity(ct_id, newQty);
        setItems((prev) =>
          prev.map((item) =>
            item.ct_id === ct_id
              ? {
                  ...item,
                  ct_qty: newQty,
                  // Optimistic estimate only; the server refreshes line_total
                  // on the next loadCart(). Scale the existing line total
                  // proportionally and round once — flooring the unit price
                  // before multiplying drops small 원 amounts every update.
                  line_total:
                    item.ct_qty > 0
                      ? Math.round((cartItemLineTotal(item) / item.ct_qty) * newQty)
                      : item.ct_price * newQty,
                }
              : item
          )
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "수량 변경에 실패했습니다.";
        toastError(message);
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(ct_id);
          return next;
        });
      }
    },
    []
  );

  const removeItem = useCallback(
    async (ct_id: string) => {
      setUpdatingIds((prev) => new Set(prev).add(ct_id));
      try {
        await removeCartItem(ct_id);
        setItems((prev) => prev.filter((item) => item.ct_id !== ct_id));
        setPendingRemoveItem(null);
      } catch {
        toastError("삭제에 실패했습니다.");
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(ct_id);
          return next;
        });
      }
    },
    []
  );

  const handleNaverPayOrder = useCallback(async () => {
    if (!naverPayConfig?.enabled || !items.length) return;
    if (naverPayBlockReason) {
      toastError(naverPayBlockReason);
      return;
    }

    setNaverPaySubmitting(true);
    try {
      const response = await registerShopNaverPayOrder({
        source: "cart",
        ct_ids: items.map((item) => item.ct_id),
        back_url: window.location.href,
      });
      if (!response.redirect_url) {
        throw new Error("네이버페이 이동 URL이 없습니다.");
      }
      window.location.href = response.redirect_url;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "네이버페이 주문 등록에 실패했습니다.";
      toastError(message);
    } finally {
      setNaverPaySubmitting(false);
    }
  }, [items, naverPayBlockReason, naverPayConfig?.enabled]);

  const subtotal = items.reduce(
    (sum, item) => sum + cartItemLineTotal(item),
    0
  );
  const estimatedShippingCost = estimateShopShippingCost(subtotal, shippingPolicy);
  const shippingCost = cartShippingCost ?? estimatedShippingCost;
  const shippingFreeThreshold = getShopShippingFreeThreshold(shippingPolicy);
  // 카트행 쿠폰(상품/카테고리) — 서버 반환값(cartCoupon)이 정확. 클라 합산은 표시 fallback.
  const cartCouponDisplay = cartCoupon > 0
    ? cartCoupon
    : items.reduce((s, it) => s + (it.cp_price ?? 0), 0);
  const total = Math.max(0, subtotal - cartCouponDisplay + shippingCost);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-lg border p-4">
            <div className="skeleton h-20 w-20 rounded" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-4 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShoppingBag className="mb-4 h-16 w-16 text-muted-foreground/50" />
        <h1 className="text-xl font-bold">장바구니를 불러올 수 없습니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        <Button className="mt-6" onClick={loadCart}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    /* 빈 장바구니도 같은 틀(제목 · 단계 · 목록 자리 · 결제 예정 금액)을 유지한다.
       영카트 cart.php 가 그렇고, 어디까지 왔는지가 그대로 보인다. */
    return (
      <div className="cart-page">
        <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "장바구니" }]} />
        <h1 className="cart-title mb-6 text-2xl font-bold">장바구니</h1>
        <CartSteps />

        <div className="cart-layout grid gap-8 lg:grid-cols-3">
          <div className="cart-items lg:col-span-2">
            <div className="cart-empty flex flex-col items-center justify-center rounded-lg border py-16 text-center">
              <ShoppingBag className="mb-4 h-12 w-12 text-muted-foreground/50" aria-hidden />
              <p className="cart-empty-text text-sm text-muted-foreground">장바구니에 담긴 상품이 없습니다.</p>
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="cart-summary sticky top-4 rounded-lg border p-6">
              <h2 className="cart-summary-title mb-4 text-lg font-bold">결제 예정 금액</h2>
              <div className="space-y-3 text-sm">
                <div className="cart-summary-row flex justify-between">
                  <span className="text-muted-foreground">상품 금액</span>
                  <span>{formatPrice(0)}</span>
                </div>
                <div className="cart-summary-row flex justify-between">
                  <span className="text-muted-foreground">배송비</span>
                  <span>{formatPrice(0)}</span>
                </div>
                <div className="cart-summary-total border-t pt-3">
                  <div className="flex justify-between text-base font-bold">
                    <span>합계</span>
                    <span className="text-primary">{formatPrice(0)}</span>
                  </div>
                </div>
              </div>
              <Button variant="outline" className="cart-continue mt-6 w-full" size="lg" asChild>
                <Link href="/shop/products">쇼핑 계속하기</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "장바구니" }]} />
      <h1 className="cart-title mb-6 text-2xl font-bold">
        장바구니 <span className="cart-title-count">({items.length})</span>
      </h1>
      <CartSteps />

      <div className="cart-layout grid gap-8 lg:grid-cols-3">
        {/* Cart Items */}
        <div className="cart-items space-y-4 lg:col-span-2">
          {items.map((item) => (
            <div
              key={item.ct_id}
              className="cart-item flex gap-4 rounded-lg border p-4"
            >
              <a
                href={shopProductHref(item, productRewriteMode)}
                className="cart-item-thumb relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted sm:h-24 sm:w-24"
              >
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.it_name}
                    fill
                    className="object-cover"
                    sizes="96px"
                    unoptimized={shouldBypassImageOptimization(item.image_url)}
                  />
                ) : (
                  <ProductImageFallback compact />
                )}
              </a>

              <div className="cart-item-body flex flex-1 flex-col justify-between">
                <div>
                  <a
                    href={shopProductHref(item, productRewriteMode)}
                    className="cart-item-name font-medium hover:text-primary"
                  >
                    {item.it_name}
                  </a>
                  {item.ct_option && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      옵션: {formatCartOption(item.ct_option)}
                    </p>
                  )}
                  <p
                    className="mt-0.5 text-xs text-muted-foreground"
                    data-shop-cart-send-cost-label="1"
                  >
                    배송비: {getShopCartShippingPaymentLabel(item, items)}
                  </p>
                  {/* 상품/카테고리 쿠폰 드롭다운 — 행 단위 적용. 적용 결과는 cp_price 에. */}
                  <div className="mt-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Ticket className="h-3 w-3" />
                      <span>상품 쿠폰</span>
                    </label>
                    <select
                      aria-label={`${item.it_name} 상품 쿠폰 선택`}
                      value={item.cp_id || ""}
                      onFocus={() => loadApplicable(item.ct_id)}
                      onChange={(e) => applyCoupon(item.ct_id, e.target.value)}
                      disabled={updatingIds.has(item.ct_id)}
                      className="mt-1 w-full max-w-md rounded-md border bg-background px-2 py-1 text-xs"
                    >
                      <option value="">— 사용 안 함 —</option>
                      {(item.cp_id && !applicableMap[item.ct_id]?.some(c => c.cp_id === item.cp_id)) && (
                        // 이미 묶인 쿠폰이 applicable 목록에 없으면 (예: 다른 행에 의해 사용 처리)
                        // 묶인 상태만 유지해서 사용자가 보고 해제할 수 있게 한 옵션 표시.
                        <option value={item.cp_id}>
                          (적용됨: {formatPrice(item.cp_price ?? 0)} 할인)
                        </option>
                      )}
                      {(applicableMap[item.ct_id] ?? []).map((c) => (
                        <option key={c.cp_id} value={c.cp_id}>
                          {c.cp_subject} (-{formatPrice(c.discount)})
                        </option>
                      ))}
                    </select>
                    {(item.cp_price ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-green-700">
                        쿠폰 할인 -{formatPrice(item.cp_price ?? 0)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="cart-item-controls mt-2 flex items-center justify-between">
                  <div className="cart-item-qty flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`${item.it_name} 수량 감소`}
                      disabled={
                        item.ct_qty <= 1 || updatingIds.has(item.ct_id)
                      }
                      onClick={() =>
                        updateQuantity(item.ct_id, item.ct_qty - 1)
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">
                      {item.ct_qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`${item.it_name} 수량 증가`}
                      disabled={updatingIds.has(item.ct_id)}
                      onClick={() =>
                        updateQuantity(item.ct_id, item.ct_qty + 1)
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="cart-item-total flex items-center gap-3">
                    <span className="cart-item-price font-bold">
                      {formatPrice(cartItemLineTotal(item))}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={updatingIds.has(item.ct_id)}
                      onClick={() => setPendingRemoveItem(item)}
                      aria-label={`${item.it_name} 삭제`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="cart-summary sticky top-4 rounded-lg border p-6">
            <h2 className="cart-summary-title mb-4 text-lg font-bold">결제 예정 금액</h2>
            <div className="space-y-3 text-sm">
              <div className="cart-summary-row flex justify-between">
                <span className="text-muted-foreground">상품 금액</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {cartCouponDisplay > 0 && (
                <div className="cart-summary-row flex justify-between text-green-700">
                  <span>상품 쿠폰 할인</span>
                  <span>-{formatPrice(cartCouponDisplay)}</span>
                </div>
              )}
              <div className="cart-summary-row flex justify-between">
                <span className="text-muted-foreground">배송비</span>
                <span>
                  {shippingCost === 0 ? (
                    <span className="text-green-700">무료</span>
                  ) : (
                    formatPrice(shippingCost)
                  )}
                </span>
              </div>
              {shippingCost > 0 && shippingFreeThreshold > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatPrice(shippingFreeThreshold)} 이상 구매 시 무료배송
                </p>
              )}
              <div className="cart-summary-total border-t pt-3">
                <div className="flex justify-between text-base font-bold">
                  <span>합계</span>
                  <span className="text-primary">{formatPrice(total)}</span>
                </div>
              </div>
            </div>
            <Button className="cart-order mt-6 w-full" size="lg" asChild>
              <Link href="/shop/order">주문하기</Link>
            </Button>
            {naverPayConfig?.enabled && (
              <>
                <Button
                  type="button"
                  className="mt-2 w-full bg-[#0c8040] text-white hover:bg-[#08783a] disabled:bg-[#0c8040]/50 disabled:text-white"
                  size="lg"
                  onClick={handleNaverPayOrder}
                  disabled={naverPaySubmitting || !canUseNaverPay}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {naverPaySubmitting ? "네이버페이 등록 중..." : "N Pay 구매"}
                </Button>
                {naverPayBlockReason && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {naverPayBlockReason}
                  </p>
                )}
              </>
            )}
            <Button
              variant="outline"
              className="cart-continue mt-2 w-full"
              asChild
            >
              <Link href="/shop/products">쇼핑 계속하기</Link>
            </Button>
          </div>
        </div>
      </div>

      {pendingRemoveItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-remove-title"
            aria-describedby="cart-remove-description"
            className="w-full max-w-sm rounded-[8px] bg-background p-5 shadow-lg"
          >
            <h2 id="cart-remove-title" className="text-lg font-bold">
              상품 삭제
            </h2>
            <p
              id="cart-remove-description"
              className="mt-2 text-sm text-muted-foreground"
            >
              {pendingRemoveItem.it_name} 상품을 장바구니에서 삭제하시겠습니까?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingRemoveItem(null)}
                disabled={updatingIds.has(pendingRemoveItem.ct_id)}
              >
                닫기
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => removeItem(pendingRemoveItem.ct_id)}
                disabled={updatingIds.has(pendingRemoveItem.ct_id)}
              >
                {updatingIds.has(pendingRemoveItem.ct_id) ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
