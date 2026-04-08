# payment-system Transition Version

一个用于 Sub2API 中转站的过渡版充值系统。

## 当前流程

1. 用户从站内入口进入充值页
2. 输入金额并选择支付宝或微信支付
3. 创建订单
4. 页面展示对应的真实收款码图片
5. 用户付款后点击“我已支付”
6. 订单进入“待人工确认”
7. 管理员在后台核对到账后点击“充值成功”或“确认失败”
8. 点击“充值成功”时后端调用 Sub2API 充值

## 目录结构

```text
payment-system-mvp/
├─ frontend/
│  ├─ public/
│  │  ├─ alipay-qr.jpg
│  │  └─ wechat-qr.jpg
│  ├─ src/
│  │  ├─ App.tsx
│  │  ├─ api.ts
│  │  ├─ main.tsx
│  │  └─ styles.css
│  ├─ .env.example
│  └─ package.json
├─ backend/
│  ├─ data/
│  │  └─ orders.json
│  ├─ src/
│  │  ├─ app.js
│  │  ├─ config.js
│  │  ├─ routes/
│  │  │  ├─ admin.js
│  │  │  └─ payment.js
│  │  ├─ services/
│  │  │  ├─ adminAuthService.js
│  │  │  ├─ orderStore.js
│  │  │  ├─ sub2apiService.js
│  │  │  └─ tokenService.js
│  │  └─ utils/
│  │     └─ helpers.js
│  ├─ .env.example
│  └─ package.json
└─ README.md
```

## 启动方式

### 后端

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

默认地址：`http://localhost:3001`

### 前端

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 页面入口

### 用户充值页

```text
http://localhost:3000/?user_id=123456&token=demo_token_preview&ui_mode=embedded
```

### 管理后台

```text
http://localhost:3000/admin
```

默认后台密码：`admin123456`

## 关键配置

后端 `.env`：

```env
PORT=3001
SUB2API_BASE_URL=
SUB2API_ADMIN_API_KEY=
VALID_DEMO_TOKEN=demo_token_preview
ADMIN_PASSWORD=admin123456
ORDER_STORE_FILE=
```

## 当前实现说明

### 已完成

- 用户侧真实收款码展示
- 创建订单
- 记录 `user_id`、金额、支付方式
- 订单写入本地 JSON 文件
- 用户点击“我已支付”后进入待人工确认
- 简易后台登录与订单列表
- 后台人工确认成功 / 失败
- 后台确认成功时调用 `sub2apiService`

### 当前仍是过渡版

- 没有接真实支付回调
- 没有接 MySQL
- 后台认证是简单密码保护
- `sub2apiService` 在未配置真实 `SUB2API_BASE_URL` 和 `SUB2API_ADMIN_API_KEY` 时会走 mock 成功逻辑，方便本地联调

## 真实接入时改哪里

- 用户支付页逻辑：`frontend/src/App.tsx`
- 用户 / 后台 API：`backend/src/routes/payment.js`、`backend/src/routes/admin.js`
- 订单存储：`backend/src/services/orderStore.js`
- 后台认证：`backend/src/services/adminAuthService.js`
- Sub2API 调用：`backend/src/services/sub2apiService.js`
