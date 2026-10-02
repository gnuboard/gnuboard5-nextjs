import { ApiError, apiClient } from "@/lib/api";
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

/** 메일 인증을 쓰는 사이트에서 이메일을 바꿨을 때 — 새 주소로 다시 인증해야 한다. */
export interface EmailVerificationNotice {
  required: boolean;
  email: string;
  mail_sent: boolean;
  /** 인증 링크 유효시간(분). 0 이면 기한 없음. */
  valid_minutes: number;
}

export function updateMyProfile(payload: MyProfilePayload) {
  return apiClient.patch<{ email_verification?: EmailVerificationNotice }>("/members/me", payload);
}

/**
 * 인증 메일 다시 보내기(아이디 + 메일 주소). 결과는 늘 같은 답이라(가입 여부 비노출) 보냈는지는 알 수 없다.
 */
export function resendVerificationByEmail(mb_id: string, mb_email: string) {
  return apiClient.post<{ sent?: boolean; message?: string }>("/auth/resend-verification", { mb_id, mb_email });
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

const memberKeyRequests = new Map<string, Promise<string | null>>();

/**
 * 주소에 쓸 회원 공개 키(GET /members/{mb_id}/key) — /members/{키}, /recent?mb={키} 처럼 주소에 아이디를 남기지 않는다.
 * 없는 회원(404)이면 null, 키를 만들 수 없는 설치본(확장 미설치)이면 "" — 부르는 쪽이 예전 주소로 물러선다.
 * 잠깐의 실패(요청 한도 429 · 네트워크)는 그대로 던진다 — 기억하지 않으므로 다음에 다시 묻는다.
 * 같은 회원은 한 번만 묻는다.
 */
export function getMemberKey(mbId: string): Promise<string | null> {
  const cached = memberKeyRequests.get(mbId);
  if (cached) return cached;

  const request = apiClient
    .get<{ mb_key?: unknown }>(`/members/${encodeURIComponent(mbId)}/key`)
    .then((response) => (typeof response.data?.mb_key === "string" ? response.data.mb_key : ""))
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      memberKeyRequests.delete(mbId);
      throw error;
    });
  memberKeyRequests.set(mbId, request);
  return request;
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
