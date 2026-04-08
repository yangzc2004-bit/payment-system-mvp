import crypto from "crypto";
import { config } from "../config.js";

function isEmpty(value) {
  return value === undefined || value === null || value === "";
}

function sortAndFilterParams(params) {
  return Object.entries(params)
    .filter(([key, value]) => key !== "sign" && key !== "sign_type" && !isEmpty(value))
    .sort(([left], [right]) => left.localeCompare(right));
}

export function createEpaySign(params, key) {
  const signSource = sortAndFilterParams(params)
    .map(([field, value]) => `${field}=${value}`)
    .join("&");

  return crypto.createHash("md5").update(`${signSource}${key}`, "utf8").digest("hex");
}

function buildAbsoluteUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function buildSubmitUrl(params) {
  const url = new URL(`${config.epayBaseUrl.replace(/\/$/, "")}/submit.php`);
  Object.entries(params).forEach(([key, value]) => {
    if (!isEmpty(value)) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

export async function createAlipayPayment(order, options) {
  const notifyUrl = buildAbsoluteUrl(options.publicBaseUrl, config.epayNotifyPath);
  const returnUrl = buildAbsoluteUrl(options.publicBaseUrl, config.epayReturnPath);
  const params = {
    pid: config.epayPid,
    type: "alipay",
    out_trade_no: order.orderNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: `充值 ${order.amount} 元`,
    money: Number(order.amount).toFixed(2),
    sitename: config.epaySiteName,
    param: order.userId,
    clientip: options.clientIp,
    device: options.device || "pc",
    sign_type: config.epaySignType
  };

  params.sign = createEpaySign(params, config.epayKey);

  const submitUrl = buildSubmitUrl(params);

  return {
    ok: true,
    mode: "redirect",
    paymentUrl: submitUrl,
    paymentQrCode: "",
    paymentUrlScheme: "",
    providerOrderId: order.orderNo,
    upstream: {
      submitUrl
    }
  };
}

export function verifyAlipayNotification(payload) {
  const expectedSign = createEpaySign(payload, config.epayKey);
  const providedSign = String(payload.sign || "").toLowerCase();

  if (!providedSign || providedSign !== expectedSign) {
    return {
      ok: false,
      message: "易支付回调签名校验失败。"
    };
  }

  return {
    ok: true,
    tradeStatus: String(payload.trade_status || ""),
    providerOrderId: String(payload.trade_no || ""),
    paidAmount: Number(payload.money || 0),
    orderNo: String(payload.out_trade_no || "")
  };
}
