import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stockFile = path.join(__dirname, "../../data/package-stock.json");
const stockDir = path.dirname(stockFile);

// 初始库存配置
const INITIAL_STOCK = {
  5: { total: 10, sold: 0 },
  12: { total: 8, sold: 0 },
  30: { total: 4, sold: 0 },
  50: { total: 3, sold: 0 }
};

function ensureStockFileReady() {
  if (!fs.existsSync(stockDir)) {
    fs.mkdirSync(stockDir, { recursive: true });
  }

  if (!fs.existsSync(stockFile)) {
    fs.writeFileSync(stockFile, JSON.stringify(INITIAL_STOCK, null, 2) + "\n", "utf8");
  }
}

function readStockFromDisk() {
  ensureStockFileReady();

  try {
    const raw = fs.readFileSync(stockFile, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return parsed;
  } catch {
    return { ...INITIAL_STOCK };
  }
}

function writeStockToDisk(stock) {
  ensureStockFileReady();
  const tempFile = `${stockFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(stock, null, 2) + "\n", "utf8");
  fs.renameSync(tempFile, stockFile);
}

let stockData = readStockFromDisk();

/**
 * 获取所有套餐库存信息
 */
export function getAllStock() {
  return { ...stockData };
}

/**
 * 获取指定金额套餐的库存信息
 */
export function getPackageStock(amount) {
  const key = String(amount);
  if (!stockData[key]) {
    return null;
  }
  return { ...stockData[key] };
}

/**
 * 检查套餐是否有库存
 */
export function hasStock(amount) {
  const stock = getPackageStock(amount);
  if (!stock) {
    return false;
  }
  return stock.sold < stock.total;
}

/**
 * 获取剩余库存数量
 */
export function getRemainingStock(amount) {
  const stock = getPackageStock(amount);
  if (!stock) {
    return 0;
  }
  return Math.max(0, stock.total - stock.sold);
}

/**
 * 扣减库存（订单支付成功时调用）
 * 返回 { ok: boolean, message: string, remaining: number }
 */
export function decrementStock(amount) {
  const key = String(amount);

  if (!stockData[key]) {
    return {
      ok: false,
      message: `套餐金额 ${amount} 不存在`,
      remaining: 0
    };
  }

  const stock = stockData[key];

  if (stock.sold >= stock.total) {
    return {
      ok: false,
      message: `套餐已售罄`,
      remaining: 0
    };
  }

  // 扣减库存
  stockData[key] = {
    ...stock,
    sold: stock.sold + 1
  };

  writeStockToDisk(stockData);

  const remaining = stock.total - stockData[key].sold;

  return {
    ok: true,
    message: `库存扣减成功，剩余 ${remaining} 份`,
    remaining
  };
}

/**
 * 增加库存（退款或补偿时调用）
 */
export function incrementStock(amount) {
  const key = String(amount);

  if (!stockData[key]) {
    return {
      ok: false,
      message: `套餐金额 ${amount} 不存在`
    };
  }

  const stock = stockData[key];

  if (stock.sold <= 0) {
    return {
      ok: false,
      message: `已售数量为 0，无法增加`
    };
  }

  stockData[key] = {
    ...stock,
    sold: Math.max(0, stock.sold - 1)
  };

  writeStockToDisk(stockData);

  return {
    ok: true,
    message: `库存恢复成功`
  };
}

/**
 * 重置所有库存（管理员操作）
 */
export function resetAllStock() {
  stockData = { ...INITIAL_STOCK };
  writeStockToDisk(stockData);
  return {
    ok: true,
    message: "库存已重置"
  };
}

/**
 * 更新套餐总库存（管理员操作）
 */
export function updatePackageTotal(amount, newTotal) {
  const key = String(amount);

  if (!stockData[key]) {
    return {
      ok: false,
      message: `套餐金额 ${amount} 不存在`
    };
  }

  if (!Number.isInteger(newTotal) || newTotal < 0) {
    return {
      ok: false,
      message: "总库存必须是非负整数"
    };
  }

  stockData[key] = {
    ...stockData[key],
    total: newTotal
  };

  writeStockToDisk(stockData);

  return {
    ok: true,
    message: `套餐 ${amount} 总库存已更新为 ${newTotal}`
  };
}
