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

const QUICK_AMOUNTS = [10, 30, 50, 100, 200, 500];
const ADMIN_TOKEN_KEY = "payment-system-admin-token";

type PaymentViewStatus = "verifying" | "ready" | "creating" | "invalid" | OrderStatus;

type PaymentQuery = {
  userId: string;
  token: string;
  uiMode: string;
  orderNo: string;
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
      return "已发卡";
    case "issue_failed":
      return "发卡失败";
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
      return "订单已创建，请前往支付宝完成支付。";
    case "paid":
      return "支付成功，系统正在发卡。";
    case "code_issued":
      return "卡密已发放，请复制后前往中转站兑换。";
    case "issue_failed":
      return "支付已完成，但发卡失败，请联系管理员。";
    case "payment_failed":
      return "支付失败或已关闭，请重新创建订单。";
    default:
      return "请稍后重试。";
  }
}

function isFinalStatus(status: OrderStatus) {
  return status === "code_issued" || status === "issue_failed" || status === "payment_failed";
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function PaymentPage() {
  const [query] = useState(() => readPaymentQuery());
  const [amount, setAmount] = useState("50");
  const [status, setStatus] = useState<PaymentViewStatus>("verifying");
  const [message, setMessage] = useState(getStatusMessage("verifying"));
  const [activeOrder, setActiveOrder] = useState<OrderSummary | null>(null);
  const [copyMessage, setCopyMessage] = useState("");

  const amountNumber = Number(amount || 0);
  const isAmountValid = /^\d+$/.test(amount) && amountNumber >= 10 && amountNumber <= 2000;
  const hasCompletedOrder = !!activeOrder && isFinalStatus(activeOrder.status);
  const canCreateOrder = isAmountValid && (status === "ready" || hasCompletedOrder);
  const isFormLocked = !!activeOrder && !isFinalStatus(activeOrder.status);

  async function syncOrder(orderNo: string) {
    const data = await getOrderStatus({
      orderNo,
      userId: query.userId,
      token: query.token
    });

    setActiveOrder(data.order);
    setAmount(String(data.order.amount));
    setStatus(data.order.status);
    setMessage(data.message || getStatusMessage(data.order.status));
  }

  useEffect(() => {
    if (query.uiMode !== "embedded") {
      setStatus("invalid");
      setMessage("请从站内入口进入充值页面。");
      return;
    }

    let active = true;

    validateAccess(query.userId, query.token)
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
            await syncOrder(query.orderNo);
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
    setCopyMessage("");

    try {
      const data = await createOrder({
        userId: query.userId,
        token: query.token,
        amount: amountNumber,
        returnPageUrl: `${window.location.origin}${window.location.pathname}`
      });

      setActiveOrder(data.order);
      setStatus(data.order.status);
      setMessage(data.message || getStatusMessage(data.order.status));
      updateOrderNoInUrl(data.order.orderNo);

      if (data.paymentUrl) {
        window.open(data.paymentUrl, "_blank", "noopener,noreferrer");
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
    setCopyMessage("");
    updateOrderNoInUrl("");
  }

  async function handleCopyCode() {
    if (!activeOrder?.cardCode) {
      return;
    }

    try {
      await copyText(activeOrder.cardCode);
      setCopyMessage("卡密已复制。请回到中转站兑换。");
    } catch {
      setCopyMessage("复制失败，请手动复制卡密。");
    }
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
              这是支付宝链接支付版。系统会自动确认支付并自动发卡，发卡完成后会直接在当前页面展示兑换卡密。
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
              <div className="tag">支付宝自动发卡版</div>
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
                  placeholder="请输入 10 到 2000 之间的整数金额"
                />
              </div>
              {!isAmountValid ? <div className="error-text">金额必须是 10 到 2000 之间的整数。</div> : null}
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
                <div>支付方式：支付宝收银台链接</div>
                <div>充值比例：1 : 1</div>
                <div>订单状态：{activeOrder ? getStatusLabel(activeOrder.status) : "待创建"}</div>
              </div>
            </div>

            <div className="panel-tip">
              点击创建订单后会自动打开支付宝支付链接。支付成功后系统会自动发卡，卡密会直接显示在当前页面。
            </div>

            <button type="button" className="pay-button" disabled={!canCreateOrder} onClick={handleCreateOrder}>
              {hasCompletedOrder ? "创建新订单" : "创建订单并前往支付宝支付"}
            </button>
          </div>

          <div className="panel panel-side">
            <div className="panel-header">
              <div>
                <h2>订单与发卡结果</h2>
                <p>自动支付成功后会在这里显示卡密和兑换说明。</p>
              </div>
              <div className="tag muted-tag">自动化流程</div>
            </div>

            {!activeOrder ? (
              <div className="empty-state">
                <div className="empty-icon" />
                <div className="empty-title">等待创建订单</div>
                <div className="empty-copy">创建订单后会自动打开支付宝支付页面，支付完成后这里会显示发卡结果。</div>
              </div>
            ) : (
              <div className="pay-card">
                <div className="pay-card-top">
                  <div>
                    <div className="pay-card-title">支付宝链接支付订单</div>
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
                  <div>发卡时间：{formatDateTime(activeOrder.cardIssuedAt)}</div>
                  <div>支付通知：{activeOrder.paymentNotified ? "已收到" : "未收到"}</div>
                </div>

                {activeOrder.paymentUrl && !isFinalStatus(activeOrder.status) ? (
                  <button type="button" className="secondary-button" onClick={() => window.open(activeOrder.paymentUrl, "_blank", "noopener,noreferrer")}>
                    重新打开支付宝支付链接
                  </button>
                ) : null}

                {activeOrder.status === "code_issued" ? (
                  <div className="qr-card code-card">
                    <div className="qr-title">卡密已生成</div>
                    <div className="code-value">{activeOrder.cardCode}</div>
                    <div className="qr-note">{activeOrder.redeemHint}</div>
                    <button type="button" className="secondary-button" onClick={handleCopyCode}>
                      复制卡密
                    </button>
                    {copyMessage ? <div className="copy-feedback">{copyMessage}</div> : null}
                  </div>
                ) : null}

                {activeOrder.status === "issue_failed" ? (
                  <div className="admin-feedback">{activeOrder.issueMessage || "发卡失败，请联系管理员处理。"}</div>
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
              <p className="hero-copy">当前后台仅用于查看自动支付与自动发卡状态，不再承担人工确认功能。</p>
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
            <p className="hero-copy">查看支付宝支付回调、发卡结果和异常订单，默认流程已经改为自动确认与自动发卡。</p>
          </div>
          <div className="admin-hero-actions">
            <button type="button" className="ghost-button" onClick={() => loadOrders(adminToken, statusFilter, selectedOrder?.orderNo || "")}>刷新订单</button>
            <button type="button" className="ghost-button" onClick={handleLogout}>退出后台</button>
          </div>
        </section>

        <section className="admin-toolbar panel">
          <div>
            <h2>订单筛选</h2>
            <p>按状态过滤，并点击订单查看支付链接、发卡结果和错误信息。</p>
          </div>
          <select className="admin-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">全部订单</option>
            <option value="created">订单已创建</option>
            <option value="paying">待支付</option>
            <option value="paid">支付成功待发卡</option>
            <option value="code_issued">已发卡</option>
            <option value="issue_failed">发卡失败</option>
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
                    <th>发卡</th>
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
                      <td>{order.cardCode ? "已生成" : "未生成"}</td>
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
                  <div>发卡时间：{formatDateTime(selectedOrder.cardIssuedAt)}</div>
                  <div>卡密：{selectedOrder.cardCode || "未生成"}</div>
                  <div>错误信息：{selectedOrder.issueMessage || "无"}</div>
                </div>
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



