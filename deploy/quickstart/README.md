# morechat.co — 一键部署包（Quickstart）

`deploy/quickstart/` 是给「云端 / 单机服务器」准备的一键部署包：一条命令把
**PostgreSQL + API + Web** 拉起来，密钥在安装时自动生成，不需要你手工拼配置。

只新增本目录，不改仓库里任何现有的 compose / Dockerfile / 代码。

| 文件 | 作用 |
| --- | --- |
| `docker-compose.yml` | `postgres` + `api`（本地构建 `Dockerfile`）+ `web`（`Dockerfile.web`）+ `caddy`（compose profile `tls`，默认不启动） |
| `.env.example` | 必填项 + 可选项清单，只有占位值，没有任何真实密钥（含 `DOMAIN` / `ACME_EMAIL`） |
| `install.sh` | Linux / macOS / WSL / Git-Bash 一键安装 |
| `install.ps1` | Windows PowerShell 5.1+ 一键安装 |
| `Caddyfile.example` | Caddy 模板：单域名同源 + `/api/*` 直连 API + `/ws` 直通（带 `X-Forwarded-*`、zstd/gzip） |
| `.gitignore` | 挡住 `Caddyfile`（每台机器一份）与 `.env`（真实密钥） |

---

## 形态一：单机 docker compose（最快）

适合：自己一台 VPS / 内网机器，先跑起来再说。

```bash
cd deploy/quickstart
bash install.sh            # Windows: .\install.ps1
```

它做这几件事（可重复执行，已有的密钥不会被覆盖）：

1. 检查 `docker` 与 `docker compose`（v2）是否可用；
2. 没有 `.env` 就从 `.env.example` 复制，并生成 / 回填：
   - `POSTGRES_PASSWORD` ← `openssl rand -hex 16`
   - `DATABASE_URL` ← 按 `POSTGRES_*` 拼好（密码对不上会自动纠正）
   - `JWT_SECRET` ← `openssl rand -hex 32`
   - `MULTICA_VCS_SECRET_KEY` ← `openssl rand -base64 32`
     （**必须 base64**，见下方「注意事项」）
3. `docker compose pull postgres` + `docker compose build`（api / web 本地构建）+ `up -d`；
4. 轮询 healthcheck 直到 `postgres` → `api` → `web` 全部 healthy；
5. 打印访问地址与下一步。

默认只监听本机：

| 地址 | 说明 |
| --- | --- |
| `http://localhost:3000` | Web（`.env` 的 `WEB_PORT`，默认 3000） |
| `http://localhost:8080` | API（`.env` 的 `PORT`，默认 8080）；`/health`、`/readyz` |

其它命令：

```bash
bash install.sh status     # docker compose ps
bash install.sh down       # 停止，卷保留
```

**端口为什么只绑 127.0.0.1**：Docker 的端口映射会绕过宿主机防火墙
（ufw / iptables），改成 `0.0.0.0` 等于把一个没有 TLS 的 API 直接摊在公网上。
要对外提供服务，走形态二。

**从别的机器访问（同网段测试）**：把 `FRONTEND_ORIGIN` / `MULTICA_APP_URL`
改成 `http://<这台机器的IP>:3000`，并让 `PORT` / `WEB_PORT` 对外可达；
更稳的做法仍然是形态二（反代会同时处理 TLS 和 WebSocket）。

---

## 形态二：Caddy 反代 + 域名 + HTTPS（对外提供服务）

推荐单域名同源布局：Cookie 只作用在同一个 host 上，不会有跨子域的 CSRF /
Cookie 域问题。

Caddy 在 compose 里挂在 **profile `tls`** 下：不进默认 `up -d`，打开 profile 或者
显式点名 `caddy` 才启动。这样「只在本机试跑」和「对外开 TLS」共用同一个
compose 文件，不需要改任何一行 YAML。

### 启用 TLS 三步

**第 1 步：生成 Caddyfile**

```bash
cd deploy/quickstart
cp Caddyfile.example Caddyfile      # Windows: Copy-Item Caddyfile.example Caddyfile
```

`Caddyfile` 已进 `.gitignore`（每台机器一份）。compose 里是 bind mount
`./Caddyfile:/etc/caddy/Caddyfile:ro`，文件不存在时 Docker 会建一个同名
**目录**，Caddy 随后报 `is a directory` —— 所以这一步不能跳。

