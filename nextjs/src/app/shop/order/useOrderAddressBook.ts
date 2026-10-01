"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import {
  EMPTY_ADDRESS,
  savedAddressToAddressForm,
  type AddressForm,
  type AddressSelection,
  type SavedAddress,
} from "./orderAddressHelpers";
import { useOrderAddressBookMutations } from "./useOrderAddressBookMutations";

type UseOrderAddressBookOptions = {
  addressSelection: AddressSelection;
  setAddressSelection: Dispatch<SetStateAction<AddressSelection>>;
  savedAddresses: SavedAddress[];
  setSavedAddresses: Dispatch<SetStateAction<SavedAddress[]>>;
  setOrderer: Dispatch<SetStateAction<AddressForm>>;
  setRecipient: Dispatch<SetStateAction<AddressForm>>;
};

export function useOrderAddressBook({
  addressSelection,
  setAddressSelection,
  savedAddresses,
  setSavedAddresses,
  setOrderer,
  setRecipient,
}: UseOrderAddressBookOptions) {
  const [showAddressModal, setShowAddressModal] = useState(false);

  const updateOrderer = useCallback(
    (field: keyof AddressForm, value: string) => {
      setOrderer((prev) => ({ ...prev, [field]: value }));
    },
    [setOrderer]
  );

  const updateRecipient = useCallback(
    (field: keyof AddressForm, value: string) => {
      setRecipient((prev) => ({ ...prev, [field]: value }));
    },
    [setRecipient]
  );

  const handleAddressSelection = useCallback(
    (selection: AddressSelection) => {
      setAddressSelection(selection);
      if (selection === "same") return;

      if (selection === "new") {
        setRecipient(EMPTY_ADDRESS);
        return;
      }

      const addr = savedAddresses.find((item) => item.ad_id === selection);
      if (!addr) return;

      setRecipient(savedAddressToAddressForm(addr));
    },
    [savedAddresses, setAddressSelection, setRecipient]
  );

  const handleSelectFromModal = useCallback(
    (addr: SavedAddress) => {
      handleAddressSelection(addr.ad_id);
      setShowAddressModal(false);
    },
    [handleAddressSelection]
  );

  const {
    updatingAddressId,
    handleDeleteAddress,
    handleUpdateAddressSubject,
    handleSetDefaultAddress,
  } = useOrderAddressBookMutations({
    addressSelection,
    setSavedAddresses,
    handleAddressSelection,
  });

  return {
    showAddressModal,
    setShowAddressModal,
    updatingAddressId,
    updateOrderer,
    updateRecipient,
    handleAddressSelection,
    handleSelectFromModal,
    handleDeleteAddress,
    handleUpdateAddressSubject,
    handleSetDefaultAddress,
  };
}
