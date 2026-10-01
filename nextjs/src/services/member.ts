import { apiClient } from "@/lib/api";
import * as z from "zod";
import type { ApiMeta } from "@/lib/api-response";
import { validateApiData } from "@/lib/api-response";
import {
  couponListSchema,
  memberProfileSchema,
  myCommentListSchema,
  myPostListSchema,
  pointItemListSchema,
  shopOrderListSchema,
  shopOrderSchema,
  type Coupon,
  type MyComment,
  type MyPost,
  type PointItem,
} from "@/lib/schemas";
import type { ShopOrder } from "@/lib/api";
import type { MemberProfile } from "@/lib/types";

export interface PointsResult {
  items: PointItem[];
  meta?: ApiMeta;
}

export interface MyOrdersResult {
  orders: ShopOrder[];
  totalPages: number;
}

export interface GuestOrderLookupResult {
  od_id: string;
  uid: string;
  redirect_url?: string;
}

export interface MyDashboardCounts {
  orders: number;
  wishlist: number;
  scraps: number;
  posts: number;
  comments: number;
  addresses: number;
}

export interface MyProfilePayload {
  mb_nick: string;
  mb_name: string;
  mb_email: string;
  mb_password_current?: string;
}

export interface MyPasswordPayload {
  mb_password_current: string;
  mb_password: string;
  mb_password_re: string;
}

export interface LoginSession {
  token_id: number;
  device_label: string;
  user_agent: string;
  ip: string;
  created_at: string;
  expires_at: string;
  last_used_at: string;
}

const loginSessionSchema = z.object({
  token_id: z.coerce.number().int().positive(),
  device_label: z.coerce.string().catch(""),
  user_agent: z.coerce.string().catch(""),
  ip: z.coerce.string().catch(""),
  created_at: z.coerce.string().catch(""),
  expires_at: z.coerce.string().catch(""),
  last_used_at: z.coerce.string().catch(""),
});

const loginSessionListSchema = z.array(loginSessionSchema);

export function updateMyProfile(payload: MyProfilePayload) {
  return apiClient.patch("/members/me", payload);
}

export function updateMyPassword(payload: MyPasswordPayload) {
  return apiClient.patch("/members/me", payload);
}

export function uploadMyIcon(file: File) {
  const formData = new FormData();
  formData.append("mb_icon", file);
  return apiClient.upload("/members/me/icon", formData);
}

export function deleteMyIcon() {
  return apiClient.delete("/members/me/icon");
}

/** 회원이미지(프로필 사진) — 회원아이콘과 다른 그림. 한도는 설정의 member_media.image. */
export function uploadMyImage(file: File) {
  const formData = new FormData();
  formData.append("mb_img", file);
  return apiClient.upload("/members/me/image", formData);
}

export function deleteMyImage() {
  return apiClient.delete("/members/me/image");
}

export async function getMemberProfile(mbId: string): Promise<MemberProfile> {
  const response = await apiClient.get<{ member?: unknown }>(
    `/members/${encodeURIComponent(mbId)}/profile`
  );
  const parsed = memberProfileSchema.safeParse(response.data?.member);
  if (!parsed.success) {
    throw new Error("회원 프로필 응답 형식이 올바르지 않습니다.");
  }

  return parsed.data;
}

export async function getLoginSessions(): Promise<LoginSession[]> {
  const response = await apiClient.get<unknown>("/auth/sessions");
  const source =
    response.data && typeof response.data === "object" && "sessions" in response.data
      ? (response.data as { sessions?: unknown }).sessions
      : [];
  return validateApiData(source, loginSessionListSchema, []);
}

export function revokeLoginSession(tokenId: number) {
  return apiClient.post<{ revoked: boolean }>("/auth/sessions/revoke", {
    token_id: tokenId,
  });
}

export async function getMyPosts(perPage = 30): Promise<MyPost[]> {
  const response = await apiClient.get<unknown>("/members/me/posts", {
    params: { per_page: perPage },
  });

  return validateApiData(response.data, myPostListSchema, []);
}

export async function getMyComments(perPage = 30): Promise<MyComment[]> {
  const response = await apiClient.get<unknown>("/members/me/comments", {
    params: { per_page: perPage },
  });

  return validateApiData(response.data, myCommentListSchema, []);
}

export async function getMyPoints(page = 1, perPage = 15): Promise<PointsResult> {
  const response = await apiClient.get<unknown>("/members/me/points", {
    params: { page, per_page: perPage },
  });

  return {
    items: validateApiData(response.data, pointItemListSchema, []),
    meta: response.meta,
  };
}

export async function getMyCoupons(): Promise<Coupon[]> {
  const response = await apiClient.get<unknown>("/shop/coupons");
  return validateApiData(response.data, couponListSchema, []);
}

export async function getMyOrders(
  page = 1,
  perPage = 10
): Promise<MyOrdersResult> {
  const response = await apiClient.get<unknown>("/shop/orders", {
    params: { page, per_page: perPage },
  });

  return {
    orders: validateApiData(response.data, shopOrderListSchema, []),
    totalPages: response.meta?.last_page ?? 1,
  };
}

export async function lookupGuestOrder(
  orderId: string,
  password: string
): Promise<GuestOrderLookupResult> {
  const response = await apiClient.post<GuestOrderLookupResult>("/shop/orders/lookup", {
    od_id: orderId.trim(),
    od_pwd: password,
  });
  if (!response.data?.od_id || !response.data?.uid) {
    throw new Error("주문 정보를 확인할 수 없습니다.");
  }
  return response.data;
}

export async function getMyOrder(
  orderId: string,
  uid = ""
): Promise<ShopOrder | null> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) return null;

  const response = await apiClient.get<unknown>(
    `/shop/orders/${encodeURIComponent(normalizedOrderId)}`,
    uid ? { params: { uid } } : undefined
  );
  const parsed = shopOrderSchema.safeParse(response.data);
  return parsed.success ? parsed.data : null;
}

export function cancelMyOrder(orderId: string, reason = "본인 취소", uid = "") {
  return apiClient.patch(`/shop/orders/${encodeURIComponent(orderId)}`, {
    reason,
    ...(uid ? { uid } : {}),
  });
}

async function getMetaTotal(path: string): Promise<number> {
  const response = await apiClient.get<unknown>(path, {
    params: { per_page: 1 },
  });

  return response.meta?.total ?? 0;
}

export async function getMyDashboardCounts(): Promise<MyDashboardCounts> {
  const [orders, wishlist, scraps, posts, comments, addresses] = await Promise.all([
    getMetaTotal("/shop/orders").catch(() => 0),
    getMetaTotal("/shop/wishlist").catch(() => 0),
    getMetaTotal("/scraps").catch(() => 0),
    getMetaTotal("/members/me/posts").catch(() => 0),
    getMetaTotal("/members/me/comments").catch(() => 0),
    getMetaTotal("/shop/addresses").catch(() => 0),
  ]);

  return {
    orders,
    wishlist,
    scraps,
    posts,
    comments,
    addresses,
  };
}