**第 2 步：改 `.env`**

```ini
# 有公网域名（DNS A/AAAA 已指向本机、80/443 放通）：
DOMAIN=app.example.com
ACME_EMAIL=you@example.com          # 证书到期通知，会注册 ACME 账户
TLS_SNIPPET=tls_acme                # 用 Let's Encrypt 公信证书
FRONTEND_ORIGIN=https://app.example.com
MULTICA_APP_URL=https://app.example.com

# 只想本地/内网自测（不需要域名、不需要公网）：
# DOMAIN=localhost
# TLS_SNIPPET=tls_local             # 默认值，Caddy 内部 CA 自签

# 两种情形都要打开这一行，caddy 才会跟 `up -d` 一起起来：
COMPOSE_PROFILES=tls
```

**第 3 步：起服务**

```bash
docker compose up -d                # COMPOSE_PROFILES=tls 已打开
# 或者只起 caddy（profile 没打开时也能单独点名）
docker compose up -d caddy
docker compose ps                   # 期望 postgres / api / web / caddy 全部 (healthy)
```

`docker compose logs -f caddy` 能看到证书签发过程（`certificate obtained
successfully` 或内部 CA 的 `serving initial configuration`）。

Caddy 做的事（见 `Caddyfile.example`）：

| 路径 | 上游 | 说明 |
| --- | --- | --- |
| `/ws`、`/ws/*` | `api:<PORT>` | `flush_interval -1`，否则 WebSocket 帧被攒住 → 评论延迟 / 刷新才出现 |
| `/api/*` | `api:<PORT>` | API 的真实路由就是 `/api/...`（前缀不剥），与 Next rewrites 语义一致，少一跳 |
| 其余 | `web:3000` | 页面、RSC、静态资源 |

两条链路都带 `X-Forwarded-Proto` / `X-Forwarded-Host` / `X-Real-IP`，响应按
`Accept-Encoding` 协商 zstd / gzip。

### 本地实测记录（无公网域名，`DOMAIN=localhost` + 内部 CA）

跑在 Windows + Docker Desktop 上，`-p qs-tls` 起了一套独立栈（`PORT=18080`、
`WEB_PORT=13000`，避开宿主机已占用的 3000/8080）：

```bash
# 临时 env：只用于本次验证，不进仓库
docker compose -p qs-tls -f deploy/quickstart/docker-compose.yml \
  --env-file "$TEMP/qs-tls.env" config -q          # → exit 0
docker compose -p qs-tls -f deploy/quickstart/docker-compose.yml \
  --env-file "$TEMP/qs-tls.env" up -d --build
docker compose -p qs-tls -f deploy/quickstart/docker-compose.yml \
  --env-file "$TEMP/qs-tls.env" ps
curl -k -sS -o /dev/null -w '%{http_code}\n' https://localhost/
curl -k -sS https://localhost/api/config
```

<!-- TLS-VERIFY-START -->
#### 实测输出（2026-11-10，Windows 11 + Docker Desktop 29.9.3）

```
$ docker compose -p qs-tls -f deploy/quickstart/docker-compose.yml --env-file qs-tls.env config -q
exit=0

$ docker compose -p qs-tls ... ps
NAME                STATUS
qs-tls-api-1        Up 25 seconds (healthy)
qs-tls-caddy-1      Up 13 seconds (healthy)
qs-tls-postgres-1   Up 31 seconds (healthy)
qs-tls-web-1        Up 20 seconds (healthy)

$ curl -k -sS -o /dev/null -w 'HTTP %{http_code}\n' https://localhost/
HTTP 200        # 0.149s，Caddy 内部 CA 证书，-k 跳过信任校验

$ curl -k -sS https://localhost/api/config
HTTP 200
{"cdn_domain":"","allow_signup":true,"daemon_server_url":"https://localhost",
 "daemon_app_url":"https://localhost","daemon_setup_target":"self_host",
 ... "feature_flags":{"agents_agent_builder":true,...}}

$ curl -k -sSI https://localhost/            # 首页走 web:3000
Via: 1.1 Caddy
X-Powered-By: Next.js

$ curl -k -sSI https://localhost/api/config  # 走 api:<PORT>，没有 X-Powered-By
HTTP/1.1 405 Method Not Allowed              # 该路由只允许 GET，证明请求打到了 Go API
Allow: GET
Content-Security-Policy: default-src 'self'; ...   # API 中间件加的 CSP
Via: 1.1 Caddy

$ curl -k -o /dev/null -w '%{http_code}' https://localhost/ws
400            # 无 Upgrade 头，由 API 的 WebSocket 处理器拒绝 ⇒ /ws 确实直连 api

$ curl -k -H 'Accept-Encoding: gzip' -D - https://localhost/
Content-Encoding: gzip                       # encode zstd gzip 生效
```

