"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { ShopCartItem, ShopNaverPayConfig, ShopPolicy } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, ShoppingBag } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { toastError } from "@/lib/toast";
import { notifyCartChanged } from "@/lib/cart-events";
import { clearCart, getCart, removeCartItems } from "@/services/cart";
import {
  estimateShopShippingCost,
  getShopNaverPayConfig,
  getShopPolicy,
  registerShopNaverPayOrder,
} from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { isTelInquiry } from "@/lib/shop-product-state";
import { useAuthStore } from "@/store/auth";
import { cartOrderHref, groupCartItems, selectedGroupCtIds, type CartGroup } from "./cartGroups";
import { CartTable } from "./CartTable";
import { CartOptionDialog } from "./CartOptionDialog";
import { CartCouponDialog } from "./CartCouponDialog";

const NOTHING_TO_ORDER = "주문하실 상품을 하나이상 선택해 주십시오.";
const NOTHING_TO_DELETE = "삭제하실 상품을 하나이상 선택해 주십시오.";

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

type DeleteKind = "selected" | "all";

/** 영카트 cart.php 아래의 합계 막대 — 배송비 · 포인트 · 총계 가격(쿠폰을 묶었으면 쿠폰 할인도). */
function CartTotals({ shippingCost, point, coupon, total }: { shippingCost: number; point: number; coupon: number; total: number }) {
  const cell = "cart-total-cell flex items-center justify-between gap-4 px-6 py-5";
  return (
    <dl className="cart-totals mt-8 grid overflow-hidden rounded-md bg-muted text-sm md:auto-cols-fr md:grid-flow-col">
      <div className={cell}>
        <dt>배송비</dt>
        <dd className="font-bold">{formatPrice(shippingCost)}</dd>
      </div>
      <div className={`${cell} border-t md:border-l md:border-t-0`}>
        <dt>포인트</dt>
        <dd className="font-bold">{new Intl.NumberFormat("ko-KR").format(point)} 점</dd>
      </div>
      {coupon > 0 && (
        <div className={`${cell} border-t text-green-700 md:border-l md:border-t-0`}>
          <dt>쿠폰 할인</dt>
          <dd className="font-bold">-{formatPrice(coupon)}</dd>
        </div>
      )}
      <div className={`${cell} cart-total-grand bg-foreground text-background`}>
        <dt>총계 가격</dt>
        <dd className="text-base font-bold">{formatPrice(total)}</dd>
      </div>
    </dl>
  );
}

