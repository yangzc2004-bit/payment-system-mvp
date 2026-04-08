import { config } from "../config.js";

const DEFAULT_REDEEM_PATH = "/api/v1/admin/redeem-codes/create-and-redeem";

function buildFallbackCode(order) {
  const suffix = order.orderNo.slice(-8);
  return `CODE-${suffix}-${order.amount}`;
}

export async function issueRedeemCodeForOrder(order) {
  const idempotencyKey = `issue-code-${order.orderNo}`;

  if (!config.sub2apiBaseUrl || (!config.sub2apiAdminApiKey && !config.sub2apiAdminJwt)) {
    return {
      ok: true,
      message: `未配置真实发卡接口，已为订单 ${order.orderNo} 生成 mock 卡密。`,
      cardCode: buildFallbackCode(order),
      rechargeApplied: false,
      upstream: {
        mode: "mock",
        idempotencyKey
      }
    };
  }

  const requestUrl = `${config.sub2apiBaseUrl.replace(/\/$/, "")}${DEFAULT_REDEEM_PATH}`;
  const payload = {
    code: `s2p_${order.orderNo}`,
    type: "balance",
    value: Number(order.amount),
    user_id: Number(order.userId),
    notes: `payment-system order: ${order.orderNo}`
  };

  const headers = {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey
  };

  if (config.sub2apiAdminJwt) {
    headers.Authorization = `Bearer ${config.sub2apiAdminJwt}`;
  } else {
    headers["x-api-key"] = config.sub2apiAdminApiKey;
  }

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || body?.code !== 0) {
      return {
        ok: false,
        message: body?.message || `发卡接口调用失败，HTTP ${response.status}`,
        rechargeApplied: false,
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
      message: "余额已自动充值到账，无需再兑换卡密。",
      cardCode: "",
      rechargeApplied: true,
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
      message: error instanceof Error ? error.message : "发卡请求失败。",
      rechargeApplied: false,
      upstream: {
        mode: "real",
        idempotencyKey
      }
    };
  }
}
