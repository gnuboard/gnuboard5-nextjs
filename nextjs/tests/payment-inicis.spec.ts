import { expect, test } from "@playwright/test";
import type {
  InicisExtra,
  PaymentMethod,
  PaymentRequest,
  PreparedOrder,
} from "../src/lib/payment.types";
import {
  INICIS_MOBILE_DEFAULT_RESERVED,
  INICIS_MOBILE_TEST_URL,
  INICIS_MOBILE_URL,
  INICIS_WEB_STD_DEFAULT_ACCEPT_METHOD,
  createInicisConfirmPayload,
  createInicisMobileFields,
  createInicisWebStdFields,
  inicisMobileActionUrl,
  inicisMobilePayMethod,
  inicisMobileReserved,
  inicisWebStdPayMethod,
  resolveInicisMobileUrl,
  shouldUseInicisMobile,
} from "../src/lib/payment.inicis";

function inicis(overrides: Partial<InicisExtra> = {}): InicisExtra {
  return {
    mid: "INIMID",
    oid: "order-1",
    price: "10000",
    timestamp: "20260101010101",
    signature: "signature",
    verification: "verification",
    mKey: "mkey",
    ...overrides,
  };
}

function paymentRequest(
  method: PaymentMethod,
  orderOverrides: Partial<PreparedOrder> = {}
): PaymentRequest {
  return {
    pg_service: "inicis",
    client_key: "client-key",
    client_mid: "CLIENTMID",
    method,
    order: {
      order_id: "order-1",
      order_name: "Test order",
      amount: 10000,
      buyer_name: "Buyer",
      buyer_email: "buyer@example.com",
      buyer_tel: "010-1234-5678",
      ...orderOverrides,
    },
    success_url: "https://shop.example.com/payment/success",
    fail_url: "https://shop.example.com/payment/fail",
  };
}

