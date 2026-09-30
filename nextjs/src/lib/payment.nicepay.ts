import { api } from "@/lib/api";
import {
  cancelPreparedPayment,
  isMobileDevice,
  paymentMessageOrigins,
  paymentTaxAmounts,
  postPaymentResult,
} from "./payment.shared";
import type { NicepayExtra, PaymentMethod, PaymentRequest } from "./payment.types";

export function createNicepayConfirmPayload(
  fields: Record<string, string>,
  req: PaymentRequest
) {
  return {
    pg_service: "nicepay",
    order_id: req.order.order_id || fields.Moid || fields.MOID || "",
    amount: req.order.amount || Number(fields.Amt || 0),
    AuthResultCode: fields.AuthResultCode || fields.ResultCode || "",
    AuthResultMsg: fields.AuthResultMsg || fields.ResultMsg || "",
    AuthToken: fields.AuthToken || fields.authToken || "",
    TxTid: fields.TxTid || fields.TID || fields.tid || "",
    TID: fields.TID || fields.TxTid || fields.tid || "",
    NextAppURL: fields.NextAppURL || fields.nextAppURL || "",
    NetCancelURL: fields.NetCancelURL || fields.netCancelUrl || "",
    MID: fields.MID || fields.mid || "",
    Moid: fields.Moid || fields.MOID || req.order.order_id || "",
    Amt: fields.Amt || String(req.order.amount),
    PayMethod: fields.PayMethod || "",
    Signature: fields.Signature || fields.signature || "",
    VbankBankName: fields.VbankBankName || "",
    VbankNum: fields.VbankNum || "",
    VbankExpDate: fields.VbankExpDate || "",
    VbankExpTime: fields.VbankExpTime || "",
  };
}

async function confirmNicepayPaymentPayload(
  fields: Record<string, string>,
  req: PaymentRequest
) {
  await api.post("/shop/payment/confirm", createNicepayConfirmPayload(fields, req));
}

const NICEPAY_PC_SCRIPT_URL =
  "https://web.nicepay.co.kr/v3/webstd/js/nicepay-3.0.js";
const NICEPAY_MOBILE_URL = "https://web.nicepay.co.kr/v3/v3Payment.jsp";
const NICEPAY_FORM_ID = "nicepayForm";

type NicepayWindow = Window & {
  goPay?: (form: HTMLFormElement) => void;
  nicepaySubmit?: () => void;
  nicepayClose?: (resultCode?: string, resultMsg?: string) => void;
};

const NICEPAY_RESPONSE_FIELDS = [
  "AuthResultCode",
  "AuthResultMsg",
  "AuthToken",
  "PayMethod",
  "MID",
  "Moid",
  "Amt",
  "ReqReserved",
  "TxTid",
  "NextAppURL",
  "NetCancelURL",
  "Signature",
  "ResultCode",
  "ResultMsg",
  "TID",
  "VbankBankName",
  "VbankNum",
  "VbankExpDate",
  "VbankExpTime",
] as const;

function nicepayAllowedMessageOrigins(nicepay?: NicepayExtra) {
  return paymentMessageOrigins(nicepay?.return_url);
}
function clearNicepayCallbacks() {
  const hostWindow = window as NicepayWindow;
  delete hostWindow.nicepaySubmit;
  delete hostWindow.nicepayClose;
}

function cleanupNicepayForm() {
  document.getElementById(NICEPAY_FORM_ID)?.remove();
}

function loadNicepayScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const targetUrl = new URL(src, window.location.href).toString();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${targetUrl}"]`
    );
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script =
      existing && existing.src === targetUrl
        ? existing
        : document.createElement("script");
    script.src = targetUrl;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () =>
      reject(new Error(`Nicepay script load failed: ${targetUrl}`));
    if (!script.parentElement) document.head.appendChild(script);
  });
}

function createNicepayForm(fields: Record<string, string>, action: string) {
  cleanupNicepayForm();
  const form = document.createElement("form");
  form.id = NICEPAY_FORM_ID;
  form.name = NICEPAY_FORM_ID;
  form.method = "POST";
  form.action = action;
  form.acceptCharset = "euc-kr";
  form.style.cssText =
    "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;";

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  return form;
}

function getNicepayField(form: HTMLFormElement, name: string) {
  const found = form.elements.namedItem(name);
  const inputCtor = form.ownerDocument.defaultView?.HTMLInputElement;
  return inputCtor && found instanceof inputCtor ? found.value : "";
}

function collectNicepayFields(form: HTMLFormElement) {
  const fields: Record<string, string> = {};
  NICEPAY_RESPONSE_FIELDS.forEach((name) => {
    const value = getNicepayField(form, name);
    if (value !== "") fields[name] = value;
  });
  return fields;
}

