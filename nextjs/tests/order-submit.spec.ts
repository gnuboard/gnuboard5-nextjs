import { expect, test } from "@playwright/test";
import type { AddressForm } from "../src/app/shop/order/orderAddressHelpers";
import type { PayMethodDef } from "../src/app/shop/order/orderPaymentHelpers";
import {
  buildAddressBookPayload,
  buildOrderBody,
} from "../src/app/shop/order/orderSubmitPayload";
import {
  resolveRecipientAddress,
  shouldPersistAddress,
  validateOrderSubmission,
} from "../src/app/shop/order/orderSubmitValidation";

function address(overrides: Partial<AddressForm> = {}): AddressForm {
  return {
    name: "Orderer",
    tel: "02-1234-5678",
    hp: "010-1234-5678",
    zip: "12345",
    addr1: "Seoul",
    addr2: "101",
    addr3: "Extra",
    addr_jibeon: "N",
    ...overrides,
  };
}

const bankMethod: PayMethodDef = {
  value: "bank",
  label: "Bank",
  settle_case: "Bank transfer",
};

test.describe("order submit validation", () => {
  test("resolves recipient address based on address selection", () => {
    const orderer = address({ name: "Orderer" });
    const recipient = address({ name: "Recipient" });

    expect(resolveRecipientAddress(orderer, recipient, "same")).toBe(orderer);
    expect(resolveRecipientAddress(orderer, recipient, "new")).toBe(recipient);
    expect(resolveRecipientAddress(orderer, recipient, 3)).toBe(recipient);
  });

  test("persists only new addresses explicitly requested by the user", () => {
    expect(shouldPersistAddress("new", true)).toBe(true);
    expect(shouldPersistAddress("new", false)).toBe(false);
    expect(shouldPersistAddress("same", true)).toBe(false);
    expect(shouldPersistAddress(7, true)).toBe(false);
  });

  test("accepts a complete guest bank order", () => {
    const recipient = address({ name: "Recipient" });
    const result = validateOrderSubmission({
      orderer: address(),
      recipient,
      addressSelection: "new",
      paymentMethod: "bank",
      bankAccount: "Bank 123-456",
      depositName: "Buyer",
      guestPassword: "abc123",
      isMemberOrder: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.methodDef.value).toBe("bank");
    expect(result.recipient).toBe(recipient);
  });

  test("rejects missing required fields before order submission", () => {
    const validInput = {
      orderer: address(),
      recipient: address({ name: "Recipient" }),
      addressSelection: "new" as const,
      paymentMethod: "bank",
      bankAccount: "Bank 123-456",
      depositName: "Buyer",
      guestPassword: "abc123",
      isMemberOrder: false,
    };

    expect(
      validateOrderSubmission({
        ...validInput,
        orderer: address({ hp: "" }),
      }).ok
    ).toBe(false);
    expect(
      validateOrderSubmission({
        ...validInput,
        recipient: address({ addr1: "" }),
      }).ok
    ).toBe(false);
    expect(
      validateOrderSubmission({
        ...validInput,
        depositName: "",
      }).ok
    ).toBe(false);
    expect(
      validateOrderSubmission({
        ...validInput,
        bankAccount: "",
      }).ok
    ).toBe(false);
    expect(
      validateOrderSubmission({
        ...validInput,
        guestPassword: "ab",
      }).ok
    ).toBe(false);
  });
});

test.describe("order hope date (YoungCart de_hope_date_use · de_hope_date_after)", () => {
  const base = {
    orderer: address(),
    recipient: address({ name: "Recipient" }),
    addressSelection: "new" as const,
    paymentMethod: "bank",
    bankAccount: "Bank 123-456",
    depositName: "Buyer",
    guestPassword: "abc123",
    isMemberOrder: false,
  };
  const rule = { use: true, after: 3, min: "2026-10-10", max: "2026-10-16" };

  test("is ignored when the shop does not use it", () => {
    expect(validateOrderSubmission({ ...base, hopeDate: "", hopeDateRule: { ...rule, use: false } }).ok).toBe(true);
    expect(validateOrderSubmission({ ...base, hopeDate: "", hopeDateRule: null }).ok).toBe(true);
  });

  test("must be chosen when used", () => {
    const result = validateOrderSubmission({ ...base, hopeDate: "", hopeDateRule: rule });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toBe("희망배송일을 선택하여 주십시오.");
  });

  test("must fall inside the allowed 7 days", () => {
    expect(validateOrderSubmission({ ...base, hopeDate: "2026-10-09", hopeDateRule: rule }).ok).toBe(false);
    expect(validateOrderSubmission({ ...base, hopeDate: "2026-10-17", hopeDateRule: rule }).ok).toBe(false);
    expect(validateOrderSubmission({ ...base, hopeDate: "2026-10-10", hopeDateRule: rule }).ok).toBe(true);
    expect(validateOrderSubmission({ ...base, hopeDate: "2026-10-16", hopeDateRule: rule }).ok).toBe(true);
  });
});

test.describe("order submit payload", () => {
  test("builds address book payload with zip split and fallback subject", () => {
    const payload = buildAddressBookPayload(
      address({
        name: "Recipient",
        tel: "02-0000-0000",
        hp: "010-0000-0000",
        zip: "54321",
        addr1: "Busan",
        addr2: "202",
        addr3: "",
        addr_jibeon: "Y",
      }),
      "",
      true
    );

    expect(payload).toEqual({
      ad_subject: "Recipient",
      ad_default: 1,
      ad_name: "Recipient",
      ad_tel: "02-0000-0000",
      ad_hp: "010-0000-0000",
      ad_zip1: "543",
      ad_zip2: "21",
      ad_addr1: "Busan",
      ad_addr2: "202",
      ad_addr3: "",
      ad_jibeon: "Y",
    });
  });

  test("builds guest order body with optional checkout fields", () => {
    const body = buildOrderBody({
      orderer: address({
        name: "Buyer",
        tel: "02-1111-2222",
        hp: "010-1111-2222",
        zip: "12345",
        addr1: "Seoul",
        addr2: "1F",
        addr3: "",
        addr_jibeon: "N",
      }),
      recipient: address({
        name: "Receiver",
        tel: "02-3333-4444",
        hp: "010-3333-4444",
        zip: "67890",
        addr1: "Incheon",
        addr2: "2F",
        addr3: "Door",
        addr_jibeon: "Y",
      }),
      addressSelection: "new",
      saveAsNewAddress: true,
      newAddressSubject: "",
      newAddressDefault: true,
      email: "buyer@example.com",
      memo: "Leave at door",
      hopeDate: "2026-06-20",
      guestPassword: "  guest123  ",
      isMemberOrder: false,
      methodDef: bankMethod,
      selectedCouponId: "coupon-order",
      selectedSendCouponId: "coupon-send",
      pointUse: 1200,
      directCheckout: true,
      directCtIds: "10,11",
      paymentDevice: "mobile",
    });

    expect(body).toMatchObject({
      od_name: "Buyer",
      od_email: "buyer@example.com",
      od_b_name: "Receiver",
      od_b_zip1: "678",
      od_b_zip2: "90",
      od_memo: "Leave at door",
      ad_subject: "Receiver",
      ad_default: 1,
      save_address: 1,
      od_settle_case: "Bank transfer",
      od_pwd: "guest123",
      ct_ids: "10,11",
      direct: 1,
      cp_id: "coupon-order",
      cp_id_send: "coupon-send",
      point_use: 1200,
      od_hope_date: "2026-06-20",
      payment_device: "mobile",
    });
  });

  test("omits guest and optional fields for member orders", () => {
    const body = buildOrderBody({
      orderer: address({ name: "Member" }),
      recipient: address({ name: "Ignored recipient" }),
      addressSelection: "same",
      saveAsNewAddress: true,
      newAddressSubject: "Home",
      newAddressDefault: true,
      email: "member@example.com",
      memo: "",
      hopeDate: "",
      guestPassword: "guest123",
      isMemberOrder: true,
      methodDef: bankMethod,
      selectedCouponId: "",
      selectedSendCouponId: "",
      pointUse: 0,
      directCheckout: false,
      directCtIds: "",
      paymentDevice: "pc",
    });

    expect(body.od_b_name).toBe("Member");
    expect(body.od_b_zip1).toBe("123");
    expect(body.od_b_zip2).toBe("45");
    expect(body).not.toHaveProperty("od_pwd");
    expect(body).not.toHaveProperty("save_address");
    expect(body).not.toHaveProperty("cp_id");
    expect(body).not.toHaveProperty("point_use");
    expect(body).not.toHaveProperty("direct");
    expect(body.payment_device).toBe("pc");
  });
});
