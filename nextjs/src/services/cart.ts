import { apiClient } from "@/lib/api";
import { validateApiData } from "@/lib/api-response";
import {
  shopCartResponseSchema,
  shopWishItemListSchema,
} from "@/lib/schemas";
import type { ShopCartResponse, ShopWishItem } from "@/lib/api";

const EMPTY_CART: ShopCartResponse = {
  items: [],
  total_price: 0,
  total_qty: 0,
  send_cost: 0,
  shipping_cost: 0,
};

/**
 * 장바구니 화면의 목록 — gather=1 로 그누보드 화면 · 다른 기기에 담긴 이 회원의 상품을 이 장바구니로 모아 받는다.
 * (머리의 미니 장바구니는 모으지 않는다 — 줄 번호를 보내지 않는 예전 앱의 주문서를 화면마다 흔들지 않게.)
 */
export async function getCart(): Promise<ShopCartResponse> {
  const response = await apiClient.get<unknown>("/shop/cart", { params: { gather: 1 } });
  return validateApiData(response.data, shopCartResponseSchema, EMPTY_CART);
}

export function addCartItem(
  itId: string,
  qty = 1,
  ctOption = "",
  meta: AddCartRequestMeta = {}
) {
  return apiClient.post<ShopCartAddResponse>("/shop/cart", {
    it_id: itId,
    ct_qty: qty,
    ...(ctOption ? { ct_option: ctOption } : {}),
    ...(meta.ctSendCost !== undefined ? { ct_send_cost: meta.ctSendCost } : {}),
  });
}

export interface ShopCartAddResponse {
  ct_id?: string | number;
  items?: Array<{ ct_id?: string | number }>;
}

export interface AddCartOptionInput {
  io_id: string;
  ct_qty: number;
}

export interface AddCartRequestMeta {
  direct?: boolean;
  replaceDirect?: boolean;
  ctSendCost?: number;
}

export function addCartItemDirect(
  itId: string,
  qty = 1,
  ctOption = "",
  meta: AddCartRequestMeta = {}
) {
  return apiClient.post<ShopCartAddResponse>("/shop/cart", {
    it_id: itId,
    ct_qty: qty,
    direct: true,
    ...(ctOption ? { ct_option: ctOption } : {}),
    ...(meta.replaceDirect === false ? { replace_direct: false } : {}),
    ...(meta.ctSendCost !== undefined ? { ct_send_cost: meta.ctSendCost } : {}),
  });
}

export function addCartItems(
  itId: string,
  options: AddCartOptionInput[],
  meta: AddCartRequestMeta = {}
) {
  return apiClient.post<ShopCartAddResponse>("/shop/cart", {
    it_id: itId,
    options,
    ...(meta.direct ? { direct: true } : {}),
    ...(meta.replaceDirect === false ? { replace_direct: false } : {}),
    ...(meta.ctSendCost !== undefined ? { ct_send_cost: meta.ctSendCost } : {}),
  });
}

export interface CartOptionLineInput {
  io_id: string;
  io_type: number;
  ct_qty: number;
}

/**
 * 장바구니의 선택사항수정 — 한 상품의 줄을 고친 뒤 목록으로 한 번에 바꾼다(POST /shop/cart/options).
 * 서버가 고친 뒤의 모습(최소 · 최대 구매수량 합계 · 재고 · 본품)을 먼저 검사하고, 통과해야 달라진 줄만 고친다.
 */
export function replaceCartItemOptions(itId: string, options: CartOptionLineInput[]) {
  return apiClient.post("/shop/cart/options", { it_id: itId, options });
}

/**
 * 장바구니의 "주문하기" 앞 재고 검사 — 영카트 cart.php 가 주문하기를 누를 때 부르는 ajax.orderstock.php 와 같다
 * (POST /shop/cart/order-stock). 품절 · 판매중지 · 재고 부족 · 구매수량 한도에 걸리면 서버의 안내 문구로 던진다.
 * 고른 줄의 선택 시각도 이때 갱신한다.
 */
export function checkCartOrderStock(ctIds: string[]) {
  return apiClient.post("/shop/cart/order-stock", { ct_ids: ctIds });
}

export function updateCartItemQuantity(ctId: string, qty: number) {
  return apiClient.patch(`/shop/cart/${ctId}`, { ct_qty: qty });
}

export function removeCartItem(ctId: string) {
  return apiClient.delete(`/shop/cart/${ctId}`);
}

/** 장바구니의 선택삭제 — 영카트 cartupdate.php(act=seldelete)와 같다. 바로구매 줄은 건드리지 않는다. */
export function removeCartItems(ctIds: string[]) {
  return apiClient.post("/shop/cart/legacy-update", { act: "seldelete", ct_id: ctIds });
}

/** 장바구니 비우기 — 영카트 cartupdate.php(act=alldelete)와 같다. 바로구매 줄은 건드리지 않는다. */
export function clearCart() {
  return apiClient.post("/shop/cart/legacy-update", { act: "alldelete" });
}

export async function getWishlist(): Promise<ShopWishItem[]> {
  const response = await apiClient.get<unknown>("/shop/wishlist");
  return validateApiData(response.data, shopWishItemListSchema, []);
}

export function addWishlistItem(itId: string) {
  return apiClient.post("/shop/wishlist", { it_id: itId });
}

export function removeWishlistItem(itId: string) {
  return apiClient.delete(`/shop/wishlist/${itId}`);
}
