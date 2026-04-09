export type PaymentMethod = "alipay";

export type OrderStatus =
  | "created"
  | "paying"
  | "paid"
  | "code_issued"
  | "issue_failed"
  | "payment_failed";

export type OrderSummary = {
  orderNo: string;
  userId: string;
  amount: number;
  method: PaymentMethod;
  status: OrderStatus;
  paymentChannel: string;
  paymentUrl: string;
  paymentProviderOrderId: string;
  paymentNotified: boolean;
  cardCode: string;
  redeemHint: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  cardIssuedAt: string | null;
  failedAt: string | null;
  issueMessage: string;
  adminNote: string;
};

export type ValidateResponse = {
  ok: boolean;
  message: string;
};

export type PaymentOrderResponse = {
  ok: boolean;
  status: OrderStatus;
  message: string;
  paymentUrl?: string;
  paymentQrCode?: string;
  paymentUrlScheme?: string;
  order: OrderSummary;
};

export type AdminLoginResponse = {
  ok: boolean;
  token: string;
  message: string;
};

export type AdminOrdersResponse = {
  ok: boolean;
  orders: OrderSummary[];
};

export type AdminOrderResponse = {
  ok: boolean;
  message?: string;
  order: OrderSummary;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim() || window.location.origin;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const data = await response.json().catch(() => ({ ok: false, message: "服务器响应异常。" }));

  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "请求失败。");
  }

  return data as T;
}

function buildAdminHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

export async function validateAccess(userId: string, token: string, uiMode: string) {
  return requestJson<ValidateResponse>("/api/payment/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, token, uiMode })
  });
}

export async function createOrder(payload: {
  userId: string;
  token: string;
  amount: number;
  returnPageUrl: string;
  uiMode: string;
}) {
  return requestJson<PaymentOrderResponse>("/api/payment/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, method: "alipay" })
  });
}

export async function getOrderStatus(params: {
  orderNo: string;
  userId: string;
  token: string;
  uiMode: string;
}) {
  const query = new URLSearchParams({ userId: params.userId, token: params.token, ui_mode: params.uiMode });
  return requestJson<PaymentOrderResponse>(`/api/payment/order-status/${params.orderNo}?${query.toString()}`);
}

export async function adminLogin(password: string) {
  return requestJson<AdminLoginResponse>("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
}

export async function getAdminOrders(token: string, status: string) {
  const query = new URLSearchParams({ status });
  return requestJson<AdminOrdersResponse>(`/api/admin/orders?${query.toString()}`, {
    headers: buildAdminHeaders(token)
  });
}

export async function getAdminOrder(token: string, orderNo: string) {
  return requestJson<AdminOrderResponse>(`/api/admin/orders/${orderNo}`, {
    headers: buildAdminHeaders(token)
  });
}

