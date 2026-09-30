import { paymentTaxAmounts } from "./payment.shared";
import type { KcpExtra, PaymentMethod, PaymentRequest } from "./payment.types";

export const KCP_FORM_FIELDS = [
  "req_tx",
  "site_cd",
  "site_name",
  "def_site_cd",
  "od_settle_case",
  "nhnkcp_pay_case",
  "pay_method",
  "ordr_idxx",
  "good_name",
  "good_mny",
  "buyr_name",
  "buyr_mail",
  "buyr_tel1",
  "buyr_tel2",
  "rcvr_name",
  "rcvr_tel1",
  "rcvr_tel2",
  "rcvr_mail",
  "rcvr_zipx",
  "rcvr_add1",
  "rcvr_add2",
  "currency",
  "module_type",
  "quotaopt",
  "epnt_issu",
  "good_expr",
  "shop_user_id",
  "pt_memcorp_cd",
  "escw_used",
  "pay_mod",
  "deli_term",
  "bask_cntx",
  "good_info",
  "skin_indx",
  "disp_tax_yn",
  "kcp_noint",
  "payco_direct",
  "naverpay_direct",
  "naverpay_point_direct",
  "kakaopay_direct",
  "applepay_direct",
  "tax_flag",
  "comm_tax_mny",
  "comm_vat_mny",
  "comm_free_mny",
  "wish_vbank_list",
  "vcnt_expire_term",
  "vcnt_expire_term_time",
  "res_cd",
  "res_msg",
  "tno",
  "trace_no",
  "enc_info",
  "enc_data",
  "ret_pay_method",
  "tran_cd",
  "bank_name",
  "bank_issu",
  "use_pay_method",
  "bankname",
  "depositor",
  "account",
  "va_date",
  "cash_tsdtime",
  "cash_yn",
  "cash_authno",
  "cash_tr_code",
  "cash_id_info",
  "Ret_URL",
  "ret_URL",
] as const;

export const KCP_TEST_SCRIPT_URL =
  "https://testpay.kcp.co.kr/plugin/payplus_web.jsp";
export const KCP_PROD_SCRIPT_URL = "https://pay.kcp.co.kr/plugin/payplus_web.jsp";

export function normalizeKcpScriptUrl(scriptUrl?: string) {
  const value = (scriptUrl || "").trim();
  if (value === KCP_PROD_SCRIPT_URL) return KCP_PROD_SCRIPT_URL;
  if (value === KCP_TEST_SCRIPT_URL) return KCP_TEST_SCRIPT_URL;
  return KCP_TEST_SCRIPT_URL;
}

export function kcpScriptUrlForSiteCd(siteCd: string) {
  return /^(T000|S\d{4})/.test(siteCd)
    ? KCP_TEST_SCRIPT_URL
    : KCP_PROD_SCRIPT_URL;
}

export function kcpMobileMethodForRequest(req: PaymentRequest) {
  const methodMap: Record<PaymentMethod, string> = {
    card: "CARD",
    iche: "BANK",
    vbank: "VCNT",
    hp: "MOBX",
    easy_pay: "CARD",
    kakaopay: "CARD",
  };
  return req.order.pg_extra?.kcp?.pay_method || methodMap[req.method] || "CARD";
}

export function kcpBitmaskForMobileMethod(method: string) {
  switch (method.toUpperCase()) {
    case "BANK":
      return "010000000000";
    case "VCNT":
      return "001000000000";
    case "MOBX":
      return "000010000000";
    case "CARD":
    default:
      return "100000000000";
  }
}

export function kcpActionResultForMobileMethod(method: string) {
  switch (method.toUpperCase()) {
    case "BANK":
      return "acnt";
    case "VCNT":
      return "vcnt";
    case "MOBX":
      return "mobx";
    case "CARD":
    default:
      return "card";
  }
}

export function kcpEasyPayService(req: PaymentRequest): string {
  const kcp = req.order.pg_extra?.kcp;
  if (kcp?.easy_pay_service) return kcp.easy_pay_service;

  const services = kcp?.easy_pay_services || [];
  return (
    services.find((service) => service === "nhnkcp_naverpay") ||
    services.find((service) => service === "nhnkcp_kakaopay") ||
    services.find((service) => service === "nhnkcp_payco") ||
    services[0] ||
    ""
  );
}