export default function CartPage() {
  const [items, setItems] = useState<ShopCartItem[]>([]);
  const [cartCoupon, setCartCoupon] = useState(0);
  const [shippingPolicy, setShippingPolicy] = useState<ShopPolicy | null>(null);
  const [cartShippingCost, setCartShippingCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [naverPayConfig, setNaverPayConfig] = useState<ShopNaverPayConfig | null>(null);
  const [naverPaySubmitting, setNaverPaySubmitting] = useState(false);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  // 영카트처럼 처음에는 모두 고른 상태 — 해제한 상품만 기억한다(다시 불러와 새로 생긴 상품도 골라진 채로 보인다).
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(() => new Set());
  const [optionItId, setOptionItId] = useState("");
  const [couponItId, setCouponItId] = useState("");
  // 확인 창 — 닫히는 동안 글이 바뀌지 않게 열림과 종류를 따로 둔다.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteKind, setDeleteKind] = useState<DeleteKind>("selected");
  const [deleting, setDeleting] = useState(false);
  const isMember = Boolean(useAuthStore((state) => state.user));

  useEffect(() => {
    let alive = true;
    getClientPublicSettings()
      .then((settings) => {
        if (alive) setProductRewriteMode(settings.cf_bbs_rewrite);
      })
      .catch(() => {
        if (alive) setProductRewriteMode(0);
      });
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

  useEffect(() => {
    applyClientPageMetadata({
      title: "장바구니",
      description: "장바구니에 담긴 상품과 적용 가능한 쿠폰을 확인하세요.",
      path: "/shop/cart",
    });
  }, []);

  const loadCart = useCallback(async () => {
    setLoadError("");
    try {
      const [cart, policy] = await Promise.all([
        getCart(),
        getShopPolicy().catch(() => null),
      ]);
      setItems(cart.items);
      setCartCoupon(cart.cart_coupon ?? 0);
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

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // 담긴 것을 바꾼 뒤 — 머리의 장바구니 수(cart:changed 를 듣는다)도 다시 센다.
  const reloadAfterChange = useCallback(async () => {
    notifyCartChanged();
    await loadCart();
  }, [loadCart]);

  const groups = useMemo(() => groupCartItems(items), [items]);
  const selected = useMemo(
    () => new Set(groups.filter((group) => !deselected.has(group.itId)).map((group) => group.itId)),
    [groups, deselected]
  );
  const selectedCtIds = selectedGroupCtIds(groups, selected);
  const orderHref = cartOrderHref(groups, selected);

  const toggleGroup = useCallback((itId: string, checked: boolean) => {
    setDeselected((previous) => {
      const next = new Set(previous);
      if (checked) next.delete(itId);
      else next.add(itId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => setDeselected(checked ? new Set() : new Set(groups.map((group) => group.itId))),
    [groups]
  );

  const requestDelete = (kind: DeleteKind) => {
    if (kind === "selected" && selectedCtIds.length === 0) {
      toastError(NOTHING_TO_DELETE);
      return;
    }
    setDeleteKind(kind);
    setConfirmOpen(true);
  };

  const runDelete = async () => {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      if (deleteKind === "all") await clearCart();
      else await removeCartItems(selectedCtIds);
      // 영카트처럼 지운 뒤에는 남은 상품이 모두 골라진 채로 보인다.
      setDeselected(new Set());
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      await reloadAfterChange();
      setDeleting(false);
    }
  };

  const selectedItems = items.filter((item) => selected.has(item.it_id));
  const naverPayBlockReason = selectedItems.map(naverPayCartBlockReason).find(Boolean) || "";
  const canUseNaverPay = !!naverPayConfig?.enabled && selectedItems.length > 0 && naverPayBlockReason === "";

  const handleNaverPayOrder = useCallback(async () => {
    if (!naverPayConfig?.enabled) return;
    if (selectedCtIds.length === 0) {
      toastError(NOTHING_TO_ORDER);
      return;
    }
    if (naverPayBlockReason) {
      toastError(naverPayBlockReason);
      return;
    }

    setNaverPaySubmitting(true);
    try {
      const response = await registerShopNaverPayOrder({
        source: "cart",
        ct_ids: selectedCtIds,
        back_url: window.location.href,
      });
      if (!response.redirect_url) {
        throw new Error("네이버페이 이동 URL이 없습니다.");
      }
      window.location.href = response.redirect_url;
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "네이버페이 주문 등록에 실패했습니다.");
    } finally {
      setNaverPaySubmitting(false);
    }
  }, [naverPayBlockReason, naverPayConfig?.enabled, selectedCtIds]);

  // 합계는 영카트처럼 장바구니 전체 — 배송비는 서버 계산값, 없으면 정책으로 어림한다.
  const subtotal = groups.reduce((sum, group) => sum + group.subtotal, 0);
  const totalPoint = groups.reduce((sum, group) => sum + group.point, 0);
  const shippingCost = cartShippingCost ?? estimateShopShippingCost(subtotal, shippingPolicy);
  const couponTotal = cartCoupon > 0 ? cartCoupon : groups.reduce((sum, group) => sum + group.couponDiscount, 0);
  const total = Math.max(0, subtotal - couponTotal + shippingCost);
  const optionGroup: CartGroup | undefined = groups.find((group) => group.itId === optionItId);
  const couponGroup: CartGroup | undefined = groups.find((group) => group.itId === couponItId);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b py-6">
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

  return (
    <div className="cart-page">
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "장바구니" }]} />
      <h1 className="cart-title mb-6 text-2xl font-bold">장바구니</h1>

      <CartTable
        groups={groups}
        selected={selected}
        onToggle={toggleGroup}
        onToggleAll={toggleAll}
        productRewriteMode={productRewriteMode}
        canUseCoupons={isMember}
        onEditOptions={setOptionItId}
        onOpenCoupons={setCouponItId}
      />

      {groups.length > 0 && (
        <>
          <div className="cart-list-actions mt-4 flex gap-2">
            <Button type="button" variant="outline" size="sm" className="cart-delete-selected" onClick={() => requestDelete("selected")} disabled={deleting}>
              선택삭제
            </Button>
            <Button type="button" variant="outline" size="sm" className="cart-delete-all" onClick={() => requestDelete("all")} disabled={deleting}>
              비우기
            </Button>
          </div>
          <CartTotals shippingCost={shippingCost} point={totalPoint} coupon={couponTotal} total={total} />
        </>
      )}

      <div className="cart-buttons mx-auto mt-8 flex max-w-sm gap-2">
        <Button variant="outline" size="lg" className="cart-continue flex-1" asChild>
          <Link href="/shop/products">쇼핑 계속하기</Link>
        </Button>
        {groups.length > 0 &&
          (orderHref ? (
            <Button size="lg" className="cart-order flex-1" asChild>
              <Link href={orderHref}>주문하기</Link>
            </Button>
          ) : (
            <Button size="lg" className="cart-order flex-1" onClick={() => toastError(NOTHING_TO_ORDER)}>
              주문하기
            </Button>
          ))}
      </div>
      {naverPayConfig?.enabled && groups.length > 0 && (
        <div className="mx-auto mt-2 max-w-sm">
          <Button
            type="button"
            className="w-full bg-[#0c8040] text-white hover:bg-[#08783a] disabled:bg-[#0c8040]/50 disabled:text-white"
            size="lg"
            onClick={handleNaverPayOrder}
            disabled={naverPaySubmitting || !canUseNaverPay}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {naverPaySubmitting ? "네이버페이 등록 중..." : "N Pay 구매"}
          </Button>
          {naverPayBlockReason && (
            <p className="mt-2 text-xs text-muted-foreground">{naverPayBlockReason}</p>
          )}
        </div>
      )}

      {optionGroup && (
        <CartOptionDialog group={optionGroup} onClose={() => setOptionItId("")} onChanged={reloadAfterChange} />
      )}
      {couponGroup && (
        <CartCouponDialog group={couponGroup} onClose={() => setCouponItId("")} onChanged={reloadAfterChange} />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteKind === "all" ? "장바구니 비우기" : "선택삭제"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteKind === "all"
                ? "장바구니의 상품을 모두 삭제하시겠습니까?"
                : `선택한 상품 ${selected.size}개를 장바구니에서 삭제하시겠습니까?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={runDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
