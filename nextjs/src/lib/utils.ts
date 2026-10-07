import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 목록 줄 날짜(그누보드 datetime2): 오늘 쓴 글은 "시:분", 그 밖에는 "월-일". 입력은 "YYYY-MM-DD HH:MM:SS".
 * "오늘"은 보는 사람의 현지 날짜로 잰다 — toISOString() 은 UTC 라 한국 0~9시에 오늘 글이 날짜로 나온다.
 * 새글 목록과 테마 홈 위젯(soluneListDate)이 같이 쓴다. now 는 테스트에서 "지금"을 정할 때만 넘긴다.
 */
export function formatListDate(datetime?: string | null, now: Date = new Date()): string {
  if (!datetime) return "";
  const day = datetime.slice(0, 10);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return day === today ? datetime.slice(11, 16) : datetime.slice(5, 10);
}

export function formatDate(date?: string | null) {
  if (!date || /^0{4}-0{2}-0{2}/.test(date)) return "";

  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) {
    return `${month}-${day}`;
  }
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * 통화 표시 — 기본 ko-KR/KRW. NEXT_PUBLIC_SHOP_LOCALE / NEXT_PUBLIC_SHOP_CURRENCY
 * 환경변수로 운영자가 다른 로케일/통화 전환 가능.
 *   예: en-US / USD → '$1,234'
 *       ja-JP / JPY → '¥1,234'
 */
const SHOP_LOCALE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SHOP_LOCALE) || 'ko-KR';
const SHOP_CURRENCY =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SHOP_CURRENCY) || 'KRW';

export function formatPrice(price?: number | null) {
  const safePrice = Number.isFinite(price) ? Number(price) : 0;

  // KRW 는 '원' 접미사가 일반적이라 그대로 유지. 다른 통화는 Intl.NumberFormat
  // currency 스타일이 자동으로 기호 처리 (en-US → $, ja-JP → ¥).
  if (SHOP_CURRENCY === 'KRW') {
    return new Intl.NumberFormat(SHOP_LOCALE).format(safePrice) + '원';
  }
  return new Intl.NumberFormat(SHOP_LOCALE, {
    style: 'currency',
    currency: SHOP_CURRENCY,
    maximumFractionDigits: 0,
  }).format(safePrice);
}

export function formatNumber(num: number) {
  return new Intl.NumberFormat('ko-KR').format(Number.isFinite(num) ? num : 0);
}

export function truncate(str: string, length: number) {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

/**
 * 그누보드5 의 카트 옵션 표시 — io_id 가 다단계 옵션을 \x1e (Record Separator)
 * 로 join 한 형태라 사용자에겐 'S / 블루' 처럼 슬래시로 변환해서 보여준다.
 * 빈 값/undefined 면 빈 문자열.
 */
/**
 * 장바구니 · 주문 줄의 옵션 글자. 영카트처럼 옵션 없는 줄의 ct_option 에는 상품명이 들어 있으므로(cartupdate.php
 * io_value), itName 을 주면 그때는 빈 글자 — 상품명 아래에 같은 이름이 한 번 더 붙지 않게.
 * 예전 줄은 io_id 원문("값1␞값2")이라 구분자를 " / " 로 바꿔 보여 준다.
 */
export function formatCartOption(ctOption?: string | null, itName?: string | null): string {
  if (!ctOption) return '';
  if (itName && ctOption.trim() === itName.trim()) return '';
  return ctOption.split('\x1e').join(' / ');
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}
