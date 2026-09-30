import { api } from "@/lib/api";
import {
  cancelPreparedPayment,
  isMobileDevice,
  paymentMessageOrigins,
  paymentTaxAmounts,
} from "./payment.shared";
import type { InicisExtra, PaymentMethod, PaymentRequest } from "./payment.types";

export const INICIS_MOBILE_DEFAULT_RESERVED =
  "bank_receipt=N&twotrs_isp=Y&block_isp=Y&centerCd=Y";
export const INICIS_WEB_STD_DEFAULT_ACCEPT_METHOD =
  "HPP(2):no_receipt:vbank(3):below1000:centerCd(Y)";
export const INICIS_MOBILE_URL = "https://mobile.inicis.com/smart/";
export const INICIS_MOBILE_TEST_URL = "https://stgmobile.inicis.com/smart/";

export function shouldUseInicisMobile(
  inicis?: Pick<InicisExtra, "module_type">,
  isMobileDeviceValue = false
) {
  if (inicis?.module_type === "mobile") return true;
  if (inicis?.module_type === "pc") return false;
  return isMobileDeviceValue;
}

export function inicisMobilePayMethod(method: PaymentMethod) {
  if (method === "vbank") return "vbank";
  if (method === "iche") return "bank";
  if (method === "hp") return "mobile";
  return "wcard";
}

export function inicisMobileReserved(
  inicis: Pick<InicisExtra, "direct_method" | "mobile_reserved">
) {
  const baseReserved =
    inicis.mobile_reserved || INICIS_MOBILE_DEFAULT_RESERVED;
  if (
    inicis.direct_method === "kakaopay" &&
    !baseReserved.includes("d_kakaopay=Y")
  ) {
    return `${baseReserved}&d_kakaopay=Y`;
  }
  return baseReserved;
}

export function inicisMobileActionUrl(
  configuredUrl: string,
  paymethod: string
) {
  return /\/(payment|wcard|vbank|bank|mobile)\/?$/i.test(configuredUrl)
    ? configuredUrl
    : `${configuredUrl.replace(/\/?$/, "/")}${paymethod}/`;
}

