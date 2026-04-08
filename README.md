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
ALLOW_DEMO_TOKEN=false
ADMIN_PASSWORD=change_me_to_a_strong_password
ADMIN_SESSION_TTL_MINUTES=120
ADMIN_MAX_FAILED_ATTEMPTS=5
ADMIN_LOCK_MINUTES=15
```

## 安全建议

- 生产环境将 `ALLOW_DEMO_TOKEN=false`
- 使用强密码替换后台密码
- 不要把 `SUB2API_ADMIN_JWT` 暴露给前端
- 定期轮换易支付密钥和后台密码
- 后续建议上 HTTPS 和域名
