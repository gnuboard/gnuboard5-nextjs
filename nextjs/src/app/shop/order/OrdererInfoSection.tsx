"use client";

import { type AddressForm } from "./orderAddressHelpers";
import {
  AddressFields,
  type AddressFieldUpdater,
  type PostcodeTarget,
} from "./OrderAddressFields";

type OrdererInfoSectionProps = {
  inputClassName: string;
  orderer: AddressForm;
  updateOrderer: AddressFieldUpdater;
  isMemberOrder: boolean;
  guestPassword: string;
  setGuestPassword: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
};

export function OrdererInfoSection({
  inputClassName,
  orderer,
  updateOrderer,
  isMemberOrder,
  guestPassword,
  setGuestPassword,
  email,
  setEmail,
}: OrdererInfoSectionProps) {
  return (
    <section className="shop-order-section shop-order-section--orderer rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-bold">주문하시는 분</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <AddressFields
          inputClassName={inputClassName}
          address={orderer}
          updateAddress={updateOrderer}
          postcodeTarget="orderer"
        />
        {!isMemberOrder && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">
              비회원 주문 비밀번호 <span className="text-red-700">*</span>
            </label>
            <input
              type="password"
              value={guestPassword}
              onChange={(event) => setGuestPassword(event.target.value)}
              className={inputClassName}
              autoComplete="new-password"
              pattern="[A-Za-z0-9]{3,}"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              주문조회에 사용할 영문/숫자 3자리 이상 비밀번호입니다.
            </p>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">이메일</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="example@example.com"
            className={inputClassName}
          />
        </div>
      </div>
    </section>
  );
}
