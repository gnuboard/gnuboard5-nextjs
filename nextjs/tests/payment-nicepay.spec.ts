import { expect, test } from "@playwright/test";
import type {
  NicepayExtra,
  PaymentMethod,
  PaymentRequest,
  PreparedOrder,
} from "../src/lib/payment.types";
import { api } from "../src/lib/api";
import {
  createNicepayConfirmPayload,
  createNicepayFields,
  installNicepayMessageBridge,
  requestNicepayPayment,
  shouldUseNicepayMobile,
} from "../src/lib/payment.nicepay";

class TestNicepayElement {
  id = "";
  ownerList?: TestNicepayElement[];

  remove() {
    if (!this.ownerList) return;
    const index = this.ownerList.indexOf(this);
    if (index >= 0) this.ownerList.splice(index, 1);
  }
}

class TestNicepayInput extends TestNicepayElement {
  type = "";
  name = "";
  value = "";
}

type TestNicepayElements = TestNicepayInput[] & {
  namedItem(name: string): TestNicepayInput | null;
};

class TestNicepayForm extends TestNicepayElement {
  name = "";
  method = "";
  action = "";
  acceptCharset = "";
  target = "";
  style = { cssText: "" };
  elements = [] as unknown as TestNicepayElements;
  ownerDocument: { defaultView: { HTMLInputElement: typeof TestNicepayInput } };
  onSubmit: (form: TestNicepayForm) => void = () => undefined;

  constructor() {
    super();
    this.elements.namedItem = (name) =>
      this.elements.find((element) => element.name === name) || null;
    this.ownerDocument = {
      defaultView: {
        HTMLInputElement: TestNicepayInput,
      },
    };
  }

  appendChild(input: TestNicepayInput) {
    this.elements.push(input);
    return input;
  }

  querySelector(selector: string) {
    const match = selector.match(/^input\[name="([^"]+)"\]$/);
    return match ? this.elements.namedItem(match[1]) : null;
  }

  submit() {
    this.onSubmit(this);
  }
}

