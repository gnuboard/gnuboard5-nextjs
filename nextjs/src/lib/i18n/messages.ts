/**
 * 가벼운 i18n 메시지 저장소 — next-intl 도입 전 단계.
 *
 * 추가 키는 ko / en / ja 세 파일 모두에 추가해야 lint warning 없음. 누락 키는
 * 영문 fallback → 한국어 fallback → 키 그대로 출력.
 *
 * 사용:
 *   import { useT, setLocale } from '@/lib/i18n';
 *   const t = useT();
 *   t('cart.add')  // '장바구니에 추가' or 'Add to cart'
 */

export const SUPPORTED_LOCALES = ["ko", "en", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";

type Messages = Record<string, string>;

const ko: Messages = {
  "cart.add": "장바구니에 추가",
  "cart.buy_now": "바로구매",
  "cart.empty": "장바구니가 비어있습니다",
  "order.title": "주문/결제",
  "order.place": "결제하기",
  "search.placeholder": "검색...",
  "search.title": "검색 결과",
  "common.more": "더보기",
  "common.cancel": "취소",
  "common.confirm": "확인",
  "common.save": "저장",
  "common.delete": "삭제",
  "shop.products": "상품 목록",
  "shop.events": "기획전",
  "shop.couponzone": "쿠폰존",
  "shop.compare": "비교",
};

const en: Messages = {
  "cart.add": "Add to cart",
  "cart.buy_now": "Buy now",
  "cart.empty": "Your cart is empty",
  "order.title": "Checkout",
  "order.place": "Place order",
  "search.placeholder": "Search...",
  "search.title": "Search results",
  "common.more": "More",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.save": "Save",
  "common.delete": "Delete",
  "shop.products": "Products",
  "shop.events": "Events",
  "shop.couponzone": "Coupon zone",
  "shop.compare": "Compare",
};

const ja: Messages = {
  "cart.add": "カートに入れる",
  "cart.buy_now": "今すぐ購入",
  "cart.empty": "カートが空です",
  "order.title": "ご注文・お支払い",
  "order.place": "注文する",
  "search.placeholder": "検索...",
  "search.title": "検索結果",
  "common.more": "もっと見る",
  "common.cancel": "キャンセル",
  "common.confirm": "確認",
  "common.save": "保存",
  "common.delete": "削除",
  "shop.products": "商品一覧",
  "shop.events": "特集",
  "shop.couponzone": "クーポンゾーン",
  "shop.compare": "比較",
};

export const MESSAGES: Record<Locale, Messages> = { ko, en, ja };
