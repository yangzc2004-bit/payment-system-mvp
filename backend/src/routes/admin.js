import express from "express";
import { getOrder, listOrders, updateOrder } from "../services/orderStore.js";
import { appendAdminAuditLog, createAdminSession, listAdminAuditLogs, requireAdminAuth } from "../services/adminAuthService.js";
import { createEpaySign, verifyAlipayNotification } from "../services/paymentGatewayService.js";
import { issueRedeemCodeForOrder } from "../services/codeService.js";
import { ORDER_STATUS, toPublicOrder } from "../utils/helpers.js";
import { config } from "../config.js";

const router = express.Router();

async function applySuccessfulPayment(order, notifyPayload) {
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

router.post("/login", (req, res) => {
  const { password } = req.body;
  const result = createAdminSession(password, req.ip);

  if (!result.ok) {
    return res.status(401).json({ ok: false, message: result.message || "后台密码错误。" });
  }

  return res.json({ ok: true, token: result.token, message: "后台登录成功。" });
});

router.use(requireAdminAuth);

router.get("/orders", (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  const orders = listOrders({ status });
  return res.json({ ok: true, orders: orders.map((order) => toPublicOrder(order)) });
});

router.get("/orders/:orderNo", (req, res) => {
  const order = getOrder(req.params.orderNo);

  if (!order) {
    return res.status(404).json({ ok: false, message: "订单不存在。" });
  }

  return res.json({ ok: true, order: toPublicOrder(order) });
});

router.get("/audit-logs", (_req, res) => {
  return res.json({ ok: true, logs: listAdminAuditLogs() });
});

router.post("/orders/:orderNo/replay-success", async (req, res) => {
  const order = getOrder(req.params.orderNo);


  if (!order) {
    return res.status(404).json({ ok: false, message: "订单不存在。" });
  }

  if (order.status !== ORDER_STATUS.paying) {
    return res.status(400).json({ ok: false, message: "当前订单状态不允许补单。" });
  }



  const payload = {
    pid: config.epayPid,
    type: "alipay",
    out_trade_no: order.orderNo,
    trade_no: `MANUAL${Date.now()}`,
    money: Number(order.amount).toFixed(2),
    trade_status: "TRADE_SUCCESS",
    param: order.userId,
    sign_type: config.epaySignType
  };

  payload.sign = createEpaySign(payload, config.epayKey);

  const verifyResult = verifyAlipayNotification(payload);
  if (!verifyResult.ok) {
    return res.status(400).json({ ok: false, message: verifyResult.message || "补单签名校验失败。" });
  }

  appendAdminAuditLog({
    type: "replay_success",
    ip: req.ip,
    orderNo: order.orderNo,
    previousStatus: order.status,
    reason,
    adminTokenSuffix: String(req.adminToken || "").slice(-6)
  });

  const nextOrder = await applySuccessfulPayment(order, payload);
  nextOrder.adminNote = `[补单] ${reason}`;
  updateOrder(order.orderNo, { adminNote: nextOrder.adminNote });
  return res.json({ ok: true, message: "补单成功。", order: toPublicOrder(getOrder(order.orderNo)) });
});

export default router;

