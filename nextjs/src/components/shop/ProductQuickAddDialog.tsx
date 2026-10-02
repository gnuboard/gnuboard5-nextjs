"use client";

import { useEffect, useState } from "react";
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
import { formatPrice } from "@/lib/utils";
import { getShopProductResult } from "@/services/shop";
import { ProductOptionPicker } from "./ProductOptionPicker";
import { productShippingPayment } from "./productDetailHelpers";
import { useProductOptions } from "./useProductOptions";
import { addProductToCart, toastAddedToCart } from "./addProductToCart";
import { isTelInquiry, isProductSoldOut } from "@/lib/shop-product-state";

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
 */
export function ProductQuickAddDialog({ product, href, open, onOpenChange }: ProductQuickAddDialogProps) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [adding, setAdding] = useState(false);
  const [ctSendCostSelection, setCtSendCostSelection] = useState(0);

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
  const options = useProductOptions({ product: detail, resetKey: product.it_id });
  const shippingPayment = productShippingPayment(detail, ctSendCostSelection);
  const unavailableReason = !detail
    ? ""
    : isTelInquiry(detail)
      ? "전화문의 상품은 온라인 주문할 수 없습니다."
      : isProductSoldOut({ ...detail, has_options: options.baseOptions.length > 0 })
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
        className="product-quick-add-dialog flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none"
      >
        <DialogHeader className="flex-row items-center gap-3 border-b p-4 pr-12 text-left">
          <QuickAddThumb product={product} />
          <div className="min-w-0 space-y-0.5">
            <DialogTitle className="line-clamp-2 text-[15px] leading-snug">{product.it_name}</DialogTitle>
            <DialogDescription className="text-sm font-bold text-foreground">
              {formatPrice(detail?.it_price ?? product.it_price)}
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
                optionSubjects={options.optionSubjects}
                optionSelections={options.optionSelections}
                onOptionSelectionsChange={options.setOptionSelections}
                getAvailableValues={options.getAvailableValues}
                supplyOptions={options.supplyOptions}
                supplyLabel={options.supplyLabel}
                supplySelection={options.supplySelection}
                onSupplySelectionChange={options.setSupplySelection}
                onAddSupplyOption={options.handleAddSupplyOption}
                quantity={options.quantity}
                onQuantityChange={options.setQuantity}
                quantityMinQty={options.quantityMinQty}
                minBuyQty={options.minBuyQty}
                maxBuyQty={options.maxBuyQty}
                selectedOption={options.selectedOption}
                selectedCartOptions={options.selectedCartOptions}
                onAddSelectedOption={options.handleAddSelectedOption}
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

        <DialogFooter className="flex-row gap-2 border-t p-4 sm:justify-stretch">
          <Button variant="outline" className="flex-1" asChild>
            <Link href={href}>상세보기</Link>
          </Button>
          <Button
            className="flex-[2] gap-1.5"
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
    <span className="relative block h-14 w-14 flex-none overflow-hidden rounded-md border bg-muted">
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
