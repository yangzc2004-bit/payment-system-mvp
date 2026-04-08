import { config } from "../config.js";

const DEFAULT_ISSUE_PATH = "/api/v1/admin/redeem-codes/create-and-issue";

function buildFallbackCode(order) {
  const suffix = order.orderNo.slice(-8);
  return `CODE-${suffix}-${order.amount}`;
}

export async function issueRedeemCodeForOrder(order) {
  const idempotencyKey = `issue-code-${order.orderNo}`;

  if (!config.sub2apiBaseUrl || !config.sub2apiAdminApiKey) {
    return {
      ok: true,
      message: `未配置真实发卡接口，已为订单 ${order.orderNo} 生成 mock 卡密。`,
      cardCode: buildFallbackCode(order),
      upstream: {
        mode: "mock",
        idempotencyKey
      }
    };
  }

  const requestUrl = `${config.sub2apiBaseUrl.replace(/\/$/, "")}${DEFAULT_ISSUE_PATH}`;
  const payload = {
    userId: order.userId,
    amount: order.amount,
    orderNo: order.orderNo,
    paymentChannel: order.paymentChannel || "alipay"
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
        message: `发卡接口调用失败，HTTP ${response.status}`,
        upstream: {
          mode: "real",
          idempotencyKey,
          status: response.status,
          body
        }
      };
    }

    const cardCode = body?.cardCode || body?.code || body?.redeemCode || "";
    if (!cardCode) {
      return {
        ok: false,
        message: "发卡接口返回成功，但未包含卡密。",
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
      message: "发卡成功。",
      cardCode,
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
      upstream: {
        mode: "real",
        idempotencyKey
      }
    };
  }
}
