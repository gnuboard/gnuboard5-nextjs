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

export async function getCart(): Promise<ShopCartResponse> {
  const response = await apiClient.get<unknown>("/shop/cart");
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

export function updateCartItemQuantity(ctId: string, qty: number) {
  return apiClient.patch(`/shop/cart/${ctId}`, { ct_qty: qty });
}

export function removeCartItem(ctId: string) {
  return apiClient.delete(`/shop/cart/${ctId}`);
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
