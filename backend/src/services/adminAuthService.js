import crypto from "crypto";
import { config } from "../config.js";

const adminSessions = new Map();
const failedAttempts = new Map();
const adminAuditLogs = [];

function nowMs() {
  return Date.now();
}

function sessionExpiresAt() {
  return nowMs() + config.adminSessionTtlMinutes * 60 * 1000;
}

function lockExpiresAt() {
  return nowMs() + config.adminLockMinutes * 60 * 1000;
}

function cleanupExpiredSessions() {
  const now = nowMs();
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

function cleanupExpiredFailures() {
  const now = nowMs();
  for (const [key, record] of failedAttempts.entries()) {
    if (record.lockUntil && record.lockUntil <= now) {
      failedAttempts.delete(key);
    }
  }
}

function getClientKey(ip) {
  return ip || "unknown";
}

function getFailureState(ip) {
  cleanupExpiredFailures();
  return failedAttempts.get(getClientKey(ip)) || { count: 0, lockUntil: 0 };
}

function recordFailedAttempt(ip) {
  const key = getClientKey(ip);
  const current = getFailureState(ip);
  const nextCount = current.count + 1;
  const locked = nextCount >= config.adminMaxFailedAttempts;

  failedAttempts.set(key, {
    count: locked ? 0 : nextCount,
    lockUntil: locked ? lockExpiresAt() : 0
  });

  return failedAttempts.get(key);
}

function clearFailedAttempts(ip) {
  failedAttempts.delete(getClientKey(ip));
}

export function appendAdminAuditLog(entry) {
  adminAuditLogs.push({
    ...entry,
    createdAt: new Date().toISOString()
  });

  if (adminAuditLogs.length > 200) {
    adminAuditLogs.shift();
  }
}

export function listAdminAuditLogs() {
  return [...adminAuditLogs].reverse();
}

export function createAdminSession(password, ip) {
  if (!config.adminPassword) {
    return { ok: false, message: "后台密码未配置。" };
  }

  const failureState = getFailureState(ip);
  if (failureState.lockUntil && failureState.lockUntil > nowMs()) {
    appendAdminAuditLog({ type: "login_locked", ip: getClientKey(ip) });
    return { ok: false, message: "登录失败次数过多，请稍后再试。" };
  }

  if (password !== config.adminPassword) {
    recordFailedAttempt(ip);
    appendAdminAuditLog({ type: "login_failed", ip: getClientKey(ip) });
    return { ok: false, message: "后台密码错误。" };
  }

  clearFailedAttempts(ip);
  cleanupExpiredSessions();

  const token = crypto.randomBytes(24).toString("hex");
  adminSessions.set(token, {
    createdAt: new Date().toISOString(),
    expiresAt: sessionExpiresAt(),
    ip: getClientKey(ip)
  });

  appendAdminAuditLog({ type: "login_success", ip: getClientKey(ip) });
  return { ok: true, token };
}

export function getAdminSession(token) {
  cleanupExpiredSessions();
  return adminSessions.get(token) || null;
}

export function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token || !getAdminSession(token)) {
    return res.status(401).json({ ok: false, message: "后台认证失败。" });
  }

  req.adminToken = token;
  next();
}
