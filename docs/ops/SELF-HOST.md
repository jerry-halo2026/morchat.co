---
purpose: 用 Docker 在本机/自建服务器跑起 morechat.co，并让桌面客户端连上它
owner: lead
status: current
updated: 2026-11-16
related:
  - docs/ops/RELEASE.md
  - SELF_HOSTING.md
  - docker-compose.selfhost.yml
---

# 本地 Docker 部署与客户端接入

## 0. 一条命令（推荐）

```bash
node scripts/selfhost-local.mjs up      # 或 make selfhost-local
```

它会：生成 `.env.selfhost`（随机密钥、开发模式、固定验证码 `123456`）→ 自动挑没被占用的
端口（默认 `8081`/`3100`，开发环境占了 8080 也不会撞）→ **按本机局域网地址**把服务发布到
`0.0.0.0` → 构建并启动 → 等 `/health` → 把本机的 `~/.multica/desktop.json` 指向这套栈。

```
web        http://192.168.x.x:3100     ← 同事直接开这个
api        http://192.168.x.x:8081
desktop    C:\Users\<you>\.multica\desktop.json
login      任意邮箱 + 验证码 123456
```

- **只给自己用**：`node scripts/selfhost-local.mjs up --localhost`，端口只绑 `127.0.0.1`。
- **指定地址**（多网卡时）：`node scripts/selfhost-local.mjs up --lan-ip=192.168.10.170`。
- 换网络后重跑一次 `up` 即可：脚本会重算局域网地址并同步 `.env.selfhost` 与 `desktop.json`。

`make selfhost-local-status` 看状态（会显示当前绑定与登录码），
`make selfhost-local-stop` 停止（保留数据）。数据库密码与 `.env.selfhost` 不一致时
（旧卷沿用旧密码），脚本会自动 `ALTER ROLE` 修正。

**防火墙**：Windows 的「专用网络」配置文件关闭时局域网可直接访问；若开着而同事连不上，
放行两个端口：`netsh advfirewall firewall add rule name="morechat" dir=in action=allow
protocol=TCP localport=3100,8081`（需要管理员）。

下面是手动方式，想自己控制每一步时用。

两种起法，二选一：

| 场景 | 命令 | 用的镜像 |
|---|---|---|
本机验证/改代码 | `make selfhost-build` | 从当前 checkout 构建 `morechat-backend:dev` / `morechat-web:dev` |
服务器（镜像已发布） | `make selfhost` | 拉 `ghcr.io/jerry-halo2026/morechat-backend|morechat-web` |

## 1. 首次启动

```bash
cp .env.example .env          # 只在没有 .env 时
# 必须填：JWT_SECRET、POSTGRES_PASSWORD、MULTICA_VCS_SECRET_KEY
# 生成：openssl rand -hex 32 / openssl rand -hex 24 / openssl rand -base64 32
make selfhost-build           # 构建并启动（会自动跑迁移）
```

默认端口：后端 `8080`（容器内 8080）、前端 `3000`。改了 `PORT` / `FRONTEND_PORT`
之后，`FRONTEND_ORIGIN` 和 `MULTICA_APP_URL` 要一起改成对应的前端地址。

**端口冲突**：本机如果已经跑着开发环境（`make up` 会占 8080），自托管栈要换端口，
例如 `PORT=8081`、`FRONTEND_PORT=3100`，并把 `FRONTEND_ORIGIN`、`MULTICA_APP_URL`
同步改掉。

**还没有发布过镜像时**：`make selfhost` 会去 GHCR 拉 `morechat-backend|web`，仓库里没有
对应 tag 时会报 `denied`。此时只能用 `make selfhost-build`（本机构建）。

**本地免邮件登录**：默认 `APP_ENV=production` 会忽略开发验证码。本机自测时在 `.env` 里设
`APP_ENV=development` 与 `MULTICA_DEV_VERIFICATION_CODE=123456`，然后
`POST /auth/verify-code {"email":"you@local.test","code":"123456"}` 即可拿到 token；
发信接口在根路径（`/auth/send-code`），不带 `/api` 前缀。


**数据库迁移由容器入口自动执行**（`docker/entrypoint.sh`：先 `migrate up`，再起 server），
不需要手动跑迁移。

验证：

