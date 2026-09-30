import { api } from "@/lib/api";
import {
  cancelPreparedPayment,
  isMobileDevice,
  paymentMessageOrigins,
  postPaymentResult,
} from "./payment.shared";
import {
  createKcpApprovalFields,
  createKcpConfirmPayload,
  createKcpFields,
  formatKcpFailureMessage,
  kcpScriptUrlForSiteCd,
  normalizeKcpScriptUrl,
} from "./payment.kcp.helpers";
import {
  KCP_DIM_OVERLAY_ID,
  KCP_SDK_FRAME_ID,
  cleanupKcpPayplusUi,
  cleanupKcpPcForm,
  cleanupKcpSdkFrame,
  clearKcpCallbacks,
  closeKcpPayplusUi,
  createKcpApprovalFrameHtml,
  createKcpConfirmFieldsFromForm,
  createKcpPcForm,
  getKcpField,
  loadKcpPayplusScript,
  mergeKcpResponseFields,
} from "./payment.kcp.runtime";
import type { KcpParentWindow } from "./payment.kcp.runtime";
import type { KcpExtra, PaymentRequest } from "./payment.types";

export {
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
} from "./payment.kcp.helpers";

function shouldUseKcpMobileApproval(kcp?: KcpExtra) {
  if (!kcp) return false;
  if (kcp.module_type === "pc") return false;
  if (kcp.module_type === "mobile") return true;
  return isMobileDevice() && (!!kcp.approval_key || !!kcp.pay_url);
}

const KCP_CANCEL_CODES = new Set(["3000", "3001", "7777"]);

type KcpPaymentMessage =
  | {
      type?: "shop-payment-result";
      status?: "success" | "error" | "cancelled";
      message?: string;
      orderId?: string;
    }
  | {
      type?: "shop-kcp-auth-result";
      status?: "success" | "error";
      message?: string;
      orderId?: string;
      amount?: number;
      fields?: Record<string, string>;
    };

function kcpAllowedMessageOrigins(kcp?: KcpExtra) {
  return paymentMessageOrigins(kcp?.return_url);
}
function postKcpResult(
  payload:
    | { status: "success"; orderId: string }
    | { status: "error" | "cancelled"; message?: string }
) {
  postPaymentResult(payload);
}

async function confirmKcpPaymentPayload(
  fields: Record<string, string>,
  req: PaymentRequest
) {
  await api.post("/shop/payment/confirm", createKcpConfirmPayload(fields, req));
}

async function confirmKcpPayment(form: HTMLFormElement, req: PaymentRequest) {
  await confirmKcpPaymentPayload(createKcpConfirmFieldsFromForm(form), req);
}

async function requestKcpApprovalPayment(req: PaymentRequest): Promise<void> {
  const kcp = req.order.pg_extra?.kcp;
  if (!kcp) {
    throw new Error("KCP prepare response is missing.");
  }
  if (kcp.registration_error) {
    throw new Error(kcp.registration_error);
  }
  if (!kcp.approval_key || !kcp.pay_url || !kcp.return_url) {
    throw new Error("KCP approval_key/pay_url/return_url is missing.");
  }

  const payUrl = kcp.pay_url;
  const fields = createKcpApprovalFields(req, kcp);
  const allowedOrigins = kcpAllowedMessageOrigins(kcp);

  await new Promise<void>((resolve, reject) => {
    cleanupKcpSdkFrame();
    clearKcpCallbacks();
    const previousWindowName = window.name;
    window.name = "tar_opener";

    const overlay = document.createElement("div");
    overlay.id = KCP_DIM_OVERLAY_ID;
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;";
    document.body.appendChild(overlay);

    const iframe = document.createElement("iframe");
    iframe.id = KCP_SDK_FRAME_ID;
    iframe.title = "KCP payment";
    iframe.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:99999;background:#fff;";
    document.body.appendChild(iframe);

    let settled = false;
    const resultTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      void cancelPreparedPayment(req, "KCP approval timeout").finally(() => {
        postKcpResult({
          status: "error",
          message:
            "KCP 결제 응답을 받지 못했습니다. 결제창을 닫고 주문서에서 다시 시도해주세요.",
        });
        resolve();
      });
    }, 300000);

    function cleanup() {
      window.clearTimeout(resultTimer);
      window.removeEventListener("message", onPaymentMessage);
      cleanupKcpSdkFrame();
      clearKcpCallbacks();
      window.name = previousWindowName;
    }

    function finish(fn: () => Promise<void> | void) {
      if (settled) return;
      settled = true;
      void Promise.resolve()
        .then(fn)
        .then(resolve, reject);
    }

    function onPaymentMessage(event: MessageEvent) {
      if (!allowedOrigins.has(event.origin)) return;
      const data = event.data as KcpPaymentMessage | undefined;
      if (!data || !data.type) return;

      if (data.type === "shop-kcp-auth-result") {
        finish(async () => {
          cleanup();
          if (data.status !== "success" || !data.fields) {
            await cancelPreparedPayment(
              req,
              data.message || "KCP authentication failed"
            );
            postKcpResult({
              status: "error",
              message: data.message || "KCP 인증이 완료되지 않았습니다.",
            });
            return;
          }

          await confirmKcpPaymentPayload(data.fields, req);
          postKcpResult({
            status: "success",
            orderId: req.order.order_id,
          });
        });
        return;
      }

      if (data.type === "shop-payment-result") {
        finish(async () => {
          cleanup();
          if (data.status === "success" && data.orderId) {
            postKcpResult({ status: "success", orderId: data.orderId });
            return;
          }

          const isCancelled = data.status === "cancelled";
          await cancelPreparedPayment(
            req,
            isCancelled ? "KCP payment cancelled" : data.message || "KCP payment failed"
          );
          postKcpResult({
            status: isCancelled ? "cancelled" : "error",
            message:
              data.message ||
              (isCancelled
                ? "결제가 취소되었습니다."
                : "KCP 결제가 완료되지 않았습니다."),
          });
        });
      }
    }

    window.addEventListener("message", onPaymentMessage);

    const iframeWindow = iframe.contentWindow;
    const iframeDocument = iframe.contentDocument || iframeWindow?.document;
    if (!iframeDocument) {
      cleanup();
      void cancelPreparedPayment(req, "KCP iframe creation failed");
      reject(new Error("KCP 결제창을 만들 수 없습니다."));
      return;
    }

    iframeDocument.open();
    iframeDocument.write(createKcpApprovalFrameHtml(payUrl, fields));
    iframeDocument.close();
  });
}

