"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { toastError, toastSuccess } from "@/lib/toast";
import type { AddressSelection, SavedAddress } from "./orderAddressHelpers";
import {
  deleteSavedAddress,
  markSavedAddressAsDefault,
  replaceSavedAddress,
  setSavedAddressAsDefault,
  updateSavedAddressSubject,
} from "./orderAddressBookActions";

type UseOrderAddressBookMutationsOptions = {
  addressSelection: AddressSelection;
  setSavedAddresses: Dispatch<SetStateAction<SavedAddress[]>>;
  handleAddressSelection: (selection: AddressSelection) => void;
};

export function useOrderAddressBookMutations({
  addressSelection,
  setSavedAddresses,
  handleAddressSelection,
}: UseOrderAddressBookMutationsOptions) {
  const [updatingAddressId, setUpdatingAddressId] = useState<number | null>(null);

  const handleDeleteAddress = useCallback(
    async (ad_id: number) => {
      if (!confirm("배송지를 삭제하시겠습니까?")) return;
      try {
        await deleteSavedAddress(ad_id);
        setSavedAddresses((prev) => prev.filter((item) => item.ad_id !== ad_id));
        if (addressSelection === ad_id) {
          handleAddressSelection("same");
        }
      } catch {
        toastError("삭제에 실패했습니다.");
      }
    },
    [addressSelection, handleAddressSelection, setSavedAddresses]
  );

  const handleUpdateAddressSubject = useCallback(
    async (addr: SavedAddress, subject: string) => {
      const nextSubject = subject.trim();
      if (nextSubject === (addr.ad_subject || "")) return;

      setUpdatingAddressId(addr.ad_id);
      try {
        const updated = await updateSavedAddressSubject(addr, nextSubject);
        setSavedAddresses((prev) => replaceSavedAddress(prev, updated));
        toastSuccess("배송지명이 수정되었습니다.");
      } catch {
        setSavedAddresses((prev) =>
          prev.map((item) =>
            item.ad_id === addr.ad_id
              ? { ...item, ad_subject: addr.ad_subject }
              : item
          )
        );
        toastError("배송지명을 수정하지 못했습니다.");
      } finally {
        setUpdatingAddressId(null);
      }
    },
    [setSavedAddresses]
  );

  const handleSetDefaultAddress = useCallback(
    async (addr: SavedAddress) => {
      if (addr.ad_default === 1) return;

      setUpdatingAddressId(addr.ad_id);
      try {
        const updated = await setSavedAddressAsDefault(addr);
        setSavedAddresses((prev) => markSavedAddressAsDefault(prev, updated));
        toastSuccess("기본배송지가 변경되었습니다.");
      } catch {
        toastError("기본배송지를 변경하지 못했습니다.");
      } finally {
        setUpdatingAddressId(null);
      }
    },
    [setSavedAddresses]
  );

  return {
    updatingAddressId,
    handleDeleteAddress,
    handleUpdateAddressSubject,
    handleSetDefaultAddress,
  };
}
