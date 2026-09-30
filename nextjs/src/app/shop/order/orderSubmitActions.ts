import { api, type ApiResponse } from "@/lib/api";
import { requestPayment as requestPaymentAction } from "@/lib/payment";
import type { AddressForm, AddressSelection } from "./orderAddressHelpers";
import type { PaymentConfig, PaymentNotice } from "./orderPaymentHelpers";
import { withEasyPayService, type PayMethodDef } from "./orderPaymentHelpers";
import { getPaymentProgressNotice } from "./orderSubmitFeedback";
import { buildAddressBookPayload } from "./orderSubmitPayload";
import type {
  CreatedOrderResponse,
  OrderBody,
  PreparedPaymentResponse,
} from "./orderSubmitTypes";
import { shouldPersistAddress } from "./orderSubmitValidation";

type PersistAddressBookEntryInput = {
  addressSelection: AddressSelection;
  saveAsNewAddress: boolean;
  recipient: AddressForm;
  newAddressSubject: string;
  newAddressDefault: boolean;
  deps?: Partial<OrderSubmitActionsDeps>;
};

type CreateBankOrderInput = {
  orderBody: OrderBody;
  bankAccount: string;
  depositName: string;
  deps?: Partial<OrderSubmitActionsDeps>;
};

type RequestPreparedOrderPaymentInput = {
  orderBody: OrderBody;
  paymentConfig: PaymentConfig;
  methodDef: PayMethodDef;
  /** 간편결제에서 고른 서비스. 서버가 채운 대표 서비스 대신 PG 에 넘긴다(서버 목록에 있는 것만). */
  easyPayService?: string;
  origin: string;
  onPaymentProgress: (notice: PaymentNotice) => void;
  deps?: Partial<OrderSubmitActionsDeps>;
};

type ApiPost = <T>(path: string, body?: unknown) => Promise<ApiResponse<T>>;

export type OrderSubmitActionsDeps = {
  post: ApiPost;
  requestPayment: typeof requestPaymentAction;
};

const defaultOrderSubmitActionsDeps: OrderSubmitActionsDeps = {
  post: (path, body) => api.post(path, body),
  requestPayment: requestPaymentAction,
};

function resolveOrderSubmitActionsDeps(
  deps?: Partial<OrderSubmitActionsDeps>
): OrderSubmitActionsDeps {
  return { ...defaultOrderSubmitActionsDeps, ...deps };
}

export async function persistAddressBookEntryIfNeeded({
  addressSelection,
  saveAsNewAddress,
  recipient,
  newAddressSubject,
  newAddressDefault,
  deps,
}: PersistAddressBookEntryInput): Promise<void> {
  if (!shouldPersistAddress(addressSelection, saveAsNewAddress)) return;

  const actionDeps = resolveOrderSubmitActionsDeps(deps);

  try {
    await actionDeps.post(
      "/shop/addresses",
      buildAddressBookPayload(
        recipient,
        newAddressSubject,
        newAddressDefault
      )
    );
  } catch {
    // Address book persistence is non-fatal for the order itself.
  }
}

export async function createBankOrder({
  orderBody,
  bankAccount,
  depositName,
  deps,
}: CreateBankOrderInput): Promise<CreatedOrderResponse | undefined> {
  const actionDeps = resolveOrderSubmitActionsDeps(deps);
  const res = await actionDeps.post<CreatedOrderResponse>("/shop/orders", {
    ...orderBody,
    od_bank_account: bankAccount,
    od_deposit_name: depositName,
  });

  return res.data;
}

export async function requestPreparedOrderPayment({
  orderBody,
  paymentConfig,
  methodDef,
  easyPayService,
  origin,
  onPaymentProgress,
  deps,
}: RequestPreparedOrderPaymentInput): Promise<void> {
  const actionDeps = resolveOrderSubmitActionsDeps(deps);

  if (!methodDef.pg_method) {
    throw new Error("결제 수단을 다시 선택해주세요.");
  }

  const prepRes = await actionDeps.post<PreparedPaymentResponse>(
    "/shop/payment/prepare",
    orderBody
  );

  const prepared = prepRes.data;
  if (!prepared) {
    throw new Error("결제 준비에 실패했습니다.");
  }
  const preparedPgService = prepared.pg_service || paymentConfig.pg_service;

  onPaymentProgress(getPaymentProgressNotice(preparedPgService));

  await actionDeps.requestPayment({
    pg_service: preparedPgService,
    client_key: paymentConfig.client.client_key || "",
    client_mid: paymentConfig.client.mid,
    script_url: paymentConfig.client.script_url,
    method: methodDef.pg_method,
    order: {
      order_id: prepared.order_id,
      order_name: prepared.order_name,
      amount: prepared.amount,
      buyer_name: prepared.buyer_name,
      buyer_email: prepared.buyer_email || "noemail@example.com",
      buyer_tel: prepared.buyer_tel,
      pg_extra: withEasyPayService(prepared.pg_extra, methodDef.value === "easy_pay" ? easyPayService || "" : ""),
    },
    success_url: `${origin}/shop/payment/success`,
    fail_url: `${origin}/shop/payment/fail`,
  });
}
