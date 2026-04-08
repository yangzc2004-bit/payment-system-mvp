import express from "express";
import { getOrder, listOrders } from "../services/orderStore.js";
import { createAdminSession, requireAdminAuth } from "../services/adminAuthService.js";
import { toPublicOrder } from "../utils/helpers.js";

const router = express.Router();

router.post("/login", (req, res) => {
  const { password } = req.body;
  const token = createAdminSession(password);

  if (!token) {
    return res.status(401).json({ ok: false, message: "后台密码错误。" });
  }

  return res.json({ ok: true, token, message: "后台登录成功。" });
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

export default router;
