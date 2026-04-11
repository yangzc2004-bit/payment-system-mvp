import express from "express";
import { getOrder, saveOrder, updateOrder, listOrders } from "../services/orderStore.js";
import { issueRedeemCodeForOrder } from "../services/codeService.js";
import { createAlipayPayment, verifyAlipayNotification } from "../services/paymentGatewayService.js";
import { validateUserAccess } from "../services/tokenService.js";
import { getAllStock, hasStock, decrementStock } from "../services/packageStockService.js";
import { config } from "../config.js";
import { ORDER_STATUS, generateOrderNo, getStatusMessage, toPublicOrder } from "../utils/helpers.js";

const router = express.Router();
const recentCreateAttempts = new Map();

function readAccessPayload(req) {
  if (req.method === "GET") {
    return {
      userId: typeof req.query.userId === "string" ? req.query.userId : "",
      token: typeof req.query.token === "string" ? req.query.token : "",
      uiMode: typeof req.query.ui_mode === "string" ? req.query.ui_mode : ""
    };
  }

  return {
    userId: req.body.userId,
    token: req.body.token,
    uiMode: req.body.uiMode
  };
}

function validateOrderOwner(order, userId) {
  return order.userId === userId;
}

function respondWithOrder(res, order, message) {
  return res.json({
    ok: true,
    status: order.status,
    message: message || getStatusMessage(order.status),
    order: toPublicOrder(order)
  });
}

function getRequestBaseUrl(req) {
  return config.publicBaseUrl || `${req.protocol}://${req.get("host")}`;
}

function detectDevice(req) {
  const userAgent = String(req.headers["user-agent"] || "").toLowerCase();
  return /iphone|android|mobile|ipad/.test(userAgent) ? "mobile" : "pc";
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  const rawIp = req.ip || req.socket?.remoteAddress || "127.0.0.1";
  return rawIp.replace(/^::ffff:/, "");
}

function resolveSafeReturnPageUrl(req, value) {
  const fallback = `${config.publicBaseUrl || `${req.protocol}://${req.get("host")}`}/`;

  if (!value || typeof value !== "string") {
    return fallback;
  }

  try {
    const parsed = new URL(value);
    const origin = parsed.origin;
    if (!config.allowedReturnOrigins.includes(origin)) {
      return fallback;
    }

    return `${origin}${parsed.pathname}`;
  } catch {
    return fallback;
  }
}

function canCreateOrderForUser(userId) {
  const now = Date.now();
  const lastAttempt = recentCreateAttempts.get(String(userId)) || 0;
  const cooldown = config.orderCreateCooldownSeconds * 1000;

  if (lastAttempt && now - lastAttempt < cooldown) {
    return {
      ok: false,
      message: `下单过于频繁，请在 ${config.orderCreateCooldownSeconds} 秒后再试。`
    };
  }

  const pendingOrders = listOrders().filter((order) => order.userId === userId && order.status === ORDER_STATUS.paying);
  if (config.maxPendingOrdersPerUser > 0 && pendingOrders.length >= config.maxPendingOrdersPerUser) {
    return {
      ok: false,
      message: `当前仍有 ${pendingOrders.length} 笔待支付订单，请先完成或补单后再创建新订单。`
    };
  }

  recentCreateAttempts.set(String(userId), now);
  return { ok: true };
}

async function handleSuccessfulPayment(order, notifyPayload) {
  if (order.status === ORDER_STATUS.codeIssued) {
    return order;
  }

  const paidOrder = updateOrder(order.orderNo, {
    status: ORDER_STATUS.paid,
    paidAt: new Date().toISOString(),
    paymentNotified: true,
    notifyPayload,
    paymentProviderOrderId: notifyPayload.trade_no || order.paymentProviderOrderId || ""
  });

  // 扣减库存
  const stockResult = decrementStock(order.amount);
  if (!stockResult.ok) {
    console.warn(`库存扣减失败: ${stockResult.message}, 订单: ${order.orderNo}`);
  }

  const issueResult = await issueRedeemCodeForOrder(paidOrder);

  if (!issueResult.ok) {
    return updateOrder(order.orderNo, {
      status: ORDER_STATUS.issueFailed,
      failedAt: new Date().toISOString(),
      issueMessage: issueResult.message,
      adminNote: issueResult.message,
      sub2apiResult: issueResult.upstream || null,
      sub2apiRequestId: issueResult.upstream?.idempotencyKey || null
    });
  }

  return updateOrder(order.orderNo, {
    status: ORDER_STATUS.codeIssued,
    cardCode: issueResult.cardCode,
    cardIssuedAt: new Date().toISOString(),
    issueMessage: issueResult.message,
    sub2apiResult: issueResult.upstream || null,
    sub2apiRequestId: issueResult.upstream?.idempotencyKey || null
  });
}

router.post("/validate", async (req, res) => {
  const { userId, token, uiMode } = req.body;
  const result = await validateUserAccess(userId, token, { requireEmbedded: uiMode === "embedded" });
  res.json(result);
});

router.get("/package-stock", async (req, res) => {
  const stock = getAllStock();
  res.json({
    ok: true,
    stock
  });
});