```bash
curl http://localhost:8080/health        # {"status":"ok",...}
curl -I http://localhost:3000            # 200
```

## 1b. 用 Supabase 账号登录（可选）

两行 env 即可启用（`docker-compose.selfhost.yml` 已把它们传进容器）：

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

启用后登录页的**密码模式**：浏览器直接把邮箱/密码发到 Supabase 换 access token，
后端再用该 token 调项目 `/auth/v1/user` 验证，然后签发**本地 JWT 会话**（不存
密码、不存 refresh token、不可滑动续期）。停用就清空这两项并重启后端。

注意事项：

- 用户必须**已存在于该 Supabase 项目且邮箱已确认**，否则验证失败。
- 项目地址在 `server/internal/supabaseauth/verifier.go` 里是固定值（当前
  `qcpgqehqjescuwqhnmie`），换项目需要改代码，不是纯配置。
- 本地身份映射表 `external_auth_identity`（迁移 656）按 `(project, subject)` 绑定，
  首次登录会创建本地用户；不会按邮箱合并已有账号。
- 想回到纯邮箱验证码：清空两项 env 即可，验证码流程不受影响。

## 2. 桌面客户端填地址（关键）
生产构建的客户端**不读环境变量**，它读一个 JSON 文件：

| 系统 | 路径 |
|---|---|
Windows | `%USERPROFILE%\.multica\desktop.json` |
macOS / Linux | `~/.multica/desktop.json` |

内容（本机自托管示例）：

```json
{
  "schemaVersion": 1,
  "apiUrl": "http://localhost:8080",
  "wsUrl": "ws://localhost:8080/ws",
  "appUrl": "http://localhost:3000"
}
```

- 三个字段都必填，`schemaVersion` 固定 `1`。
- `apiUrl` 是后端，`wsUrl` 是后端 WebSocket（同主机 + `/ws`），`appUrl` 是前端。
- 写好后**完全退出并重启**客户端（托盘退出，不是关窗口）。
- 文件存在但格式不对时，客户端会报 `Invalid <path>: …`；删掉文件即回到默认云端配置。
- 默认云端配置指向 `https://api.morechat.co` / `wss://api.morechat.co/ws` / `https://morechat.co`，
  这三个域名部署之前，**不写这个文件就无法登录**。

> 开发模式（`pnpm --filter @morechat/desktop dev`）走 `VITE_API_URL` / `VITE_WS_URL` /
> `VITE_APP_URL`，不读 `desktop.json`。

## 3. CLI 接入同一套环境

```bash
morechat setup self-host --server-url http://localhost:8080 --app-url http://localhost:3000
morechat login
```

不传 `--server-url`/`--app-url` 时按 `--port`（默认 8080）与 `--frontend-port`（默认 3000）
拼 localhost 地址。配置写入 `~/.multica/`，`morechat setup self-host --help` 可看完整参数。

## 4. 跨机访问 / 对外提供服务

本机 compose 只绑定 `127.0.0.1`。要给同事或公网用，需要：

1. 反代（Caddy 两行即可）：

```caddyfile
app.example.com {
    reverse_proxy 127.0.0.1:3000
}
api.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

2. `.env` 里把 `FRONTEND_ORIGIN`、`MULTICA_APP_URL` 改成 `https://app.example.com`，
   `MULTICA_PUBLIC_URL` 改成 `https://api.example.com`，然后 `docker compose up -d` 重启。
3. 客户端 `desktop.json` 用 `https://api.example.com` / `wss://api.example.com/ws` /
   `https://app.example.com`。

## 5. 备份与升级

```bash
# 备份数据库（卷是 pgdata）
docker compose -f docker-compose.selfhost.yml exec postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql

# 升级到新版本
docker compose -f docker-compose.selfhost.yml pull
docker compose -f docker-compose.selfhost.yml up -d
```

停止（保留数据）：`make selfhost-stop`。删除数据：`docker compose -f docker-compose.selfhost.yml down -v`。

## 6. 已知限制

- 本机 compose 不提供 TLS，只用于本地/内网；对外必须加反代。
- `MULTICA_*` 环境变量名与 `~/.multica` 目录名沿用上游，暂未改名（可见品牌已改）。
- 首次登录需要先注册账号；未配置邮件（SMTP）时邀请邮件不会真的发出。
