"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { G5Link as Link } from "@/components/ui/g5-link";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import type { ShopProduct } from "@/lib/api";
import { normalizeG5ImageSrc, shouldBypassImageOptimization } from "@/lib/image";
import { toastError } from "@/lib/toast";
import { getShopProductResult } from "@/services/shop";
import { ProductOptionPicker } from "./ProductOptionPicker";
import { isProductDetailSoldOut, productShippingPayment } from "./productDetailHelpers";
import { useProductOptions } from "./useProductOptions";
import { addProductToCart, toastAddedToCart } from "./addProductToCart";
import {
  formatProductPrice,
  hasProductDiscount,
  isTelInquiry,
  productDiscountPercent,
} from "@/lib/shop-product-state";
import { formatPrice } from "@/lib/utils";

interface ProductQuickAddDialogProps {
  /** 카드가 가진 목록 행 — 옵션은 없다. 창이 열리면 상세를 받아 옵션을 채운다. */
  product: ShopProduct;
  href: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; product: ShopProduct }
  | { status: "error"; message: string };

/**
 * 상품 카드의 옵션 고르기 창(영카트 목록의 cart-layer 와 같은 자리).
 * 옵션 · 수량 · 합계는 상품 상세의 구매 상자와 같은 ProductOptionPicker · useProductOptions 를 쓴다.
 * 폰에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 대화상자.
 * 테마가 모양을 입힐 수 있게 덩어리마다 product-quick-add-* 손잡이를 단다(기본 테마: theme.shop.quick-add.css).
 */
export function ProductQuickAddDialog({ product, href, open, onOpenChange }: ProductQuickAddDialogProps) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [adding, setAdding] = useState(false);
  const [ctSendCostSelection, setCtSendCostSelection] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getShopProductResult(product.it_id)
      .then((result) => {
        if (cancelled) return;
        setLoad(
          result.ok
            ? { status: "ready", product: result.data }
            : { status: "error", message: result.error || "상품 정보를 불러오지 못했습니다." }
        );
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error", message: "상품 정보를 불러오지 못했습니다." });
      });
    return () => {
      cancelled = true;
    };
  }, [product.it_id]);

  const detail = load.status === "ready" ? load.product : null;
  const priced = detail ?? product;
  const discounted = hasProductDiscount(priced);
  const options = useProductOptions({ product: detail, resetKey: product.it_id });
  const shippingPayment = productShippingPayment(detail, ctSendCostSelection);
  const unavailableReason = !detail
    ? ""
    : isTelInquiry(detail)
      ? "전화문의 상품은 온라인 주문할 수 없습니다."
      : isProductDetailSoldOut(detail)
        ? "품절된 상품입니다."
        : "";

  const handleSubmit = async () => {
    if (!detail || unavailableReason || adding) return;
    const cartOptions = options.buildSelectedCartOptions();
    if (options.optionSubjects.length > 0 && !cartOptions.some((option) => option.ioType === 0)) {
      toastError("옵션을 선택해주세요.");
      return;
    }
    if (!options.validateBuyQtyBeforeSubmit(cartOptions)) return;

    setAdding(true);
    try {
      await addProductToCart({
        product: detail,
        quantity: options.quantity,
        cartOptions,
        hasOptionSubjects: options.optionSubjects.length > 0,
        ctSendCost: shippingPayment.ctSendCost,
      });
      onOpenChange(false);
      toastAddedToCart(router);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "장바구니 추가에 실패했습니다.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        // 열리자마자 닫기(X)에 초점이 가 초점 테두리가 그려지던 것 — 창 자체에 초점을 두고, 키보드는 Tab 으로 옵션부터 간다.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        className="product-quick-add-dialog flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none"
      >
        <DialogHeader className="product-quick-add-head flex-row items-center gap-3 border-b p-4 pr-12 text-left">
          <QuickAddThumb product={product} />
          <div className="min-w-0 space-y-0.5">
            {product.ca_name ? (
              <p className="product-quick-add-kicker truncate text-xs text-muted-foreground">{product.ca_name}</p>
            ) : null}
            <DialogTitle className="product-quick-add-name line-clamp-2 text-[15px] leading-snug">{product.it_name}</DialogTitle>
            <DialogDescription className="product-quick-add-price flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-foreground">
              <span className="product-quick-add-price-now">{formatProductPrice(priced)}</span>
              {discounted ? (
                <>
                  <s className="product-quick-add-price-was text-xs font-normal text-muted-foreground">
                    {formatPrice(priced.it_cust_price)}
                  </s>
                  <span className="product-quick-add-discount text-xs">{productDiscountPercent(priced)}%</span>
                </>
              ) : null}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="product-quick-add-body min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {load.status === "loading" ? (
            <div className="space-y-3" aria-label="옵션을 불러오는 중">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : load.status === "error" ? (
            <p className="text-sm text-destructive" role="alert">{load.message}</p>
          ) : unavailableReason ? (
            <p className="text-sm text-muted-foreground" role="alert">{unavailableReason}</p>
          ) : (
            <>
              <ProductOptionPicker
                productName={product.it_name}
                optionSubjects={options.optionSubjects}
                optionSelections={options.optionSelections}
                onSelectOptionValue={options.selectOptionValue}
                getAvailableValues={options.getAvailableValues}
                supplyGroups={options.supplyGroups}
                onSelectSupplyOption={options.selectSupplyOption}
                quantity={options.quantity}
                onQuantityChange={options.setQuantity}
                quantityMinQty={options.quantityMinQty}
                minBuyQty={options.minBuyQty}
                maxBuyQty={options.maxBuyQty}
                selectedCartOptions={options.selectedCartOptions}
                onUpdateSelectedOptionQty={options.updateSelectedOptionQty}
                onRemoveSelectedOption={options.removeSelectedOption}
                displayTotal={options.displayTotal}
              />
              {shippingPayment.selectable ? (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{shippingPayment.label}</span>
                  <select
                    value={ctSendCostSelection}
                    onChange={(event) => setCtSendCostSelection(Number(event.target.value))}
                    className="h-9 min-w-[140px] rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={0}>주문시 결제</option>
                    <option value={1}>수령후 지불</option>
                  </select>
                </label>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="product-quick-add-foot flex-row gap-2 border-t p-4 sm:justify-stretch">
          <Button variant="outline" className="product-quick-add-detail flex-1" asChild>
            <Link href={href}>상세보기</Link>
          </Button>
          <Button
            className="product-quick-add-submit flex-[2] gap-1.5"
            onClick={handleSubmit}
            disabled={!detail || Boolean(unavailableReason) || adding}
            aria-busy={adding || undefined}
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShoppingCart className="h-4 w-4" aria-hidden="true" />}
            장바구니 담기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddThumb({ product }: { product: ShopProduct }) {
  const image = normalizeG5ImageSrc(product.image_url);
  return (
    <span className="product-quick-add-thumb relative block h-14 w-14 flex-none overflow-hidden rounded-md border bg-muted">
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          sizes="56px"
          className="object-cover"
          unoptimized={shouldBypassImageOptimization(image)}
        />
      ) : (
        <ProductImageFallback compact />
      )}
    </span>
  );
}
