---
purpose: morechat.co 发版与部署方案：tag 触发、产物清单、云端一键部署步骤
owner: lead
status: current
updated: 2026-11-16
related:
  - docs/ops/SELF-HOST.md
  - .github/workflows/release.yml
  - .goreleaser.yml
---

# 发版与部署方案

## 1. 发版：推一个 tag 就够了

```bash
git tag -a v0.9.0-morechat.2 -m "…"
git push origin v0.9.0-morechat.2      # 推 tag 即触发 .github/workflows/release.yml
```

tag 规则：`vX.Y.Z` 或 `vX.Y.Z-suffix`（严格 semver 校验，`-dirty` 拒绝）。
稳定版（无 suffix）会额外打 `latest` 镜像标签。

一次 release 产出：

| 产物 | 位置 |
|---|---|
后端镜像 | `ghcr.io/jerry-halo2026/morechat-backend`（多架构，`latest` 仅稳定版） |
前端镜像 | `ghcr.io/jerry-halo2026/morechat-web` |
桌面安装包 | 本仓 GitHub Release（Windows/macOS/Linux，`morechat-desktop-<version>-<platform>-<arch>`） |
CLI | goreleaser 产物 + brew（`brew install jerry-halo2026/tap/morechat`） |

桌面客户端自动更新读的就是本仓 release（`electron-builder.yml` 的 `publish.owner/repo`
已改到 `jerry-halo2026/morchat.co`），所以**版本号必须递增**，否则更新不会触发。

## 2. 云端服务器准备好之后的一键部署

服务器上只需要两样东西：`docker-compose.selfhost.yml` + `.env`。

```bash
# 1) 拉文件（也可以直接 scp 过去）
git clone https://github.com/jerry-halo2026/morchat.co.git && cd morchat.co

# 2) 生成配置
cp .env.example .env
# 填：JWT_SECRET、POSTGRES_PASSWORD、MULTICA_VCS_SECRET_KEY，
#     FRONTEND_ORIGIN=https://app.example.com、MULTICA_APP_URL=https://app.example.com、
#     MULTICA_PUBLIC_URL=https://api.example.com

# 3) 一条命令起服务（迁移由容器入口自动执行）
MULTICA_IMAGE_TAG=v0.9.0-morechat.2 docker compose -f docker-compose.selfhost.yml up -d
```

升级：改 `MULTICA_IMAGE_TAG` 再 `up -d`（或 `docker compose pull && up -d`）。

反向代理（Caddy，自动 HTTPS）：

```caddyfile
app.example.com { reverse_proxy 127.0.0.1:3000 }
api.example.com { reverse_proxy 127.0.0.1:8080 }
```

## 3. 域名接上之后，客户端就"开箱即用"

桌面生产构建的默认运行时配置是：

```json
{"schemaVersion":1,"apiUrl":"https://api.morechat.co","wsUrl":"wss://api.morechat.co/ws","appUrl":"https://morechat.co"}
```

也就是说：**只要 `api.morechat.co` 与 `morechat.co` 指向这套服务，用户下载安装包后不需要
任何配置就能登录**。在此之前，用户需要按 `docs/ops/SELF-HOST.md` §2 写
`~/.multica/desktop.json` 指向自托管地址。

## 4. 部署前检查清单

- [ ] `curl https://api.example.com/health` 返回 `{"status":"ok"}`
- [ ] `curl -I https://app.example.com` 回 200
- [ ] `FRONTEND_ORIGIN` 与实际访问地址完全一致（含协议；不一致会导致登录回调/CORS 失败）
- [ ] 迁移成功（`docker compose logs backend | grep -i migrat`）
- [ ] 数据库卷 `pgdata` 已有备份计划
- [ ] 首个管理员账号已创建，并测试一次登录 + 建 issue

## 5. 已知未完成

- 云端域名与服务器尚未准备；目前只有本地 Docker 部署路径。
- 客户端暂无"首次启动填写服务器地址"的界面，只有 `desktop.json` 与 CLI 两条路径。
- macOS 安装包未签名（`CSC_IDENTITY_AUTO_DISCOVERY=false` 只做本地构建），正式分发前需要证书。
