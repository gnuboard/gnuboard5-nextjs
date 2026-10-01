"use client";

import { useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import { ShoppingCartIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCartStore } from "@/store/cart";
import { formatPrice, formatCartOption } from "@/lib/utils";
import { shouldBypassImageOptimization } from "@/lib/image";

/**
 * 헤더 카트 아이콘 — click/keyboard/touch 로 미니 카트 popover를 연다.
 */
export function CartMiniPopover() {
  const { items, totalQty, totalPrice, fetchError, fetchCart } = useCartStore();
  const [open, setOpen] = useState(false);

  // 비회원 카트도 쿠키 기반으로 동작하므로 초기 진입과 cart 변경 때 동기화한다.
  // 붙는 순간에는 "지금 상태"만 필요하다 — 화면 이동으로 두 번 붙어도 요청은 한 번만 나간다.
  useEffect(() => {
    void fetchCart({ dedupe: true });
  }, [fetchCart]);

  useEffect(() => {
    const handleCartChanged = () => {
      fetchCart();
    };
    window.addEventListener("cart:changed", handleCartChanged);
    return () => window.removeEventListener("cart:changed", handleCartChanged);
  }, [fetchCart]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`장바구니${totalQty > 0 ? `, 상품 ${totalQty}개` : ""}`}
        >
          <ShoppingCartIcon className="size-4" />
          {totalQty > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 size-5 items-center justify-center rounded-full p-0 text-[10px]"
            >
              {totalQty > 99 ? "99+" : totalQty}
            </Badge>
          )}
          <span className="sr-only">장바구니</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 rounded-lg p-3"
        aria-label="장바구니 미리보기"
      >
          <div className="mb-2 flex items-center justify-between border-b pb-2 text-sm font-medium">
            <span>장바구니 ({totalQty})</span>
            <Link
              href="/shop/cart"
              className="text-xs text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              전체 보기 →
            </Link>
          </div>

          {fetchError ? (
            <p role="status" className="rounded-[4px] bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
              {fetchError}
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-[4px] bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
              장바구니가 비어 있습니다.
            </p>
          ) : (
            <>
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {items.slice(0, 5).map((it) => (
                  <li key={it.ct_id} className="flex items-center gap-2">
                    {it.image_url ? (
                      <Image
                        src={it.image_url}
                        alt={it.it_name}
                        width={40}
                        height={40}
                        className="h-10 w-10 flex-shrink-0 rounded object-cover"
                        unoptimized={shouldBypassImageOptimization(it.image_url)}
                      />
                    ) : (
                      <div className="h-10 w-10 flex-shrink-0 rounded bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{it.it_name}</p>
                      {it.ct_option && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {formatCartOption(it.ct_option)}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {it.ct_qty}개 · {formatPrice(it.line_total ?? it.ct_price * it.ct_qty)}
                      </p>
                    </div>
                  </li>
                ))}
                {items.length > 5 && (
                  <li className="text-center text-[10px] text-muted-foreground">
                    외 {items.length - 5}개 상품 더
                  </li>
                )}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t pt-2">
                <span className="text-xs text-muted-foreground">상품 합계</span>
                <span className="text-sm font-bold text-primary">
                  {formatPrice(totalPrice)}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <Button asChild className="flex-1" size="sm">
                  <Link href="/shop/cart" onClick={() => setOpen(false)}>
                    장바구니
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1" size="sm">
                  <Link href="/shop/order" onClick={() => setOpen(false)}>
                    주문하기
                  </Link>
                </Button>
              </div>
            </>
          )}
          {(fetchError || items.length === 0) && (
            <div className="mt-2 flex gap-2">
              <Button asChild className="flex-1" size="sm">
                <Link href="/shop/cart" onClick={() => setOpen(false)}>
                  장바구니 보기
                </Link>
              </Button>
              {fetchError && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  size="sm"
                  onClick={() => {
                    void fetchCart();
                  }}
                >
                  다시 시도
                </Button>
              )}
            </div>
          )}
      </PopoverContent>
    </Popover>
  );
}
