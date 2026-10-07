"use client";

import type { HopeDateRule } from "./orderPaymentHelpers";
import {
  type AddressForm,
  type AddressSelection,
  type SavedAddress,
} from "./orderAddressHelpers";
import type { AddressFieldUpdater, PostcodeTarget } from "./OrderAddressFields";
import { RecipientAddressDetails } from "./RecipientAddressDetails";
import { RecipientAddressSelector } from "./RecipientAddressSelector";
import { RecipientDeliveryOptions } from "./RecipientDeliveryOptions";

type RecipientInfoSectionProps = {
  inputClassName: string;
  addressSelection: AddressSelection;
  handleAddressSelection: (selection: AddressSelection) => void;
  savedAddresses: SavedAddress[];
  openAddressModal: () => void;
  recipient: AddressForm;
  updateRecipient: AddressFieldUpdater;
  isMemberOrder: boolean;
  saveAsNewAddress: boolean;
  setSaveAsNewAddress: (checked: boolean) => void;
  newAddressSubject: string;
  setNewAddressSubject: (value: string) => void;
  newAddressDefault: boolean;
  setNewAddressDefault: (checked: boolean) => void;
  memo: string;
  setMemo: (value: string) => void;
  hopeDate: string;
  setHopeDate: (value: string) => void;
  hopeDateRule: HopeDateRule | null;
};

export function RecipientInfoSection({
  inputClassName,
  addressSelection,
  handleAddressSelection,
  savedAddresses,
  openAddressModal,
  recipient,
  updateRecipient,
  isMemberOrder,
  saveAsNewAddress,
  setSaveAsNewAddress,
  newAddressSubject,
  setNewAddressSubject,
  newAddressDefault,
  setNewAddressDefault,
  memo,
  setMemo,
  hopeDate,
  setHopeDate,
  hopeDateRule,
}: RecipientInfoSectionProps) {
  return (
    <section className="shop-order-section shop-order-section--recipient rounded-lg border p-6">
      <RecipientAddressSelector
        addressSelection={addressSelection}
        handleAddressSelection={handleAddressSelection}
        savedAddresses={savedAddresses}
        openAddressModal={openAddressModal}
      />
      <RecipientAddressDetails
        inputClassName={inputClassName}
        addressSelection={addressSelection}
        recipient={recipient}
        updateRecipient={updateRecipient}
        isMemberOrder={isMemberOrder}
        saveAsNewAddress={saveAsNewAddress}
        setSaveAsNewAddress={setSaveAsNewAddress}
        newAddressSubject={newAddressSubject}
        setNewAddressSubject={setNewAddressSubject}
        newAddressDefault={newAddressDefault}
        setNewAddressDefault={setNewAddressDefault}
      />
      <RecipientDeliveryOptions
        inputClassName={inputClassName}
        memo={memo}
        setMemo={setMemo}
        hopeDate={hopeDate}
        setHopeDate={setHopeDate}
        hopeDateRule={hopeDateRule}
      />
    </section>
  );
}
