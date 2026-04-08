# payment-system Auto Recharge Version

一个用于 Sub2API 中转站的自动支付充值系统。

## 当前流程

1. 用户从站内入口进入充值页
2. 输入金额并创建订单
3. 系统跳转到易支付支付页或展示支付宝二维码
4. 用户完成支付
5. 易支付异步回调支付系统后端
6. 后端自动调用 Sub2API Admin API 直接充值余额
7. 用户页面自动显示“余额已自动充值到账”

## 启动方式

### 后端

```bash
cd backend
cp .env.example .env
npm install
node src/app.js
```

### 前端

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

## 页面入口

### 用户充值页

```text
http://localhost:3000/?user_id=1&token=demo_token_preview&ui_mode=embedded
```

### 后台排障页

```text
http://localhost:3000/admin
```

## 关键配置

后端 `.env`：

```env
PORT=3001
PUBLIC_BASE_URL=http://43.156.141.204:3001
EPAY_BASE_URL=https://pay.521cd.cn/xpay/epay
EPAY_PID=10579
EPAY_KEY=your_epay_key
SUB2API_BASE_URL=http://43.156.141.204:8080
SUB2API_ADMIN_JWT=your_admin_jwt
VALID_DEMO_TOKEN=demo_token_preview
ADMIN_PASSWORD=change_me
```

## 当前实现说明

### 已完成

- 易支付下单
- 支付成功异步回调
- 订单持久化到本地 JSON 文件
- 自动调用 Sub2API `create-and-redeem`
- 支付成功后余额自动到账
- 用户页显示自动充值结果
- 后台页查看订单和异常状态

### 已验证

- 创建订单成功
- 标准易支付回调验签成功
- 10 元订单自动为用户余额充值 10 元

## Debian 常驻运行

创建服务文件：`/etc/systemd/system/payment-system-backend.service`

```ini
[Unit]
Description=Payment System Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/payment-system-mvp/backend
ExecStart=/usr/bin/node /root/payment-system-mvp/backend/src/app.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
systemctl daemon-reload
systemctl enable payment-system-backend
systemctl start payment-system-backend
systemctl status payment-system-backend
```
