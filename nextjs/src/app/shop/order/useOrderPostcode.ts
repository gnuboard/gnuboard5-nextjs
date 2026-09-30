"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toastError } from "@/lib/toast";
import type { DaumPostcodeData } from "@/types/daum-postcode";
import type { AddressForm } from "./orderAddressHelpers";

export type OrderPostcodeTarget = "orderer" | "recipient";

type UseOrderPostcodeOptions = {
  setOrderer: Dispatch<SetStateAction<AddressForm>>;
  setRecipient: Dispatch<SetStateAction<AddressForm>>;
};

export function useOrderPostcode({
  setOrderer,
  setRecipient,
}: UseOrderPostcodeOptions) {
  return useCallback(
    (target: OrderPostcodeTarget) => {
      if (typeof window === "undefined" || !window.daum?.Postcode) {
        toastError(
          "우편번호 검색 서비스를 사용할 수 없습니다. 우편번호와 주소를 직접 입력해 주세요."
        );
        return;
      }

      new window.daum.Postcode({
        oncomplete: (data: DaumPostcodeData) => {
          const update = target === "orderer" ? setOrderer : setRecipient;
          update((prev) => ({
            ...prev,
            zip: data.zonecode,
            addr1: data.address,
            addr3: data.buildingName ? `(${data.buildingName})` : "",
            addr_jibeon: data.jibunAddress ?? "",
          }));
        },
      }).open();
    },
    [setOrderer, setRecipient]
  );
}