function kcpDocumentTitle() {
  return typeof document !== "undefined" && document.title
    ? document.title
    : "GnuBoard Shop";
}

export function createKcpFields(
  req: PaymentRequest,
  siteCd: string,
  siteName = kcpDocumentTitle()
) {
  const payMethodMap: Record<PaymentMethod, string> = {
    card: "100000000000",
    iche: "010000000000",
    vbank: "001000000000",
    hp: "000010000000",
    easy_pay: "100000000000",
    kakaopay: "100000000000",
  };
  const settleCaseMap: Record<PaymentMethod, string> = {
    card: "신용카드",
    iche: "계좌이체",
    vbank: "가상계좌",
    hp: "휴대폰",
    easy_pay: "간편결제",
    kakaopay: "KAKAOPAY",
  };
  const returnParams = new URLSearchParams({
    pg: "kcp",
    orderId: req.order.order_id,
    amount: String(req.order.amount),
  });
  const returnUrl = `${req.success_url}?${returnParams.toString()}`;
  const tel = req.order.buyer_tel || "";
  const email = req.order.buyer_email || "noemail@example.com";
  const taxAmounts = paymentTaxAmounts(req.order);

  const fields: Record<(typeof KCP_FORM_FIELDS)[number], string> =
    Object.fromEntries(KCP_FORM_FIELDS.map((name) => [name, ""])) as Record<
      (typeof KCP_FORM_FIELDS)[number],
      string
    >;

  fields.req_tx = "pay";
  fields.site_cd = siteCd;
  fields.site_name = siteName;
  fields.def_site_cd = siteCd;
  fields.od_settle_case = settleCaseMap[req.method] || settleCaseMap.card;
  fields.nhnkcp_pay_case = "";
  fields.pay_method = payMethodMap[req.method] || payMethodMap.card;
  fields.ordr_idxx = req.order.order_id;
  fields.good_name = req.order.order_name || "주문";
  fields.good_mny = String(req.order.amount);
  fields.buyr_name = req.order.buyer_name || "";
  fields.buyr_mail = email;
  fields.buyr_tel1 = tel;
  fields.buyr_tel2 = tel;
  fields.rcvr_name = req.order.buyer_name || "";
  fields.rcvr_tel1 = tel;
  fields.rcvr_tel2 = tel;
  fields.rcvr_mail = email;
  fields.currency = "WON";
  fields.module_type = "01";
  fields.quotaopt = "12";
  fields.good_expr = "0";
  fields.shop_user_id = "";
  fields.pt_memcorp_cd = "";
  fields.escw_used = "Y";
  fields.pay_mod = "N";
  fields.deli_term = "03";
  fields.bask_cntx = "1";
  fields.good_info = "";
  fields.skin_indx = "1";
  fields.disp_tax_yn = "N";
  fields.kcp_noint = "N";
  fields.payco_direct = "";
  fields.naverpay_direct = "A";
  fields.naverpay_point_direct = "";
  fields.kakaopay_direct = "A";
  fields.applepay_direct = "A";
  fields.wish_vbank_list = "";
  fields.Ret_URL = returnUrl;
  fields.ret_URL = returnUrl;

  if (taxAmounts.enabled) {
    fields.tax_flag = "TG03";
    fields.comm_tax_mny = String(taxAmounts.tax);
    fields.comm_vat_mny = String(taxAmounts.vat);
    fields.comm_free_mny = String(taxAmounts.free);
  }

  if (req.method === "easy_pay") {
    const service = kcpEasyPayService(req);
    if (service === "nhnkcp_naverpay") {
      fields.naverpay_direct = "Y";
      fields.naverpay_point_direct = req.order.pg_extra?.kcp
        ?.naverpay_point_enabled
        ? "Y"
        : "";
    } else if (service === "nhnkcp_kakaopay") {
      fields.kakaopay_direct = "Y";
    } else {
      fields.payco_direct = "Y";
    }
  }

  if (fields.pay_method === "001000000000") {
    fields.vcnt_expire_term = "3";
    fields.vcnt_expire_term_time = "235959";
  }

  return fields;
}

