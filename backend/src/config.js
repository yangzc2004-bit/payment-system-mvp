import path from "path";
import dotenv from "dotenv";

dotenv.config();

const backendRoot = path.resolve(process.cwd());

function parseList(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 3001),
  sub2apiBaseUrl: process.env.SUB2API_BASE_URL || "",
  sub2apiAdminApiKey: process.env.SUB2API_ADMIN_API_KEY || "",
  sub2apiAdminJwt: process.env.SUB2API_ADMIN_JWT || "",
  validDemoToken: process.env.VALID_DEMO_TOKEN || "demo_token_preview",
  allowDemoToken: String(process.env.ALLOW_DEMO_TOKEN || "false").toLowerCase() === "true",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminSessionTtlMinutes: Number(process.env.ADMIN_SESSION_TTL_MINUTES || 120),
  adminMaxFailedAttempts: Number(process.env.ADMIN_MAX_FAILED_ATTEMPTS || 5),
  adminLockMinutes: Number(process.env.ADMIN_LOCK_MINUTES || 15),
  orderCreateCooldownSeconds: Number(process.env.ORDER_CREATE_COOLDOWN_SECONDS || 10),
  maxPendingOrdersPerUser: Number(process.env.MAX_PENDING_ORDERS_PER_USER || 3),
  orderStoreFile: process.env.ORDER_STORE_FILE || path.join(backendRoot, "data", "orders.json"),
  paymentOrderTimeoutMinutes: Number(process.env.PAYMENT_ORDER_TIMEOUT_MINUTES || 30),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
  allowedCorsOrigins: parseList(process.env.ALLOWED_CORS_ORIGINS, [
    "https://pay.yzccc.cloud",
    "http://localhost:3000",
    "http://localhost:3004",
    "http://localhost:3005"
  ]),
  allowedReturnOrigins: parseList(process.env.ALLOWED_RETURN_ORIGINS, [
    "https://pay.yzccc.cloud",
    "http://localhost:3000",
    "http://localhost:3004",
    "http://localhost:3005"
  ]),
  epayBaseUrl: process.env.EPAY_BASE_URL || "https://pay.521cd.cn/xpay/epay",
  epayPid: process.env.EPAY_PID || "10579",
  epayKey: process.env.EPAY_KEY || "",
  epayNotifyPath: process.env.EPAY_NOTIFY_PATH || "/api/payment/alipay-notify",
  epayReturnPath: process.env.EPAY_RETURN_PATH || "/api/payment/return",
  epaySiteName: process.env.EPAY_SITE_NAME || "充值中心",
  epaySignType: process.env.EPAY_SIGN_TYPE || "MD5",
  redeemCodeHint: process.env.REDEEM_CODE_HINT || "请回到中转站兑换页面输入卡密完成兑换。"
};