结论：**TLS 链路真的通了** —— `DOMAIN=localhost` + `tls_local`（Caddy 内部 CA）
下，`https://localhost/` 返回 200（页面来自 `web:3000`），`/api/config` 与 `/ws`
命中 `api:<PORT>`（响应头里没有 Next 的 `X-Powered-By`，说明没有被 web 转一手）。
`docker compose exec caddy wget -qO- http://127.0.0.1:2019/config/` 里能看到
`"issuers":[{"module":"internal"}]`、`X-Forwarded-*`、`flush_interval:-1` 全在。

验证用的栈是个一次性项目（`-p qs-tls`，假密钥，`PORT=18080` / `WEB_PORT=13000`），
验完即 `docker compose -p qs-tls down -v` 删掉，不留在机器上。
<!-- TLS-VERIFY-END -->

### 信任内部 CA（可选，`TLS_SNIPPET=tls_local` 时）

浏览器不认自签证书，点「继续访问」即可；要让系统真的信任：

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
# macOS:  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-root.crt
# Linux:  sudo cp caddy-root.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
# Windows（管理员 PowerShell）:
#   Import-Certificate -FilePath .\caddy-root.crt -CertStoreLocation Cert:\LocalMachine\Root
```

删掉 `caddy_data` 卷等于换一套内部 CA：已经导入的根证书全部失效，要重新导。

不用 Caddy 也可以：nginx 把 `/` 转 `127.0.0.1:3000`、`/api` 与 `/ws` 转
`127.0.0.1:8080`（`/ws` 带 `Upgrade` / `Connection` 头），仓库根目录
`SELF_HOSTING_ADVANCED.md → Nginx` 有完整片段。

> 换域名/换端口后必须同步改 `FRONTEND_ORIGIN`，否则浏览器 WebSocket 升级会被
> 判为非法 Origin 直接 403（默认只允许 `localhost`）。

---

## 形态三：用 Supabase 托管库与身份

两种用法可以只取其一：

**A. 只用 Supabase 的 Postgres**

1. 把 `DATABASE_URL` 改成 Supabase 连接串，**保留 `?sslmode=require`**
   （例：`postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`）；
2. 数据库角色需要能建扩展：`pgcrypto`、`pg_trgm` 是迁移的硬依赖；
3. 删掉 compose 里的 `postgres` 服务和 `api.depends_on.postgres`，
   （`pgdata` 卷不再使用）。

**B. 只用 Supabase 的 Auth（身份）**

在 `.env` 里填这两项后重启 api：

```ini
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

两项都填才会启用；后端通过 `/auth/supabase/config` 把配置暴露给前端，
前端出现 Supabase 登录入口。留空则走「邮箱 + 验证码」。

> 注意：Supabase Auth 只负责「证明你是谁」，账号仍会在本地库
> `external_auth_identity` 里建档（project + subject）。`JWT_SECRET` 依旧必填，
> 它签的是本地会话 token。

---

## 首次登录

1. 打开 `FRONTEND_ORIGIN` 指向的地址（默认 `http://localhost:3000`）；
2. 输入邮箱 → 收验证码 → 登录（没有验证码注册流程，第一个登录的人就是
   实例的第一个用户）。

**没配邮件怎么拿验证码**：验证码会打到 API 容器日志里。

```bash
docker compose -f docker-compose.yml logs -f api | grep "Verification code"
# 日志形如：[DEV] Verification code for you@example.com: 123456
```

Windows PowerShell：

```powershell
docker compose -f docker-compose.yml logs -f api | Select-String "Verification code"
```

要真正发信，在 `.env` 填 `RESEND_API_KEY`（+ `RESEND_FROM_EMAIL`）或
`SMTP_*`，然后 `docker compose up -d --force-recreate api`。`SMTP_HOST` 一旦
设置就优先于 Resend。

