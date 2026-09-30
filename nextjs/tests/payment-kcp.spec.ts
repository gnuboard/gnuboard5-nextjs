import { expect, test } from "@playwright/test";
import type { KcpExtra, PaymentRequest } from "../src/lib/payment.types";
import {
  createKcpApprovalFields,
  createKcpConfirmPayload,
  createKcpFields,
  formatKcpFailureMessage,
  kcpActionResultForMobileMethod,
  kcpBitmaskForMobileMethod,
  kcpEasyPayService,
  kcpMobileMethodForRequest,
  kcpScriptUrlForSiteCd,
  normalizeKcpScriptUrl,
} from "../src/lib/payment.kcp";
import {
  createKcpApprovalFrameHtml,
  createKcpConfirmFieldsFromForm,
  getKcpField,
  mergeKcpResponseFields,
} from "../src/lib/payment.kcp.runtime";

const KCP_TEST_SCRIPT_URL = "https://testpay.kcp.co.kr/plugin/payplus_web.jsp";
const KCP_PROD_SCRIPT_URL = "https://pay.kcp.co.kr/plugin/payplus_web.jsp";

class TestKcpInput {
  type = "hidden";
  name = "";
  value = "";
}

type TestKcpElements = TestKcpInput[] & {
  namedItem(name: string): TestKcpInput | null;
};

function createTestKcpForm(
  initialFields: Record<string, string> = {}
): HTMLFormElement {
  const elements = [] as unknown as TestKcpElements;
  elements.namedItem = (name) =>
    elements.find((element) => element.name === name) || null;

  const appendInput = (name: string, value: string) => {
    const input = new TestKcpInput();
    input.name = name;
    input.value = value;
    elements.push(input);
  };

  Object.entries(initialFields).forEach(([name, value]) => {
    appendInput(name, value);
  });

  return {
    elements,
    ownerDocument: {
      defaultView: {
        HTMLInputElement: TestKcpInput,
      },
    },
    appendChild(input: TestKcpInput) {
      elements.push(input);
      return input;
    },
  } as unknown as HTMLFormElement;
}

function withTestKcpDocument<T>(fn: () => T): T {
  const previousDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => new TestKcpInput(),
    },
  });

  try {
    return fn();
  } finally {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, "document", previousDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
  }
}

function paymentRequest(
  method: PaymentRequest["method"],
  kcp: Partial<KcpExtra> = {}
): PaymentRequest {
  return {
    pg_service: "kcp",
    client_key: "client-key",
    client_mid: "T0000",
    method,
    order: {
      order_id: "order-1",
      order_name: "Test order",
      amount: 10000,
      buyer_name: "Buyer",
      buyer_email: "buyer@example.com",
      buyer_tel: "010-1234-5678",
      pg_extra: {
        kcp: {
          site_cd: "T0000",
          ...kcp,
        },
      },
    },
    success_url: "https://shop.example.com/payment/success",
    fail_url: "https://shop.example.com/payment/fail",
  };
}

