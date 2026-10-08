import { KCP_FORM_FIELDS } from "./payment.kcp.helpers";

export const KCP_SDK_FRAME_ID = "kcp-sdk-iframe";
export const KCP_DIM_OVERLAY_ID = "kcp-dim-overlay";

const KCP_PC_FORM_ID = "kcp-pc-order-info";
const KCP_PAYPLUS_SCRIPT_SELECTOR = "script[data-nextjs25-kcp-payplus]";
const KCP_FIELD_NAMES = new Set<string>(KCP_FORM_FIELDS);
const KCP_RESPONSE_FIELD_ALIASES: Record<string, string> = {
  resCd: "res_cd",
  resMsg: "res_msg",
  encInfo: "enc_info",
  encData: "enc_data",
  tranCd: "tran_cd",
  traceNo: "trace_no",
  orderId: "ordr_idxx",
  orderID: "ordr_idxx",
  siteCd: "site_cd",
  usePayMethod: "use_pay_method",
  retPayMethod: "ret_pay_method",
  bankName: "bankname",
  vaDate: "va_date",
};

function escapeKcpHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type KcpParentWindow = Window & {
  __nextjs25KcpReady?: () => void;
  __nextjs25KcpComplete?: (form: HTMLFormElement) => void;
  __nextjs25KcpFail?: (resCd?: string, resMsg?: string) => void;
  __nextjs25KcpError?: (message?: string) => void;
  GetField?: (form: HTMLFormElement, source: unknown) => void;
  KCP_Pay_Execute?: (form: HTMLFormElement) => void;
  KCP_Pay_Execute_Web?: (form: HTMLFormElement) => void;
  KCP_JQUERY?: { unblockUI?: () => void };
  m_Completepayment?: (formOrJson: unknown, closeEvent?: () => void) => void;
};

export function getKcpField(form: HTMLFormElement, name: string) {
  const found = form.elements.namedItem(name);
  const inputCtor = form.ownerDocument.defaultView?.HTMLInputElement;
  return inputCtor && found instanceof inputCtor ? found.value : "";
}

export function createKcpConfirmFieldsFromForm(form: HTMLFormElement) {
  return {
    res_cd: getKcpField(form, "res_cd"),
    res_msg: getKcpField(form, "res_msg"),
    enc_info: getKcpField(form, "enc_info"),
    enc_data: getKcpField(form, "enc_data"),
    tran_cd: getKcpField(form, "tran_cd"),
    tno: getKcpField(form, "tno"),
    trace_no: getKcpField(form, "trace_no"),
    site_cd: getKcpField(form, "site_cd"),
    ret_pay_method: getKcpField(form, "ret_pay_method"),
    use_pay_method: getKcpField(form, "use_pay_method"),
    pay_method: getKcpField(form, "pay_method"),
    bankname: getKcpField(form, "bankname"),
    depositor: getKcpField(form, "depositor"),
    account: getKcpField(form, "account"),
    va_date: getKcpField(form, "va_date"),
  };
}

function setKcpFormField(
  form: HTMLFormElement,
  name: string,
  value: unknown
) {
  const fieldName = KCP_RESPONSE_FIELD_ALIASES[name] || name;
  if (!KCP_FIELD_NAMES.has(fieldName)) return;
  const fieldValue = value == null ? "" : String(value);
  const existing = Array.from(form.elements).find(
    (element) => (element as HTMLInputElement).name === fieldName
  ) as HTMLInputElement | undefined;
  if (existing && "value" in existing) {
    existing.value = fieldValue;
    return;
  }

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = fieldName;
  input.value = fieldValue;
  form.appendChild(input);
}

function kcpPrimitiveValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return kcpPrimitiveValue(value[0]);
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (typeof value === "object" && "value" in value) {
    return kcpPrimitiveValue((value as { value?: unknown }).value);
  }
  return null;
}

export function mergeKcpResponseFields(
  form: HTMLFormElement,
  source: unknown,
  depth = 0
) {
  if (source == null || depth > 2) return;

  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) return;
    try {
      mergeKcpResponseFields(form, JSON.parse(trimmed), depth + 1);
      return;
    } catch {
      // Fall through to query-string parsing.
    }
    if (trimmed.includes("=")) {
      const params = new URLSearchParams(trimmed.replace(/^\?/, ""));
      params.forEach((value, key) => setKcpFormField(form, key, value));
    }
    return;
  }

  if (source instanceof URLSearchParams) {
    source.forEach((value, key) => setKcpFormField(form, key, value));
    return;
  }

  if (typeof source !== "object") return;

  const maybeForm = source as { elements?: HTMLFormControlsCollection };
  if (maybeForm.elements) {
    Array.from(maybeForm.elements).forEach((element) => {
      const input = element as HTMLInputElement;
      if (input.name) setKcpFormField(form, input.name, input.value);
    });
  }

  const record = source as Record<string, unknown>;
  Object.entries(record).forEach(([key, value]) => {
    const primitive = kcpPrimitiveValue(value);
    if (primitive !== null) {
      setKcpFormField(form, key, primitive);
    }
  });

  ["data", "result", "response", "payload", "params", "form", "fields"].forEach(
    (key) => {
      if (record[key] && record[key] !== source) {
        mergeKcpResponseFields(form, record[key], depth + 1);
      }
    }
  );
}

