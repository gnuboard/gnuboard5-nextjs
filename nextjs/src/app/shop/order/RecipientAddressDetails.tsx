"use client";

import type {
  AddressForm,
  AddressSelection,
} from "./orderAddressHelpers";
import {
  AddressFields,
  type AddressFieldUpdater,
  type PostcodeTarget,
} from "./OrderAddressFields";

type RecipientAddressDetailsProps = {
  inputClassName: string;
  addressSelection: AddressSelection;
  recipient: AddressForm;
  updateRecipient: AddressFieldUpdater;
  isMemberOrder: boolean;
  saveAsNewAddress: boolean;
  setSaveAsNewAddress: (checked: boolean) => void;
  newAddressSubject: string;
  setNewAddressSubject: (value: string) => void;
  newAddressDefault: boolean;
  setNewAddressDefault: (checked: boolean) => void;
};

export function RecipientAddressDetails({
  inputClassName,
  addressSelection,
  recipient,
  updateRecipient,
  isMemberOrder,
  saveAsNewAddress,
  setSaveAsNewAddress,
  newAddressSubject,
  setNewAddressSubject,
  newAddressDefault,
  setNewAddressDefault,
}: RecipientAddressDetailsProps) {
  if (addressSelection === "same") return null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <AddressFields
          inputClassName={inputClassName}
          address={recipient}
          updateAddress={updateRecipient}
          postcodeTarget="recipient"
        />
      </div>

      {isMemberOrder && addressSelection === "new" && (
        <div className="mt-4 space-y-3 rounded-md border bg-muted/30 p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={saveAsNewAddress}
              onChange={(event) => setSaveAsNewAddress(event.target.checked)}
              className="h-4 w-4 rounded"
            />
            배송지 목록에 저장
          </label>
          {saveAsNewAddress && (
            <div className="space-y-3 pl-6">
              <div>
                <label className="mb-1 block text-sm">배송지명</label>
                <input
                  type="text"
                  value={newAddressSubject}
                  onChange={(event) =>
                    setNewAddressSubject(event.target.value)
                  }
                  placeholder="집, 회사"
                  className={inputClassName}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newAddressDefault}
                  onChange={(event) =>
                    setNewAddressDefault(event.target.checked)
                  }
                  className="h-4 w-4 rounded"
                />
                기본배송지로 설정
              </label>
            </div>
          )}
        </div>
      )}
    </>
  );
}
