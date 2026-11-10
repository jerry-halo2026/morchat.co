#!/usr/bin/env bash
# morechat.co — 一键部署（Linux / macOS / WSL / Git-Bash）
#
#   bash install.sh          # 生成 .env（含随机密钥）→ 构建镜像 → 启动 → 等就绪
#   bash install.sh status   # 看服务状态
#   bash install.sh down     # 停止（保留数据卷；绝不加 -v）
#
# 幂等：重复执行不会覆盖已有的密钥，只补生成缺失/仍是占位符的那些。
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"

say() { printf '%s\n' "$*"; }
warn() { printf '警告: %s\n' "$*" >&2; }
die() { printf '错误: %s\n' "$*" >&2; exit 1; }

compose() { docker compose -f docker-compose.yml "$@"; }

# ---------------------------------------------------------------- 前置检查
command -v docker >/dev/null 2>&1 || die "未找到 docker。请先安装 Docker Engine 或 Docker Desktop。"
docker compose version >/dev/null 2>&1 || die "未找到 docker compose（v2 插件）。请安装 compose 插件。"

case "${1:-}" in
  status)
    compose ps
    exit 0
    ;;
  down)
    say "停止服务（数据卷保留）…"
    compose down
    exit 0
    ;;
  -h | --help | help)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *)
    die "未知参数: $1（可用: status | down | --help）"
    ;;
esac

# ---------------------------------------------------------------- 工具函数
get_kv() {
  awk -F= -v k="$1" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

set_kv() { # set_kv KEY VALUE —— 原位替换，不存在则追加；不带 BOM、不带引号
  local key="$1" val tmp
  # 去掉值里的任何 CR/LF：Git-Bash 下 openssl 的输出可能带 CRLF，混进
  # DATABASE_URL 会变成一个永远对不上的密码。
  val="$(printf '%s' "$2" | tr -d '\r\n')"
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  awk -F= -v k="$key" -v v="$val" '
    $1 == k { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
}

rand_hex() { # 参数：字节数
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1" | tr -d '\r\n'
  else
    od -An -tx1 -N "$1" /dev/urandom | tr -d ' \r\n'
  fi
}

rand_b64() { # 参数：字节数。必须是 base64，MULTICA_VCS_SECRET_KEY 只认这个格式
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$1" | tr -d '\r\n'
  else
    head -c "$1" /dev/urandom | base64 | tr -d '\r\n'
  fi
}

is_placeholder() { # 空值、或值里仍含示例占位串 → 需要生成
  local v="$1"
  [ -z "$v" ] && return 0
  case "$v" in
    *REPLACE_WITH* | *REPLACE_ME* | *change-me* | *CHANGEME*) return 0 ;;
  esac
  return 1
}

# ---------------------------------------------------------------- 准备 .env
if [ ! -f "$ENV_FILE" ]; then
  [ -f "$EXAMPLE_FILE" ] || die "缺少 $EXAMPLE_FILE，无法生成 $ENV_FILE"
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  say "已创建 $ENV_FILE（来自 $EXAMPLE_FILE）"
fi

changed=0

if is_placeholder "$(get_kv POSTGRES_PASSWORD)"; then
  set_kv POSTGRES_PASSWORD "$(rand_hex 16)"
  say "已生成 POSTGRES_PASSWORD"
  changed=1
fi

db_user="$(get_kv POSTGRES_USER)"
db_name="$(get_kv POSTGRES_DB)"
db_pass="$(get_kv POSTGRES_PASSWORD)"
[ -n "$db_user" ] || die "POSTGRES_USER 为空，请检查 $ENV_FILE"
[ -n "$db_name" ] || die "POSTGRES_DB 为空，请检查 $ENV_FILE"

# DATABASE_URL 必须与 POSTGRES_* 完全一致（密码对不上 → api 连库失败）。
# 判据用「连接串里是否出现 :<当前密码>@」，这样手工改过密码也能自动纠正。
db_url="$(get_kv DATABASE_URL)"
if [ -z "$db_url" ] || ! printf '%s' "$db_url" | grep -qF ":${db_pass}@"; then
  set_kv DATABASE_URL "postgres://${db_user}:${db_pass}@postgres:5432/${db_name}?sslmode=disable"
  say "已按 POSTGRES_* 回填 DATABASE_URL"
  changed=1
fi

if is_placeholder "$(get_kv JWT_SECRET)"; then
  set_kv JWT_SECRET "$(rand_hex 32)"
  say "已生成 JWT_SECRET（openssl rand -hex 32）"
  changed=1
fi

if is_placeholder "$(get_kv MULTICA_VCS_SECRET_KEY)"; then
  set_kv MULTICA_VCS_SECRET_KEY "$(rand_b64 32)"
  say "已生成 MULTICA_VCS_SECRET_KEY（openssl rand -base64 32）"
  changed=1
fi

if [ -n "$(get_kv FRONTEND_ORIGIN)" ] && [ -n "$(get_kv MULTICA_APP_URL)" ]; then
  :
else
  die "FRONTEND_ORIGIN / MULTICA_APP_URL 不能为空，请检查 $ENV_FILE"
fi

chmod 600 "$ENV_FILE" 2>/dev/null || true
if [ "$changed" = "1" ]; then
  say "密钥已就绪（$ENV_FILE 权限 600，不要提交 git）"
  say "提示: 之后若手工改 POSTGRES_PASSWORD，记得同步改 DATABASE_URL。"
fi

# ---------------------------------------------------------------- 构建与启动
say ""
say "==> 拉取基础镜像"
if ! compose pull postgres; then
  warn "postgres 镜像拉取失败，继续尝试（可能已有本地缓存）"
fi

say ""
say "==> 构建 api / web 镜像（首次较慢，需要 Go 与 Node 构建环境）"
compose build

say ""
say "==> 启动服务"
compose up -d

# ---------------------------------------------------------------- 等待就绪
wait_healthy() { # 参数：服务名 超时秒数
  local svc="$1" limit="${2:-600}" start now cid status
  start="$(date +%s)"
  while :; do
    cid="$(compose ps -q "$svc" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)"
      case "$status" in
        healthy)
          say "  $svc: healthy"
          return 0
          ;;
        exited | dead)
          warn "$svc 已退出，日志："
          compose logs --tail 40 "$svc" || true
          return 1
          ;;
      esac
    fi
    now="$(date +%s)"
    if [ $((now - start)) -gt "$limit" ]; then
      warn "$svc 超过 ${limit}s 未就绪（最后状态: ${status:-unknown}）"
      return 1
    fi
    sleep 5
  done
}

