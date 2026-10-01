import { apiUrl } from "@/lib/config";
import { apiClient } from "@/lib/api";
import { requestShare } from "@/lib/request-share";
import {
  fetchApiData,
  fetchApiResult,
  validateApiData,
  type ApiMeta,
  type ApiResult,
} from "@/lib/api-response";
import {
  shopCategoryProductPageSchema,
  shopCategorySchema,
  shopBannerListSchema,
  shopNaverPayConfigSchema,
  shopNaverPayOrderResponseSchema,
  shopNaverPayWishResponseSchema,
  shopPolicySchema,
  shopPopupListSchema,
  shopQaSchema,
  shopProductListSchema,
  shopProductSchema,
  shopQaListSchema,
  shopReviewListSchema,
  shopReviewSchema,
  shopReviewSummarySchema,
  shopShippingQuoteSchema,
  type ShopCategoryProductPage,
} from "@/lib/schemas";
import type {
  ShopCategory,
  ShopBanner,
  ShopNaverPayConfig,
  ShopNaverPayOrderRequest,
  ShopNaverPayOrderResponse,
  ShopNaverPayWishResponse,
  ShopPolicy,
  ShopPopup,
  ShopProduct,
  ShopQA,
  ShopReview,
  ShopReviewSummary,
  ShopShippingQuote,
} from "@/lib/api";

export type ShopProductParams = Record<string, string | number | undefined>;

const FALLBACK_SHIPPING_COST = 3000;
const FALLBACK_FREE_THRESHOLD = 50000;

export interface ShopProductListResult {
  products: ShopProduct[];
  meta?: ApiMeta;
}

export function getShopCategories(revalidate = 300): Promise<ShopCategory[]> {
  // 분류는 머리글·왼쪽 목록·홈 진열이 각자 부른다 — 한 화면에서 네 번까지 나갔다.
  return requestShare.get(
    "shop/categories",
    SHARED_LIST_TTL_MS,
    () =>
      fetchApiData(apiUrl("/shop/categories"), shopCategorySchema.array(), [], {
        next: { revalidate },
      }),
    isEmptyList
  );
}

export function getShopBanners(
  params: { position?: string; device?: "pc" | "mobile" | "all" } = {},
  revalidate = 300
): Promise<ShopBanner[]> {
  const query = new URLSearchParams();
  query.set("position", params.position || "메인");
  query.set("device", params.device || "all");
  const suffix = `?${query.toString()}`;

  return requestShare.get(
    `shop/banners${suffix}`,
    SHARED_LIST_TTL_MS,
    () =>
      fetchApiData(apiUrl(`/shop/banners${suffix}`), shopBannerListSchema, [], {
        next: { revalidate },
      }),
    isEmptyList
  );
}

export function getShopPopups(
  params: { device?: "pc" | "mobile" | "all"; limit?: number; division?: "shop" | "comm" } = {},
  revalidate = 60
): Promise<ShopPopup[]> {
  const query = new URLSearchParams();
  query.set("device", params.device || "all");
  query.set("limit", String(params.limit || 5));
  // 팝업레이어관리의 구분. comm = 커뮤니티 화면, 기본은 쇼핑몰. 둘 다(both)인 팝업은 어느 쪽에도 나온다.
  if (params.division === "comm") query.set("division", "comm");
  const suffix = `?${query.toString()}`;

  return fetchApiData(apiUrl(`/shop/popups${suffix}`), shopPopupListSchema, [], {
    next: { revalidate },
  });
}

export function getShopProducts(
  params: Record<string, string | number | undefined>,
  revalidate = 30
): Promise<ShopProduct[]> {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value));
  });

  const suffix = query.toString() ? `?${query.toString()}` : "";

  return requestShare.get(
    `shop/products${suffix}`,
    SHARED_LIST_TTL_MS,
    () =>
      fetchApiData(apiUrl(`/shop/products${suffix}`), shopProductListSchema, [], {
        next: { revalidate },
      }),
    isEmptyList
  );
}

export async function getShopProduct(
  itId: string,
  revalidate = 60
): Promise<ShopProduct | null> {
  const result = await getShopProductResult(itId, revalidate);

  return result.ok ? result.data : null;
}

