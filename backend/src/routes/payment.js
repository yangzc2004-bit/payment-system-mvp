import express from "express";
import { getOrder, saveOrder, updateOrder } from "../services/orderStore.js";
import { issueRedeemCodeForOrder } from "../services/codeService.js";
import { createAlipayPayment, verifyAlipayNotification } from "../services/paymentGatewayService.js";
import { validateUserAccess } from "../services/tokenService.js";
import { config } from "../config.js";
import { ORDER_STATUS, generateOrderNo, getStatusMessage, toPublicOrder } from "../utils/helpers.js";

const router = express.Router();

function readAccessPayload(req) {
  if (req.method === "GET") {
    return {
      userId: typeof req.query.userId === "string" ? req.query.userId : "",
      token: typeof req.query.token === "string" ? req.query.token : ""
    };
  }

  return {
    userId: req.body.userId,
    token: req.body.token
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
  const { userId, token } = req.body;
  const result = await validateUserAccess(userId, token);
  res.json(result);
});

router.post("/create-order", async (req, res) => {
  const { userId, token, amount, returnPageUrl } = req.body;
  const access = await validateUserAccess(userId, token);

  if (!access.ok) {
    return res.status(401).json({ ok: false, message: access.message });
  }

  if (!Number.isInteger(amount) || amount < 1 || amount > 2000) {
    return res.status(400).json({ ok: false, message: "金额不合法，请输入 1 到 2000 之间的整数。" });
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
    returnPageUrl: typeof returnPageUrl === "string" ? returnPageUrl : "",
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
  const { userId, token } = readAccessPayload(req);
  const access = await validateUserAccess(userId, token);

  if (!access.ok) {
    return res.status(401).json({ ok: false, message: access.message });
  }

  const order = getOrder(req.params.orderNo);

  if (!order || !validateOrderOwner(order, userId)) {
    return res.status(404).json({ ok: false, message: "订单不存在。" });
  }

  return respondWithOrder(res, order);
});

router.get("/return", (req, res) => {
  const orderNo = typeof req.query.out_trade_no === "string" ? req.query.out_trade_no : "";
  const order = orderNo ? getOrder(orderNo) : null;
  const redirectBase = order?.returnPageUrl || `${req.protocol}://${req.get("host")}/`;
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

