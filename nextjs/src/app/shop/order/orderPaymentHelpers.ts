import type { PgService, PaymentMethod } from "@/lib/payment";

export interface PaymentConfig {
  pg_service: PgService;
  client: {
    client_key?: string;
    mid?: string;
    site_key?: string;
    script_url?: string;
  };
  payment_methods: {
    card: boolean;
    vbank: boolean;
    bank: boolean;
    iche: boolean;
    hp: boolean;
    easy_pay: boolean;
    kakaopay?: boolean;
  };
  easy_pay_services?: string[];
  bank_accounts?: string[];
  is_test_mode: boolean;
  /** 희망배송일(영카트 de_hope_date_use · de_hope_date_after) — 고를 수 있는 날은 서버 날짜 기준 */
  hope_date?: HopeDateRule;
}

export type HopeDateRule = {
  use: boolean;
  after: number;
  min: string;
  max: string;
};

export type PaymentNotice = {
  tone: "info" | "error" | "success";
  title: string;
  message: string;
};

export const PAYMENT_NOTICE_AUTO_DISMISS_MS = 15000;

export interface PayMethodDef {
  value: string;
  label: string;
  settle_case: string;
  pg_method?: PaymentMethod;
}

export const PAYMENT_METHODS: PayMethodDef[] = [
  { value: "bank", label: "무통장입금", settle_case: "무통장" },
  {
    value: "card",
    label: "신용카드",
    settle_case: "신용카드",
    pg_method: "card",
  },
  {
    value: "vbank",
    label: "가상계좌",
    settle_case: "가상계좌",
    pg_method: "vbank",
  },
  {
    value: "iche",
    label: "실시간계좌이체",
    settle_case: "계좌이체",
    pg_method: "iche",
  },
  {
    value: "hp",
    label: "휴대폰결제",
    settle_case: "휴대폰",
    pg_method: "hp",
  },
  {
    value: "easy_pay",
    label: "간편결제",
    settle_case: "간편결제",
    pg_method: "easy_pay",
  },
  {
    value: "kakaopay",
    label: "KAKAOPAY",
    settle_case: "KAKAOPAY",
    pg_method: "kakaopay",
  },
];

export function isPaymentMethodEnabled(
  method: PayMethodDef,
  config: PaymentConfig | null
): boolean {
  if (!config) return method.value === "bank";
  if (method.value === "bank") return config.payment_methods.bank;
  if (method.value === "card") return config.payment_methods.card;
  if (method.value === "vbank") return config.payment_methods.vbank;
  if (method.value === "iche") return config.payment_methods.iche;
  if (method.value === "hp") return config.payment_methods.hp;
  if (method.value === "easy_pay") return config.payment_methods.easy_pay;
  if (method.value === "kakaopay") return !!config.payment_methods.kakaopay;
  return false;
}

export type EasyPayOption = {
  service: string;
  label: string;
  src: string;
  /** 칸에는 로고만 보이므로, 어느 PG 의 무엇인지는 포인터를 올렸을 때 뜨는 이 글로 알린다. */
  title?: string;
};

/* 영카트 주문서(shop/orderform.sub.php)가 label 의 title 에 적는 표기와 같은 말로 맞춘다. */
const EASY_PAY_GATEWAY_LABEL: Record<string, string> = {
  kcp: "NHN_KCP",
  nicepay: "NICEPAY",
};

/* 간편결제 서비스를 따로 고를 수 있는 PG 와 그 서비스들. 순서는 서버의 대표 서비스(pg_primary_easy_pay_service)
   고르는 순서와 같아 첫 칸이 곧 기본값이다. 영카트 주문서(orderform.sub.php)도 KCP · NICEPAY 일 때만 서비스마다
   칸을 따로 내고, 다른 PG(토스 · 이니시스 등)는 "간편결제" 한 칸으로 PG 창에서 고르게 한다.
   그림은 그누보드 설치본 img/ 에 늘 있는 것(영카트 주문서가 쓰는 것과 같다). */
const EASY_PAY_SERVICES: Record<string, EasyPayOption[]> = {
  kcp: [
    { service: "nhnkcp_naverpay", label: "네이버페이", src: "/img/ico-default-naverpay.png" },
    { service: "nhnkcp_kakaopay", label: "카카오페이", src: "/img/kakao.png" },
    { service: "nhnkcp_payco", label: "PAYCO", src: "/img/payco.png" },
  ],
  nicepay: [
    { service: "nicepay_naverpay", label: "네이버페이", src: "/img/ico-default-naverpay.png" },
    { service: "nicepay_kakaopay", label: "카카오페이", src: "/img/kakao.png" },
    { service: "nicepay_samsungpay", label: "삼성페이", src: "/img/samsungpay.png" },
    { service: "nicepay_paycopay", label: "PAYCO", src: "/img/payco.png" },
    { service: "nicepay_skpay", label: "SK페이", src: "/img/skpay11_icon.png" },
    { service: "nicepay_ssgpay", label: "SSGPAY", src: "/img/ssgpay_icon.png" },
    { service: "nicepay_lpay", label: "LPAY", src: "/img/lpay_logo.png" },
  ],
};

/** 지금 PG 에서 따로 고를 수 있는 간편결제 서비스(관리자가 켠 것만). 고를 수 없는 PG 면 빈 배열. */
export function easyPayOptions(config: Pick<PaymentConfig, "pg_service" | "easy_pay_services"> | null): EasyPayOption[] {
  if (!config) return [];
  const enabled = new Set(config.easy_pay_services || []);
  const gateway = EASY_PAY_GATEWAY_LABEL[config.pg_service] ?? config.pg_service.toUpperCase();
  return (EASY_PAY_SERVICES[config.pg_service] || [])
    .filter((option) => enabled.has(option.service))
    .map((option) => ({ ...option, title: `${gateway} - ${option.label}` }));
}

/**
 * 고른 간편결제 서비스를 결제 준비 응답의 PG 추가값에 적는다. 서버는 대표 서비스 하나를 채워 보내므로
 * 사용자가 다른 것을 골랐으면 그것으로 바꾼다. 서버가 켜 둔 목록(easy_pay_services)에 없는 값은 무시한다.
 */
export function withEasyPayService<T extends { kcp?: { easy_pay_services?: string[]; easy_pay_service?: string }; nicepay?: { easy_pay_services?: string[]; easy_pay_service?: string } }>(
  pgExtra: T | undefined,
  service: string
): T | undefined {
  if (!pgExtra || !service) return pgExtra;
  const pick = <E extends { easy_pay_services?: string[]; easy_pay_service?: string }>(extra: E | undefined): E | undefined =>
    extra && (extra.easy_pay_services || []).includes(service) ? { ...extra, easy_pay_service: service } : extra;
  return { ...pgExtra, kcp: pick(pgExtra.kcp), nicepay: pick(pgExtra.nicepay) };
}

export function easyPayButtonLabel(services?: string[]): string {
  const labels: Record<string, string> = {
    nhnkcp_payco: "PAYCO",
    nhnkcp_naverpay: "네이버페이",
    nhnkcp_kakaopay: "카카오페이",
    nicepay_samsungpay: "삼성페이",
    nicepay_naverpay: "네이버페이",
    nicepay_kakaopay: "카카오페이",
    nicepay_paycopay: "PAYCO",
    nicepay_skpay: "SK페이",
    nicepay_ssgpay: "SSGPAY",
    nicepay_lpay: "LPAY",
  };
  const unique = Array.from(
    new Set((services || []).map((service) => labels[service]).filter(Boolean))
  );

  return unique.length === 1 ? unique[0] : "간편결제";
}
