import fs from "fs";
import path from "path";
import { config } from "../config.js";

const storeFile = config.orderStoreFile;
const storeDir = path.dirname(storeFile);

function ensureStoreReady() {
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }

  if (!fs.existsSync(storeFile)) {
    fs.writeFileSync(storeFile, "[]\n", "utf8");
  }
}

function readOrdersFromDisk() {
  ensureStoreReady();

  try {
    const raw = fs.readFileSync(storeFile, "utf8");
    const parsed = JSON.parse(raw || "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

function writeOrdersToDisk(orders) {
  ensureStoreReady();
  const tempFile = `${storeFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(orders, null, 2) + "\n", "utf8");
  fs.renameSync(tempFile, storeFile);
}

const orders = new Map(readOrdersFromDisk().map((order) => [order.orderNo, order]));

function persistOrders() {
  writeOrdersToDisk(Array.from(orders.values()));
}

export function saveOrder(order) {
  orders.set(order.orderNo, order);
  persistOrders();
  return order;
}

export function getOrder(orderNo) {
  return orders.get(orderNo) || null;
}

export function updateOrder(orderNo, patch) {
  const current = orders.get(orderNo);

  if (!current) {
    return null;
  }

  const nextOrder = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  orders.set(orderNo, nextOrder);
  persistOrders();
  return nextOrder;
}

export function listOrders(options = {}) {
  const { status } = options;
  const allOrders = Array.from(orders.values()).sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  if (!status || status === "all") {
    return allOrders;
  }

  return allOrders.filter((order) => order.status === status);
}
