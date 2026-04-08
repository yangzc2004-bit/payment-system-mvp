# payment-system 部署与维护文档

本文档记录当前线上部署结构、更新方式、常用排障命令和日常维护要点。

## 1. 当前线上结构

### 域名

- Sub2API：`https://api.yzccc.cloud`
- 支付系统：`https://pay.yzccc.cloud`
- 支付系统后台：`https://pay.yzccc.cloud/admin`

### 服务器

- 主机公网 IP：`43.156.141.204`

### 端口分工

- 支付系统后端实际监听：`3001`
- Sub2API 容器实际监听：`8080`
- Nginx 对外监听：`80/443`

### 反向代理关系

- `api.yzccc.cloud` -> `172.17.0.1:8080`
- `pay.yzccc.cloud` -> `172.17.0.1:3001`

### 代码目录

- 支付系统项目目录：`/root/payment-system-mvp`
- 支付系统后端目录：`/root/payment-system-mvp/backend`
- 支付系统前端目录：`/root/payment-system-mvp/frontend`
- Nginx 配置文件：`/opt/yzc-api/docker/nginx/nginx.conf`
- Nginx 证书目录：`/opt/yzc-api/docker/nginx/ssl`

## 2. 支付系统关键配置

支付系统后端 `.env` 路径：

- `/root/payment-system-mvp/backend/.env`

关键变量：

```env
PORT=3001
PUBLIC_BASE_URL=https://pay.yzccc.cloud
EPAY_BASE_URL=https://pay.521cd.cn/xpay/epay
EPAY_PID=10579
EPAY_KEY=你的易支付密钥
SUB2API_BASE_URL=https://api.yzccc.cloud
SUB2API_ADMIN_JWT=你的Sub2API管理员JWT
ALLOW_DEMO_TOKEN=false
ADMIN_PASSWORD=你的后台密码
ADMIN_SESSION_TTL_MINUTES=120
ADMIN_MAX_FAILED_ATTEMPTS=5
ADMIN_LOCK_MINUTES=15
```

说明：

- `PUBLIC_BASE_URL` 必须指向支付系统公网域名，否则支付回调地址会生成错误。
- `SUB2API_BASE_URL` 必须指向 Sub2API 公网域名。
- `SUB2API_ADMIN_JWT` 必须是一整行完整 JWT，不能换行。
- `ALLOW_DEMO_TOKEN=false` 表示生产环境禁用 demo token。

## 3. 日常更新流程

### 拉取最新代码

```bash
cd /root/payment-system-mvp
git pull
```

### 重建前端

```bash
cd /root/payment-system-mvp/frontend
npm install
npm run build
```

### 重启支付系统后端

```bash
systemctl restart payment-system-backend
systemctl status payment-system-backend
```

### 如果改了 Nginx

```bash
docker restart yzc-api-nginx
```

## 4. 常用运维命令

### 支付系统后端

查看服务状态：

```bash
systemctl status payment-system-backend
```

查看近期日志：

```bash
journalctl -u payment-system-backend -n 100 --no-pager
```

查看是否监听 3001：

```bash
ss -ltnp | grep 3001
```

本机健康检查：

```bash
curl -i http://127.0.0.1:3001/health
```

### Nginx 容器

查看容器状态：

```bash
docker ps | grep yzc-api-nginx
```

查看日志：

```bash
docker logs yzc-api-nginx --tail 100
```

### Sub2API

查看用户资料：

```bash
curl -s https://api.yzccc.cloud/api/v1/user/profile \
  -H "Authorization: Bearer 你的JWT"
```

查看兑换/充值记录：

```bash
curl -s https://api.yzccc.cloud/api/v1/admin/redeem-codes \
  -H "Authorization: Bearer 你的JWT"
```

## 5. 订单与补单

### 自动到账正常路径

1. 用户创建订单
2. 跳到易支付页面
3. 支付平台异步回调
4. 支付系统验签
5. 调用 Sub2API `create-and-redeem`
6. 余额自动到账

### 漏回调时的兜底

如果用户已支付，但订单还停在 `paying`：

1. 打开后台：`https://pay.yzccc.cloud/admin`
2. 登录后台
3. 找到状态为 `paying` 的订单
4. 打开订单详情
5. 点击 `补单并自动充值`

## 6. 常见问题排查

### 问题：支付成功但没到账

先查后台订单状态：

- 如果是 `code_issued`：说明已经自动充值成功
- 如果是 `paying`：说明平台回调没到，使用补单按钮
- 如果是 `issue_failed`：说明支付成功但自动充值失败，需要看订单详情中的错误信息

### 问题：访问 token 校验失败

先确认：

- 是否从 Sub2API 用户侧真实入口进入
- `ALLOW_DEMO_TOKEN` 是否为 `false`
- `SUB2API_BASE_URL` 是否正确
- `Sub2API` 用户 JWT 是否有效

### 问题：后台登录失败

先确认：

- 后台地址是否为 `https://pay.yzccc.cloud/admin`
- `.env` 中 `ADMIN_PASSWORD` 是否已修改
- 浏览器本地存储里旧 token 是否已清理

### 问题：Nginx 返回 502

先查：

```bash
docker logs yzc-api-nginx --tail 100
curl -i http://127.0.0.1:3001/health
curl -i http://172.17.0.1:8080/health
```

## 7. 证书与 HTTPS

证书通过 `certbot` 申请。

证书目录：

- `/etc/letsencrypt/live/api.yzccc.cloud/`

复制到 Nginx 挂载目录：

- `/opt/yzc-api/docker/nginx/ssl/api.yzccc.cloud/`
- `/opt/yzc-api/docker/nginx/ssl/pay.yzccc.cloud/`

如果证书更新，记得重新复制并重启 `yzc-api-nginx`。

## 8. 安全维护建议

- 定期更换 `ADMIN_PASSWORD`
- 定期更新 `SUB2API_ADMIN_JWT`
- 定期更换 `EPAY_KEY`
- 不要把 `.env` 文件传到公开仓库
- 生产环境保持 `ALLOW_DEMO_TOKEN=false`
- 后续可以继续加：
  - 查单补偿
  - 后台 IP 限制
  - 更强密码策略
  - 自动备份订单文件