export function cleanupKcpSdkFrame() {
  document.getElementById(KCP_SDK_FRAME_ID)?.remove();
  document.getElementById(KCP_DIM_OVERLAY_ID)?.remove();
}

export function cleanupKcpPcForm() {
  document.getElementById(KCP_PC_FORM_ID)?.remove();
}

export function cleanupKcpPayplusUi() {
  const hostWindow = window as KcpParentWindow;

  try {
    hostWindow.KCP_JQUERY?.unblockUI?.();
  } catch {
    // KCP's blockUI cleanup is best-effort; remove known nodes below as well.
  }

  [
    "NAX_BLOCK",
    "nax_pp_mask",
    "naxIfr",
    "naxPop",
    "nax_ifr_id",
    "KCP_PAYCO",
    "kcp_content",
    "kcp_mask",
    "kcp_progress",
    "kcp_event_form",
  ].forEach((id) => document.getElementById(id)?.remove());

  document
    .querySelectorAll(".blockUI,.blockOverlay,.blockMsg")
    .forEach((element) => element.remove());
}

export function closeKcpPayplusUi(closeEvent?: () => void) {
  try {
    closeEvent?.();
  } catch {
    // KCP may throw if the iframe has already navigated or been removed.
  }
  cleanupKcpPayplusUi();
}

export function clearKcpCallbacks() {
  const hostWindow = window as KcpParentWindow;
  delete hostWindow.__nextjs25KcpReady;
  delete hostWindow.__nextjs25KcpComplete;
  delete hostWindow.__nextjs25KcpFail;
  delete hostWindow.__nextjs25KcpError;
  delete hostWindow.m_Completepayment;
}

export function createKcpPcForm(fields: Record<string, string>) {
  cleanupKcpPcForm();
  const form = document.createElement("form");
  form.id = KCP_PC_FORM_ID;
  form.name = "order_info";
  form.method = "POST";
  form.acceptCharset = "UTF-8";
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

function createKcpHiddenInputs(fields: Record<string, string>) {
  return Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeKcpHtml(name)}" value="${escapeKcpHtml(value)}">`
    )
    .join("");
}