/**
 * 브라우저에서 같은 요청을 잠깐 나눠 쓰는 시간(request-share.ts). 링크에 마우스를 올렸을 때 미리 부른
 * 상품·분류 요청을 이동한 뒤 화면이 그대로 받아 쓸 만큼만 둔다 — 그동안은 재고·값 표시가 최대 이만큼
 * 늦을 수 있다(장바구니·주문은 서버가 따로 검사한다).
 *
 * 네이버페이 설정도 이 짧은 쪽이다. 테스트 모드에서는 관리자·테스트 회원에게만 켜지므로 사람마다 다르다
 * (로그인 상태가 바뀌면 runtime-navigation-bridge 가 requestShare 를 비운다). 상점 정책만 사용자와 무관해 길게.
 */
const SHARED_DETAIL_TTL_MS = 15_000;
const SHARED_SHOP_POLICY_TTL_MS = 60_000;
/*
 * 쇼핑 홈의 진열 목록. 휴대용 정적 빌드는 어느 설치본의 상품도 굽지 않으므로 테마 홈이 붙은 뒤
 * 브라우저에서 같은 목록을 한 번 더 받는데(themes/default/shop-home-client.tsx), 화면 이동으로
 * 들어오면 그 갱신이 두 번 돈다 — 목록 열두 종이 고스란히 두 벌씩 나갔다. 사람마다 다르지 않은
 * 진열이라 길게 둘 수도 있지만, 관리자가 진열을 바꾼 것이 곧 보이도록 짧게 잡는다.
 */
const SHARED_LIST_TTL_MS = 5_000;

/*
 * 목록 API 는 실패해도 빈 배열로 돌아온다(fetchApiData 의 fallback). 그것을 담아 두면 잠깐의
 * 장애가 TTL 만큼 굳으므로 빈 목록은 나눠 쓰지 않는다 — 진짜로 비어 있는 진열은 한 번 더
 * 받지만, 빈 응답은 작고 그 편이 안전하다.
 */
function isEmptyList(list: readonly unknown[]): boolean {
  return list.length === 0;
}

function stableParamsKey(params: object): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .sort()
    .join("&");
}

export function getShopProductResult(
  itId: string,
  revalidate = 60
): Promise<ApiResult<ShopProduct>> {
  return requestShare.get(
    `shop/product:${itId}`,
    SHARED_DETAIL_TTL_MS,
    () => fetchApiResult(apiUrl(`/shop/products/${itId}`), shopProductSchema, { next: { revalidate } }),
    (result) => !result.ok
  );
}

export async function getShopProductBySeo(
  slug: string,
  revalidate = 60
): Promise<ShopProduct | null> {
  const result = await getShopProductBySeoResult(slug, revalidate);

  return result.ok ? result.data : null;
}

export function getShopProductBySeoResult(
  slug: string,
  revalidate = 60
): Promise<ApiResult<ShopProduct>> {
  return fetchApiResult(
    apiUrl(`/shop/products/seo/${encodeURIComponent(slug)}`),
    shopProductSchema,
    { next: { revalidate } }
  );
}

export async function getShopProductList(
  params: ShopProductParams
): Promise<ShopProductListResult> {
  const response = await apiClient.get<unknown>("/shop/products", { params });

  return {
    products: validateApiData(response.data, shopProductListSchema, []),
    meta: response.meta,
  };
}

export function getShopCategoryProductPage(
  caId: string,
  params: ShopProductParams
): Promise<ShopCategoryProductPage | null> {
  return requestShare.get(
    `shop/category:${caId}?${stableParamsKey(params)}`,
    SHARED_DETAIL_TTL_MS,
    async () => {
      const response = await apiClient.get<unknown>(
        `/shop/categories/${encodeURIComponent(caId)}`,
        { params }
      );
      const parsed = shopCategoryProductPageSchema.safeParse(response.data);

      return parsed.success ? parsed.data : null;
    },
    (page) => page === null
  );
}

function shippingRules(policy?: ShopPolicy | null) {
  return [...(policy?.shipping_rules ?? [])]
    .filter((rule) => Number(rule.limit) > 0)
    .sort((a, b) => Number(a.limit) - Number(b.limit));
}

export function getShopShippingFreeThreshold(policy?: ShopPolicy | null): number {
  if (!policy) return FALLBACK_FREE_THRESHOLD;

  const rules = shippingRules(policy);
  if (rules.length > 0) {
    return Math.max(...rules.map((rule) => Number(rule.limit)));
  }

  return Math.max(0, Number(policy.free_threshold || 0));
}

