"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { ShopCartItem, ShopPolicy } from "@/lib/api";
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
import { ShoppingBag } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { toastError } from "@/lib/toast";
import { notifyCartChanged } from "@/lib/cart-events";
import { checkCartOrderStock, clearCart, getCart, removeCartItems } from "@/services/cart";
import { useRouter } from "next/navigation";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { estimateShopShippingCost, getShopPolicy } from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import { useAuthStore } from "@/store/auth";
import { cartOrderHref, groupCartItems, selectedGroupCtIds, type CartGroup } from "./cartGroups";
import { CartTable } from "./CartTable";
import { CartOptionDialog } from "./CartOptionDialog";
import { CartCouponDialog } from "./CartCouponDialog";

const NOTHING_TO_ORDER = "주문하실 상품을 하나이상 선택해 주십시오.";
const NOTHING_TO_DELETE = "삭제하실 상품을 하나이상 선택해 주십시오.";

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
  const [ordering, setOrdering] = useState(false);
  const router = useRouter();
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

  /**
   * 주문하기 — 영카트 cart.php 처럼 주문서로 가기 전에 재고를 본다(ajax.orderstock.php). 품절 · 재고 부족이면 서버의
   * 안내 문구를 알리고 장바구니에 남는다. 통과하면 주문서로 간다(주문을 만들 때 서버가 한 번 더 본다).
   */
  const handleOrder = async () => {
    if (!orderHref || ordering) return;
    setOrdering(true);
    try {
      await checkCartOrderStock(selectedCtIds);
    } catch (err: unknown) {
      toastError(err instanceof Error && err.message ? err.message : "재고를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      setOrdering(false);
      // 서버가 알려 준 대로 장바구니를 다시 불러 수량 · 상태를 맞춘다.
      await reloadAfterChange();
      return;
    }
    runtimeRouterPush(router, orderHref);
    // 주문서에서 뒤로 돌아왔을 때 단추가 잠긴 채 남지 않게 이동을 시작한 뒤 바로 푼다.
    setOrdering(false);
  };

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
            <Button size="lg" className="cart-order flex-1" onClick={handleOrder} disabled={ordering} aria-busy={ordering || undefined}>
              주문하기
            </Button>
          ) : (
            <Button size="lg" className="cart-order flex-1" onClick={() => toastError(NOTHING_TO_ORDER)}>
              주문하기
            </Button>
          ))}
      </div>
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