export async function requestKcpInlinePayment(req: PaymentRequest): Promise<void> {
  if (shouldUseKcpMobileApproval(req.order.pg_extra?.kcp)) {
    return requestKcpApprovalPayment(req);
  }

  const siteCd =
    req.order.pg_extra?.kcp?.site_cd || req.client_mid || "T0000";
  const scriptUrl = normalizeKcpScriptUrl(
    req.script_url || kcpScriptUrlForSiteCd(siteCd)
  );
  const fields = createKcpFields(req, siteCd);

  await new Promise<void>((resolve, reject) => {
    cleanupKcpSdkFrame();
    cleanupKcpPcForm();
    clearKcpCallbacks();

    const form = createKcpPcForm(fields);
    const hostWindow = window as KcpParentWindow;
    let settled = false;
    let resultCompleted = false;
    let resultTimer: number | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const markResultCompleted = () => {
      if (resultCompleted) return false;
      resultCompleted = true;
      if (resultTimer) window.clearTimeout(resultTimer);
      return true;
    };

    function cleanup() {
      if (sdkLoadTimer) window.clearTimeout(sdkLoadTimer);
      if (resultTimer) window.clearTimeout(resultTimer);
      cleanupKcpPayplusUi();
      cleanupKcpPcForm();
      clearKcpCallbacks();
    }

    const sdkLoadTimer = window.setTimeout(() => {
      if (!markResultCompleted()) return;
      cleanup();
      void cancelPreparedPayment(req, "KCP SDK load timeout");
      settle(() => {
        reject(new Error("KCP SDK load timeout"));
      });
    }, 15000);

    const startResultTimer = () => {
      if (sdkLoadTimer) window.clearTimeout(sdkLoadTimer);
      if (resultTimer) window.clearTimeout(resultTimer);
      resultTimer = window.setTimeout(() => {
        if (!markResultCompleted()) return;
        cleanup();
        void cancelPreparedPayment(req, "KCP 결제 응답 timeout").finally(() => {
          postKcpResult({
            status: "error",
            message:
              "KCP 결제 응답을 받지 못했습니다. 결제창을 닫고 주문서에서 다시 시도해주세요.",
          });
          settle(() => {
            reject(new Error("KCP payment response timeout"));
          });
        });
      }, 300000);
    };

    hostWindow.m_Completepayment = (formOrJson, closeEvent) => {
      try {
        hostWindow.GetField?.(form, formOrJson);
      } catch {
        // KCP PC can return either a form or a JSON-like object.
      }
      mergeKcpResponseFields(form, formOrJson);

      const resCd = getKcpField(form, "res_cd");
      const resMsg = getKcpField(form, "res_msg");
      const hasAuthPayload =
        !!getKcpField(form, "enc_info") &&
        !!getKcpField(form, "enc_data") &&
        !!getKcpField(form, "tran_cd");
      if (resCd === "0000" || (!resCd && hasAuthPayload)) {
        closeKcpPayplusUi(closeEvent);
        hostWindow.__nextjs25KcpComplete?.(form);
        return;
      }

      hostWindow.__nextjs25KcpFail?.(resCd, resMsg);
      closeKcpPayplusUi(closeEvent);
    };

    hostWindow.__nextjs25KcpComplete = (form) => {
      void (async () => {
        if (!markResultCompleted()) return;
        try {
          const resCd = getKcpField(form, "res_cd");
          const resMsg = getKcpField(form, "res_msg");
          const hasAuthPayload =
            !!getKcpField(form, "enc_info") &&
            !!getKcpField(form, "enc_data") &&
            !!getKcpField(form, "tran_cd");
          if ((resCd && resCd !== "0000") || (!resCd && !hasAuthPayload)) {
            await cancelPreparedPayment(
              req,
              KCP_CANCEL_CODES.has(resCd)
                ? "KCP 결제 취소"
                : `KCP 인증 실패: ${resMsg || resCd || "unknown"}`
            );
            cleanup();
            postKcpResult({
              status: KCP_CANCEL_CODES.has(resCd) ? "cancelled" : "error",
              message:
                KCP_CANCEL_CODES.has(resCd)
                  ? "결제가 취소되었습니다."
                  : formatKcpFailureMessage(resCd, resMsg),
            });
            settle(() => {
              reject(
                new Error(
                  KCP_CANCEL_CODES.has(resCd)
                    ? "결제가 취소되었습니다."
                    : formatKcpFailureMessage(resCd, resMsg)
                )
              );
            });
            return;
          }

          await confirmKcpPayment(form, req);
          cleanup();
          postKcpResult({
            status: "success",
            orderId: req.order.order_id,
          });
          settle(() => resolve());
        } catch (err) {
          await cancelPreparedPayment(
            req,
            err instanceof Error
              ? `KCP 승인 처리 실패: ${err.message}`
              : "KCP 승인 처리 실패"
          );
          cleanup();
          postKcpResult({
            status: "error",
            message:
              err instanceof Error
                ? err.message
                : "KCP 결제 승인 처리에 실패했습니다.",
          });
          settle(() => {
            reject(err instanceof Error ? err : new Error("KCP approval failed"));
          });
        }
      })();
    };

    hostWindow.__nextjs25KcpFail = (resCd = "", resMsg = "") => {
      void (async () => {
        if (!markResultCompleted()) return;
        cleanup();
        const isCancelled = KCP_CANCEL_CODES.has(resCd) || resMsg.includes("취소");
        const displayMessage = isCancelled
          ? "결제가 취소되었습니다."
          : formatKcpFailureMessage(resCd, resMsg);
        await cancelPreparedPayment(
          req,
          isCancelled
            ? "KCP 결제 취소"
            : `KCP 인증 실패: ${resMsg || resCd || "unknown"}`
        );
        postKcpResult({
          status: isCancelled ? "cancelled" : "error",
          message: displayMessage,
        });
        settle(() => {
          reject(new Error(displayMessage));
        });
      })();
    };

    hostWindow.__nextjs25KcpError = (message) => {
      if (!markResultCompleted()) return;
      const errorMessage =
        message ||
        "KCP 결제 모듈을 불러오지 못했습니다. 주문서를 새로고침한 뒤 다시 시도해주세요.";
      const wasSettled = settled;
      cleanup();
      void cancelPreparedPayment(
        req,
        message ? `KCP 결제 모듈 오류: ${message}` : "KCP 결제 모듈 오류"
      ).finally(() => {
        if (wasSettled) {
          postKcpResult({
            status: "error",
            message: errorMessage,
          });
          return;
        }
        settle(() => {
          reject(new Error(errorMessage));
        });
      });
    };

    loadKcpPayplusScript(scriptUrl)
      .then(() => {
        if (resultCompleted) return;
        const pay = hostWindow.KCP_Pay_Execute || hostWindow.KCP_Pay_Execute_Web;
        if (typeof pay !== "function") {
          hostWindow.__nextjs25KcpError?.("KCP_Pay_Execute not defined");
          return;
        }
        try {
          pay(form);
          startResultTimer();
        } catch (err) {
          hostWindow.__nextjs25KcpError?.(
            err instanceof Error ? err.message : String(err)
          );
        }
      })
      .catch((err) => {
        hostWindow.__nextjs25KcpError?.(
          err instanceof Error ? err.message : String(err)
        );
      });
    return;
  });
}