export function getShopShippingFreeRemaining(
  subtotal: number,
  policy?: ShopPolicy | null
): number {
  const threshold = getShopShippingFreeThreshold(policy);
  if (threshold <= 0) return 0;

  return Math.max(0, threshold - Math.max(0, Math.floor(subtotal)));
}

export function estimateShopShippingCost(
  subtotal: number,
  policy?: ShopPolicy | null
): number {
  const amount = Math.max(0, Math.floor(subtotal));
  if (amount <= 0) return 0;

  if (!policy) {
    return amount >= FALLBACK_FREE_THRESHOLD ? 0 : FALLBACK_SHIPPING_COST;
  }

  const rules = shippingRules(policy);
  if (rules.length > 0) {
    const matched = rules.find((rule) => amount < Number(rule.limit));
    return matched ? Math.max(0, Number(matched.cost || 0)) : 0;
  }

  const baseCost = Math.max(0, Number(policy.base_shipping_cost || 0));
  const threshold = Math.max(0, Number(policy.free_threshold || 0));

  if (baseCost <= 0 && threshold <= 0) return 0;
  if (threshold > 0 && amount >= threshold) return 0;

  return baseCost > 0 ? baseCost : FALLBACK_SHIPPING_COST;
}

export function getShopPolicy(revalidate = 300): Promise<ShopPolicy | null> {
  return requestShare.get(
    "shop/policy",
    SHARED_SHOP_POLICY_TTL_MS,
    async () => {
      const result = await fetchApiResult(apiUrl("/shop/policy"), shopPolicySchema, {
        next: { revalidate },
      });

      return result.ok ? result.data : null;
    },
    (policy) => policy === null
  );
}

