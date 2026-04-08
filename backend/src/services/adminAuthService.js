import crypto from "crypto";
import { config } from "../config.js";

const adminSessions = new Map();

export function createAdminSession(password) {
  if (password !== config.adminPassword) {
    return null;
  }

  const token = crypto.randomBytes(24).toString("hex");
  adminSessions.set(token, { createdAt: new Date().toISOString() });
  return token;
}

export function getAdminSession(token) {
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