say ""
say "==> 等待服务就绪（首次安装要跑完整套迁移，可能需要几分钟）"
ok=1
wait_healthy postgres 120 || ok=0
wait_healthy api 600 || ok=0
wait_healthy web 180 || ok=0

app_url="$(get_kv MULTICA_APP_URL)"
api_port="$(get_kv PORT)"
web_port="$(get_kv WEB_PORT)"
[ -n "$web_port" ] || web_port=3000

say ""
if [ "$ok" = "1" ]; then
  say "部署完成。"
else
  say "部署未完全就绪，排查：docker compose -f docker-compose.yml ps / logs -f api"
fi
say ""
say "  应用地址 : ${app_url}"
say "  本机前端 : http://localhost:${web_port}"
say "  API      : http://localhost:${api_port}  （/health、/readyz）"
say ""
say "首次登录：打开上面的地址，输入邮箱 —— 未配置邮件时会话验证码打印在 API 日志里："
say "  docker compose -f docker-compose.yml logs -f api | grep 'Verification code'"
say ""
say "下一步："
say "  1) 想用真实邮件发码：在 $ENV_FILE 填 RESEND_API_KEY 或 SMTP_*，然后"
say "     docker compose -f docker-compose.yml up -d --force-recreate api"
say "  2) 想用域名 + HTTPS：见 README.md「形态二」（Caddyfile.example 已就绪）"
say "  3) 停止：bash install.sh down    状态：bash install.sh status"
say "  4) 永远不要 docker compose down -v —— 那会删掉 pgdata 卷里的全部数据。"