router.post("/create-order", async (req, res) => {
  const { userId, token, amount, returnPageUrl, uiMode } = req.body;
  const access = await validateUserAccess(userId, token, { requireEmbedded: true });

  if (!access.ok) {
    return res.status(401).json({ ok: false, message: access.message });
  }

  if (uiMode !== "embedded") {
    return res.status(400).json({ ok: false, message: "支付页只允许通过嵌入入口访问。" });
  }

  const VALID_PACKAGE_AMOUNTS = [5, 12, 30, 50];
  if (!Number.isInteger(amount) || !VALID_PACKAGE_AMOUNTS.includes(amount)) {
    return res.status(400).json({
      ok: false,
      message: "请选择有效的充值套餐（¥5/¥12/¥30/¥50）"
    });
  }

  // 检查库存
  if (!hasStock(amount)) {
    return res.status(400).json({
      ok: false,
      message: `该套餐已售罄，请选择其他套餐`
    });
  }

  const createCheck = canCreateOrderForUser(String(userId));
  if (!createCheck.ok) {
    return res.status(429).json({ ok: false, message: createCheck.message });
  }

  const orderNo = generateOrderNo();
  const now = new Date().toISOString();
  const order = {
    orderNo,
    userId,
    amount,
    method: "alipay",
    paymentChannel: "alipay",
    status: ORDER_STATUS.created,
    paymentUrl: "",
    paymentProviderOrderId: "",
    paymentNotified: false,
    returnPageUrl: resolveSafeReturnPageUrl(req, returnPageUrl),
    cardCode: "",
    redeemHint: config.redeemCodeHint,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    cardIssuedAt: null,
    failedAt: null,
    issueMessage: "",
    adminNote: "",
    notifyPayload: null,
    sub2apiResult: null,
    sub2apiRequestId: null
  };

  const paymentResult = await createAlipayPayment(order, {
    publicBaseUrl: getRequestBaseUrl(req),
    clientIp: getClientIp(req),
    device: detectDevice(req)
  });

  if (!paymentResult.ok) {
    return res.status(502).json({ ok: false, message: paymentResult.message || "创建支付订单失败。" });
  }

  order.status = ORDER_STATUS.paying;
  order.paymentUrl = paymentResult.paymentUrl;
  order.paymentProviderOrderId = paymentResult.providerOrderId;

  saveOrder(order);

  return res.json({
    ok: true,
    status: order.status,
    message: "订单创建成功，请前往支付宝支付。",
    paymentUrl: order.paymentUrl,
    paymentQrCode: paymentResult.paymentQrCode || "",
    paymentUrlScheme: paymentResult.paymentUrlScheme || "",
    order: toPublicOrder(order)
  });
});

router.get("/order-status/:orderNo", async (req, res) => {
  const { userId, token, uiMode } = readAccessPayload(req);
  const access = await validateUserAccess(userId, token, { requireEmbedded: true });

  if (!access.ok) {
    return res.status(401).json({ ok: false, message: access.message });
  }

  if (uiMode !== "embedded") {
    return res.status(400).json({ ok: false, message: "支付页只允许通过嵌入入口访问。" });
  }

  const order = getOrder(req.params.orderNo);

  if (!order || !validateOrderOwner(order, userId)) {
    return res.status(404).json({ ok: false, message: "订单不存在。" });
  }

  return respondWithOrder(res, order);
});

router.get("/return", async (req, res) => {
  const payload = Object.fromEntries(
    Object.entries(req.query).map(([key, value]) => [key, Array.isArray(value) ? String(value[0] || "") : String(value || "")])
  );
  const orderNo = typeof payload.out_trade_no === "string" ? payload.out_trade_no : "";
  const order = orderNo ? getOrder(orderNo) : null;

  if (order) {
    const verifyResult = verifyAlipayNotification(payload);
    if (
      verifyResult.ok &&
      payload.pid === config.epayPid &&
      String(payload.type || "") === "alipay" &&
      String(payload.param || "") === String(order.userId) &&
      (verifyResult.tradeStatus === "TRADE_SUCCESS" || verifyResult.tradeStatus === "TRADE_FINISHED") &&
      Math.abs(verifyResult.paidAmount - Number(order.amount)) <= 0.0001
    ) {
      await handleSuccessfulPayment(order, payload);
    }
  }

  const redirectBase = order?.returnPageUrl || `${config.publicBaseUrl || `${req.protocol}://${req.get("host")}`}/`;
  const redirectUrl = new URL(redirectBase);

  if (orderNo) {
    redirectUrl.searchParams.set("order_no", orderNo);
  }

  res.redirect(redirectUrl.toString());
});

router.post("/alipay-notify", async (req, res) => {
  const payload = req.body || {};
  const orderNo = typeof payload.out_trade_no === "string" ? payload.out_trade_no : "";

  if (!orderNo) {
    return res.status(400).send("fail");
  }

  const order = getOrder(orderNo);
  if (!order) {
    return res.status(404).send("fail");
  }

  const verifyResult = verifyAlipayNotification(payload);
  if (!verifyResult.ok) {
    return res.status(400).send("fail");
  }

  if (payload.pid !== config.epayPid || String(payload.type || "") !== "alipay" || String(payload.param || "") !== String(order.userId)) {
    return res.status(400).send("fail");
  }

  if (verifyResult.tradeStatus !== "TRADE_SUCCESS" && verifyResult.tradeStatus !== "TRADE_FINISHED") {
    updateOrder(orderNo, {
      status: ORDER_STATUS.paymentFailed,
      failedAt: new Date().toISOString(),
      issueMessage: `支付状态：${verifyResult.tradeStatus}`,
      notifyPayload: payload,
      paymentNotified: true
    });
    return res.send("success");
  }

  if (Math.abs(verifyResult.paidAmount - Number(order.amount)) > 0.0001) {
    updateOrder(orderNo, {
      status: ORDER_STATUS.issueFailed,
      failedAt: new Date().toISOString(),
      issueMessage: `支付金额校验失败，回调金额 ${verifyResult.paidAmount}`,
      notifyPayload: payload,
      paymentNotified: true
    });
    return res.status(400).send("fail");
  }

  await handleSuccessfulPayment(order, payload);
  return res.send("success");
});

export default router;