export function getShopNaverPayConfig(): Promise<ShopNaverPayConfig | null> {
  return requestShare.get(
    "shop/naverpay",
    SHARED_DETAIL_TTL_MS,
    async () => {
      try {
        const response = await apiClient.get<unknown>("/shop/naverpay");
        const parsed = shopNaverPayConfigSchema.safeParse(response.data);
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    (config) => config === null
  );
}

export async function registerShopNaverPayOrder(
  payload: ShopNaverPayOrderRequest
): Promise<ShopNaverPayOrderResponse> {
  const response = await apiClient.post<unknown>("/shop/naverpay/order", payload);
  const parsed = shopNaverPayOrderResponseSchema.safeParse(response.data);

  if (!parsed.success) {
    throw new Error("네이버페이 주문 등록 응답 형식이 올바르지 않습니다.");
  }

  return parsed.data;
}

export async function registerShopNaverPayWish(
  payload: { it_id?: string; it_ids?: string[] }
): Promise<ShopNaverPayWishResponse> {
  const response = await apiClient.post<unknown>("/shop/naverpay/wish", payload);
  const parsed = shopNaverPayWishResponseSchema.safeParse(response.data);

  if (!parsed.success) {
    throw new Error("네이버페이 찜 등록 응답 형식이 올바르지 않습니다.");
  }

  return parsed.data;
}

export async function getShopShippingQuote(params: {
  zip1?: string;
  zip2?: string;
  ct_ids?: string;
  direct?: string | number;
  sw_direct?: string | number;
} = {}): Promise<ShopShippingQuote | null> {
  try {
    const response = await apiClient.get<unknown>("/shop/shipping/quote", { params });
    const parsed = shopShippingQuoteSchema.safeParse(response.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getShopProductReviews(
  itId: string,
  page = 1
): Promise<ShopReview[]> {
  const response = await apiClient.get<unknown>("/shop/reviews", {
    params: { it_id: itId, page },
  });

  return validateApiData(response.data, shopReviewListSchema, []);
}

export async function getShopReviews(
  params: ShopReviewListParams = {}
): Promise<ShopReviewListResult> {
  const response = await apiClient.get<unknown>("/shop/reviews", {
    params: {
      page: params.page,
      per_page: params.perPage,
      q: params.q || undefined,
    },
  });

  return {
    items: validateApiData(response.data, shopReviewListSchema, []),
    meta: response.meta,
  };
}

export function getShopReviewsCached(
  params: ShopReviewListParams = {},
  revalidate = 30
): Promise<ShopReview[]> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.perPage) query.set("per_page", String(params.perPage));
  if (params.q) query.set("q", params.q);

  const suffix = query.toString() ? `?${query.toString()}` : "";

  return requestShare.get(
    `shop/reviews${suffix}`,
    SHARED_LIST_TTL_MS,
    () =>
      fetchApiData(apiUrl(`/shop/reviews${suffix}`), shopReviewListSchema, [], {
        next: { revalidate },
      }),
    isEmptyList
  );
}

export async function getShopProductReviewSummary(
  itId: string
): Promise<ShopReviewSummary | null> {
  const response = await apiClient.get<unknown>("/shop/reviews/summary", {
    params: { it_id: itId },
  });
  const parsed = shopReviewSummarySchema.safeParse(response.data);

  return parsed.success ? parsed.data : null;
}

export interface ShopReviewListParams {
  page?: number;
  perPage?: number;
  status?: "all" | "confirmed" | "pending";
  q?: string;
}

export interface ShopReviewListResult {
  items: ShopReview[];
  meta?: ApiMeta;
}

export interface ShopReviewPayload {
  is_subject: string;
  is_content: string;
  is_score: number;
}

function parseShopReview(data: unknown): ShopReview {
  const parsed = shopReviewSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("상품후기 응답 형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

export async function getMyShopReviews(
  params: ShopReviewListParams = {}
): Promise<ShopReviewListResult> {
  const response = await apiClient.get<unknown>("/shop/reviews/mine", {
    params: {
      page: params.page,
      per_page: params.perPage,
      status: params.status === "all" ? undefined : params.status,
      q: params.q || undefined,
    },
  });

  return {
    items: validateApiData(response.data, shopReviewListSchema, []),
    meta: response.meta,
  };
}

export async function getShopReview(reviewId: string | number): Promise<ShopReview> {
  const response = await apiClient.get<unknown>(`/shop/reviews/${reviewId}`);
  return parseShopReview(response.data);
}

export async function updateShopReview(
  reviewId: string | number,
  payload: ShopReviewPayload
): Promise<ShopReview> {
  const response = await apiClient.patch<unknown>(`/shop/reviews/${reviewId}`, payload);
  return parseShopReview(response.data);
}

export function deleteShopReview(reviewId: string | number) {
  return apiClient.delete(`/shop/reviews/${reviewId}`);
}

export async function getShopProductQas(
  itId: string,
  page = 1
): Promise<ShopQA[]> {
  const response = await apiClient.get<unknown>("/shop/reviews/qna", {
    params: { it_id: itId, page },
  });

  return validateApiData(response.data, shopQaListSchema, []);
}

export async function getShopQas(
  params: ShopQaListParams = {}
): Promise<ShopQaListResult> {
  const response = await apiClient.get<unknown>("/shop/reviews/qna", {
    params: {
      page: params.page,
      per_page: params.perPage,
      status: params.status === "all" ? undefined : params.status,
      q: params.q || undefined,
    },
  });

  return {
    items: validateApiData(response.data, shopQaListSchema, []),
    meta: response.meta,
  };
}

export interface ShopQaListParams {
  page?: number;
  perPage?: number;
  status?: "all" | "answered" | "unanswered";
  q?: string;
}

export interface ShopQaListResult {
  items: ShopQA[];
  meta?: ApiMeta;
}

export interface ShopQaPayload {
  iq_subject: string;
  iq_question: string;
  iq_secret?: boolean | number;
  iq_email?: string;
  iq_hp?: string;
}

function parseShopQa(data: unknown): ShopQA {
  const parsed = shopQaSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("상품문의 응답 형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

export async function getMyShopQas(
  params: ShopQaListParams = {}
): Promise<ShopQaListResult> {
  const response = await apiClient.get<unknown>("/shop/reviews/qna/mine", {
    params: {
      page: params.page,
      per_page: params.perPage,
      status: params.status === "all" ? undefined : params.status,
      q: params.q || undefined,
    },
  });

  return {
    items: validateApiData(response.data, shopQaListSchema, []),
    meta: response.meta,
  };
}

export async function getShopQa(iqId: string | number): Promise<ShopQA> {
  const response = await apiClient.get<unknown>(`/shop/reviews/qna/${iqId}`);
  return parseShopQa(response.data);
}

export async function updateShopQa(
  iqId: string | number,
  payload: ShopQaPayload
): Promise<ShopQA> {
  const response = await apiClient.patch<unknown>(`/shop/reviews/qna/${iqId}`, payload);
  return parseShopQa(response.data);
}

export function deleteShopQa(iqId: string | number) {
  return apiClient.delete(`/shop/reviews/qna/${iqId}`);
}
