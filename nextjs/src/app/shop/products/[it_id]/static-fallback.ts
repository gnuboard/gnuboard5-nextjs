// 정적 내보내기용 셸 세그먼트. 빌드 때 실제 상품 대신 이 두 경로만 구워 두고, PHP 브리지가
// 알 수 없는 /shop/<id> 요청에 이 셸을 내준다. 실제 id 는 클라이언트가 URL 에서 읽는다
// (ProductDetailClient 의 useRuntimeRouteParam).
export const STATIC_PRODUCT_FALLBACK_SEGMENT = "g5-static-product";

export const STATIC_PRODUCT_SENTINELS = ["__g5_static__", STATIC_PRODUCT_FALLBACK_SEGMENT];

export function isStaticProductFallbackSegment(itId: string): boolean {
  return STATIC_PRODUCT_SENTINELS.includes(itId);
}