test.describe("Inicis payment helpers", () => {
  test("prefers explicit module type before device detection", () => {
    expect(shouldUseInicisMobile(inicis({ module_type: "mobile" }), false)).toBe(
      true
    );
    expect(shouldUseInicisMobile(inicis({ module_type: "pc" }), true)).toBe(
      false
    );
    expect(shouldUseInicisMobile(inicis(), true)).toBe(true);
    expect(shouldUseInicisMobile(inicis(), false)).toBe(false);
    expect(shouldUseInicisMobile(undefined, true)).toBe(true);
  });

  test("maps shop methods to Inicis mobile paymethod path segments", () => {
    expect(inicisMobilePayMethod("vbank")).toBe("vbank");
    expect(inicisMobilePayMethod("iche")).toBe("bank");
    expect(inicisMobilePayMethod("hp")).toBe("mobile");
    expect(inicisMobilePayMethod("card")).toBe("wcard");
    expect(inicisMobilePayMethod("easy_pay")).toBe("wcard");
    expect(inicisMobilePayMethod("kakaopay")).toBe("wcard");
  });

  test("builds mobile action URLs without double-appending paymethod segments", () => {
    expect(
      inicisMobileActionUrl("https://stgmobile.inicis.com/smart/payment/", "wcard")
    ).toBe("https://stgmobile.inicis.com/smart/payment/");
    expect(inicisMobileActionUrl("https://pg.example.com/smart", "bank")).toBe(
      "https://pg.example.com/smart/bank/"
    );
    expect(inicisMobileActionUrl("https://pg.example.com/smart/", "vbank")).toBe(
      "https://pg.example.com/smart/vbank/"
    );
  });

  test("does not use WebStandard script URLs as mobile form actions", () => {
    expect(
      resolveInicisMobileUrl(
        inicis(),
        "https://stdpay.inicis.com/stdjs/INIStdPay.js"
      )
    ).toBe(INICIS_MOBILE_URL);
    expect(
      resolveInicisMobileUrl(
        inicis(),
        "https://stgstdpay.inicis.com/stdjs/INIStdPay.js"
      )
    ).toBe(INICIS_MOBILE_TEST_URL);
    expect(
      resolveInicisMobileUrl(
        inicis({ mobile_url: "https://mobile.example.com/smart/" }),
        "https://stdpay.inicis.com/stdjs/INIStdPay.js"
      )
    ).toBe("https://mobile.example.com/smart/");
  });

  test("builds mobile reserved params and adds direct Kakao only once", () => {
    expect(inicisMobileReserved(inicis())).toBe(INICIS_MOBILE_DEFAULT_RESERVED);
    expect(
      inicisMobileReserved(
        inicis({
          direct_method: "kakaopay",
          mobile_reserved: "base=Y",
        })
      )
    ).toBe("base=Y&d_kakaopay=Y");
    expect(
      inicisMobileReserved(
        inicis({
          direct_method: "kakaopay",
          mobile_reserved: "base=Y&d_kakaopay=Y",
        })
      )
    ).toBe("base=Y&d_kakaopay=Y");
  });

  test("builds mobile form fields with return URLs, tax, and chkfake data", () => {
    const fields = createInicisMobileFields(
      paymentRequest("kakaopay", {
        buyer_email: "",
        tax_flag: 1,
        comm_tax_mny: 7000,
        comm_vat_mny: 700,
        comm_free_mny: 3000,
      }),
      inicis({
        direct_method: "kakaopay",
        mobile_next_url: "https://pg.example.com/next",
        mobile_return_url: "https://pg.example.com/return",
        mobile_noti_url: "https://pg.example.com/noti",
        mobile_reserved: "base=Y",
        mobile_chkfake: "chkfake",
      })
    );

    expect(fields).toMatchObject({
      P_OID: "order-1",
      P_GOODS: "Test order",
      P_AMT: "10000",
      P_UNAME: "Buyer",
      P_EMAIL: "test@test.com",
      P_MID: "INIMID",
      P_NEXT_URL: "https://pg.example.com/next",
      P_NOTI_URL: "https://pg.example.com/noti",
      P_RETURN_URL: "https://pg.example.com/return",
      P_RESERVED: "base=Y&d_kakaopay=Y",
      DEF_RESERVED: "base=Y&d_kakaopay=Y",
      P_SKIP_TERMS: "Y",
      P_TAX: "700",
      P_TAXFREE: "3000",
      P_TIMESTAMP: "20260101010101",
      P_CHKFAKE: "chkfake",
      good_mny: "10000",
    });
  });

  test("maps shop methods to Inicis WebStandard gopaymethod values", () => {
    expect(inicisWebStdPayMethod("card")).toBe("Card");
    expect(inicisWebStdPayMethod("vbank")).toBe("VBank");
    expect(inicisWebStdPayMethod("iche")).toBe("DirectBank");
    expect(inicisWebStdPayMethod("hp")).toBe("HPP");
    expect(inicisWebStdPayMethod("kakaopay")).toBe("onlykakaopay");
    expect(inicisWebStdPayMethod("card", "kakaopay")).toBe("onlykakaopay");
    expect(inicisWebStdPayMethod("vbank", "kakaopay")).toBe("VBank");
  });

  test("builds WebStandard fields with defaults, tax, and Kakao overrides", () => {
    const fields = createInicisWebStdFields(
      paymentRequest("card", {
        buyer_email: "",
        tax_flag: 1,
        comm_tax_mny: 7000,
        comm_vat_mny: 700,
        comm_free_mny: 3000,
      }),
      inicis({
        return_url: "",
        close_url: "",
        popup_url: "https://pg.example.com/popup",
      })
    );

    expect(fields).toMatchObject({
      version: "1.0",
      gopaymethod: "Card",
      mid: "INIMID",
      oid: "order-1",
      buyeremail: "test@test.com",
      returnUrl: "https://shop.example.com/payment/success?pg=inicis",
      closeUrl: "https://shop.example.com/payment/fail",
      popupUrl: "https://pg.example.com/popup",
      acceptmethod: INICIS_WEB_STD_DEFAULT_ACCEPT_METHOD,
      tax: "700",
      taxfree: "3000",
    });
    expect(fields.SupplyAmt).toBeUndefined();

    expect(
      createInicisWebStdFields(
        paymentRequest("kakaopay", {
          tax_flag: 1,
          comm_tax_mny: 7000,
          comm_vat_mny: 700,
          comm_free_mny: 3000,
        }),
        inicis({
          acceptmethod: "custom",
        })
      )
    ).toMatchObject({
      gopaymethod: "onlykakaopay",
      acceptmethod: "cardonly",
      SupplyAmt: "10000",
      GoodsVat: "700",
    });
  });

  test("builds desktop confirmation payloads from Inicis auth fields", () => {
    expect(
      createInicisConfirmPayload(
        {
          resultCode: "0000",
          resultMsg: "ok",
          authToken: "auth-token",
          authUrl: "https://pg.example.com/auth",
          netCancelUrl: "https://pg.example.com/net-cancel",
          mid: "INIMID",
          MOID: "moid-1",
          TotPrice: "10000",
          authSignature: "auth-signature",
          idc_name: "fc",
          payMethod: "Card",
          tid: "tid-1",
          VACT_BankCode: "001",
          VACT_Num: "123456789",
          VACT_Name: "Bank",
          VACT_InputName: "Buyer",
          VACT_Date: "20261231",
          VACT_Time: "235959",
        },
        paymentRequest("card")
      )
    ).toMatchObject({
      pg_service: "inicis",
      order_id: "order-1",
      amount: 10000,
      resultCode: "0000",
      resultMsg: "ok",
      authToken: "auth-token",
      authUrl: "https://pg.example.com/auth",
      netCancelUrl: "https://pg.example.com/net-cancel",
      mid: "INIMID",
      MOID: "moid-1",
      TotPrice: "10000",
      authSignature: "auth-signature",
      idc_name: "fc",
      payMethod: "Card",
      tid: "tid-1",
      VACT_BankCode: "001",
      VACT_Num: "123456789",
      VACT_Name: "Bank",
      VACT_InputName: "Buyer",
      VACT_Date: "20261231",
      VACT_Time: "235959",
    });
  });

  test("builds mobile confirmation payloads and Kakao pg service fallback", () => {
    const req: PaymentRequest = {
      ...paymentRequest("kakaopay", {
        order_id: "",
        amount: 0,
      }),
      pg_service: "kakaopay",
    };

    expect(
      createInicisConfirmPayload(
        {
          P_STATUS: "00",
          P_RMESG1: "ok",
          P_TID: "mobile-tid",
          P_AMT: "33000",
          P_REQ_URL: "https://pg.example.com/req",
          P_NOTI: "noti-order",
          P_MID: "INIMID",
          P_OID: "mobile-order",
          P_TYPE: "CARD",
          P_AUTH_DT: "20260101010101",
          P_AUTH_NO: "auth-no",
          P_UNAME: "Buyer",
          P_VACT_NUM: "987654321",
          P_VACT_NAME: "Virtual Bank",
          P_VACT_BANK_CODE: "088",
          P_VACT_DATE: "20261231",
          P_VACT_TIME: "235959",
          P_CARD_ISSUER_CODE: "04",
          mobile_verification: "verified",
        },
        req
      )
    ).toMatchObject({
      pg_service: "kakaopay",
      order_id: "mobile-order",
      amount: 33000,
      P_STATUS: "00",
      P_RMESG1: "ok",
      P_TID: "mobile-tid",
      P_AMT: "33000",
      P_REQ_URL: "https://pg.example.com/req",
      P_NOTI: "noti-order",
      P_MID: "INIMID",
      P_OID: "mobile-order",
      P_TYPE: "CARD",
      P_AUTH_DT: "20260101010101",
      P_AUTH_NO: "auth-no",
      P_UNAME: "Buyer",
      P_VACT_NUM: "987654321",
      P_VACT_NAME: "Virtual Bank",
      P_VACT_BANK_CODE: "088",
      P_VACT_DATE: "20261231",
      P_VACT_TIME: "235959",
      P_CARD_ISSUER_CODE: "04",
      mobile_verification: "verified",
    });
  });
});