> 不要在生产实例上设 `MULTICA_DEV_VERIFICATION_CODE`：那等于给所有人一个固定
> 验证码。而且 `APP_ENV=production` 时它本来也会被忽略。

---

## 备份

数据分两处：`pgdata` 卷（数据库）和 `api_uploads` 卷（未配 S3 时的附件）。
**只备份数据库是不够的**，附件也要一起备。

```bash
# 1) 数据库（自定义格式，恢复用 pg_restore）
docker compose -f docker-compose.yml exec -T postgres \
  pg_dump -U "$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)" \
          -d "$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)" \
          -Fc > "backup-$(date +%Y%m%d-%H%M).dump"

# 2) 附件卷
docker run --rm -v morechat-quickstart_api_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%Y%m%d).tgz -C /data .
```

恢复（**在空库上做**，别往有数据的库里灌）：

```bash
docker compose -f docker-compose.yml exec -T postgres \
  pg_restore -U multica -d multica --clean --if-exists < backup-YYYYMMDD-HHMM.dump
```

备份 `.env` 也要单独存一份到安全的地方（`JWT_SECRET` 丢了 = 所有会话失效；
`MULTICA_VCS_SECRET_KEY` 丢了 = 已存的 VCS token 解不开）。

## 升级

```bash
git pull                                   # 或切到目标 tag
cd deploy/quickstart
docker compose pull postgres
docker compose build                       # api / web 是本地构建
docker compose up -d                       # 迁移在 api 启动时自动跑
docker compose logs -f api | grep -E "migrate|migration"
```

- 迁移是 `api` 容器的 entrypoint 跑的（`./migrate up` 成功后才 `exec ./server`），
  多副本并发也安全（内部有 Postgres advisory lock）。
- 大表上的 `CREATE INDEX CONCURRENTLY` 可能跑几分钟，healthcheck 的
  `start_period` 已给到 120s / 30 次重试；不够就临时调大。
- 升级前先按上一节备份。

## 迁移回滚（`migrate down`）的风险

**先备份，再考虑回滚。**`down` 只回滚一个版本，且：

- 它是破坏性的：`down` 会执行 `DROP`/删除列/删表，回滚后数据不回来；
- 部分迁移的 `down` 会**主动拒绝执行**而不是静默删数据 —— 例如
  `430_channel_outbound_message_binding_index` 在 `/new` 已经建过频道 Chat 时
  直接报错，`407…414`（source context）在有抓取数据时也会拒绝回滚；
- `down` 里也有 `CREATE INDEX CONCURRENTLY`，被打断会留下 INVALID 索引；
  runner 有清理钩子，但**重建大 GIN 索引不是瞬时操作**；
- 回滚到旧版本后，旧版本代码未必认得新 schema 的数据（迁移是可前向的，
  回滚通常意味着「旧代码 + 旧 schema」，两者必须一起回退）。

执行方式（在 api 容器里）：

```bash
docker compose -f docker-compose.yml exec api ./migrate down   # 回滚一个版本
# 预演：先看会动什么
docker compose -f docker-compose.yml exec api ./migrate up     # 幂等，可安全重跑
```

真正出事时更安全的路径是：**恢复备份**（上面 `pg_restore`）+ 把镜像/tag 退回
上一版，而不是在生产库上跑 `down`。

---

## 不要做什么

- **不要 `docker compose down -v`**：`-v` 会删掉 `pgdata` 和 `api_uploads`
  两个命名卷，等于把数据库和附件全删了，且不可恢复。要停就用
  `bash install.sh down`（内部是 `docker compose down`，不带 `-v`）。
- **不要把 `.env` 提交到 git**：里面有 `JWT_SECRET`、数据库密码、
  `MULTICA_VCS_SECRET_KEY`。仓库根 `.gitignore` 已忽略 `.env`，
  但请自己确认 `git status` 是干净的。
- **不要在公网上直接暴露 8080 / 3000 / 5432**：本包的端口只绑 `127.0.0.1`，
  别改成 `0.0.0.0`，对外统一走形态二的反代。