class TestNicepayScript extends TestNicepayElement {
  async = false;
  dataset: Record<string, string> = {};
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

type TestNicepayWindow = {
  location: { origin: string; protocol: string };
  goPay?: (form: HTMLFormElement) => void;
  nicepaySubmit?: () => void;
  nicepayClose?: (resultCode?: string, resultMsg?: string) => void;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  setTimeout: (listener: TimerHandler, timeout?: number) => number;
  clearTimeout: (handle?: number) => void;
  postMessage: (message: unknown, targetOrigin: string) => void;
};

async function withNicepayDom<T>(
  run: (context: {
    submittedForms: TestNicepayForm[];
    postedMessages: unknown[];
    win: TestNicepayWindow;
  }) => T | Promise<T>
): Promise<T> {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const bodyChildren: TestNicepayElement[] = [];
  const scripts: TestNicepayScript[] = [];
  const submittedForms: TestNicepayForm[] = [];
  const postedMessages: unknown[] = [];
  const listeners = new Map<string, Set<EventListener>>();

  const win: TestNicepayWindow = {
    location: {
      origin: "https://shop.example.com",
      protocol: "https:",
    },
    addEventListener: (type, listener) => {
      const existing = listeners.get(type) || new Set<EventListener>();
      existing.add(listener);
      listeners.set(type, existing);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    postMessage: (message) => {
      postedMessages.push(message);
    },
  };

  const documentLike = {
    cookie: "",
    body: {
      children: bodyChildren,
      appendChild(element: TestNicepayElement) {
        element.ownerList = bodyChildren;
        bodyChildren.push(element);
        return element;
      },
    },
    head: {
      appendChild(script: TestNicepayScript) {
        script.ownerList = scripts;
        scripts.push(script);
        script.onload?.();
        return script;
      },
    },
    createElement(tagName: string) {
      if (tagName === "form") {
        const form = new TestNicepayForm();
        form.onSubmit = (submitted) => submittedForms.push(submitted);
        return form;
      }
      if (tagName === "input") return new TestNicepayInput();
      if (tagName === "script") return new TestNicepayScript();
      return new TestNicepayElement();
    },
    getElementById(id: string) {
      return bodyChildren.find((element) => element.id === id) || null;
    },
    querySelector(selector: string) {
      const match = selector.match(/^script\[src="([^"]+)"\]$/);
      return match ? scripts.find((script) => script.src === match[1]) || null : null;
    },
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentLike,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: win,
  });

  try {
    return await run({ submittedForms, postedMessages, win });
  } finally {
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

function appendNicepayResponseField(
  form: HTMLFormElement,
  name: string,
  value: string
) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  form.appendChild(input);
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function withMockedApiPost<T>(
  handler: (path: string, body: unknown) => Promise<unknown>,
  run: () => Promise<T>
): Promise<T> {
  const originalPost = api.post;
  (api as unknown as { post: typeof api.post }).post = ((path, body) =>
    handler(path, body)) as typeof api.post;

  try {
    return await run();
  } finally {
    (api as unknown as { post: typeof api.post }).post = originalPost;
  }
}

function nicepay(overrides: Partial<NicepayExtra> = {}): NicepayExtra {
  return {
    mid: "NICEPAYMID",
    edi_date: "20260101010101",
    sign_data: "signed-data",
    ...overrides,
  };
}

function paymentRequest(
  method: PaymentMethod,
  orderOverrides: Partial<PreparedOrder> = {}
): PaymentRequest {
  return {
    pg_service: "nicepay",
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

test.describe("Nicepay payment helpers", () => {
  test("builds normalized Nicepay fields for the selected payment method", () => {
    const methodCases: Array<[PaymentMethod, string]> = [
      ["card", "CARD"],
      ["vbank", "VBANK"],
      ["iche", "BANK"],
      ["hp", "CELLPHONE"],
      ["easy_pay", "CARD"],
      ["kakaopay", "CARD"],
    ];

    methodCases.forEach(([method, payMethod]) => {
      expect(createNicepayFields(paymentRequest(method), nicepay()).PayMethod).toBe(
        payMethod
      );
    });
  });

  test("normalizes buyer and callback fields", () => {
    const fields = createNicepayFields(
      paymentRequest("card", {
        buyer_email: "",
        buyer_tel: "010.1234 5678",
      }),
      nicepay({
        return_url: "https://pg.example.com/return",
        trans_type: "1",
      })
    );

    expect(fields).toMatchObject({
      GoodsName: "Test order",
      Amt: "10000",
      MID: "NICEPAYMID",
      Moid: "order-1",
      BuyerEmail: "noemail@example.com",
      BuyerTel: "01012345678",
      ReturnURL: "https://pg.example.com/return",
      TransType: "1",
      EdiDate: "20260101010101",
      SignData: "signed-data",
    });
  });

  test("adds optional mobile WebView return fields", () => {
    const fields = createNicepayFields(
      paymentRequest("card"),
      nicepay({
        wap_url: "myshop://nicepay-return",
        isp_cancel_url: "https://shop.example.com/payments/nicepay/isp-cancel",
      })
    );

    expect(fields.WapUrl).toBe("myshop://nicepay-return");
    expect(fields.IspCancelUrl).toBe(
      "https://shop.example.com/payments/nicepay/isp-cancel"
    );
  });

  test("falls back to the success URL and client MID when needed", () => {
    const fields = createNicepayFields(
      paymentRequest("card"),
      nicepay({
        mid: "",
      })
    );

    expect(fields.MID).toBe("CLIENTMID");
    expect(fields.ReturnURL).toBe(
      "https://shop.example.com/payment/success?pg=nicepay"
    );
  });

  test("sets virtual bank expiry and tax amounts only when applicable", () => {
    expect(
      createNicepayFields(
        paymentRequest("vbank", {
          tax_flag: 1,
          comm_tax_mny: 7000,
          comm_vat_mny: 700,
          comm_free_mny: 3000,
        }),
        nicepay({
          vbank_exp_date: "20261231",
        })
      )
    ).toMatchObject({
      VbankExpDate: "20261231",
      SupplyAmt: "7000",
      GoodsVat: "700",
      TaxFreeAmt: "3000",
    });

    const cardFields = createNicepayFields(
      paymentRequest("card", {
        tax_flag: 0,
        comm_tax_mny: 7000,
        comm_vat_mny: 700,
        comm_free_mny: 3000,
      }),
      nicepay({
        vbank_exp_date: "20261231",
      })
    );

    expect(cardFields.VbankExpDate).toBe("");
    expect(cardFields.SupplyAmt).toBeUndefined();
    expect(cardFields.GoodsVat).toBeUndefined();
    expect(cardFields.TaxFreeAmt).toBeUndefined();
  });

  test("maps easy pay services to Nicepay direct fields", () => {
    const serviceCases: Array<
      [
        string,
        {
          DirectEasyPay?: string;
          EasyPayMethod?: string;
          NicepayReserved?: string;
        },
      ]
    > = [
      [
        "nicepay_naverpay",
        {
          DirectEasyPay: "E020",
          EasyPayMethod: "E020=CARD",
        },
      ],
      ["nicepay_kakaopay", { NicepayReserved: "DirectKakao=Y" }],
      ["nicepay_samsungpay", { DirectEasyPay: "E021" }],
      ["nicepay_paycopay", { NicepayReserved: "DirectPayco=Y" }],
      ["nicepay_skpay", { NicepayReserved: "DirectPay11=Y" }],
      ["nicepay_ssgpay", { DirectEasyPay: "E007" }],
      ["nicepay_lpay", { DirectEasyPay: "E018" }],
    ];

    serviceCases.forEach(([service, expected]) => {
      expect(
        createNicepayFields(
          paymentRequest("easy_pay"),
          nicepay({
            easy_pay_service: service,
          })
        )
      ).toMatchObject({
        DirectShowOpt: "CARD",
        ...expected,
      });
    });
  });

  test("prefers explicit Nicepay module type before device detection", () => {
    expect(shouldUseNicepayMobile(nicepay({ module_type: "pc" }))).toBe(false);
    expect(shouldUseNicepayMobile(nicepay({ module_type: "mobile" }))).toBe(
      true
    );
  });

  test("builds the confirmation payload from PC callback fields", () => {
    expect(
      createNicepayConfirmPayload(
        {
          AuthResultCode: "0000",
          AuthToken: "auth-token",
          TxTid: "tx-tid",
          NextAppURL: "https://webapi.nicepay.co.kr/webapi/pay_process.jsp",
          NetCancelURL: "https://webapi.nicepay.co.kr/webapi/cancel.jsp",
          MID: "NICEPAYMID",
          Moid: "order-1",
          Amt: "10000",
          PayMethod: "CARD",
          Signature: "response-signature",
        },
        paymentRequest("card")
      )
    ).toMatchObject({
      pg_service: "nicepay",
      order_id: "order-1",
      amount: 10000,
      AuthResultCode: "0000",
      AuthToken: "auth-token",
      TxTid: "tx-tid",
      NextAppURL: "https://webapi.nicepay.co.kr/webapi/pay_process.jsp",
      NetCancelURL: "https://webapi.nicepay.co.kr/webapi/cancel.jsp",
      MID: "NICEPAYMID",
      Moid: "order-1",
      Amt: "10000",
      PayMethod: "CARD",
      Signature: "response-signature",
    });
  });

  test("submits Nicepay mobile forms with EUC-KR charset", async () => {
    await withNicepayDom(async ({ submittedForms }) => {
      const mobileNicepay = nicepay({
        module_type: "mobile",
        mobile_url: "https://web.nicepay.co.kr/v3/v3Payment.jsp",
        return_url: "https://shop.example.com/api/v1/shop/payment/nicepay-return",
        wap_url: "myshop://nicepay-return",
        isp_cancel_url: "https://shop.example.com/payments/nicepay/isp-cancel",
      });
      const req = paymentRequest("card", {
        pg_extra: {
          nicepay: mobileNicepay,
        },
      });

      await requestNicepayPayment(req);

      expect(submittedForms).toHaveLength(1);
      const form = submittedForms[0];
      expect(form.action).toBe("https://web.nicepay.co.kr/v3/v3Payment.jsp");
      expect(form.acceptCharset).toBe("euc-kr");
      expect(form.elements.namedItem("CharSet")?.value).toBe("euc-kr");
      expect(form.elements.namedItem("WapUrl")?.value).toBe(
        "myshop://nicepay-return"
      );
      expect(form.elements.namedItem("IspCancelUrl")?.value).toBe(
        "https://shop.example.com/payments/nicepay/isp-cancel"
      );
    });
  });

  test("confirms Nicepay PC payments from the nicepaySubmit callback", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];

    await withNicepayDom(async ({ postedMessages, win }) => {
      win.goPay = (form) => {
        appendNicepayResponseField(form, "AuthResultCode", "0000");
        appendNicepayResponseField(form, "AuthToken", "auth-token");
        appendNicepayResponseField(form, "TxTid", "tx-tid");
        appendNicepayResponseField(
          form,
          "NextAppURL",
          "https://webapi.nicepay.co.kr/webapi/pay_process.jsp"
        );
        appendNicepayResponseField(form, "MID", "NICEPAYMID");
        appendNicepayResponseField(form, "Moid", "order-1");
        appendNicepayResponseField(form, "Amt", "10000");
        appendNicepayResponseField(form, "PayMethod", "CARD");
        win.nicepaySubmit?.();
      };

      await withMockedApiPost(
        async (path, body) => {
          calls.push({ path, body });
          return {};
        },
        async () => {
          await requestNicepayPayment(
            paymentRequest("card", {
              pg_extra: {
                nicepay: nicepay({
                  module_type: "pc",
                  return_url:
                    "https://shop.example.com/api/v1/shop/payment/nicepay-return",
                }),
              },
            })
          );
          await flushPromises();
        }
      );

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        path: "/shop/payment/confirm",
        body: {
          pg_service: "nicepay",
          order_id: "order-1",
          AuthResultCode: "0000",
          AuthToken: "auth-token",
          TxTid: "tx-tid",
          PayMethod: "CARD",
        },
      });
      expect(postedMessages).toContainEqual({
        type: "shop-payment-result",
        status: "success",
        orderId: "order-1",
      });
    });
  });
});

test.describe("Nicepay message bridge (CSP 가 eval 을 막아도 결제창 메시지를 처리)", () => {
  // nicepay-3.0.js 처럼 bubble 단계에서 메시지를 받는 듣는이. 받은 data 를 모은다.
  function listen(target: EventTarget) {
    const received: unknown[] = [];
    target.addEventListener("message", (event) => received.push((event as MessageEvent).data));
    return received;
  }

  test("나이스페이에서 온 JSON 문자열은 객체로 다시 보내고, 문자열 원본은 막는다", () => {
    const target = new EventTarget();
    const remove = installNicepayMessageBridge(target as unknown as Window);
    const received = listen(target);

    target.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://web.nicepay.co.kr",
        data: '{"code":"11","width":"660","height":"825","scroll":"Y"}',
      })
    );

    expect(received).toEqual([{ code: "11", width: "660", height: "825", scroll: "Y" }]);
    remove();
  });

  test("다른 곳에서 온 메시지 · JSON 이 아닌 문자열 · 이미 객체인 메시지는 그대로 둔다", () => {
    const target = new EventTarget();
    const remove = installNicepayMessageBridge(target as unknown as Window);
    const received = listen(target);

    target.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", data: '{"code":"0"}' }));
    target.dispatchEvent(new MessageEvent("message", { origin: "https://web.nicepay.co.kr", data: "{code:'0'}" }));
    target.dispatchEvent(new MessageEvent("message", { origin: "https://web.nicepay.co.kr", data: { code: "2" } }));
    target.dispatchEvent(new MessageEvent("message", { origin: "https://web.nicepay.co.kr", data: '{"type":"x"}' }));

    expect(received).toEqual(['{"code":"0"}', "{code:'0'}", { code: "2" }, '{"type":"x"}']);
    remove();
  });

  test("떼어 낸 뒤에는 문자열을 그대로 넘긴다", () => {
    const target = new EventTarget();
    installNicepayMessageBridge(target as unknown as Window)();
    const received = listen(target);

    target.dispatchEvent(new MessageEvent("message", { origin: "https://web.nicepay.co.kr", data: '{"code":"11"}' }));

    expect(received).toEqual(['{"code":"11"}']);
  });
});
