"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { g5ShortHref } from "@/lib/g5-short-url";
import { notifyCartChanged } from "@/lib/cart-events";
import type { ShopWishItem } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { shopProductHref } from "@/lib/product-url";
import { useAuthStore } from "@/store/auth";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { ToastAction } from "@/components/ui/toast";
import { CreditCard, Heart, ShoppingCart, SlidersHorizontal, Trash2 } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";
import {
  addCartItem,
  addCartItemDirect,
  getWishlist,
  removeWishlistItem,
  type ShopCartAddResponse,
} from "@/services/cart";
import { getClientPublicSettings } from "@/services/settings";
import { isTelInquiry, formatProductPrice } from "@/lib/shop-product-state";

function cartIdsFromAddResponse(response?: { data?: ShopCartAddResponse | null }) {
  const data = response?.data;
  if (!data) return [] as string[];

  const ids = [
    data.ct_id,
    ...(data.items ?? []).map((item) => item.ct_id),
  ];

  return ids
    .filter((id): id is string | number => id !== undefined && id !== null && String(id) !== "")
    .map((id) => String(id));
}

function wishlistCartBlockReason(item: ShopWishItem) {
  const telInquiry = isTelInquiry(item);
  const isSoldout = String(item.it_soldout ?? "0") === "1";
  const isUnavailable = String(item.it_use ?? "1") !== "1";
  const optionCount = Number(item.option_count ?? 0);

  return item.cart_block_reason ||
    (isUnavailable
      ? "판매중지"
      : isSoldout
        ? "품절"
        : telInquiry
          ? "전화문의"
          : optionCount > 0
            ? "옵션 선택 필요"
            : "");
}

function canSelectWishlistItem(item: ShopWishItem) {
  return (item.can_add_cart ?? wishlistCartBlockReason(item) === "") && wishlistCartBlockReason(item) === "";
}

