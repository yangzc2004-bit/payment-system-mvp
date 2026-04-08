import path from "path";
import dotenv from "dotenv";

dotenv.config();

const backendRoot = path.resolve(process.cwd());

export const config = {
  port: Number(process.env.PORT || 3001),
  sub2apiBaseUrl: process.env.SUB2API_BASE_URL || "",
  sub2apiAdminApiKey: process.env.SUB2API_ADMIN_API_KEY || "",
  validDemoToken: process.env.VALID_DEMO_TOKEN || "demo_token_preview",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123456",
  orderStoreFile: process.env.ORDER_STORE_FILE || path.join(backendRoot, "data", "orders.json"),
  paymentOrderTimeoutMinutes: Number(process.env.PAYMENT_ORDER_TIMEOUT_MINUTES || 30),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
  epayBaseUrl: process.env.EPAY_BASE_URL || "https://pay.521cd.cn/xpay/epay",
  epayPid: process.env.EPAY_PID || "10579",
  epayKey: process.env.EPAY_KEY || "iHJVQVgarTIe6xYcUHVB",
  epayNotifyPath: process.env.EPAY_NOTIFY_PATH || "/api/payment/alipay-notify",
  epayReturnPath: process.env.EPAY_RETURN_PATH || "/api/payment/return",
  epaySiteName: process.env.EPAY_SITE_NAME || "充值中心",
  epaySignType: process.env.EPAY_SIGN_TYPE || "MD5",
  redeemCodeHint: process.env.REDEEM_CODE_HINT || "请回到中转站兑换页面输入卡密完成兑换。"
};