export function createKcpApprovalFrameHtml(
  payUrl: string,
  fields: Record<string, string>
) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:#fff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wait{display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center}
.wait strong{display:block;font-size:16px;margin-bottom:8px}
.wait span{display:block;color:#64748b;font-size:13px}
</style>
</head>
<body>
<div class="wait"><div><strong>NHN KCP</strong><span>결제창을 여는 중입니다.</span></div></div>
<form id="sm_form" name="sm_form" method="POST" accept-charset="euc-kr" action="${escapeKcpHtml(payUrl)}">${createKcpHiddenInputs(fields)}</form>
<script>
(function () {
  try {
    document.getElementById("sm_form").submit();
  } catch (err) {
    // 부모 창이 document.write 로 만든 같은 출처 문서다. "*" 로 보내면 이 페이지를 감싼 다른 출처도 받는다.
    var targetOrigin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "/";
    parent.postMessage({
      type: "shop-payment-result",
      status: "error",
      message: err && err.message ? err.message : "KCP payment form submit failed."
    }, targetOrigin);
  }
})();
<\/script>
</body>
</html>`;
}

function ensureKcpBaseMarkup() {
  if (!document.getElementById("nextjs25-kcp-payplus-style")) {
    const style = document.createElement("style");
    style.id = "nextjs25-kcp-payplus-style";
    style.textContent =
      ".kcpTransDiv{filter:alpha(opacity=10);-khtml-opacity:.1;-moz-opacity:.1;opacity:.1;top:0;left:0;background-color:#000;width:100%;height:100%;position:absolute;z-index:10000}";
    document.head.appendChild(style);
  }

  const placeholders: Array<[string, string]> = [
    ["kcp_content", "background-color:white;"],
    ["kcp_mask", "display:none"],
    ["kcp_progress", ""],
    ["kcp_event_form", ""],
  ];
  placeholders.forEach(([id, style]) => {
    if (document.getElementById(id)) return;
    const div = document.createElement("div");
    div.id = id;
    if (id === "kcp_mask") div.className = "kcpTransDiv";
    if (id === "kcp_progress") div.className = "spin_container";
    if (style) div.setAttribute("style", style);
    document.body.appendChild(div);
  });
}

function loadExternalScript(
  src: string,
  options: {
    selector?: string;
    charset?: string;
    requiredGlobal?: keyof KcpParentWindow;
  } = {}
) {
  return new Promise<void>((resolve, reject) => {
    const hostWindow = window as KcpParentWindow;
    const targetUrl = new URL(src, window.location.href).toString();
    const selector = options.selector || `script[src="${targetUrl}"]`;
    const existing = document.querySelector<HTMLScriptElement>(selector);

    if (existing?.dataset.loaded === "true") {
      if (
        !options.requiredGlobal ||
        typeof hostWindow[options.requiredGlobal] === "function"
      ) {
        resolve();
        return;
      }
    }

    if (existing && existing.src !== targetUrl) existing.remove();

    const script =
      existing && existing.src === targetUrl
        ? existing
        : document.createElement("script");
    script.src = targetUrl;
    script.async = false;
    if (options.charset) script.charset = options.charset;
    if (options.selector === KCP_PAYPLUS_SCRIPT_SELECTOR) {
      script.dataset.nextjs25KcpPayplus = "true";
    }
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () =>
      reject(new Error(`KCP script load failed: ${targetUrl}`));
    if (!script.parentElement) document.head.appendChild(script);
  });
}

async function ensureKcpPayplusWebRuntime(scriptUrl: string) {
  const hostWindow = window as KcpParentWindow;
  if (typeof hostWindow.KCP_Pay_Execute_Web === "function") return;

  ensureKcpBaseMarkup();

  const targetUrl = new URL(scriptUrl, window.location.href).toString();
  const isTest = targetUrl.includes("testpay.kcp.co.kr");
  const kcpDomain = isTest
    ? "https://testpay.kcp.co.kr/"
    : "https://pay.kcp.co.kr/";
  const npayDomain = isTest
    ? "https://testnpay.kcp.co.kr/"
    : "https://npay.kcp.co.kr/";
  const npayScript = isTest ? "web_cross_hub_test.js" : "web_cross_hub.js";
  const cacheKey = `${Date.now()}${Math.floor(Math.random() * 100000)}`;

  const eucKr = { charset: "EUC-KR" };
  await loadExternalScript(`${kcpDomain}plugin/js/ajax.js?${cacheKey}`, eucKr);
  await loadExternalScript(
    `${kcpDomain}plugin/cross_service/extends/util.js?${cacheKey}`,
    eucKr
  );
  await loadExternalScript(
    `${kcpDomain}plugin/cross_service/extends/spin.min.js?${cacheKey}`
  );
  await loadExternalScript(
    `${kcpDomain}plugin/js/payplus_webExe.js?${cacheKey}`,
    eucKr
  );
  await loadExternalScript(
    `${npayDomain}js/kcp_jquery-3.6.0.js?ver=${cacheKey}`,
    eucKr
  );
  await loadExternalScript(`${npayDomain}js/kcp_jquery.blockUI.js`, eucKr);
  await loadExternalScript(
    `${npayDomain}js/ClientDataHandler.js?ver=${cacheKey}`,
    eucKr
  );
  await loadExternalScript(
    `${npayDomain}js/npayUtils.js?ver=${cacheKey}`,
    eucKr
  );
  await loadExternalScript(`${npayDomain}plugin/${npayScript}?${cacheKey}`, {
    ...eucKr,
    requiredGlobal: "KCP_Pay_Execute_Web",
  });

  if (typeof hostWindow.KCP_Pay_Execute_Web !== "function") {
    throw new Error("KCP_Pay_Execute_Web not defined");
  }
}

export function loadKcpPayplusScript(scriptUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const hostWindow = window as KcpParentWindow;
    const targetUrl = new URL(scriptUrl, window.location.href).toString();
    const existing = document.querySelector<HTMLScriptElement>(
      KCP_PAYPLUS_SCRIPT_SELECTOR
    );

    if (
      existing?.dataset.loaded === "true" &&
      existing.src === targetUrl &&
      hostWindow.KCP_Pay_Execute &&
      hostWindow.KCP_Pay_Execute_Web
    ) {
      resolve();
      return;
    }

    loadExternalScript(targetUrl, {
      selector: KCP_PAYPLUS_SCRIPT_SELECTOR,
      charset: "EUC-KR",
      requiredGlobal: "KCP_Pay_Execute",
    })
      .then(() => ensureKcpPayplusWebRuntime(targetUrl))
      .then(resolve, reject);
  });
}
