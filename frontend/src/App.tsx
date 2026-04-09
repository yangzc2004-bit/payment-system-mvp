import { useEffect, useState } from "react";
import {
  adminLogin,
  createOrder,
  getAdminOrder,
  getAdminOrders,
  getOrderStatus,
  validateAccess,
  type OrderStatus,
  type OrderSummary
} from "./api";
import "./styles.css";

const QUICK_AMOUNTS = [1, 5, 10, 30, 50, 100, 200, 500];
const ADMIN_TOKEN_KEY = "payment-system-admin-token";

type PaymentViewStatus = "verifying" | "ready" | "creating" | "invalid" | OrderStatus;

type PaymentQuery = {
  userId: string;
  token: string;
  uiMode: string;
  orderNo: string;
};

type PendingPaymentDisplay = {
  paymentUrl: string;
  paymentQrCode: string;
  paymentUrlScheme: string;
};

function readPaymentQuery(): PaymentQuery {
  const params = new URLSearchParams(window.location.search);

  return {
    userId: params.get("user_id") || "123456",
    token: params.get("token") || "demo_token_preview",
    uiMode: params.get("ui_mode") || "embedded",
    orderNo: params.get("order_no") || ""
  };
}

function updateOrderNoInUrl(orderNo: string) {
  const url = new URL(window.location.href);

  if (orderNo) {
    url.searchParams.set("order_no", orderNo);
  } else {
    url.searchParams.delete("order_no");
  }

  window.history.replaceState(null, "", url.toString());
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function getStatusLabel(status: PaymentViewStatus) {
  switch (status) {
    case "verifying":
      return "校验中";
    case "ready":
      return "待创建订单";
    case "creating":
      return "创建订单中";
    case "invalid":
      return "访问受限";
    case "created":
      return "订单已创建";
    case "paying":
      return "待支付";
    case "paid":
      return "支付成功";
    case "code_issued":
      return "充值成功";
    case "issue_failed":
      return "充值失败";
    case "payment_failed":
      return "支付失败";
    default:
      return "未知状态";
  }
}

function getStatusMessage(status: PaymentViewStatus) {
  switch (status) {
    case "verifying":
      return "正在检查支付环境...";
    case "ready":
      return "请选择金额并创建支付宝订单。";
    case "creating":
      return "正在创建支付宝订单，请稍候...";
    case "invalid":
      return "当前访问方式不合法。";
    case "created":
      return "订单已创建。";
    case "paying":
      return "订单已创建，请点击按钮在新窗口完成支付。";
    case "paid":
      return "支付成功，系统正在处理充值。";
    case "code_issued":
      return "余额已自动充值到账。";
    case "issue_failed":
      return "支付已完成，但自动充值失败，请联系管理员。";
    case "payment_failed":
      return "支付失败或已关闭，请重新创建订单。";
    default:
      return "请稍后重试。";
  }
}

function isFinalStatus(status: OrderStatus) {
  return status === "code_issued" || status === "issue_failed" || status === "payment_failed";
}

function openPaymentWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function PaymentPage() {
  const [query] = useState(() => readPaymentQuery());
  const [amount, setAmount] = useState("50");
  const [status, setStatus] = useState<PaymentViewStatus>("verifying");
  const [message, setMessage] = useState(getStatusMessage("verifying"));
  const [activeOrder, setActiveOrder] = useState<OrderSummary | null>(null);
  const [pendingPaymentDisplay, setPendingPaymentDisplay] = useState<PendingPaymentDisplay>({
    paymentUrl: "",
    paymentQrCode: "",
    paymentUrlScheme: ""
  });

  const amountNumber = Number(amount || 0);
  const isAmountValid = /^\d+$/.test(amount) && amountNumber >= 1 && amountNumber <= 2000;
  const hasCompletedOrder = !!activeOrder && isFinalStatus(activeOrder.status);
  const canCreateOrder = isAmountValid && (status === "ready" || hasCompletedOrder);
  const isFormLocked = !!activeOrder && !isFinalStatus(activeOrder.status);

  async function syncOrder(orderNo: string) {
    const data = await getOrderStatus({
      orderNo,
      userId: query.userId,
      token: query.token,
      uiMode: query.uiMode
    });

    setActiveOrder(data.order);
    setAmount(String(data.order.amount));
    setStatus(data.order.status);
    setMessage(data.message || getStatusMessage(data.order.status));
    return data.order;
  }

  useEffect(() => {
    if (query.uiMode !== "embedded") {
      setStatus("invalid");
      setMessage("请从站内入口进入充值页面。");
      return;
    }

    let active = true;

    validateAccess(query.userId, query.token, query.uiMode)
      .then(async (data) => {
        if (!active) {
          return;
        }

        if (!data.ok) {
          setStatus("invalid");
          setMessage(data.message || "访问校验失败。");
          return;
        }

        if (query.orderNo) {
          try {
            const restoredOrder = await syncOrder(query.orderNo);
            if (isFinalStatus(restoredOrder.status)) {
              setActiveOrder(null);
              setStatus("ready");
              setMessage(getStatusMessage("ready"));
              updateOrderNoInUrl("");
            }
          } catch (error) {
            setStatus("ready");
            setMessage(error instanceof Error ? error.message : getStatusMessage("ready"));
            updateOrderNoInUrl("");
          }
          return;
        }

        setStatus("ready");
        setMessage(getStatusMessage("ready"));
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setStatus("invalid");
        setMessage(error instanceof Error ? error.message : "支付服务暂时不可用。");
      });

    return () => {
      active = false;
    };
  }, [query.orderNo, query.token, query.uiMode, query.userId]);

  useEffect(() => {
    if (!activeOrder || isFinalStatus(activeOrder.status)) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        await syncOrder(activeOrder.orderNo);
      } catch {
        // Keep current UI on transient polling failures.
      }
    }, 4000);

    return () => window.clearInterval(timer);
  }, [activeOrder]);

  async function handleCreateOrder() {
    if (!canCreateOrder) {
      return;
    }

    setStatus("creating");
    setMessage(getStatusMessage("creating"));
    setPendingPaymentDisplay({ paymentUrl: "", paymentQrCode: "", paymentUrlScheme: "" });

    try {
      const data = await createOrder({
        userId: query.userId,
        token: query.token,
        amount: amountNumber,
        returnPageUrl: `${window.location.origin}${window.location.pathname}`,
        uiMode: query.uiMode
      });

      setActiveOrder(data.order);
      setStatus(data.order.status);
      setMessage(data.message || getStatusMessage(data.order.status));
      updateOrderNoInUrl(data.order.orderNo);
      setPendingPaymentDisplay({
        paymentUrl: data.paymentUrl || "",
        paymentQrCode: data.paymentQrCode || "",
        paymentUrlScheme: data.paymentUrlScheme || ""
      });

      if (data.paymentUrl && !data.paymentQrCode) {
        openPaymentWindow(data.paymentUrl);
      }
    } catch (error) {
      setStatus("ready");
      setMessage(error instanceof Error ? error.message : "订单创建失败。");
    }
  }

  function handleCreateNextOrder() {
    setActiveOrder(null);
    setStatus("ready");
    setMessage(getStatusMessage("ready"));
    setPendingPaymentDisplay({ paymentUrl: "", paymentQrCode: "", paymentUrlScheme: "" });
    updateOrderNoInUrl("");
  }

  return (
    <div className="page-shell">
      <div className="orb orb-left" />
      <div className="orb orb-right" />

      <main className="page">
        <section className="hero">
          <div>
            <div className="eyebrow">Secure Payment Center</div>
            <h1>在线充值中心</h1>
            <p className="hero-copy">
              当前接入易支付自动收款。创建订单后会自动新开支付窗口或展示二维码，支付成功后系统自动充值到你的 Sub2API 账户余额。
            </p>
          </div>
          <div className={`status-card status-${status}`}>
            <div className="status-label">{getStatusLabel(status)}</div>
            <div className="status-message">{message}</div>
          </div>
        </section>

        <section className="layout">
          <div className="panel panel-main">
            <div className="panel-header">
              <div>
                <h2>充值配置</h2>
                <p>充值账号：{query.userId}</p>
              </div>
              <div className="tag">支付宝自动充值版</div>
            </div>

            <div className="field-block">
              <label className="field-label" htmlFor="amount-input">
                充值金额
              </label>
              <div className="amount-input-wrap">
                <span className="currency">¥</span>
                <input
                  id="amount-input"
                  inputMode="numeric"
                  value={amount}
                  disabled={isFormLocked}
                  onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
                  placeholder="请输入 1 到 2000 之间的整数金额"
                />
              </div>
              {!isAmountValid ? <div className="error-text">金额必须是 1 到 2000 之间的整数。</div> : null}
            </div>

            <div className="field-block">
              <div className="field-label">快捷金额</div>
              <div className="quick-row">
                {QUICK_AMOUNTS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={isFormLocked}
                    className={String(item) === amount ? "quick active" : "quick"}
                    onClick={() => setAmount(String(item))}
                  >
                    ¥{item}
                  </button>
                ))}
              </div>
            </div>

            <div className="summary-box">
              <div>
                <div className="summary-label">预计到账</div>
                <div className="summary-value">{isAmountValid ? amountNumber : 0}</div>
                <div className="summary-label">余额</div>
              </div>
              <div className="summary-side">
                <div>支付方式：支付宝</div>
                <div>充值比例：1 : 1</div>
                <div>订单状态：{activeOrder ? getStatusLabel(activeOrder.status) : "待创建"}</div>
              </div>
            </div>

            <div className="panel-tip">
              如果支付平台禁止 iframe 内跳转，系统会自动在新窗口打开支付页。支付成功后当前页面会自动轮询并显示到账结果。
            </div>

            <button type="button" className="pay-button" disabled={!canCreateOrder} onClick={handleCreateOrder}>
              {hasCompletedOrder ? "创建新订单" : "创建订单并前往支付"}
            </button>
          </div>

          <div className="panel panel-side">
            <div className="panel-header">
              <div>
                <h2>支付与充值结果</h2>
                <p>按支付平台返回结果展示跳转按钮或二维码，并在成功后显示到账状态。</p>
              </div>
              <div className="tag muted-tag">自动化流程</div>
            </div>

            {!activeOrder ? (
              <div className="empty-state">
                <div className="empty-icon" />
                <div className="empty-title">等待创建订单</div>
                <div className="empty-copy">创建订单后，这里会展示支付指引和自动充值结果。</div>
              </div>
            ) : (
              <div className="pay-card">
                <div className="pay-card-top">
                  <div>
                    <div className="pay-card-title">支付宝订单</div>
                    <div className="order-text">订单号：{activeOrder.orderNo}</div>
                  </div>
                  <div className="countdown">{getStatusLabel(activeOrder.status)}</div>
                </div>

                <div className="amount-card">
                  <div className="money-row">
                    <span>订单金额</span>
                    <span>支付通道</span>
                  </div>
                  <div className="money-row money-strong">
                    <strong>¥{activeOrder.amount}</strong>
                    <strong className="accent">支付宝</strong>
                  </div>
                </div>

                <div className="order-meta">
                  <div>创建时间：{formatDateTime(activeOrder.createdAt)}</div>
                  <div>支付时间：{formatDateTime(activeOrder.paidAt)}</div>
                  <div>充值时间：{formatDateTime(activeOrder.cardIssuedAt)}</div>
                  <div>支付通知：{activeOrder.paymentNotified ? "已收到" : "未收到"}</div>
                </div>

                {activeOrder.status === "paying" && pendingPaymentDisplay.paymentQrCode ? (
                  <div className="qr-card code-card">
                    <div className="qr-title">请使用支付宝扫码付款</div>
                    <img className="qr-image" src={pendingPaymentDisplay.paymentQrCode} alt="支付宝二维码" />
                    <div className="qr-note">如果扫码失败，点击下方按钮在新窗口打开支付页。</div>
                    {pendingPaymentDisplay.paymentUrl ? (
                      <button type="button" className="secondary-button" onClick={() => openPaymentWindow(pendingPaymentDisplay.paymentUrl)}>
                        在新窗口打开支付页
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {activeOrder.status === "paying" && !pendingPaymentDisplay.paymentQrCode && pendingPaymentDisplay.paymentUrl ? (
                  <button type="button" className="secondary-button" onClick={() => openPaymentWindow(pendingPaymentDisplay.paymentUrl)}>
                    在新窗口打开支付页
                  </button>
                ) : null}

                {activeOrder.status === "paying" && pendingPaymentDisplay.paymentUrlScheme ? (
                  <div className="admin-feedback">当前平台返回的是移动端跳转链接，请使用手机支付宝完成支付。</div>
                ) : null}

                {activeOrder.status === "code_issued" ? (
                  <div className="admin-feedback">余额已自动充值到账。当前订单金额已按 1:1 充值到你的账户。</div>
                ) : null}

                {activeOrder.status === "issue_failed" ? (
                  <div className="admin-feedback">{activeOrder.issueMessage || "自动充值失败，请联系管理员处理。"}</div>
                ) : null}

                {isFinalStatus(activeOrder.status) ? (
                  <button type="button" className="ghost-button full-width-button" onClick={handleCreateNextOrder}>
                    再创建一笔订单
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function AdminPage() {
  const [adminToken, setAdminToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_KEY) || "");
  const [password, setPassword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function loadOrders(token: string, filter: string, preferredOrderNo = "") {
    setIsLoading(true);

    try {
      const data = await getAdminOrders(token, filter);
      setOrders(data.orders);

      if (preferredOrderNo) {
        const detail = await getAdminOrder(token, preferredOrderNo);
        setSelectedOrder(detail.order);
      } else if (selectedOrder) {
        const matched = data.orders.find((item) => item.orderNo === selectedOrder.orderNo) || null;
        setSelectedOrder(matched);
      }

      setFeedback("");
    } catch (error) {
      if (error instanceof Error && error.message.includes("认证")) {
        window.localStorage.removeItem(ADMIN_TOKEN_KEY);
        setAdminToken("");
      }

      setFeedback(error instanceof Error ? error.message : "加载订单失败。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!adminToken) {
      return;
    }

    loadOrders(adminToken, statusFilter);
    const timer = window.setInterval(() => {
      loadOrders(adminToken, statusFilter, selectedOrder?.orderNo || "");
    }, 5000);

    return () => window.clearInterval(timer);
  }, [adminToken, selectedOrder?.orderNo, statusFilter]);

  async function handleLogin() {
    setIsLoading(true);

    try {
      const data = await adminLogin(password);
      window.localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setAdminToken(data.token);
      setPassword("");
      setFeedback(data.message);
      await loadOrders(data.token, statusFilter);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "后台登录失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectOrder(orderNo: string) {
    if (!adminToken) {
      return;
    }

    try {
      const data = await getAdminOrder(adminToken, orderNo);
      setSelectedOrder(data.order);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "加载订单详情失败。");
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken("");
    setSelectedOrder(null);
    setOrders([]);
    setFeedback("已退出后台。");
  }

  if (!adminToken) {
    return (
      <div className="page-shell admin-shell">
        <main className="page admin-page">
          <section className="hero admin-hero">
            <div>
              <div className="eyebrow">Payment Ops Console</div>
              <h1>支付订单后台</h1>
              <p className="hero-copy">当前后台仅用于查看自动支付与自动充值状态，不再承担人工确认功能。</p>
            </div>
          </section>

          <section className="admin-login-card">
            <h2>后台登录</h2>
            <p>请输入管理员密码进入订单排障后台。</p>
            <input
              className="admin-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入后台密码"
            />
            <button type="button" className="pay-button" disabled={!password || isLoading} onClick={handleLogin}>
              {isLoading ? "登录中..." : "登录后台"}
            </button>
            {feedback ? <div className="admin-feedback">{feedback}</div> : null}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell admin-shell">
      <main className="page admin-page">
        <section className="hero admin-hero">
          <div>
            <div className="eyebrow">Payment Ops Console</div>
            <h1>支付订单后台</h1>
            <p className="hero-copy">查看支付回调、自动充值结果和异常订单，默认流程已经改为自动确认与自动充值。</p>
          </div>
          <div className="admin-hero-actions">
            <button type="button" className="ghost-button" onClick={() => loadOrders(adminToken, statusFilter, selectedOrder?.orderNo || "")}>刷新订单</button>
            <button type="button" className="ghost-button" onClick={handleLogout}>退出后台</button>
          </div>
        </section>

        <section className="admin-toolbar panel">
          <div>
            <h2>订单筛选</h2>
            <p>按状态过滤，并点击订单查看支付链接、自动充值结果和错误信息。</p>
          </div>
          <select className="admin-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">全部订单</option>
            <option value="created">订单已创建</option>
            <option value="paying">待支付</option>
            <option value="paid">支付成功待充值</option>
            <option value="code_issued">已自动充值</option>
            <option value="issue_failed">充值失败</option>
            <option value="payment_failed">支付失败</option>
          </select>
        </section>

        {feedback ? <div className="admin-feedback top-feedback">{feedback}</div> : null}

        <section className="admin-grid">
          <div className="panel admin-table-panel">
            <div className="admin-panel-head">
              <h2>订单列表</h2>
              <span className="tag muted-tag">{isLoading ? "加载中" : `${orders.length} 笔`}</span>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>用户</th>
                    <th>金额</th>
                    <th>状态</th>
                    <th>结果</th>
                    <th>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.orderNo} className={selectedOrder?.orderNo === order.orderNo ? "active-row" : ""} onClick={() => handleSelectOrder(order.orderNo)}>
                      <td>{order.orderNo}</td>
                      <td>{order.userId}</td>
                      <td>¥{order.amount}</td>
                      <td><span className={`admin-status-pill status-${order.status}`}>{getStatusLabel(order.status)}</span></td>
                      <td>{order.status === "code_issued" ? "已到账" : order.status === "paying" ? "可补单" : "处理中"}</td>
                      <td>{formatDateTime(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!orders.length ? <div className="admin-empty">当前筛选条件下暂无订单。</div> : null}
            </div>
          </div>

          <div className="panel admin-detail-panel">
            <div className="admin-panel-head">
              <h2>订单详情</h2>
            </div>

            {!selectedOrder ? (
              <div className="admin-empty detail-empty">请选择一笔订单查看详情。</div>
            ) : (
              <div className="admin-detail-body">
                <div className="detail-list">
                  <div>订单号：{selectedOrder.orderNo}</div>
                  <div>用户 ID：{selectedOrder.userId}</div>
                  <div>金额：¥{selectedOrder.amount}</div>
                  <div>支付通道：支付宝</div>
                  <div>订单状态：{getStatusLabel(selectedOrder.status)}</div>
                  <div>支付链接：{selectedOrder.paymentUrl || "无"}</div>
                  <div>支付通知：{selectedOrder.paymentNotified ? "已收到" : "未收到"}</div>
                  <div>支付时间：{formatDateTime(selectedOrder.paidAt)}</div>
                  <div>充值时间：{formatDateTime(selectedOrder.cardIssuedAt)}</div>
                  <div>结果信息：{selectedOrder.issueMessage || "无"}</div>
                </div>

                {selectedOrder.status === "paying" ? (
                  <div className="detail-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={async () => {
                        if (!adminToken || !selectedOrder) {
                          return;
                        }

                        try {
                          const response = await fetch(`/api/admin/orders/${selectedOrder.orderNo}/replay-success`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${adminToken}`
                            }
                          });
                          const data = await response.json();
                          if (!response.ok) {
                            throw new Error(data.message || "补单失败。");
                          }
                          setSelectedOrder(data.order);
                          setFeedback(data.message || "补单成功。");
                          await loadOrders(adminToken, statusFilter, selectedOrder.orderNo);
                        } catch (error) {
                          setFeedback(error instanceof Error ? error.message : "补单失败。");
                        }
                      }}
                    >
                      补单并自动充值
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const isAdminPage = window.location.pathname.startsWith("/admin");
  return isAdminPage ? <AdminPage /> : <PaymentPage />;
}







