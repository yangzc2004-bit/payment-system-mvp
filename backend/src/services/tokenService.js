import { config } from "../config.js";

async function validateTokenWithSub2API(userId, token) {
  if (!config.sub2apiBaseUrl) {
    return { ok: false, message: "未配置 Sub2API 服务地址。" };
  }

  try {
    const response = await fetch(`${config.sub2apiBaseUrl.replace(/\/$/, "")}/api/v1/user/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || body?.code !== 0 || !body?.data) {
      return { ok: false, message: "访问 token 校验失败。" };
    }

    if (String(body.data.id) !== String(userId)) {
      return { ok: false, message: "user_id 与 token 不匹配。" };
    }

    return { ok: true, message: "访问校验通过。", user: body.data };
  } catch {
    return { ok: false, message: "Sub2API 用户校验失败。" };
  }
}

export async function validateUserAccess(userId, token) {
  if (!userId || !token) {
    return { ok: false, message: "缺少 userId 或 token。" };
  }

  if (config.allowDemoToken && token === config.validDemoToken) {
    return { ok: true, message: "访问校验通过。" };
  }

  return validateTokenWithSub2API(userId, token);
}
