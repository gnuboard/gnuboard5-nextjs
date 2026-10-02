"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { ShopProduct } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { isTelInquiry, isProductSoldOut } from "@/lib/shop-product-state";
import { cn } from "@/lib/utils";
import { addProductToCart, toastAddedToCart } from "./addProductToCart";

// 옵션 고르기 창은 누를 때만 받는다 — 상품 줄마다 옵션 UI 를 미리 싣지 않는다.
const ProductQuickAddDialog = dynamic(
  () => import("./ProductQuickAddDialog").then((mod) => mod.ProductQuickAddDialog),
  { ssr: false }
);

/**
 * 카드에서 바로 담을 수 없는 상품 — 옵션 고르기 창을 연다.
 * 선택옵션이 있거나(장바구니 API 가 옵션 없이 받지 않는다), 배송비 결제 방법을 손님이 고르는 상품.
 * 목록 응답에 has_options 가 없으면(오래된 API · 정적 픽스처) 모르는 것이므로 창을 연다 — 창은 옵션 없는 상품도 담는다.
 */
function needsChoice(product: ShopProduct): boolean {
  if (product.has_options !== false) return true;
  return Number(product.it_sc_type ?? 0) > 1 && Number(product.it_sc_method ?? 0) === 2;
}

interface ProductQuickAddProps {
  product: ShopProduct;
  /** 상품 상세 주소 — 전화문의 상품의 "문의", 창의 "상세보기"가 쓴다 */
  href: string;
  /** 테마가 단추 모양을 정한다(예: 기본 테마 ondam-card-add) */
  className?: string;
}

/**
 * 상품 카드의 "담기". 옵션 없는 상품은 그 자리에서 담고, 옵션이 필요한 상품은 옵션 고르기 창을 연다.
 * 품절은 누를 수 없는 "품절", 전화문의는 상세로 가는 "문의"가 된다.
 */
export function ProductQuickAdd({ product, href, className }: ProductQuickAddProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isTelInquiry(product)) {
    return (
      <Link href={href} className={cn("product-quick-add is-inquiry", className)}>
        문의
      </Link>
    );
  }

  if (isProductSoldOut(product)) {
    return (
      <button type="button" className={cn("product-quick-add is-soldout", className)} disabled>
        품절
      </button>
    );
  }

  const addDirectly = async () => {
    setAdding(true);
    try {
      await addProductToCart({
        product,
        quantity: Math.max(1, Number(product.it_buy_min_qty ?? 0)),
        cartOptions: [],
        hasOptionSubjects: false,
      });
      toastAddedToCart(router);
    } catch (error) {
      const message = error instanceof Error ? error.message : "장바구니 추가에 실패했습니다.";
      // 목록을 받은 뒤 관리자가 옵션을 붙였다면 서버가 옵션을 요구한다 — 그때는 창으로 넘긴다.
      if (message.includes("옵션")) {
        setDialogOpen(true);
      } else {
        toastError(message);
      }
    } finally {
      setAdding(false);
    }
  };

  const handleClick = () => {
    if (adding) return;
    if (needsChoice(product)) {
      setDialogOpen(true);
      return;
    }
    void addDirectly();
  };

  return (
    <>
      <button
        type="button"
        className={cn("product-quick-add inline-flex items-center justify-center gap-1", className)}
        onClick={handleClick}
        aria-busy={adding || undefined}
        aria-haspopup={needsChoice(product) ? "dialog" : undefined}
        aria-label={`${product.it_name} 장바구니에 담기`}
      >
        {adding ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
        담기
      </button>
      {dialogOpen ? (
        <ProductQuickAddDialog product={product} href={href} open={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
    </>
  );
}
