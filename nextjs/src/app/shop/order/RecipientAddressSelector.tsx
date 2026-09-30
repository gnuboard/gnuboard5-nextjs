"use client";

import { Button } from "@/components/ui/button";
import type {
  AddressSelection,
  SavedAddress,
} from "./orderAddressHelpers";

type RecipientAddressSelectorProps = {
  addressSelection: AddressSelection;
  handleAddressSelection: (selection: AddressSelection) => void;
  savedAddresses: SavedAddress[];
  openAddressModal: () => void;
};

export function RecipientAddressSelector({
  addressSelection,
  handleAddressSelection,
  savedAddresses,
  openAddressModal,
}: RecipientAddressSelectorProps) {
  const selectedSavedAddress =
    typeof addressSelection === "number"
      ? savedAddresses.find((address) => address.ad_id === addressSelection)
      : undefined;

  return (
    <>
      <div className="shop-order-section-head mb-4">
        <h2 className="text-lg font-bold">받으시는 분</h2>
        <div className="shop-order-address-choice flex min-w-0 flex-wrap gap-2">
          <Button
            type="button"
            variant={addressSelection === "same" ? "default" : "outline"}
            size="sm"
            onClick={() => handleAddressSelection("same")}
          >
            주문자와 동일
          </Button>
          {savedAddresses.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openAddressModal}
            >
              배송지 목록 ({savedAddresses.length})
            </Button>
          )}
          <Button
            type="button"
            variant={addressSelection === "new" ? "default" : "outline"}
            size="sm"
            onClick={() => handleAddressSelection("new")}
          >
            신규 배송지
          </Button>
        </div>
      </div>

      {selectedSavedAddress && (
        <div className="mb-4 rounded-md border bg-primary/5 p-3 text-sm">
          <span className="font-medium">선택한 배송지: </span>
          {selectedSavedAddress.ad_subject || selectedSavedAddress.ad_name} -{" "}
          {selectedSavedAddress.ad_addr1}
        </div>
      )}
    </>
  );
}