export function createNicepayFields(req: PaymentRequest, nicepay: NicepayExtra) {
  const payMethodMap: Record<PaymentMethod, string> = {
    card: "CARD",
    vbank: "VBANK",
    iche: "BANK",
    hp: "CELLPHONE",
    easy_pay: "CARD",
    kakaopay: "CARD",
  };
  const tel = (req.order.buyer_tel || "").replace(/[^0-9]/g, "");
  const email = req.order.buyer_email || "noemail@example.com";
  const taxAmounts = paymentTaxAmounts(req.order);

  const fields: Record<string, string> = {
    PayMethod: payMethodMap[req.method] || "CARD",
    GoodsName: req.order.order_name || "Order",
    Amt: String(req.order.amount),
    MID: nicepay.mid || req.client_mid || "",
    Moid: req.order.order_id,
    BuyerName: req.order.buyer_name || "",
    BuyerEmail: email,
    BuyerTel: tel,
    ReturnURL: nicepay.return_url || `${req.success_url}?pg=nicepay`,
    VbankExpDate: req.method === "vbank" ? nicepay.vbank_exp_date || "" : "",
    NpLang: "KO",
    GoodsCl: "1",
    TransType: nicepay.trans_type || "0",
    CharSet: "utf-8",
    ReqReserved: "",
    EdiDate: nicepay.edi_date || "",
    SignData: nicepay.sign_data || "",
    DirectShowOpt: req.method === "easy_pay" ? "CARD" : "",
    SelectCardCode: "",
    NicepayReserved: "",
    DirectEasyPay: "",
    EasyPayMethod: "",
    EasyPayCardCode: "",
    EasyPayQuota: "",
    MultiEasyPayQuota: "",
  };

  if (nicepay.wap_url) {
    fields.WapUrl = nicepay.wap_url;
  }
  if (nicepay.isp_cancel_url) {
    fields.IspCancelUrl = nicepay.isp_cancel_url;
  }

  if (taxAmounts.enabled) {
    fields.SupplyAmt = String(taxAmounts.tax);
    fields.GoodsVat = String(taxAmounts.vat);
    fields.TaxFreeAmt = String(taxAmounts.free);
  }

  if (req.method === "easy_pay") {
    switch (nicepay.easy_pay_service) {
      case "nicepay_naverpay":
        fields.DirectEasyPay = "E020";
        fields.EasyPayMethod = "E020=CARD";
        break;
      case "nicepay_kakaopay":
        fields.NicepayReserved = "DirectKakao=Y";
        break;
      case "nicepay_samsungpay":
        fields.DirectEasyPay = "E021";
        break;
      case "nicepay_paycopay":
        fields.NicepayReserved = "DirectPayco=Y";
        break;
      case "nicepay_skpay":
        fields.NicepayReserved = "DirectPay11=Y";
        break;
      case "nicepay_ssgpay":
        fields.DirectEasyPay = "E007";
        break;
      case "nicepay_lpay":
        fields.DirectEasyPay = "E018";
        break;
      default:
        break;
    }
  }

  return fields;
}

export function shouldUseNicepayMobile(nicepay?: NicepayExtra) {
  if (nicepay?.module_type === "pc") return false;
  if (nicepay?.module_type === "mobile") return true;
  return isMobileDevice();
}

