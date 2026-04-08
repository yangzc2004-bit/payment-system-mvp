import { config } from "../config.js";

export const ORDER_STATUS = {
  created: "created",
  paying: "paying",
  paid: "paid",
  codeIssued: "code_issued",
  issueFailed: "issue_failed",
  paymentFailed: "payment_failed"
};

export function generateOrderNo() {
  const randomTail = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");

  return `PAY${Date.now()}${randomTail}`;
}

export function getStatusMessage(status) {
  switch (status) {
    case ORDER_STATUS.created:
      return "订单已创建。";
    case ORDER_STATUS.paying:
      return "订单已创建，请前往支付宝完成支付。";
    case ORDER_STATUS.paid:
      return "支付成功，系统正在发卡。";
    case ORDER_STATUS.codeIssued:
      return "卡密已发放，请复制后前往中转站兑换。";
    case ORDER_STATUS.issueFailed:
      return "支付已完成，但发卡失败，请联系管理员。";
    case ORDER_STATUS.paymentFailed:
      return "支付失败或已关闭，请重新创建订单。";
    default:
      return "订单状态未知。";
  }
}

export function toPublicOrder(order) {
  return {
    orderNo: order.orderNo,
    userId: order.userId,
    amount: order.amount,
    method: order.method,
    status: order.status,
    paymentChannel: order.paymentChannel || "alipay",
    paymentUrl: order.paymentUrl || "",
    paymentProviderOrderId: order.paymentProviderOrderId || "",
    paymentNotified: Boolean(order.paymentNotified),
    cardCode: order.cardCode || "",
    redeemHint: order.redeemHint || config.redeemCodeHint,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.paidAt || null,
    cardIssuedAt: order.cardIssuedAt || null,
    failedAt: order.failedAt || null,
    issueMessage: order.issueMessage || "",
    adminNote: order.adminNote || ""
  };
}
