import { expect, test } from "@playwright/test";
import type { AddressForm } from "../src/app/shop/order/orderAddressHelpers";
import type {
  PaymentConfig,
  PayMethodDef,
} from "../src/app/shop/order/orderPaymentHelpers";
import {
  createBankOrder,
  persistAddressBookEntryIfNeeded,
  requestPreparedOrderPayment,
  type OrderSubmitActionsDeps,
} from "../src/app/shop/order/orderSubmitActions";
import type {
  CreatedOrderResponse,
  OrderBody,
  PreparedPaymentResponse,
} from "../src/app/shop/order/orderSubmitTypes";
import type { PaymentRequest } from "../src/lib/payment";

type PostCall = {
  path: string;
  body?: unknown;
};

function address(overrides: Partial<AddressForm> = {}): AddressForm {
  return {
    name: "Receiver",
    tel: "02-1234-5678",
    hp: "010-1234-5678",
    zip: "12345",
    addr1: "Seoul",
    addr2: "101",
    addr3: "",
    addr_jibeon: "N",
    ...overrides,
  };
}

function paymentConfig(): PaymentConfig {
  return {
    pg_service: "inicis",
    client: {
      client_key: "client-key",
      mid: "merchant-id",
      script_url: "https://pay.example.com/sdk.js",
    },
    payment_methods: {
      card: true,
      vbank: true,
      bank: true,
      iche: true,
      hp: true,
      easy_pay: true,
      kakaopay: true,
    },
    is_test_mode: true,
  };
}

function paymentMethod(overrides: Partial<PayMethodDef> = {}): PayMethodDef {
  return {
    value: "card",
    label: "Card",
    settle_case: "Card",
    pg_method: "card",
    ...overrides,
  };
}

function buildDeps(response?: unknown): Partial<OrderSubmitActionsDeps> & {
  postCalls: PostCall[];
  paymentRequests: PaymentRequest[];
} {
  const postCalls: PostCall[] = [];
  const paymentRequests: PaymentRequest[] = [];

  return {
    postCalls,
    paymentRequests,
    post: async <T>(path: string, body?: unknown) => {
      postCalls.push({ path, body });

      return {
        success: true,
        data: response as T,
      };
    },
    requestPayment: async (request) => {
      paymentRequests.push(request);
    },
  };
}