export function resolveInicisMobileUrl(
  inicis: Pick<InicisExtra, "mobile_url"> | undefined,
  scriptUrl: string
) {
  if (inicis?.mobile_url) return inicis.mobile_url;
  if (/\/stdjs\/INIStdPay\.js(?:[?#].*)?$/i.test(scriptUrl)) {
    return /stg/i.test(scriptUrl) ? INICIS_MOBILE_TEST_URL : INICIS_MOBILE_URL;
  }
  return scriptUrl || INICIS_MOBILE_TEST_URL;
}

export function isInicisKakaoPay(
  method: PaymentMethod,
  directMethod?: InicisExtra["direct_method"]
) {
  return method === "kakaopay" || directMethod === "kakaopay";
}

export function inicisWebStdPayMethod(
  method: PaymentMethod,
  directMethod?: InicisExtra["direct_method"]
) {
  if (method === "vbank") return "VBank";
  if (method === "iche") return "DirectBank";
  if (method === "hp") return "HPP";
  if (method === "kakaopay" || directMethod === "kakaopay") {
    return "onlykakaopay";
  }
  return "Card";
}

export function createInicisMobileFields(
  req: PaymentRequest,
  inicis: InicisExtra
) {
  const taxAmounts = paymentTaxAmounts(req.order);
  const mobileReserved = inicisMobileReserved(inicis);
  const fields: Record<string, string> = {
    P_OID: inicis.oid,
    P_GOODS: req.order.order_name,
    P_AMT: inicis.price || String(req.order.amount),
    P_UNAME: req.order.buyer_name,
    P_MOBILE: req.order.buyer_tel,
    P_EMAIL: req.order.buyer_email || "test@test.com",
    P_MID: inicis.mid,
    P_NEXT_URL:
      inicis.mobile_next_url ||
      inicis.return_url ||
      `${req.success_url}?pg=inicis`,
    P_NOTI_URL: inicis.mobile_noti_url || "",
    P_RETURN_URL:
      inicis.mobile_return_url ||
      inicis.return_url ||
      `${req.success_url}?pg=inicis`,
    P_HPP_METHOD: "2",
    P_RESERVED: mobileReserved,
    DEF_RESERVED: mobileReserved,
    P_NOTI: req.order.order_id,
    P_QUOTABASE: "01:02:03:04:05:06:07:08:09:10:11:12",
    P_SKIP_TERMS: inicis.direct_method === "kakaopay" ? "Y" : "",
    P_CHARSET: "utf8",
    good_mny: String(req.order.amount),
  };

  if (taxAmounts.enabled) {
    fields.P_TAX = String(taxAmounts.vat);
    fields.P_TAXFREE = String(taxAmounts.free);
  }
  if (inicis.mobile_chkfake) {
    fields.P_TIMESTAMP = inicis.timestamp;
    fields.P_CHKFAKE = inicis.mobile_chkfake;
  }

  return fields;
}

export function createInicisWebStdFields(
  req: PaymentRequest,
  inicis: InicisExtra
) {
  const taxAmounts = paymentTaxAmounts(req.order);
  const isKakaoPay = isInicisKakaoPay(req.method, inicis.direct_method);
  const fields: Record<string, string> = {
    version: "1.0",
    gopaymethod: inicisWebStdPayMethod(req.method, inicis.direct_method),
    mid: inicis.mid,
    oid: inicis.oid,
    price: inicis.price,
    timestamp: inicis.timestamp,
    signature: inicis.signature,
    verification: inicis.verification,
    mKey: inicis.mKey,
    use_chkfake: "Y",
    currency: "WON",
    goodname: req.order.order_name,
    buyername: req.order.buyer_name,
    buyertel: req.order.buyer_tel,
    buyeremail: req.order.buyer_email || "test@test.com",
    returnUrl: inicis.return_url || req.success_url + "?pg=inicis",
    closeUrl: inicis.close_url || req.fail_url,
    popupUrl: inicis.popup_url || "",
    charset: "UTF-8",
    payViewType: "overlay",
    acceptmethod:
      inicis.acceptmethod || INICIS_WEB_STD_DEFAULT_ACCEPT_METHOD,
  };

  if (fields.gopaymethod === "onlykakaopay") {
    fields.acceptmethod = "cardonly";
  }

  if (taxAmounts.enabled) {
    fields.tax = String(taxAmounts.vat);
    fields.taxfree = String(taxAmounts.free);
    if (isKakaoPay) {
      fields.SupplyAmt = String(taxAmounts.supply);
      fields.GoodsVat = String(taxAmounts.vat);
    }
  }

  return fields;
}

export function createInicisConfirmPayload(
  fields: Record<string, string>,
  req: PaymentRequest
) {
  return {
    pg_service: req.pg_service === "kakaopay" ? "kakaopay" : "inicis",
    order_id:
      req.order.order_id ||
      fields.MOID ||
      fields.Moid ||
      fields.orderNumber ||
      fields.P_OID ||
      fields.P_NOTI ||
      "",
    amount:
      req.order.amount ||
      Number(fields.TotPrice || fields.price || fields.P_AMT || 0),
    resultCode: fields.resultCode || "",
    resultMsg: fields.resultMsg || "",
    authToken: fields.authToken || fields.AuthToken || "",
    authUrl: fields.authUrl || "",
    netCancelUrl: fields.netCancelUrl || "",
    mid: fields.mid || "",
    MOID: fields.MOID || fields.Moid || fields.orderNumber || "",
    TotPrice: fields.TotPrice || fields.price || "",
    authSignature: fields.authSignature || "",
    idc_name: fields.idc_name || "",
    payMethod: fields.payMethod || "",
    tid: fields.tid || fields.TID || "",
    VACT_BankCode: fields.VACT_BankCode || "",
    VACT_Num: fields.VACT_Num || "",
    VACT_Name: fields.VACT_Name || "",
    VACT_InputName: fields.VACT_InputName || "",
    VACT_Date: fields.VACT_Date || "",
    VACT_Time: fields.VACT_Time || "",
    P_STATUS: fields.P_STATUS || "",
    P_RMESG1: fields.P_RMESG1 || "",
    P_TID: fields.P_TID || "",
    P_AMT: fields.P_AMT || "",
    P_REQ_URL: fields.P_REQ_URL || "",
    P_NOTI: fields.P_NOTI || "",
    P_MID: fields.P_MID || "",
    P_OID: fields.P_OID || "",
    P_TYPE: fields.P_TYPE || "",
    P_AUTH_DT: fields.P_AUTH_DT || "",
    P_AUTH_NO: fields.P_AUTH_NO || "",
    P_UNAME: fields.P_UNAME || "",
    P_VACT_NUM: fields.P_VACT_NUM || "",
    P_VACT_NAME: fields.P_VACT_NAME || "",
    P_VACT_BANK_CODE: fields.P_VACT_BANK_CODE || "",
    P_VACT_DATE: fields.P_VACT_DATE || "",
    P_VACT_TIME: fields.P_VACT_TIME || "",
    P_CARD_ISSUER_CODE: fields.P_CARD_ISSUER_CODE || "",
    mobile_verification: fields.mobile_verification || "",
  };
}

/**
 * Open KG Inicis WebStandard popup or mobile form flow.
 */
export function requestInicisPayment(req: PaymentRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const inicisExtra = req.order.pg_extra?.inicis;
    const useMobileModule = shouldUseInicisMobile(
      inicisExtra,
      !inicisExtra?.module_type && isMobileDevice()
    );
    const scriptUrl =
      req.script_url ||
      inicisExtra?.script_url ||
      (useMobileModule
        ? "https://stgmobile.inicis.com/smart/payment/"
        : "https://stgstdpay.inicis.com/stdjs/INIStdPay.js");

    if (useMobileModule) {
      if (!inicisExtra) {
        reject(
          new Error(
            "Inicis 결제 정보가 누락되었습니다. (서버에서 서명 필드를 받지 못함)"
          )
        );
        return;
      }
      if (inicisExtra.registration_error) {
        reject(new Error(inicisExtra.registration_error));
        return;
      }

      const paymethod = inicisMobilePayMethod(req.method);
      const configuredUrl = resolveInicisMobileUrl(inicisExtra, scriptUrl);
      const action = inicisMobileActionUrl(configuredUrl, paymethod);

      const form = document.createElement("form");
      form.method = "POST";
      form.action = action;
      form.target = "_self";
      form.acceptCharset = "EUC-KR";

      const fields = createInicisMobileFields(req, inicisExtra);

      Object.entries(fields).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="INIStdPay.js"]'
    );
    const loadScript = existing
      ? Promise.resolve()
      : new Promise<void>((res, rej) => {
          const script = document.createElement("script");
          script.src = scriptUrl;
          script.onload = () => res();
          script.onerror = () => rej(new Error("INIStdPay 로드 실패"));
          document.head.appendChild(script);
        });

    loadScript
      .then(() => {
        if (!inicisExtra) {
          reject(
            new Error(
              "Inicis 결제 정보가 누락되었습니다. (서버에서 서명 필드를 받지 못함)"
            )
          );
          return;
        }
        if (inicisExtra.registration_error) {
          reject(new Error(inicisExtra.registration_error));
          return;
        }

        const allowedOrigins = inicisAllowedMessageOrigins(inicisExtra);
        let resultReceived = false;
        let paymentForm: HTMLFormElement | null = null;
        const cleanup = () => {
          if (resultTimer) window.clearTimeout(resultTimer);
          window.removeEventListener("message", onInicisMessage);
          paymentForm?.remove();
          paymentForm = null;
        };
        const postResult = (
          payload:
            | { status: "success"; orderId: string }
            | { status: "error" | "cancelled"; message?: string }
        ) => {
          window.postMessage(
            {
              type: "shop-payment-result",
              ...payload,
            },
            window.location.origin
          );
        };
        const finish = (task: () => Promise<void>) => {
          if (resultReceived) return;
          resultReceived = true;
          task().catch(async (err: unknown) => {
            cleanup();
            await cancelPreparedPayment(
              req,
              err instanceof Error ? err.message : "Inicis payment failed"
            );
            postResult({
              status: "error",
              message:
                err instanceof Error
                  ? err.message
                  : "KG 이니시스 결제가 완료되지 않았습니다.",
            });
            reject(err instanceof Error ? err : new Error("Inicis payment failed"));
          });
        };
        function onInicisMessage(event: MessageEvent) {
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

          if (data.type === "shop-inicis-auth-result") {
            finish(async () => {
              cleanup();
              if (data.status !== "success" || !data.fields) {
                await cancelPreparedPayment(
                  req,
                  data.message || "Inicis authentication failed"
                );
                postResult({
                  status: "error",
                  message:
                    data.message ||
                    "KG 이니시스 인증이 완료되지 않았습니다.",
                });
                reject(new Error(data.message || "Inicis authentication failed"));
                return;
              }

              await confirmInicisPaymentPayload(data.fields, req);
              postResult({ status: "success", orderId: req.order.order_id });
              resolve();
            });
            return;
          }

          if (data.type === "shop-payment-result") {
            finish(async () => {
              cleanup();
              if (data.status === "success" && data.orderId) {
                postResult({ status: "success", orderId: data.orderId });
                resolve();
                return;
              }

              const isCancelled = data.status === "cancelled";
              const message =
                data.message ||
                (isCancelled
                  ? "결제가 취소되었습니다."
                  : "KG 이니시스 결제가 완료되지 않았습니다.");
              await cancelPreparedPayment(
                req,
                isCancelled
                  ? "Inicis payment cancelled"
                  : data.message || "Inicis payment failed"
              );
              postResult({
                status: isCancelled ? "cancelled" : "error",
                message:
                  data.message ||
                  (isCancelled
                    ? "결제가 취소되었습니다."
                    : "KG 이니시스 결제가 완료되지 않았습니다."),
              });
              reject(new Error(message));
            });
          }
        }
        window.addEventListener("message", onInicisMessage);
        const resultTimer = window.setTimeout(() => {
          finish(async () => {
            const message =
              "KG 이니시스 결제 응답을 받지 못했습니다. 결제창을 닫고 다시 시도해 주세요.";
            await cancelPreparedPayment(req, "Inicis payment response timeout");
            cleanup();
            postResult({
              status: "error",
              message,
            });
            reject(new Error(message));
          });
        }, 300000);

        const form = document.createElement("form");
        form.id = "SendPayForm_id";
        form.method = "POST";
        form.acceptCharset = "UTF-8";
        paymentForm = form;

        const fields = createInicisWebStdFields(req, inicisExtra);

        Object.entries(fields).forEach(([key, value]) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });

        document.body.appendChild(form);

        const hostWindow = window as unknown as {
          INIStdPay?: { pay: (formId: string) => void };
        };
        if (hostWindow.INIStdPay) {
          try {
            hostWindow.INIStdPay.pay("SendPayForm_id");
          } catch (err) {
            cleanup();
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        } else {
          cleanup();
          reject(new Error("INIStdPay 객체를 찾을 수 없습니다."));
        }
      })
      .catch(reject);
  });
}

function inicisAllowedMessageOrigins(inicis?: InicisExtra) {
  return paymentMessageOrigins(
    inicis?.return_url,
    inicis?.close_url,
    inicis?.mobile_next_url,
    inicis?.mobile_return_url
  );
}

async function confirmInicisPaymentPayload(
  fields: Record<string, string>,
  req: PaymentRequest
) {
  await api.post(
    "/shop/payment/confirm",
    createInicisConfirmPayload(fields, req)
  );
}