- **不要把 `JWT_SECRET` 换成示例值或短字符串**：`APP_ENV=production` 时
  API 会拒绝启动（占位值是黑名单里的）；即使能启动，弱密钥等于会话可伪造。
  换 `JWT_SECRET` 会让所有人重新登录。
- **不要给 `MULTICA_VCS_SECRET_KEY` 用 hex**：它是 `secretbox.LoadKey`，
  只接受 **base64 编码的 32 字节**（`openssl rand -base64 32`）。用
  `-hex 32` 得到 64 个字符，base64 解出来 48 字节，会被判非法、VCS 集成静默关闭。
- **不要在生产上设 `MULTICA_DEV_VERIFICATION_CODE`**（固定验证码 = 任意邮箱可登录）。
- **不要改 `POSTGRES_PASSWORD` 却不同步 `DATABASE_URL`**：两者必须一致。
  重跑 `install.sh` 会自动纠正，手工改时记得两处一起改。

---

## 环境变量速查

必填（`docker-compose.yml` 用 `${VAR:?err}` 引用，缺失直接启动失败）：

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | API / `migrate` 用的 Postgres 连接串 |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | postgres 容器初始化 + `DATABASE_URL` 的来源 |
| `PORT` | API 端口（容器内监听 + 宿主机发布，默认 8080） |
| `APP_ENV` | `production` 会开启配置安全检查 |
| `JWT_SECRET` | 会话 / daemon token / 附件签名密钥（`openssl rand -hex 32`） |
| `MULTICA_VCS_SECRET_KEY` | VCS token 静态加密（`openssl rand -base64 32`） |
| `FRONTEND_ORIGIN` | 前端源，CORS + WebSocket Origin 校验都认它 |
| `MULTICA_APP_URL` | 对外应用 URL（邮件链接、daemon 安装命令） |

可选（留空即关闭对应功能）：`WEB_PORT`、`CORS_ALLOWED_ORIGINS`、
`RESEND_API_KEY` / `RESEND_FROM_EMAIL`、`SMTP_HOST` / `SMTP_PORT` /
`SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM_EMAIL` / `SMTP_TLS`、
`S3_BUCKET` / `S3_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
`AWS_ENDPOINT_URL` / `S3_USE_PATH_STYLE`、`SUPABASE_URL` /
`SUPABASE_PUBLISHABLE_KEY`。

Caddy / TLS 专用（只影响 `caddy` 服务，见上「形态二」）：

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `COMPOSE_PROFILES` | 空 | 填 `tls` 才让 `up -d` 带上 caddy；注释掉即关闭 |
| `DOMAIN` | `localhost` | 站点地址。公网域名 → ACME；`localhost` → 内部 CA 自签 |
| `ACME_EMAIL` | 空 | ACME 账户邮箱（`TLS_SNIPPET=tls_acme` 时使用） |
| `TLS_SNIPPET` | `tls_local` | `tls_local`（自签）或 `tls_acme`（Let's Encrypt） |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` | 宿主机侧端口，80/443 被占用时改这里 |

每个键在代码里的读取点：`server/cmd/server/main.go`（`PORT`、`APP_ENV`、
`JWT_SECRET`、`DATABASE_URL`、`RESEND_*`、`SMTP_HOST`、`DO_NOT_TRACK`）、
`server/internal/service/email.go`（其余 `SMTP_*`）、
`server/internal/storage/s3.go`（`S3_*` / `AWS_*`）、
`server/internal/supabaseauth/verifier.go`（`SUPABASE_*`）、
`server/cmd/server/router.go` + `server/internal/realtime/hub.go`
（`FRONTEND_ORIGIN`、`CORS_ALLOWED_ORIGINS`、`MULTICA_APP_URL`、
`MULTICA_VCS_SECRET_KEY`）、`server/cmd/migrate/main.go`（`DATABASE_URL`）。

## 自检

```bash
# Compose 文件 + 变量是否自洽（不启动任何东西）
docker compose -f docker-compose.yml --env-file .env.example config -q

# 连 caddy 那一段一起校验（profile 不打开时 caddy 不在默认渲染结果里）
docker compose -f docker-compose.yml --env-file .env.example --profile tls config -q

# 脚本语法
bash -n install.sh

# PowerShell
powershell -NoProfile -c "[System.Management.Automation.Language.Parser]::ParseFile('install.ps1',[ref]$null,[ref]$null)"
```