test.describe("order submit actions", () => {
  test("persists new address book entries with split zip payload", async () => {
    const deps = buildDeps();

    await persistAddressBookEntryIfNeeded({
      addressSelection: "new",
      saveAsNewAddress: true,
      recipient: address({
        name: "Receiver",
        zip: "54321",
        addr1: "Busan",
        addr2: "202",
        addr3: "Extra",
        addr_jibeon: "Y",
      }),
      newAddressSubject: "",
      newAddressDefault: true,
      deps,
    });

    expect(deps.postCalls).toEqual([
      {
        path: "/shop/addresses",
        body: {
          ad_subject: "Receiver",
          ad_default: 1,
          ad_name: "Receiver",
          ad_tel: "02-1234-5678",
          ad_hp: "010-1234-5678",
          ad_zip1: "543",
          ad_zip2: "21",
          ad_addr1: "Busan",
          ad_addr2: "202",
          ad_addr3: "Extra",
          ad_jibeon: "Y",
        },
      },
    ]);
  });

  test("skips or ignores address persistence without blocking checkout", async () => {
    const skippedDeps = buildDeps();

    await persistAddressBookEntryIfNeeded({
      addressSelection: "same",
      saveAsNewAddress: true,
      recipient: address(),
      newAddressSubject: "Home",
      newAddressDefault: false,
      deps: skippedDeps,
    });

    expect(skippedDeps.postCalls).toEqual([]);

    await expect(
      persistAddressBookEntryIfNeeded({
        addressSelection: "new",
        saveAsNewAddress: true,
        recipient: address(),
        newAddressSubject: "Home",
        newAddressDefault: false,
        deps: {
          post: async () => {
            throw new Error("address save failed");
          },
        },
      })
    ).resolves.toBeUndefined();
  });

  test("creates bank orders with bank account and deposit name", async () => {
    const createdOrder: CreatedOrderResponse = {
      order: {
        od_id: "202606100001",
        uid: "guest",
      },
    };
    const deps = buildDeps(createdOrder);
    const orderBody: OrderBody = {
      od_name: "Buyer",
      od_settle_case: "Bank",
    };

    const result = await createBankOrder({
      orderBody,
      bankAccount: "Bank 123",
      depositName: "Buyer",
      deps,
    });

    expect(result).toBe(createdOrder);
    expect(deps.postCalls).toEqual([
      {
        path: "/shop/orders",
        body: {
          od_name: "Buyer",
          od_settle_case: "Bank",
          od_bank_account: "Bank 123",
          od_deposit_name: "Buyer",
        },
      },
    ]);
  });

  test("prepares payment and dispatches a normalized payment request", async () => {
    const prepared: PreparedPaymentResponse = {
      order_id: "order-1",
      order_name: "Test order",
      amount: 12000,
      buyer_name: "Buyer",
      buyer_email: "",
      buyer_tel: "010-1234-5678",
      pg_service: "kcp",
      pg_extra: {
        kcp: {
          site_cd: "site-cd",
          pay_method: "100000000000",
          approval_key: "approval-key",
          pay_url: "https://kcp.example.com",
        },
      },
    };
    const deps = buildDeps(prepared);
    const notices: string[] = [];
    const orderBody: OrderBody = {
      od_name: "Buyer",
    };

    await requestPreparedOrderPayment({
      orderBody,
      paymentConfig: paymentConfig(),
      methodDef: paymentMethod(),
      origin: "https://shop.example.com",
      onPaymentProgress: (notice) => notices.push(notice.title),
      deps,
    });

    expect(deps.postCalls).toEqual([
      {
        path: "/shop/payment/prepare",
        body: orderBody,
      },
    ]);
    expect(notices).toHaveLength(1);
    expect(deps.paymentRequests).toHaveLength(1);
    expect(deps.paymentRequests[0]).toMatchObject({
      pg_service: "kcp",
      client_key: "client-key",
      client_mid: "merchant-id",
      script_url: "https://pay.example.com/sdk.js",
      method: "card",
      success_url: "https://shop.example.com/shop/payment/success",
      fail_url: "https://shop.example.com/shop/payment/fail",
      order: {
        order_id: "order-1",
        order_name: "Test order",
        amount: 12000,
        buyer_name: "Buyer",
        buyer_email: "noemail@example.com",
        buyer_tel: "010-1234-5678",
        pg_extra: prepared.pg_extra,
      },
    });
  });

  test("uses configured pg service when prepared response omits pg service", async () => {
    const prepared: PreparedPaymentResponse = {
      order_id: "order-2",
      order_name: "Fallback PG order",
      amount: 5000,
      buyer_name: "Buyer",
      buyer_email: "buyer@example.com",
      buyer_tel: "010-0000-0000",
    };
    const deps = buildDeps(prepared);

    await requestPreparedOrderPayment({
      orderBody: { od_name: "Buyer" },
      paymentConfig: paymentConfig(),
      methodDef: paymentMethod({ pg_method: "vbank" }),
      origin: "https://shop.example.com",
      onPaymentProgress: () => undefined,
      deps,
    });

    expect(deps.paymentRequests[0]).toMatchObject({
      pg_service: "inicis",
      method: "vbank",
      order: {
        buyer_email: "buyer@example.com",
      },
    });
  });

  test("rejects invalid prepared payment inputs before requesting payment", async () => {
    const missingMethodDeps = buildDeps();

    await expect(
      requestPreparedOrderPayment({
        orderBody: { od_name: "Buyer" },
        paymentConfig: paymentConfig(),
        methodDef: paymentMethod({ pg_method: undefined }),
        origin: "https://shop.example.com",
        onPaymentProgress: () => undefined,
        deps: missingMethodDeps,
      })
    ).rejects.toThrow();
    expect(missingMethodDeps.postCalls).toEqual([]);
    expect(missingMethodDeps.paymentRequests).toEqual([]);

    const missingPreparedDeps = buildDeps(undefined);

    await expect(
      requestPreparedOrderPayment({
        orderBody: { od_name: "Buyer" },
        paymentConfig: paymentConfig(),
        methodDef: paymentMethod(),
        origin: "https://shop.example.com",
        onPaymentProgress: () => undefined,
        deps: missingPreparedDeps,
      })
    ).rejects.toThrow();
    expect(missingPreparedDeps.paymentRequests).toEqual([]);
  });

  test("passes the chosen easy-pay service to the PG instead of the server default", async () => {
    const prepared: PreparedPaymentResponse = {
      order_id: "order-2",
      order_name: "Easy pay order",
      amount: 5000,
      buyer_name: "Buyer",
      buyer_email: "buyer@example.com",
      buyer_tel: "010-1234-5678",
      pg_service: "nicepay",
      pg_extra: {
        nicepay: {
          mid: "mid",
          edi_date: "20260929000000",
          sign_data: "sign",
          easy_pay_services: ["nicepay_naverpay", "nicepay_samsungpay"],
          easy_pay_service: "nicepay_naverpay",
        },
      },
    };
    const easyPay = paymentMethod({ value: "easy_pay", label: "간편결제", settle_case: "간편결제", pg_method: "easy_pay" });

    const chosen = buildDeps(prepared);
    await requestPreparedOrderPayment({
      orderBody: { od_name: "Buyer" },
      paymentConfig: paymentConfig(),
      methodDef: easyPay,
      easyPayService: "nicepay_samsungpay",
      origin: "https://shop.example.com",
      onPaymentProgress: () => {},
      deps: chosen,
    });
    expect(chosen.paymentRequests[0].order.pg_extra?.nicepay?.easy_pay_service).toBe("nicepay_samsungpay");

    // 서버가 켜 두지 않은 서비스는 무시하고 서버의 대표 서비스를 쓴다.
    const unknown = buildDeps(prepared);
    await requestPreparedOrderPayment({
      orderBody: { od_name: "Buyer" },
      paymentConfig: paymentConfig(),
      methodDef: easyPay,
      easyPayService: "nicepay_lpay",
      origin: "https://shop.example.com",
      onPaymentProgress: () => {},
      deps: unknown,
    });
    expect(unknown.paymentRequests[0].order.pg_extra?.nicepay?.easy_pay_service).toBe("nicepay_naverpay");
  });
});
