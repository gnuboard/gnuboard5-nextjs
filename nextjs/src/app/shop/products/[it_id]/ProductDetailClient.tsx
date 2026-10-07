"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ShopProduct, ShopReview, ShopReviewSummary, ShopQA } from "@/lib/api";
import type { ShopNaverPayOrderOption } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import {
  currentPathForRuntime,
  currentPathHasTrailingSlashForRuntime,
  g5PathForRuntime,
} from "@/lib/config";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { addProductToCart, toastAddedToCart } from "@/components/shop/addProductToCart";
import type { BbsRewriteMode } from "@/lib/board-url";
import { isBbsSeoRewrite } from "@/lib/board-url";
import { useRuntimeRouteParam, useRuntimeRouteReady } from "@/hooks/use-runtime-route-param";
import { STATIC_PRODUCT_SENTINELS } from "./static-fallback";
import { useRecentProductsStore } from "@/store/recent-products";
import {
  addCartItemDirect,
  addCartItems,
  addWishlistItem,
} from "@/services/cart";
import { gaViewItem } from "@/lib/analytics";
import {
  getShopProductResult,
  getShopProductBySeoResult,
  getShopShippingFreeThreshold,
  getShopProductReviewSummary,
  getShopProductQaPage,
  getShopProductReviews,
  getShopProductReviewPage,
  registerShopNaverPayOrder,
  registerShopNaverPayWish,
} from "@/services/shop";
import { getClientPublicSettings } from "@/services/settings";
import {
  cartIdsFromAddResponse,
  productShippingPayment,
  productDetailTabFromSearch,
  reviewFocusIdFromSearch,
  qaFocusIdFromSearch,
  productDetailFormFromSearch,
  isLegacyShortProductPath,
} from "@/components/shop/productDetailHelpers";
import { ProductDetailView } from "./ProductDetailView";
import { useProductDetailMetadata } from "./useProductDetailMetadata";
import { useProductMemberActions } from "./useProductMemberActions";
import { useShopProductPageConfig } from "./useShopProductPageConfig";
import { scrollToProductDetailTabs, useProductDetailFocusScroll } from "./useProductDetailFocusScroll";
import { useProductOptions } from "@/components/shop/useProductOptions";
import { isTelInquiry } from "@/lib/shop-product-state";

interface ProductDetailClientProps {
  itId?: string;
  initialProduct?: ShopProduct | null;
  isStaticFallbackShell?: boolean;
}