test.describe("KCP payment helpers", () => {
  test("prefers the explicitly selected easy pay service", () => {
    expect(
      kcpEasyPayService(
        paymentRequest("easy_pay", {
          easy_pay_service: "custom_easy_pay",
          easy_pay_services: ["nhnkcp_naverpay", "nhnkcp_payco"],
        })
      )
    ).toBe("custom_easy_pay");
  });

  test("chooses known easy pay services by KCP priority", () => {
    expect(
      kcpEasyPayService(
        paymentRequest("easy_pay", {
          easy_pay_services: [
            "nhnkcp_payco",
            "custom_easy_pay",
            "nhnkcp_kakaopay",
            "nhnkcp_naverpay",
          ],
        })
      )
    ).toBe("nhnkcp_naverpay");

    expect(
      kcpEasyPayService(
        paymentRequest("easy_pay", {
          easy_pay_services: ["custom_easy_pay", "nhnkcp_payco"],
        })
      )
    ).toBe("nhnkcp_payco");

    expect(
      kcpEasyPayService(
        paymentRequest("easy_pay", {
          easy_pay_services: ["custom_easy_pay"],
        })
      )
    ).toBe("custom_easy_pay");

    expect(kcpEasyPayService(paymentRequest("easy_pay"))).toBe("");
  });

  test("maps shop payment methods to KCP mobile pay methods", () => {
    expect(kcpMobileMethodForRequest(paymentRequest("card"))).toBe("CARD");
    expect(kcpMobileMethodForRequest(paymentRequest("iche"))).toBe("BANK");
    expect(kcpMobileMethodForRequest(paymentRequest("vbank"))).toBe("VCNT");
    expect(kcpMobileMethodForRequest(paymentRequest("hp"))).toBe("MOBX");
    expect(kcpMobileMethodForRequest(paymentRequest("easy_pay"))).toBe("CARD");
    expect(kcpMobileMethodForRequest(paymentRequest("kakaopay"))).toBe("CARD");

    expect(
      kcpMobileMethodForRequest(
        paymentRequest("card", {
          pay_method: "BANK",
        })
      )
    ).toBe("BANK");
  });

  test("maps KCP mobile pay methods to bitmasks", () => {
    expect(kcpBitmaskForMobileMethod("BANK")).toBe("010000000000");
    expect(kcpBitmaskForMobileMethod("bank")).toBe("010000000000");
    expect(kcpBitmaskForMobileMethod("VCNT")).toBe("001000000000");
    expect(kcpBitmaskForMobileMethod("MOBX")).toBe("000010000000");
    expect(kcpBitmaskForMobileMethod("CARD")).toBe("100000000000");
    expect(kcpBitmaskForMobileMethod("UNKNOWN")).toBe("100000000000");
  });

  test("maps KCP mobile pay methods to approval action results", () => {
    expect(kcpActionResultForMobileMethod("BANK")).toBe("acnt");
    expect(kcpActionResultForMobileMethod("bank")).toBe("acnt");
    expect(kcpActionResultForMobileMethod("VCNT")).toBe("vcnt");
    expect(kcpActionResultForMobileMethod("MOBX")).toBe("mobx");
    expect(kcpActionResultForMobileMethod("CARD")).toBe("card");
    expect(kcpActionResultForMobileMethod("UNKNOWN")).toBe("card");
  });

  test("selects KCP script URLs from site codes", () => {
    expect(kcpScriptUrlForSiteCd("T0000")).toBe(KCP_TEST_SCRIPT_URL);
    expect(kcpScriptUrlForSiteCd("S1234")).toBe(KCP_TEST_SCRIPT_URL);
    expect(kcpScriptUrlForSiteCd("A1234")).toBe(KCP_PROD_SCRIPT_URL);
  });

  test("normalizes unknown KCP script URLs to the test gateway", () => {
    expect(normalizeKcpScriptUrl()).toBe(KCP_TEST_SCRIPT_URL);
    expect(normalizeKcpScriptUrl(KCP_TEST_SCRIPT_URL)).toBe(
      KCP_TEST_SCRIPT_URL
    );
    expect(normalizeKcpScriptUrl(KCP_PROD_SCRIPT_URL)).toBe(
      KCP_PROD_SCRIPT_URL
    );
    expect(normalizeKcpScriptUrl("https://example.com/payplus_web.jsp")).toBe(
      KCP_TEST_SCRIPT_URL
    );
  });

  test("builds KCP confirmation payloads from auth fields", () => {
    expect(
      createKcpConfirmPayload(
        {
          res_cd: "0000",
          res_msg: "OK",
          enc_info: "enc-info",
          enc_data: "enc-data",
          tran_cd: "00100000",
          tno: "T123",
          trace_no: "trace-1",
          site_cd: "T0000",
          use_pay_method: "100000000000",
          bankname: "Test Bank",
        },
        paymentRequest("card")
      )
    ).toEqual({
      pg_service: "kcp",
      order_id: "order-1",
      amount: 10000,
      res_cd: "0000",
      res_msg: "OK",
      enc_info: "enc-info",
      enc_data: "enc-data",
      tran_cd: "00100000",
      tno: "T123",
      trace_no: "trace-1",
      site_cd: "T0000",
      ret_pay_method: "",
      use_pay_method: "100000000000",
      pay_method: "",
      bankname: "Test Bank",
      depositor: "",
      account: "",
      va_date: "",
    });
  });

  test("extracts KCP confirmation fields from runtime forms", () => {
    const fields = createKcpConfirmFieldsFromForm(
      createTestKcpForm({
        res_cd: "0000",
        res_msg: "OK",
        enc_info: "enc-info",
        enc_data: "enc-data",
        tran_cd: "00100000",
        tno: "T123",
        trace_no: "trace-1",
        site_cd: "T0000",
        ret_pay_method: "CARD",
        use_pay_method: "100000000000",
        pay_method: "100000000000",
        bankname: "Test Bank",
        depositor: "Buyer",
        account: "1234567890",
        va_date: "20260610",
      })
    );

    expect(fields).toEqual({
      res_cd: "0000",
      res_msg: "OK",
      enc_info: "enc-info",
      enc_data: "enc-data",
      tran_cd: "00100000",
      tno: "T123",
      trace_no: "trace-1",
      site_cd: "T0000",
      ret_pay_method: "CARD",
      use_pay_method: "100000000000",
      pay_method: "100000000000",
      bankname: "Test Bank",
      depositor: "Buyer",
      account: "1234567890",
      va_date: "20260610",
    });
  });

  test("builds KCP PC form fields with return URLs and tax amounts", () => {
    const req = paymentRequest("vbank");
    req.order.tax_flag = 1;
    req.order.comm_tax_mny = 8000;
    req.order.comm_vat_mny = 1000;
    req.order.comm_free_mny = 1000;

    const fields = createKcpFields(req, "T1234", "Test Shop");

    expect(fields.site_name).toBe("Test Shop");
    expect(fields.site_cd).toBe("T1234");
    expect(fields.def_site_cd).toBe("T1234");
    expect(fields.pay_method).toBe("001000000000");
    expect(fields.vcnt_expire_term).toBe("3");
    expect(fields.vcnt_expire_term_time).toBe("235959");
    expect(fields.Ret_URL).toBe(
      "https://shop.example.com/payment/success?pg=kcp&orderId=order-1&amount=10000"
    );
    expect(fields.ret_URL).toBe(fields.Ret_URL);
    expect(fields.tax_flag).toBe("TG03");
    expect(fields.comm_tax_mny).toBe("8000");
    expect(fields.comm_vat_mny).toBe("1000");
    expect(fields.comm_free_mny).toBe("1000");
  });

  test("sets KCP easy pay direct flags for Naver Pay", () => {
    const fields = createKcpFields(
      paymentRequest("easy_pay", {
        easy_pay_services: ["nhnkcp_naverpay"],
        naverpay_point_enabled: true,
      }),
      "T0000",
      "Test Shop"
    );

    expect(fields.pay_method).toBe("100000000000");
    expect(fields.naverpay_direct).toBe("Y");
    expect(fields.naverpay_point_direct).toBe("Y");
    expect(fields.payco_direct).toBe("");
  });

  test("builds KCP mobile approval fields with easy pay and tax amounts", () => {
    const req = paymentRequest("easy_pay", {
      approval_key: "approval-key",
      pay_url: "https://kcp.example.com/pay",
      return_url: "https://shop.example.com/kcp/return",
      easy_pay_services: ["nhnkcp_naverpay"],
      naverpay_point_enabled: true,
    });
    req.order.tax_flag = 1;
    req.order.comm_tax_mny = 7000;
    req.order.comm_vat_mny = 700;
    req.order.comm_free_mny = 2300;

    const kcp = req.order.pg_extra?.kcp;
    if (!kcp) throw new Error("Expected KCP extra");
    const fields = createKcpApprovalFields(req, kcp, "Mobile Shop");

    expect(fields.shop_name).toBe("Mobile Shop");
    expect(fields.site_cd).toBe("T0000");
    expect(fields.approval_key).toBe("approval-key");
    expect(fields.Ret_URL).toBe("https://shop.example.com/kcp/return");
    expect(fields.pay_method).toBe("CARD");
    expect(fields.use_pay_method).toBe("100000000000");
    expect(fields.ActionResult).toBe("card");
    expect(fields.escw_used).toBe("N");
    expect(fields.naverpay_direct).toBe("Y");
    expect(fields.naverpay_point_direct).toBe("Y");
    expect(fields.tax_flag).toBe("TG03");
    expect(fields.comm_tax_mny).toBe("7000");
    expect(fields.comm_vat_mny).toBe("700");
    expect(fields.comm_free_mny).toBe("2300");
  });

  test("merges KCP response aliases from nested runtime payloads", () => {
    withTestKcpDocument(() => {
      const form = createTestKcpForm({
        enc_info: "old-enc-info",
        res_cd: "",
      });

      mergeKcpResponseFields(form, {
        resCd: "0000",
        fields: {
          encInfo: { value: "enc-info" },
          encData: ["enc-data"],
          tranCd: 12345,
          usePayMethod: "100000000000",
          ignored_field: "skip-me",
        },
      });

      expect(getKcpField(form, "res_cd")).toBe("0000");
      expect(getKcpField(form, "enc_info")).toBe("enc-info");
      expect(getKcpField(form, "enc_data")).toBe("enc-data");
      expect(getKcpField(form, "tran_cd")).toBe("12345");
      expect(getKcpField(form, "use_pay_method")).toBe("100000000000");
      expect(getKcpField(form, "ignored_field")).toBe("");
    });
  });

  test("merges KCP response fields from query strings and form-like sources", () => {
    withTestKcpDocument(() => {
      const form = createTestKcpForm();

      mergeKcpResponseFields(
        form,
        "res_msg=OK&bankName=Test+Bank&vaDate=20260610"
      );
      expect(getKcpField(form, "res_msg")).toBe("OK");
      expect(getKcpField(form, "bankname")).toBe("Test Bank");
      expect(getKcpField(form, "va_date")).toBe("20260610");

      mergeKcpResponseFields(
        form,
        createTestKcpForm({
          account: "1234567890",
          depositor: "Buyer",
          unknown: "skip-me",
        })
      );
      expect(getKcpField(form, "account")).toBe("1234567890");
      expect(getKcpField(form, "depositor")).toBe("Buyer");
      expect(getKcpField(form, "unknown")).toBe("");
    });
  });

  test("escapes KCP approval frame action and hidden fields", () => {
    const html = createKcpApprovalFrameHtml(
      'https://kcp.example.com/pay?next=<script>&quote="',
      {
        good_name: 'Order <b>"name"</b>',
        ordr_idxx: "order-1&2",
      }
    );

    expect(html).toContain(
      'action="https://kcp.example.com/pay?next=&lt;script&gt;&amp;quote=&quot;"'
    );
    expect(html).toContain('name="good_name"');
    expect(html).toContain('value="Order &lt;b&gt;&quot;name&quot;&lt;/b&gt;"');
    expect(html).toContain('value="order-1&amp;2"');
    expect(html).not.toContain('value="Order <b>"name"</b>"');
  });

  test("formats KCP failure messages from response codes", () => {
    expect(formatKcpFailureMessage(" 3001 ", " 결제 취소 ")).toBe(
      "[3001] 결제 취소"
    );
    expect(formatKcpFailureMessage("", " 결제 실패 ")).toBe("결제 실패");
    expect(formatKcpFailureMessage("9999", "")).toBe(
      "[9999] KCP 결제가 완료되지 않았습니다."
    );
    expect(formatKcpFailureMessage("", "")).toContain("오류 코드 없이");
  });
});
