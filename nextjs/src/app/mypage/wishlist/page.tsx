"use client";

import { useEffect, useState, useCallback } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ShopWishItem } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { formatPrice } from "@/lib/utils";
import { isTelInquiry } from "@/lib/shop-product-state";
import { Button } from "@/components/ui/button";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { ToastAction } from "@/components/ui/toast";
import { Heart, ShoppingCart, Trash2 } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/toast";
import { addCartItem, getWishlist, removeWishlistItem } from "@/services/cart";
import { g5ShortHref } from "@/lib/g5-short-url";
import { shopProductHref } from "@/lib/product-url";
import { notifyCartChanged } from "@/lib/cart-events";
import { getClientPublicSettings } from "@/services/settings";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { MypagePanel } from "../MypagePanel";

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

function canAddWishlistItemToCart(item: ShopWishItem) {
  return (item.can_add_cart ?? wishlistCartBlockReason(item) === "") && wishlistCartBlockReason(item) === "";
}

export default function MyWishlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<ShopWishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
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
    const loadWishlist = async () => {
      try {
        setItems(await getWishlist());
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    loadWishlist();
  }, []);

  const removeFromWishlist = useCallback(
    async (it_id: string, wi_id: string) => {
      if (!confirm("위시리스트에서 삭제하시겠습니까?")) return;
      setProcessingIds((prev) => new Set(prev).add(wi_id));
      try {
        await removeWishlistItem(it_id);
        setItems((prev) => prev.filter((item) => item.wi_id !== wi_id));
      } catch {
        toastError("삭제에 실패했습니다.");
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(wi_id);
          return next;
        });
      }
    },
    []
  );

  const addToCart = useCallback(async (item: ShopWishItem) => {
    const blockReason = wishlistCartBlockReason(item);
    if (!canAddWishlistItemToCart(item)) {
      toastError(blockReason || "장바구니에 담을 수 없는 상품입니다.");
      return;
    }

    setProcessingIds((prev) => new Set(prev).add(item.it_id));
    try {
      await addCartItem(item.it_id);
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
        next.delete(item.it_id);
        return next;
      });
    }
  }, [router]);

  if (loading) {
    return (
      <MypagePanel title="위시리스트">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton aspect-square rounded-lg" />
              <div className="skeleton mt-2 h-4 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </MypagePanel>
    );
  }

  if (items.length === 0) {
    return (
      <MypagePanel title="위시리스트">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart className="mb-4 h-14 w-14 text-muted-foreground/50" />
          <p className="text-lg font-medium">위시리스트가 비어있습니다</p>
          <p className="mt-1 text-sm text-muted-foreground">마음에 드는 상품을 추가해보세요</p>
          <Button className="mt-6" asChild>
            <Link href="/shop/products">상품 둘러보기</Link>
          </Button>
        </div>
      </MypagePanel>
    );
  }

  return (
    <MypagePanel title={`위시리스트 (${items.length})`}>

      <div className="wishlist-grid grid grid-cols-2 gap-4 md:grid-cols-3">
        {items.map((item) => {
          const hasDiscount =
            item.it_cust_price > 0 && item.it_cust_price > item.it_basic_price;
          const cartBlockReason = wishlistCartBlockReason(item);
          const canAddCart = canAddWishlistItemToCart(item);
          return (
            <div key={item.wi_id} className="wishlist-card group relative">
              <a className="wishlist-link" href={shopProductHref(item, productRewriteMode)}>
                <div className="wishlist-thumb relative aspect-square overflow-hidden rounded-lg bg-muted">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.it_name}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, 33vw"
                    />
                  ) : (
                    <ProductImageFallback compact />
                  )}
                </div>
                <div className="wishlist-info mt-2 space-y-1">
                  <h3 className="line-clamp-2 text-sm font-medium group-hover:text-primary">
                    {item.it_name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">
                      {formatPrice(item.it_basic_price)}
                    </span>
                    {hasDiscount && (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatPrice(item.it_cust_price)}
                      </span>
                    )}
                  </div>
                  {cartBlockReason && (
                    <p className="text-xs text-muted-foreground">
                      {cartBlockReason}
                    </p>
                  )}
                </div>
              </a>

              <div className="wishlist-actions mt-2 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={processingIds.has(item.it_id) || !canAddCart}
                  onClick={() => addToCart(item)}
                >
                  <ShoppingCart className="mr-1 h-3.5 w-3.5" />
                  담기
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={processingIds.has(item.wi_id)}
                  onClick={() => removeFromWishlist(item.it_id, item.wi_id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </MypagePanel>
  );
}
