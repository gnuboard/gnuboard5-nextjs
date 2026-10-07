import {
  type AddressForm,
  type AddressSelection,
} from "./orderAddressHelpers";
import type { PayMethodDef } from "./orderPaymentHelpers";
import type { AddressBookPayload, OrderBody } from "./orderSubmitTypes";
import {
  resolveRecipientAddress,
  shouldPersistAddress,
} from "./orderSubmitValidation";

type BuildOrderBodyInput = {
  orderer: AddressForm;
  recipient: AddressForm;
  addressSelection: AddressSelection;
  saveAsNewAddress: boolean;
  newAddressSubject: string;
  newAddressDefault: boolean;
  email: string;
  memo: string;
  hopeDate: string;
  guestPassword: string;
  isMemberOrder: boolean;
  methodDef: PayMethodDef;
  selectedCouponId: string;
  selectedSendCouponId: string;
  pointUse: number;
  directCheckout: boolean;
  directCtIds: string;
  paymentDevice: "mobile" | "pc";
  clientUid?: string;
};

export function buildAddressBookPayload(
  recipient: AddressForm,
  newAddressSubject: string,
  newAddressDefault: boolean
): AddressBookPayload {
  return {
    ad_subject: newAddressSubject || recipient.name,
    ad_default: newAddressDefault ? 1 : 0,
    ad_name: recipient.name,
    ad_tel: recipient.tel,
    ad_hp: recipient.hp,
    ad_zip1: recipient.zip.substring(0, 3),
    ad_zip2: recipient.zip.substring(3),
    ad_addr1: recipient.addr1,
    ad_addr2: recipient.addr2,
    ad_addr3: recipient.addr3,
    ad_jibeon: recipient.addr_jibeon,
  };
}

export function buildOrderBody({
  orderer,
  recipient,
  addressSelection,
  saveAsNewAddress,
  newAddressSubject,
  newAddressDefault,
  email,
  memo,
  hopeDate,
  guestPassword,
  isMemberOrder,
  methodDef,
  selectedCouponId,
  selectedSendCouponId,
  pointUse,
  directCheckout,
  directCtIds,
  paymentDevice,
  clientUid,
}: BuildOrderBodyInput): OrderBody {
  const resolvedRecipient = resolveRecipientAddress(
    orderer,
    recipient,
    addressSelection
  );

  return {
    od_name: orderer.name,
    od_tel: orderer.tel,
    od_hp: orderer.hp,
    od_email: email,
    od_zip: orderer.zip,
    od_addr1: orderer.addr1,
    od_addr2: orderer.addr2,
    od_addr3: orderer.addr3,
    od_addr_jibeon: orderer.addr_jibeon,
    od_b_name: resolvedRecipient.name,
    od_b_tel: resolvedRecipient.tel,
    od_b_hp: resolvedRecipient.hp,
    od_b_zip1: resolvedRecipient.zip.substring(0, 3),
    od_b_zip2: resolvedRecipient.zip.substring(3),
    od_b_addr1: resolvedRecipient.addr1,
    od_b_addr2: resolvedRecipient.addr2,
    od_b_addr3: resolvedRecipient.addr3,
    od_b_addr_jibeon: resolvedRecipient.addr_jibeon,
    od_memo: memo,
    ...(shouldPersistAddress(addressSelection, saveAsNewAddress)
      ? {
          ad_subject: newAddressSubject || resolvedRecipient.name,
          ad_default: newAddressDefault ? 1 : 0,
          save_address: 1,
        }
      : {}),
    od_settle_case: methodDef.settle_case,
    ...(!isMemberOrder ? { od_pwd: guestPassword.trim() } : {}),
    ...(directCtIds ? { ct_ids: directCtIds } : {}),
    ...(directCheckout ? { direct: 1 } : {}),
    ...(selectedCouponId ? { cp_id: selectedCouponId } : {}),
    ...(selectedSendCouponId ? { cp_id_send: selectedSendCouponId } : {}),
    ...(pointUse > 0 ? { point_use: pointUse } : {}),
    ...(hopeDate ? { od_hope_date: hopeDate } : {}),
    payment_device: paymentDevice,
    ...(clientUid ? { client_uid: clientUid } : {}),
  };
}
