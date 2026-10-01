"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  KOREAN_PHONE_PATTERN,
  KOREAN_ZIP_PATTERN,
  normalizeKoreanZipInput,
} from "@/lib/address-validation";
import { type AddressForm } from "./orderAddressHelpers";
import { PostcodeSearchPanel } from "./PostcodeSearchPanel";

export type AddressFieldUpdater = (
  field: keyof AddressForm,
  value: string
) => void;
export type PostcodeTarget = "orderer" | "recipient";

type AddressFieldsProps = {
  inputClassName: string;
  address: AddressForm;
  updateAddress: AddressFieldUpdater;
  postcodeTarget: PostcodeTarget;
};

const POSTCODE_PANEL_LABEL: Record<PostcodeTarget, string> = {
  orderer: "주문하시는 분",
  recipient: "받는 분",
};

export function AddressFields({
  inputClassName,
  address,
  updateAddress,
  postcodeTarget,
}: AddressFieldsProps) {
  const fieldId = (field: string) => `order-${postcodeTarget}-${field}`;
  const [postcodeOpen, setPostcodeOpen] = useState(false);

  return (
    <>
      <div className="sm:col-span-2">
        <label htmlFor={fieldId("name")} className="mb-1 block text-sm font-medium">
          이름 <span className="text-red-700">*</span>
        </label>
        <input
          id={fieldId("name")}
          name={`${postcodeTarget}_name`}
          type="text"
          value={address.name}
          onChange={(event) => updateAddress("name", event.target.value)}
          required
          className={inputClassName}
        />
      </div>
      <div>
        <label htmlFor={fieldId("tel")} className="mb-1 block text-sm font-medium">전화번호</label>
        <input
          id={fieldId("tel")}
          name={`${postcodeTarget}_tel`}
          type="tel"
          value={address.tel}
          onChange={(event) => updateAddress("tel", event.target.value)}
          placeholder="02-000-0000"
          pattern={KOREAN_PHONE_PATTERN}
          title="전화번호를 올바르게 입력해 주세요."
          className={inputClassName}
        />
      </div>
      <div>
        <label htmlFor={fieldId("hp")} className="mb-1 block text-sm font-medium">
          휴대폰번호 <span className="text-red-700">*</span>
        </label>
        <input
          id={fieldId("hp")}
          name={`${postcodeTarget}_hp`}
          type="tel"
          value={address.hp}
          onChange={(event) => updateAddress("hp", event.target.value)}
          placeholder="010-0000-0000"
          pattern={KOREAN_PHONE_PATTERN}
          title="휴대폰 번호를 올바르게 입력해 주세요."
          required
          className={inputClassName}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={fieldId("zip")} className="mb-1 block text-sm font-medium">
          우편번호 <span className="text-red-700">*</span>
        </label>
        <div className="flex gap-2">
          <input
            id={fieldId("zip")}
            name={`${postcodeTarget}_zip`}
            type="text"
            value={address.zip}
            onChange={(event) =>
              updateAddress("zip", normalizeKoreanZipInput(event.target.value))
            }
            placeholder="우편번호"
            inputMode="numeric"
            maxLength={5}
            pattern={KOREAN_ZIP_PATTERN}
            title="우편번호 5자리를 입력해 주세요."
            required
            className={`${inputClassName} max-w-[140px]`}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setPostcodeOpen((prev) => !prev)}
            aria-expanded={postcodeOpen}
            aria-controls={fieldId("postcode-panel")}
          >
            {postcodeOpen ? "검색 닫기" : "우편번호 검색"}
          </Button>
        </div>
        <div id={fieldId("postcode-panel")}>
          <PostcodeSearchPanel
            open={postcodeOpen}
            label={POSTCODE_PANEL_LABEL[postcodeTarget]}
            onClose={() => setPostcodeOpen(false)}
            onComplete={(data) => {
              updateAddress("zip", data.zonecode);
              updateAddress("addr1", data.address);
              updateAddress("addr3", data.buildingName ? `(${data.buildingName})` : "");
              updateAddress("addr_jibeon", data.jibunAddress ?? "");
            }}
          />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={fieldId("addr1")} className="mb-1 block text-sm font-medium">
          기본주소 <span className="text-red-700">*</span>
        </label>
        <input
          id={fieldId("addr1")}
          name={`${postcodeTarget}_addr1`}
          type="text"
          value={address.addr1}
          onChange={(event) => updateAddress("addr1", event.target.value)}
          required
          className={inputClassName}
        />
      </div>
      <div>
        <label htmlFor={fieldId("addr2")} className="mb-1 block text-sm font-medium">상세주소</label>
        <input
          id={fieldId("addr2")}
          name={`${postcodeTarget}_addr2`}
          type="text"
          value={address.addr2}
          onChange={(event) => updateAddress("addr2", event.target.value)}
          placeholder="상세주소"
          className={inputClassName}
        />
      </div>
      <div>
        <label htmlFor={fieldId("addr3")} className="mb-1 block text-sm font-medium">참고항목</label>
        <input
          id={fieldId("addr3")}
          name={`${postcodeTarget}_addr3`}
          type="text"
          value={address.addr3}
          onChange={(event) => updateAddress("addr3", event.target.value)}
          placeholder="(건물명)"
          className={inputClassName}
        />
      </div>
    </>
  );
}