export function requestNicepayPayment(req: PaymentRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const nicepay = req.order.pg_extra?.nicepay;
    if (!nicepay) {
      reject(new Error("Nicepay prepare response is missing."));
      return;
    }
    if (nicepay.registration_error) {
      reject(new Error(nicepay.registration_error));
      return;
    }
    if (!nicepay.mid || !nicepay.edi_date || !nicepay.sign_data) {
      reject(new Error("Nicepay MID/signature is missing."));
      return;
    }

    const isMobile = shouldUseNicepayMobile(nicepay);
    const fields = createNicepayFields(req, nicepay);
    const form = createNicepayForm(fields, nicepay.return_url || "");

    if (isMobile) {
      form.action = nicepay.mobile_url || NICEPAY_MOBILE_URL;
      form.acceptCharset = "euc-kr";
      const charsetInput = form.querySelector<HTMLInputElement>(
        'input[name="CharSet"]'
      );
      if (charsetInput) charsetInput.value = "euc-kr";
      form.submit();
      resolve();
      return;
    }

    const hostWindow = window as NicepayWindow;
    const bodySnapshot = new Set<Element>(Array.from(document.body.children));
    const allowedOrigins = nicepayAllowedMessageOrigins(nicepay);
    let resultCompleted = false;
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    function cleanup() {
      if (resultTimer) window.clearTimeout(resultTimer);
      window.removeEventListener("message", onNicepayMessage);
      Array.from(document.body.children).forEach((element) => {
        if (!bodySnapshot.has(element)) element.remove();
      });
      cleanupNicepayForm();
      clearNicepayCallbacks();
    }

    function finish(fn: () => Promise<void> | void) {
      if (resultCompleted) return;
      resultCompleted = true;
      void Promise.resolve().then(fn).catch(async (err: unknown) => {
        cleanup();
        await cancelPreparedPayment(
          req,
          err instanceof Error ? err.message : "Nicepay payment failed"
        );
        postPaymentResult({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "Nicepay payment confirmation failed.",
        });
        settle(() => {
          reject(err instanceof Error ? err : new Error("Nicepay payment failed"));
        });
      });
    }

    function onNicepayMessage(event: MessageEvent) {
      if (!allowedOrigins.has(event.origin)) return;
      const data = event.data as
        | {
            type?: string;
            status?: "success" | "error" | "cancelled";
            orderId?: string;
            message?: string;
            fields?: Record<string, string>;
          }
        | undefined;
      if (!data) return;

      if (data.type === "shop-nicepay-auth-result") {
        finish(async () => {
          cleanup();
          if (data.status !== "success" || !data.fields) {
            await cancelPreparedPayment(
              req,
              data.message || "Nicepay authentication failed"
            );
            postPaymentResult({
              status: "error",
              message: data.message || "Nicepay authentication failed.",
            });
            settle(() => {
              reject(new Error(data.message || "Nicepay authentication failed."));
            });
            return;
          }

          await confirmNicepayPaymentPayload(data.fields, req);
          postPaymentResult({ status: "success", orderId: req.order.order_id });
          settle(() => resolve());
        });
        return;
      }

      if (data.type === "shop-payment-result") {
        finish(async () => {
          cleanup();
          if (data.status === "success" && data.orderId) {
            postPaymentResult({ status: "success", orderId: data.orderId });
            settle(() => resolve());
            return;
          }

          const isCancelled = data.status === "cancelled";
          const message =
            data.message ||
            (isCancelled
              ? "Payment was cancelled."
              : "Nicepay payment was not completed.");
          await cancelPreparedPayment(
            req,
            isCancelled
              ? "Nicepay payment cancelled"
              : data.message || "Nicepay payment failed"
          );
          postPaymentResult({
            status: isCancelled ? "cancelled" : "error",
            message,
          });
          settle(() => {
            reject(new Error(message));
          });
        });
      }
    }

    hostWindow.nicepaySubmit = () => {
      finish(async () => {
        const responseFields = collectNicepayFields(form);
        const code =
          responseFields.AuthResultCode || responseFields.ResultCode || "";
        if (code && code !== "0000") {
          await cancelPreparedPayment(
            req,
            responseFields.AuthResultMsg || responseFields.ResultMsg || code
          );
          cleanup();
          postPaymentResult({
            status: "error",
            message:
              responseFields.AuthResultMsg ||
              responseFields.ResultMsg ||
              `Nicepay authentication failed: ${code}`,
          });
          settle(() => {
            reject(
              new Error(
                responseFields.AuthResultMsg ||
                  responseFields.ResultMsg ||
                  `Nicepay authentication failed: ${code}`
              )
            );
          });
          return;
        }
        await confirmNicepayPaymentPayload(responseFields, req);
        cleanup();
        postPaymentResult({ status: "success", orderId: req.order.order_id });
        settle(() => resolve());
      });
    };

    hostWindow.nicepayClose = (_resultCode?: string, resultMsg?: string) => {
      finish(async () => {
        cleanup();
        await cancelPreparedPayment(req, resultMsg || "Nicepay payment cancelled");
        postPaymentResult({
          status: "cancelled",
          message: resultMsg || "Payment was cancelled.",
        });
        settle(() => {
          reject(new Error(resultMsg || "Payment was cancelled."));
        });
      });
    };

    window.addEventListener("message", onNicepayMessage);
    const resultTimer = window.setTimeout(() => {
      finish(async () => {
        cleanup();
        await cancelPreparedPayment(req, "Nicepay payment response timeout");
        postPaymentResult({
          status: "error",
          message:
            "Nicepay payment response timed out. Close the payment window and try again.",
        });
        settle(() => {
          reject(new Error("Nicepay payment response timeout"));
        });
      });
    }, 300000);

    loadNicepayScript(req.script_url || nicepay.script_url || NICEPAY_PC_SCRIPT_URL)
      .then(() => {
        if (typeof hostWindow.goPay !== "function") {
          cleanup();
          reject(new Error("Nicepay goPay is not defined."));
          return;
        }
        try {
          hostWindow.goPay(form);
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
}
