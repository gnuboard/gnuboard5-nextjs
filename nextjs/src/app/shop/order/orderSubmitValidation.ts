import {
  type AddressForm,
  type AddressSelection,
} from "./orderAddressHelpers";
import {
  PAYMENT_METHODS,
  type PayMethodDef,
} from "./orderPaymentHelpers";
import {
  isValidKoreanPhone,
  isValidKoreanZip,
} from "@/lib/address-validation";

type ValidateOrderSubmissionInput = {
  orderer: AddressForm;
  recipient: AddressForm;
  addressSelection: AddressSelection;
  paymentMethod: string;
  bankAccount: string;
  depositName: string;
  guestPassword: string;
  isMemberOrder: boolean;
};

export type OrderSubmitValidationResult =
  | {
      ok: true;
      methodDef: PayMethodDef;
      recipient: AddressForm;
    }
  | {
      ok: false;
      message?: string;
    };

function hasRequiredAddressFields(address: AddressForm): boolean {
  return !!(address.name && address.hp && address.zip && address.addr1);
}

function validateAddressFormat(
  address: AddressForm,
  label: string
): string | null {
  if (!isValidKoreanPhone(address.hp)) {
    return `${label} 휴대폰 번호를 올바르게 입력해 주세요.`;
  }
  if (!isValidKoreanZip(address.zip)) {
    return `${label} 우편번호는 5자리 숫자로 입력해 주세요.`;
  }
  return null;
}

export function resolveRecipientAddress(
  orderer: AddressForm,
  recipient: AddressForm,
  addressSelection: AddressSelection
): AddressForm {
  return addressSelection === "same" ? orderer : recipient;
}

export function shouldPersistAddress(
  addressSelection: AddressSelection,
  saveAsNewAddress: boolean
): boolean {
  return addressSelection === "new" && saveAsNewAddress;
}

export function validateOrderSubmission({
  orderer,
  recipient,
  addressSelection,
  paymentMethod,
  bankAccount,
  depositName,
  guestPassword,
  isMemberOrder,
}: ValidateOrderSubmissionInput): OrderSubmitValidationResult {
  if (!hasRequiredAddressFields(orderer)) {
    return { ok: false, message: "주문자 정보를 모두 입력해주세요." };
  }

  const ordererFormatError = validateAddressFormat(orderer, "주문자");
  if (ordererFormatError) {
    return { ok: false, message: ordererFormatError };
  }

  const resolvedRecipient = resolveRecipientAddress(
    orderer,
    recipient,
    addressSelection
  );
  if (!hasRequiredAddressFields(resolvedRecipient)) {
    return { ok: false, message: "받으시는 분 정보를 모두 입력해주세요." };
  }

  const recipientFormatError = validateAddressFormat(
    resolvedRecipient,
    "받는 분"
  );
  if (recipientFormatError) {
    return { ok: false, message: recipientFormatError };
  }

  const methodDef = PAYMENT_METHODS.find(
    (method) => method.value === paymentMethod
  );
  if (!methodDef) return { ok: false };

  if (methodDef.value === "bank" && !depositName) {
    return { ok: false, message: "입금자명을 입력해주세요." };
  }
  if (methodDef.value === "bank" && !bankAccount) {
    return {
      ok: false,
      message: "무통장 입금 계좌가 설정되어 있지 않습니다.",
    };
  }

  if (!isMemberOrder && !/^[A-Za-z0-9]{3,}$/.test(guestPassword.trim())) {
    return {
      ok: false,
      message:
        "비회원 주문조회에 사용할 비밀번호를 영문/숫자 3자리 이상 입력해주세요.",
    };
  }

  return { ok: true, methodDef, recipient: resolvedRecipient };
}
