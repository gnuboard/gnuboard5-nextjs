"use client";

import { g5PathForRuntime } from "@/lib/config";
import {
  PAYMENT_METHODS,
  easyPayButtonLabel,
  easyPayOptions,
  isPaymentMethodEnabled,
  type EasyPayOption,
  type PaymentConfig,
} from "./orderPaymentHelpers";

/*
 * 결제수단 칸의 아이콘.
 *
 * 영카트 주문서(shop/orderform.sub.php)는 라벨에 .bank_icon 같은 클래스를 붙이고 테마 CSS 가
 * 설치본 img/ 의 그림을 배경으로 깐다. 같은 화면으로 보이려면 같은 그림을 써야 하므로, 여기서도
 * 그 파일을 그대로 가리킨다 — 그누보드 설치본이면 어디에나 있는 것들이다.
 * 간편결제 브랜드 로고도 이미 같은 방식이다(orderPaymentHelpers 의 EASY_PAY_SERVICES).
 */
const PAY_METHOD_ICONS: Record<string, string> = {
  bank: "/img/pay_icon1.png",
  vbank: "/img/pay_icon2.png",
  iche: "/img/pay_icon2.png",
  hp: "/img/pay_icon3.png",
  card: "/img/pay_icon4.png",
  kakaopay: "/img/kakao.png",
};

const TILE_CLASS =
  "shop-pay-method flex min-h-[58px] min-w-0 items-center gap-2.5 whitespace-normal break-keep rounded-[9px] border px-3 py-2 text-left text-[0.8125rem] font-medium leading-snug transition-colors";

function tileStateClass(pressed: boolean) {
  return pressed
    ? "border-primary bg-primary/5 font-bold text-primary shadow-[inset_0_0_0_1px_var(--color-primary)]"
    : "border-border hover:border-foreground/40 hover:bg-accent";
}

/**
 * 간편결제 서비스 한 칸 — 브랜드 로고만 보이고 이름은 로고의 alt 로 읽힌다(영카트 주문서와 같다).
 *
 * 로고 파일은 브랜드마다 가로세로 비율도, 그림 둘레의 여백도 제각각이다. 높이만 맞춰 두면
 * (h-4 w-auto) 가로가 제멋대로 늘어나 어떤 칸은 글자가 깨알같고 어떤 칸은 칸을 꽉 채운다.
 * 그래서 로고마다 같은 크기의 상자를 주고 그 안에서 비율을 지켜 맞춘다(object-contain).
 * 로고만 봐서는 어느 PG 의 무엇인지 모르니 title 로 알린다 — 영카트 주문서도 같다.
 */
function EasyPayServiceTile({ option, pressed, onSelect }: { option: EasyPayOption; pressed: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={pressed}
      title={option.title ?? option.label}
      className={`${TILE_CLASS} shop-pay-method--brand justify-center ${tileStateClass(pressed)}`}
    >
      <img
        src={g5PathForRuntime(option.src)}
        alt={option.label}
        className="shop-pay-method-logo max-h-6 w-full max-w-[88px] object-contain"
        loading="lazy"
      />
    </button>
  );
}

type OrderPaymentMethodSectionProps = {
  inputClassName: string;
  paymentMethod: string;
  setPaymentMethod: (value: string) => void;
  easyPayService: string;
  setEasyPayService: (value: string) => void;
  paymentConfig: PaymentConfig | null;
  bankAccounts: string[];
  bankAccount: string;
  setBankAccount: (value: string) => void;
  depositName: string;
  setDepositName: (value: string) => void;
};

export function OrderPaymentMethodSection({
  inputClassName,
  paymentMethod,
  setPaymentMethod,
  easyPayService,
  setEasyPayService,
  paymentConfig,
  bankAccounts,
  bankAccount,
  setBankAccount,
  depositName,
  setDepositName,
}: OrderPaymentMethodSectionProps) {
  const easyServices = easyPayOptions(paymentConfig);
  return (
    <section className="shop-order-section shop-order-section--payment rounded-lg border p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold">결제 수단</h2>
      </div>
      {/* 오른쪽 좁은 칸에 들어가므로 두 칸 격자로 둔다 — 레퍼런스 주문서의 #sod_frm_paysel 과 같다. */}
      <div className="shop-pay-methods grid min-w-0 grid-cols-2 gap-2.5">
        {PAYMENT_METHODS.filter((method) =>
          isPaymentMethodEnabled(method, paymentConfig)
        ).map((method) => {
          if (method.value === "easy_pay" && easyServices.length > 0) {
            /* 서비스를 따로 고를 수 있는 PG(KCP · NICEPAY)면 "간편결제" 한 칸 대신 서비스마다 칸을 낸다.
               아무것도 안 골랐으면(첫 진입) 첫 칸이 서버의 대표 서비스와 같은 기본값이다. */
            const current = easyPayService || easyServices[0].service;
            return easyServices.map((option) => (
              <EasyPayServiceTile
                key={option.service}
                option={option}
                pressed={paymentMethod === "easy_pay" && current === option.service}
                onSelect={() => {
                  setEasyPayService(option.service);
                  setPaymentMethod("easy_pay");
                }}
              />
            ));
          }
          const iconSrc = PAY_METHOD_ICONS[method.value];
          const pressed = paymentMethod === method.value;
          const label =
            method.value === "easy_pay"
              ? easyPayButtonLabel(paymentConfig?.easy_pay_services)
              : method.label;
          return (
            <button
              key={method.value}
              type="button"
              onClick={() => setPaymentMethod(method.value)}
              aria-pressed={pressed}
              title={label}
              className={`${TILE_CLASS} ${tileStateClass(pressed)} ${
                /* 그림이 없는 수단(서비스를 못 고르는 PG 의 "간편결제" 한 칸)은 이름을
                   가운데 둔다 — 왼쪽에 두면 그림이 빠진 자리처럼 보인다. */
                iconSrc ? "" : "justify-center text-center"
              }`}
            >
              {iconSrc ? (
                <img
                  src={g5PathForRuntime(iconSrc)}
                  alt=""
                  aria-hidden
                  className="shop-pay-method-icon h-7 w-9 shrink-0 object-contain"
                  loading="lazy"
                />
              ) : null}
              <span className="shop-pay-method-label min-w-0">{label}</span>
            </button>
          );
        })}
      </div>

      {paymentMethod === "bank" && (
        <div className="mt-4 space-y-3 rounded-md border bg-muted/30 p-4">
          <div>
            <label htmlFor="order-bank-account" className="mb-1 block text-sm font-medium">
              입금 계좌 <span className="text-red-700">*</span>
            </label>
            <select
              id="order-bank-account"
              name="bank_account"
              aria-label="입금 계좌"
              value={bankAccount}
              onChange={(event) => setBankAccount(event.target.value)}
              className={inputClassName}
              disabled={bankAccounts.length === 0}
            >
              {bankAccounts.length === 0 ? (
                <option value="">등록된 입금 계좌가 없습니다</option>
              ) : (
                bankAccounts.map((account) => (
                  <option key={account} value={account}>
                    {account}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label htmlFor="order-deposit-name" className="mb-1 block text-sm font-medium">
              입금자명 <span className="text-red-700">*</span>
            </label>
            <input
              id="order-deposit-name"
              name="deposit_name"
              aria-label="입금자명"
              type="text"
              value={depositName}
              onChange={(event) => setDepositName(event.target.value)}
              placeholder="입금자명"
              required
              className={inputClassName}
            />
          </div>
        </div>
      )}
    </section>
  );
}
