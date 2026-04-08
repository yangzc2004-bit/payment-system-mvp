import { config } from "../config.js";

export function validateUserAccess(userId, token) {
  if (!userId || !token) {
    return { ok: false, message: "缺少 userId 或 token。" };
  }

  if (token !== config.validDemoToken) {
    return { ok: false, message: "访问 token 校验失败。" };
  }

  return { ok: true, message: "访问校验通过。" };
}