export default function WishlistPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const [items, setItems] = useState<ShopWishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);

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
    if (!isInitialized) return;
    if (!user) {
      runtimeRouterPush(router, "/shop/login?redirect=%2Fshop%2Fwishlist");
      return;
    }

    const loadWishlist = async () => {
      try {
        setItems(await getWishlist());
      } catch {
        toastError("로그인이 필요합니다.");
        runtimeRouterPush(router, "/shop/login?redirect=%2Fshop%2Fwishlist");
      } finally {
        setLoading(false);
      }
    };
    loadWishlist();
  }, [isInitialized, router, user]);

  const selectableItems = useMemo(
    () => items.filter((item) => canSelectWishlistItem(item)),
    [items]
  );
  const selectedItems = useMemo(
    () => selectableItems.filter((item) => selectedIds.has(item.it_id)),
    [selectableItems, selectedIds]
  );
  const allSelectableSelected =
    selectableItems.length > 0 && selectableItems.every((item) => selectedIds.has(item.it_id));

  useEffect(() => {
    setSelectedIds((prev) => {
      const selectableIds = new Set(selectableItems.map((item) => item.it_id));
      const next = new Set([...prev].filter((itId) => selectableIds.has(itId)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableItems]);

  const toggleSelected = useCallback((itId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(itId);
      } else {
        next.delete(itId);
      }
      return next;
    });
  }, []);

  const toggleAllSelectable = useCallback((checked: boolean) => {
    setSelectedIds(checked ? new Set(selectableItems.map((item) => item.it_id)) : new Set());
  }, [selectableItems]);

  const removeFromWishlist = useCallback(async (it_id: string, wi_id: string) => {
    if (!confirm("위시리스트에서 삭제하시겠습니까?")) return;
    setProcessingIds((prev) => new Set(prev).add(wi_id));
    try {
      await removeWishlistItem(it_id);
      setItems((prev) => prev.filter((item) => item.wi_id !== wi_id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(it_id);
        return next;
      });
    } catch {
      toastError("삭제에 실패했습니다.");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(wi_id);
        return next;
      });
    }
  }, []);

  const addToCart = useCallback(async (it_id: string) => {
    setProcessingIds((prev) => new Set(prev).add(it_id));
    try {
      await addCartItem(it_id);
      notifyCartChanged();
      toastSuccess("장바구니에 추가되었습니다.", {
        action: (
          <ToastAction
            altText="장바구니 페이지로 이동"
            onClick={() => runtimeRouterPush(router, g5ShortHref("/shop/cart"))}
          >
            바로가기
          </ToastAction>
        ),
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "장바구니 추가에 실패했습니다.";
      toastError(message);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(it_id);
        return next;
      });
    }
  }, [router]);

  const addSelectedToCart = useCallback(async () => {
    if (selectedItems.length === 0) {
      toastError("상품을 하나 이상 선택해 주세요.");
      return;
    }

    const selectedItemIds = selectedItems.map((item) => item.it_id);
    setBulkProcessing(true);
    setProcessingIds((prev) => new Set([...prev, ...selectedItemIds]));
    try {
      for (const item of selectedItems) {
        await addCartItem(item.it_id);
      }
      notifyCartChanged();
      setSelectedIds(new Set());
      toastSuccess(`${selectedItems.length.toLocaleString()}개 상품을 장바구니에 담았습니다.`, {
        action: (
          <ToastAction
            altText="장바구니 페이지로 이동"
            onClick={() => runtimeRouterPush(router, g5ShortHref("/shop/cart"))}
          >
            바로가기
          </ToastAction>
        ),
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "선택 상품을 장바구니에 담지 못했습니다.";
      toastError(message);
    } finally {
      setBulkProcessing(false);
      setProcessingIds((prev) => {
        const next = new Set(prev);
        selectedItemIds.forEach((itId) => next.delete(itId));
        return next;
      });
    }
  }, [router, selectedItems]);

  const orderSelected = useCallback(async () => {
    if (selectedItems.length === 0) {
      toastError("상품을 하나 이상 선택해 주세요.");
      return;
    }

    const selectedItemIds = selectedItems.map((item) => item.it_id);
    setBulkProcessing(true);
    setProcessingIds((prev) => new Set([...prev, ...selectedItemIds]));
    try {
      const directCartIds: string[] = [];
      for (const [index, item] of selectedItems.entries()) {
        const response = await addCartItemDirect(item.it_id, 1, "", {
          replaceDirect: index === 0,
        });
        directCartIds.push(...cartIdsFromAddResponse(response));
      }
      notifyCartChanged();

      const uniqueCartIds = Array.from(new Set(directCartIds));
      const orderHref = uniqueCartIds.length > 0
        ? `/shop/order?ct_ids=${encodeURIComponent(uniqueCartIds.join(","))}`
        : "/shop/order";
      runtimeRouterPush(router, orderHref);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "선택 상품 주문을 시작하지 못했습니다.";
      toastError(message);
    } finally {
      setBulkProcessing(false);
      setProcessingIds((prev) => {
        const next = new Set(prev);
        selectedItemIds.forEach((itId) => next.delete(itId));
        return next;
      });
    }
  }, [router, selectedItems]);

  if (!isInitialized || !user || loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton mb-6 h-8 w-40 rounded" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton aspect-square rounded-lg" />
              <div className="skeleton mt-2 h-4 w-3/4 rounded" />
              <div className="skeleton mt-1 h-4 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Heart className="mb-4 h-16 w-16 text-muted-foreground/50" />
        <h1 className="text-xl font-bold">위시리스트가 비어있습니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          마음에 드는 상품을 추가해보세요
        </p>
        <Button className="mt-6" asChild>
          <Link href="/shop/products">상품 둘러보기</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">
        위시리스트 ({items.length})
      </h1>

      <div className="mb-5 flex flex-col gap-3 rounded-[4px] border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelectableSelected}
            disabled={selectableItems.length === 0 || bulkProcessing}
            onChange={(event) => toggleAllSelectable(event.currentTarget.checked)}
            aria-label="선택 가능한 상품 전체 선택"
          />
          <div className="text-sm">
            <p className="font-semibold">선택 상품</p>
            <p className="text-xs text-muted-foreground">
              {selectedItems.length.toLocaleString()}개 선택 / {selectableItems.length.toLocaleString()}개 가능
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={bulkProcessing || selectedItems.length === 0}
            onClick={addSelectedToCart}
          >
            <ShoppingCart className="mr-1 h-3.5 w-3.5" />
            선택 장바구니
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={bulkProcessing || selectedItems.length === 0}
            onClick={orderSelected}
          >
            <CreditCard className="mr-1 h-3.5 w-3.5" />
            선택 주문
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const telInquiry = isTelInquiry(item);
          const isSoldout = String(item.it_soldout ?? "0") === "1";
          const isUnavailable = String(item.it_use ?? "1") !== "1";
          const optionCount = Number(item.option_count ?? 0);
          const productHref = shopProductHref(item, productRewriteMode);
          const cartBlockReason =
            item.cart_block_reason ||
            (isUnavailable
              ? "판매중지"
              : isSoldout
                ? "품절"
                : telInquiry
                  ? "전화문의"
                  : optionCount > 0
                    ? "옵션 선택 필요"
                    : "");
          const canAddCart = item.can_add_cart ?? cartBlockReason === "";
          const selectable = canSelectWishlistItem(item);
          const selected = selectedIds.has(item.it_id);
          const hasDiscount =
            !telInquiry &&
            item.it_cust_price > 0 &&
            item.it_cust_price > item.it_basic_price;

          return (
            <div key={item.wi_id} className="group relative">
              {selectable && (
                <div className="absolute left-2 top-2 z-10 rounded-[4px] bg-background/90 p-1 shadow-sm">
                  <Checkbox
                    checked={selected}
                    disabled={bulkProcessing || processingIds.has(item.it_id)}
                    onChange={(event) => toggleSelected(item.it_id, event.currentTarget.checked)}
                    aria-label={`${item.it_name} 선택`}
                  />
                </div>
              )}
              <a href={productHref}>
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.it_name}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                    />
                  ) : (
                    <ProductImageFallback compact />
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  <h3 className="line-clamp-2 text-sm font-medium group-hover:text-primary">
                    {item.it_name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">
                      {formatProductPrice(item, item.it_basic_price)}
                    </span>
                    {hasDiscount && (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatPrice(item.it_cust_price)}
                      </span>
                    )}
                  </div>
                  {cartBlockReason && (
                    <p className="text-xs text-muted-foreground" data-shop-wishlist-cart-block="1">
                      {cartBlockReason}
                    </p>
                  )}
                </div>
              </a>

              <div className="mt-2 flex gap-2">
                {optionCount > 0 && !isUnavailable && !isSoldout && !telInquiry ? (
                  <Button size="sm" className="flex-1" asChild>
                    <a href={productHref}>
                      <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                      옵션선택
                    </a>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={processingIds.has(item.it_id) || !canAddCart}
                    onClick={() => addToCart(item.it_id)}
                  >
                    <ShoppingCart className="mr-1 h-3.5 w-3.5" />
                    {cartBlockReason || "담기"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={processingIds.has(item.wi_id)}
                  onClick={() => removeFromWishlist(item.it_id, item.wi_id)}
                  aria-label={`${item.it_name} 위시리스트에서 삭제`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