export function createKcpApprovalFields(
  req: PaymentRequest,
  kcp: KcpExtra,
  siteName = kcpDocumentTitle()
) {
  const payMethod = kcpMobileMethodForRequest(req);
  const tel = req.order.buyer_tel || "";
  const email = req.order.buyer_email || "noemail@example.com";
  const siteCd = kcp.site_cd || req.client_mid || "T0000";
  const returnUrl = kcp.return_url || "";
  const taxAmounts = paymentTaxAmounts(req.order);

  const fields = {
    good_name: req.order.order_name || "Order",
    good_mny: String(req.order.amount),
    buyr_name: req.order.buyer_name || "",
    buyr_tel1: tel,
    buyr_tel2: tel,
    buyr_mail: email,
    req_tx: "pay",
    site_cd: siteCd,
    shop_name: siteName,
    pay_method: payMethod,
    use_pay_method: kcpBitmaskForMobileMethod(payMethod),
    ordr_idxx: req.order.order_id,
    quotaopt: "12",
    currency: "410",
    approval_key: kcp.approval_key || "",
    Ret_URL: returnUrl,
    ActionResult: kcpActionResultForMobileMethod(payMethod),
    escw_used: req.method === "easy_pay" ? "N" : "Y",
    pay_mod: "N",
    rcvr_name: req.order.buyer_name || "",
    rcvr_tel1: tel,
    rcvr_tel2: tel,
    rcvr_mail: email,
    rcvr_zipx: "",
    rcvr_add1: "",
    rcvr_add2: "",
    bask_cntx: "1",
    good_info: "",
    deli_term: "03",
    disp_tax_yn: "N",
    tablet_size: "1.0",
    kcp_noint: "N",
    payco_direct: "",
    naverpay_direct: "A",
    naverpay_point_direct: "",
    kakaopay_direct: "A",
    applepay_direct: "A",
    tax_flag: taxAmounts.enabled ? "TG03" : "",
    comm_tax_mny: taxAmounts.enabled ? String(taxAmounts.tax) : "",
    comm_vat_mny: taxAmounts.enabled ? String(taxAmounts.vat) : "",
    comm_free_mny: taxAmounts.enabled ? String(taxAmounts.free) : "",
    res_cd: "",
    tran_cd: "",
    enc_info: "",
    enc_data: "",
  };

  if (req.method === "easy_pay") {
    const service = kcpEasyPayService(req);
    if (service === "nhnkcp_naverpay") {
      fields.naverpay_direct = "Y";
      fields.naverpay_point_direct = req.order.pg_extra?.kcp
        ?.naverpay_point_enabled
        ? "Y"
        : "";
    } else if (service === "nhnkcp_kakaopay") {
      fields.kakaopay_direct = "Y";
    } else {
      fields.payco_direct = "Y";
    }
  }

  return fields;
}

export function formatKcpFailureMessage(resCd = "", resMsg = "") {
  const code = resCd.trim();
  const message = resMsg.trim();
  if (!code && !message) {
    return "KCP에서 오류 코드 없이 결제가 중단되었습니다. 결제창이 차단되었거나 KCP 응답값이 누락되었습니다.";
  }
  if (!code) {
    return message;
  }
  return `[${code}] ${message || "KCP 결제가 완료되지 않았습니다."}`;
}

export function createKcpConfirmPayload(
  fields: Record<string, string>,
  req: PaymentRequest
) {
  return {
    pg_service: "kcp",
    order_id: req.order.order_id,
    amount: req.order.amount,
    res_cd: fields.res_cd || "",
    res_msg: fields.res_msg || "",
    enc_info: fields.enc_info || "",
    enc_data: fields.enc_data || "",
    tran_cd: fields.tran_cd || "",
    tno: fields.tno || "",
    trace_no: fields.trace_no || "",
    site_cd: fields.site_cd || "",
    ret_pay_method: fields.ret_pay_method || "",
    use_pay_method: fields.use_pay_method || "",
    pay_method: fields.pay_method || "",
    bankname: fields.bankname || "",
    depositor: fields.depositor || "",
    account: fields.account || "",
    va_date: fields.va_date || "",
  };
}