export default function ProductDetailClient({
  itId,
  initialProduct,
  isStaticFallbackShell = false,
}: ProductDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const productQueryString = searchParams.toString();
  const it_id = useRuntimeRouteParam("it_id", ["/shop/products/:it_id", "/shop/:it_id"], itId, {
    sentinelValues: STATIC_PRODUCT_SENTINELS,
  });
  const routeReady = useRuntimeRouteReady();
  const [product, setProduct] = useState<ShopProduct | null>(
    initialProduct?.it_id === it_id ? initialProduct : null
  );
  // 맞는 상품을 미리 받은 경우가 아니면 로딩으로 시작한다. 정적 셸은 빌드 때 id 가 비어 있어서
  // 예전 식(!!it_id && …)이면 내보낸 HTML 이 "찾을 수 없습니다" 화면이 되고, 하이드레이션 뒤
  // 진짜 상품으로 바뀔 때까지 그 문구가 번쩍였다. 아래 effect 가 id 가 정말 없으면 로딩을 끈다.
  const [loading, setLoading] = useState(product?.it_id !== it_id);
  const [productErrorMessage, setProductErrorMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [ctSendCostSelection, setCtSendCostSelection] = useState(0);
  const [activeTab, setActiveTab] = useState("description");
  const [reviews, setReviews] = useState<ShopReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ShopReviewSummary | null>(null);
  const [qas, setQas] = useState<ShopQA[]>([]);
  const { shippingPolicy, naverPayConfig } = useShopProductPageConfig();
  const [reviewPage, setReviewPage] = useState(1);
  // 사용후기 쪽 — 서버가 실제로 연 쪽(찾아간 후기가 있으면 그 쪽)과 마지막 쪽.
  const [reviewShownPage, setReviewShownPage] = useState(1);
  const [reviewLastPage, setReviewLastPage] = useState(1);
  // 주소의 ?is_id= — 첫 불러오기에서만 서버에 넘겨 그 후기가 있는 쪽을 연다. 쪽을 옮기면 비운다.
  const [pendingFocusIsId, setPendingFocusIsId] = useState(0);
  const [qaPage, setQaPage] = useState(1);
  // 상품문의 쪽 — 사용후기와 같다(서버가 연 쪽 · 마지막 쪽 · 주소의 ?iq_id= 를 첫 불러오기에서만).
  const [qaShownPage, setQaShownPage] = useState(1);
  const [qaLastPage, setQaLastPage] = useState(1);
  const [pendingFocusIqId, setPendingFocusIqId] = useState(0);
  const [addingToCart, setAddingToCart] = useState(false);
  const [naverPaySubmitting, setNaverPaySubmitting] = useState(false);
  const [naverPayWishSubmitting, setNaverPayWishSubmitting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  const addRecentProduct = useRecentProductsStore((s) => s.addProduct);
  const trackedViewItemIdRef = useRef<string | null>(null);
  const {
    quantity,
    setQuantity,
    optionSelections,
    selectOptionValue,
    selectSupplyOption,
    supplyGroups,
    selectedCartOptions,
    clearSelectedOptions,
    optionSubjects,
    minBuyQty,
    maxBuyQty,
    quantityMinQty,
    getAvailableValues,
    updateSelectedOptionQty,
    removeSelectedOption,
    buildSelectedCartOptions,
    validateBuyQtyBeforeSubmit,
    displayTotal,
  } = useProductOptions({ product, resetKey: it_id });
  const {
    user,
    isAuthInitialized,
    requireLogin,
    handleMemberActionError,
    restockAlerted,
    handleRemoveRestockAlert,
    restockDialogOpen,
    setRestockDialogOpen,
    restockHp,
    setRestockHp,
    restockAgree,
    setRestockAgree,
    restockSubmitting,
    openRestockDialog,
    submitRestockAlert,
    recommendDialogOpen,
    setRecommendDialogOpen,
    recommendToEmail,
    setRecommendToEmail,
    recommendSubject,
    setRecommendSubject,
    recommendContent,
    setRecommendContent,
    recommendSubmitting,
    openRecommendDialog,
    submitRecommendation,
  } = useProductMemberActions(product);
  const telInquiry = isTelInquiry(product);
  const shippingFreeThreshold = getShopShippingFreeThreshold(shippingPolicy);
  const shippingPayment = productShippingPayment(product, ctSendCostSelection);
  const legacyProductForm = productDetailFormFromSearch(productQueryString);

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
    if (!it_id) {
      // 하이드레이션 첫 렌더는 주소를 아직 못 읽어 id 가 비어 있다 — 로딩을 유지한다.
      if (!routeReady) return;
      setProduct(null);
      setProductErrorMessage("");
      setLoading(false);
      return;
    }

    if (initialProduct) {
      setProduct(initialProduct);
      setProductErrorMessage("");
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setProductErrorMessage("");
    const runtimePath = currentPathForRuntime(pathname || undefined);
    const legacyShortProductPath = isLegacyShortProductPath(runtimePath);
    const legacySeoPath =
      legacyShortProductPath && currentPathHasTrailingSlashForRuntime(pathname || undefined);
    const request = (async () => {
      if (legacySeoPath) {
        return {
          productResult: await getShopProductBySeoResult(it_id),
          resolvedBySeo: true,
        };
      }

      const productResult = await getShopProductResult(it_id);
      if (productResult.ok || !legacyShortProductPath) {
        return { productResult, resolvedBySeo: false };
      }

      const seoResult = await getShopProductBySeoResult(it_id);
      if (seoResult.ok) {
        return { productResult: seoResult, resolvedBySeo: true };
      }

      return { productResult, resolvedBySeo: false };
    })();
    const settingsRequest = legacyShortProductPath
      ? getClientPublicSettings().catch(() => null)
      : Promise.resolve(null);

    Promise.all([request, settingsRequest])
      .then(([lookup, settings]) => {
        if (!alive) return;
        const { productResult, resolvedBySeo } = lookup;
        const nextRewriteMode = settings?.cf_bbs_rewrite ?? 0;
        if (settings) setProductRewriteMode(nextRewriteMode);
        if (!productResult.ok) {
          setProduct(null);
          setProductErrorMessage(productResult.error || "상품을 찾을 수 없습니다");
          return;
        }
        const nextProduct = productResult.data;
        if (resolvedBySeo && nextProduct?.it_id && !isBbsSeoRewrite(nextRewriteMode)) {
          window.location.replace(g5PathForRuntime(`/shop/${nextProduct.it_id}`));
          return;
        }
        setProduct(nextProduct);
        setProductErrorMessage("");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setProduct(null);
        setProductErrorMessage(err instanceof Error ? err.message : "상품을 불러오지 못했습니다");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [initialProduct, it_id, pathname, routeReady]);

  useEffect(() => {
    setSelectedImage(0);
    setCtSendCostSelection(0);
    setReviews([]);
    setReviewSummary(null);
    setQas([]);
    setReviewPage(1);
    setPendingFocusIsId(reviewFocusIdFromSearch(productQueryString));
    setPendingFocusIqId(qaFocusIdFromSearch(productQueryString));
    setQaPage(1);
    setActiveTab(productDetailTabFromSearch(productQueryString));
  }, [it_id, productQueryString]);


  useEffect(() => {
    const nextTab = productDetailTabFromSearch(productQueryString);
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }, [productQueryString]);

  useProductDetailFocusScroll(product?.it_id, productQueryString);

  useEffect(() => {
    if (!product?.it_id) return;

    const params = new URLSearchParams(productQueryString);
    const modal = (params.get("modal") ?? params.get("action") ?? "").toLowerCase();
    if (modal === "recommend") {
      if (isAuthInitialized) {
        openRecommendDialog();
      }
      return;
    }
    if (modal === "restock" || modal === "stock" || modal === "stocksms") {
      openRestockDialog();
    }
  }, [
    isAuthInitialized,
    openRecommendDialog,
    openRestockDialog,
    product?.it_id,
    productQueryString,
  ]);

  useProductDetailMetadata(product, productRewriteMode);

  useEffect(() => {
    if (!product) return;
    addRecentProduct({
      it_id: product.it_id,
      it_name: product.it_name,
      it_seo_title: product.it_seo_title,
      it_price: product.it_price,
      it_tel_inq: product.it_tel_inq,
      image_url: product.image_url,
      viewed_at: Date.now(),
    });
    // GA4 view_item — 상품 페이지 진입 시 1회 (mount).
    if (trackedViewItemIdRef.current !== product.it_id) {
      trackedViewItemIdRef.current = product.it_id;
      gaViewItem({
        item_id: product.it_id,
        item_name: product.it_name,
        item_category: product.ca_name,
        item_brand: product.it_brand,
        price: product.it_price,
      });
    }
  }, [product, addRecentProduct]);

  useEffect(() => {
    if (activeTab === "reviews" && it_id) {
      Promise.all([
        getShopProductReviewPage(it_id, reviewPage, pendingFocusIsId || undefined).catch(() => null),
        getShopProductReviewSummary(it_id).catch(() => null),
      ]).then(([nextPage, nextSummary]) => {
        setReviews(nextPage?.items ?? []);
        setReviewShownPage(nextPage?.meta?.current_page ?? reviewPage);
        setReviewLastPage(nextPage?.meta?.last_page ?? 1);
        setReviewSummary(nextSummary);
      });
    }
  }, [activeTab, reviewPage, it_id, pendingFocusIsId]);

  /** 사용후기 쪽 옮기기 — 찾아간 후기 표시는 그만두고, 탭 머리로 올라가 새 쪽을 처음부터 보게 한다. */
  const handleReviewPageChange = useCallback((nextPage: number) => {
    setPendingFocusIsId(0);
    setReviewPage(nextPage);
    scrollToProductDetailTabs();
  }, []);

  const applyQaPage = useCallback((result: { items: ShopQA[]; meta?: { current_page?: number; last_page?: number } } | null, fallbackPage: number) => {
    setQas(result?.items ?? []);
    setQaShownPage(result?.meta?.current_page ?? fallbackPage);
    setQaLastPage(result?.meta?.last_page ?? 1);
  }, []);

  useEffect(() => {
    if (activeTab === "qa" && it_id) {
      getShopProductQaPage(it_id, qaPage, pendingFocusIqId || undefined)
        .then((result) => applyQaPage(result, qaPage))
        .catch(() => applyQaPage(null, qaPage));
    }
  }, [activeTab, qaPage, it_id, pendingFocusIqId, applyQaPage]);

  // 문의를 쓰거나 고치면 지금 보는 쪽을 다시 읽는다.
  const reloadQas = useCallback(() => {
    if (!it_id) return;
    getShopProductQaPage(it_id, qaShownPage)
      .then((result) => applyQaPage(result, qaShownPage))
      .catch(() => applyQaPage(null, qaShownPage));
  }, [it_id, qaShownPage, applyQaPage]);

  /** 상품문의 쪽 옮기기 — 사용후기와 같이 찾아간 문의 표시는 그만두고 탭 머리로 올라간다. */
  const handleQaPageChange = useCallback((nextPage: number) => {
    setPendingFocusIqId(0);
    setQaPage(nextPage);
    scrollToProductDetailTabs();
  }, []);

  const handleAddToCart = useCallback(async () => {
    if (!product) return;
    if (telInquiry) {
      toastError("전화문의 상품은 온라인 주문할 수 없습니다.");
      return;
    }

    const cartOptions = buildSelectedCartOptions();
    const hasBaseOption = cartOptions.some((option) => option.ioType === 0);
    if (optionSubjects.length > 0 && !hasBaseOption) {
      toastError("옵션을 선택해주세요.");
      return;
    }
    if (!validateBuyQtyBeforeSubmit(cartOptions)) {
      return;
    }
    setAddingToCart(true);
    try {
      await addProductToCart({
        product,
        quantity,
        cartOptions,
        hasOptionSubjects: optionSubjects.length > 0,
        ctSendCost: shippingPayment.ctSendCost,
      });
      if (cartOptions.length > 0) {
        clearSelectedOptions();
      }
      toastAddedToCart(router);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "장바구니 추가에 실패했습니다.";
      toastError(message);
    } finally {
      setAddingToCart(false);
    }
  }, [
    product,
    telInquiry,
    quantity,
    buildSelectedCartOptions,
    validateBuyQtyBeforeSubmit,
    shippingPayment.ctSendCost,
    optionSubjects.length,
    clearSelectedOptions,
    router,
  ]);

  const handleBuyNow = useCallback(async () => {
    if (!product) return;
    if (telInquiry) {
      toastError("전화문의 상품은 온라인 주문할 수 없습니다.");
      return;
    }

    const cartOptions = buildSelectedCartOptions();
    const hasBaseOption = cartOptions.some((option) => option.ioType === 0);
    if (optionSubjects.length > 0 && !hasBaseOption) {
      toastError("옵션을 선택해주세요.");
      return;
    }
    if (!validateBuyQtyBeforeSubmit(cartOptions)) {
      return;
    }
    try {
      const directCartIds: string[] = [];
      if (cartOptions.length > 0) {
        let addedDirectBase = false;
        if (optionSubjects.length === 0) {
          const response = await addCartItemDirect(product.it_id, quantity, "", {
            ctSendCost: shippingPayment.ctSendCost,
          });
          directCartIds.push(...cartIdsFromAddResponse(response));
          addedDirectBase = true;
        }
        const response = await addCartItems(
          product.it_id,
          cartOptions.map((option) => ({
            io_id: option.io_id,
            ct_qty: option.qty,
          })),
          {
            direct: true,
            replaceDirect: !addedDirectBase,
            ctSendCost: shippingPayment.ctSendCost,
          }
        );
        directCartIds.push(...cartIdsFromAddResponse(response));
        clearSelectedOptions();
      } else {
        const response = await addCartItemDirect(product.it_id, quantity, "", {
          ctSendCost: shippingPayment.ctSendCost,
        });
        directCartIds.push(...cartIdsFromAddResponse(response));
      }
      const uniqueCartIds = Array.from(new Set(directCartIds));
      const orderHref = uniqueCartIds.length > 0
        ? `/shop/order?ct_ids=${encodeURIComponent(uniqueCartIds.join(","))}`
        : "/shop/order";
      runtimeRouterPush(router, orderHref);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "오류가 발생했습니다.";
      toastError(message);
    }
  }, [
    product,
    telInquiry,
    quantity,
    buildSelectedCartOptions,
    validateBuyQtyBeforeSubmit,
    shippingPayment.ctSendCost,
    optionSubjects.length,
    clearSelectedOptions,
    router,
  ]);

  const handleWishlist = useCallback(async () => {
    if (!product) return;
    if (!requireLogin()) return;

    try {
      await addWishlistItem(product.it_id);
      toastSuccess("위시리스트에 추가되었습니다.");
    } catch (err: unknown) {
      handleMemberActionError(err, "위시리스트 추가에 실패했습니다.");
    }
  }, [product, requireLogin, handleMemberActionError]);

  const buildNaverPayOptions = useCallback((): ShopNaverPayOrderOption[] => {
    if (!product) return [];

    const cartOptions = buildSelectedCartOptions();
    if (cartOptions.length === 0) {
      return [
        {
          io_id: "",
          io_type: 0,
          io_value: "",
          ct_qty: quantity,
        },
      ];
    }

    return cartOptions.map((option) => ({
      io_id: option.io_id,
      io_type: option.ioType,
      io_value: option.label,
      ct_qty: option.qty,
    }));
  }, [buildSelectedCartOptions, product, quantity]);

  const validateNaverPaySelection = useCallback(() => {
    if (!product) return false;
    if (telInquiry) {
      toastError("전화문의 상품은 네이버페이로 주문할 수 없습니다.");
      return false;
    }
    if (product.it_soldout === "1") {
      toastError("품절 상품은 네이버페이로 주문할 수 없습니다.");
      return false;
    }

    const cartOptions = buildSelectedCartOptions();
    const hasBaseOption = cartOptions.some((option) => option.ioType === 0);
    if (optionSubjects.length > 0 && !hasBaseOption) {
      toastError("옵션을 선택해주세요.");
      return false;
    }

    return validateBuyQtyBeforeSubmit(cartOptions);
  }, [
    buildSelectedCartOptions,
    telInquiry,
    optionSubjects.length,
    product,
    validateBuyQtyBeforeSubmit,
  ]);

  const handleNaverPayOrder = useCallback(async () => {
    if (!product || !naverPayConfig?.enabled || !validateNaverPaySelection()) return;

    setNaverPaySubmitting(true);
    try {
      const response = await registerShopNaverPayOrder({
        source: "item",
        it_id: product.it_id,
        quantity,
        options: buildNaverPayOptions(),
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
  }, [
    buildNaverPayOptions,
    naverPayConfig?.enabled,
    product,
    quantity,
    validateNaverPaySelection,
  ]);

  const handleNaverPayWish = useCallback(async () => {
    if (!product || !naverPayConfig?.enabled) return;

    const popup = window.open(
      "about:blank",
      "win_naverpay_wishlist",
      "scrollbars=yes,width=400,height=267"
    );
    setNaverPayWishSubmitting(true);
    try {
      const response = await registerShopNaverPayWish({ it_id: product.it_id });
      if (!response.redirect_url) {
        throw new Error("네이버페이 찜 URL이 없습니다.");
      }
      if (popup) {
        popup.location.href = response.redirect_url;
      } else {
        window.open(response.redirect_url, "_blank", "noopener,noreferrer");
      }
    } catch (err: unknown) {
      if (popup) popup.close();
      const message =
        err instanceof Error ? err.message : "네이버페이 찜 등록에 실패했습니다.";
      toastError(message);
    } finally {
      setNaverPayWishSubmitting(false);
    }
  }, [naverPayConfig?.enabled, product]);

  const handleReviewSubmitted = useCallback(() => {
    if (!product) return;
    getShopProductReviews(product.it_id, 1).then(setReviews).catch(() => undefined);
    getShopProductReviewSummary(product.it_id)
      .then(setReviewSummary)
      .catch(() => undefined);
    setReviewPage(1);
  }, [product]);

  const handleQaSubmitted = useCallback(() => {
    if (!product) return;
    // 새 문의는 맨 앞(1쪽)에 선다 — 쪽 정보까지 새로 받는다.
    getShopProductQaPage(product.it_id, 1)
      .then((result) => applyQaPage(result, 1))
      .catch(() => undefined);
    setPendingFocusIqId(0);
    setQaPage(1);
  }, [product, applyQaPage]);

  return (
    <ProductDetailView
      loading={loading}
      product={product}
      productErrorMessage={productErrorMessage}
      isStaticFallbackShell={isStaticFallbackShell}
      itId={it_id}
      selectedImage={selectedImage}
      onSelectedImageChange={setSelectedImage}
      lightboxOpen={lightboxOpen}
      onLightboxOpenChange={setLightboxOpen}
      productRewriteMode={productRewriteMode}
      isTelInquiry={telInquiry}
      shippingPayment={shippingPayment}
      ctSendCostSelection={ctSendCostSelection}
      onCtSendCostSelectionChange={setCtSendCostSelection}
      optionSubjects={optionSubjects}
      optionSelections={optionSelections}
      onSelectOptionValue={selectOptionValue}
      getAvailableValues={getAvailableValues}
      supplyGroups={supplyGroups}
      onSelectSupplyOption={selectSupplyOption}
      quantity={quantity}
      onQuantityChange={setQuantity}
      quantityMinQty={quantityMinQty}
      minBuyQty={minBuyQty}
      maxBuyQty={maxBuyQty}
      selectedCartOptions={selectedCartOptions}
      onUpdateSelectedOptionQty={updateSelectedOptionQty}
      onRemoveSelectedOption={removeSelectedOption}
      displayTotal={displayTotal}
      restockAlerted={restockAlerted}
      onRemoveRestockAlert={handleRemoveRestockAlert}
      onOpenRestockDialog={openRestockDialog}
      addingToCart={addingToCart}
      onAddToCart={handleAddToCart}
      onBuyNow={handleBuyNow}
      onWishlist={handleWishlist}
      naverPayConfig={naverPayConfig}
      naverPaySubmitting={naverPaySubmitting}
      onNaverPayOrder={handleNaverPayOrder}
      naverPayWishSubmitting={naverPayWishSubmitting}
      onNaverPayWish={handleNaverPayWish}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      canWriteReview={Boolean(user)}
      canWriteQa={Boolean(user)}
      shippingPolicy={shippingPolicy}
      legacyProductForm={legacyProductForm}
      onReviewSubmitted={handleReviewSubmitted}
      onQaSubmitted={handleQaSubmitted}
      reviews={reviews}
      reviewSummary={reviewSummary}
      reviewPage={reviewShownPage}
      reviewLastPage={reviewLastPage}
      onReviewPageChange={handleReviewPageChange}
      qaPage={qaShownPage}
      qaLastPage={qaLastPage}
      onQaPageChange={handleQaPageChange}
      qas={qas}
      onQaChanged={reloadQas}
      shippingFreeThreshold={shippingFreeThreshold}
      restockDialogOpen={restockDialogOpen}
      onRestockDialogOpenChange={setRestockDialogOpen}
      restockHp={restockHp}
      onRestockHpChange={setRestockHp}
      restockAgree={restockAgree}
      onRestockAgreeChange={setRestockAgree}
      restockSubmitting={restockSubmitting}
      onRestockSubmit={submitRestockAlert}
      recommendDialogOpen={recommendDialogOpen}
      onRecommendDialogOpenChange={setRecommendDialogOpen}
      recommendToEmail={recommendToEmail}
      onRecommendToEmailChange={setRecommendToEmail}
      recommendSubject={recommendSubject}
      onRecommendSubjectChange={setRecommendSubject}
      recommendContent={recommendContent}
      onRecommendContentChange={setRecommendContent}
      recommendSubmitting={recommendSubmitting}
      onRecommendSubmit={submitRecommendation}
    />
  );
}
