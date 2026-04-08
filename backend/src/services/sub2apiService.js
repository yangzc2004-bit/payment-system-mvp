import { config } from "../config.js";

const DEFAULT_REDEEM_PATH = "/api/v1/admin/redeem-codes/create-and-redeem";

export async function redeemBalanceForOrder(order) {
  const idempotencyKey = `manual-recharge-${order.orderNo}`;

  if (!config.sub2apiBaseUrl || !config.sub2apiAdminApiKey) {
    return {
      ok: true,
      message: `未配置真实 Sub2API，已按 mock 方式完成订单 ${order.orderNo} 的充值。`,
      upstream: {
        mode: "mock",
        idempotencyKey
      }
    };
  }

  const requestUrl = `${config.sub2apiBaseUrl.replace(/\/$/, "")}${DEFAULT_REDEEM_PATH}`;
  const payload = {
    userId: order.userId,
    amount: order.amount,
    orderNo: order.orderNo,
    paymentMethod: order.method
  };

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.sub2apiAdminApiKey,
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(payload)
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        message: `Sub2API 调用失败，HTTP ${response.status}`,
        upstream: {
          mode: "real",
          idempotencyKey,
          status: response.status,
          body
        }
      };
    }

    return {
      ok: true,
      message: "Sub2API 充值成功。",
      upstream: {
        mode: "real",
        idempotencyKey,
        status: response.status,
        body
      }
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Sub2API 请求失败。",
      upstream: {
        mode: "real",
        idempotencyKey
      }
    };
  }
}
