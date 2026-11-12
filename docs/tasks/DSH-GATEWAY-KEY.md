---
purpose: 让 DSH 用公司网关的 key（用户无需登录 DeepSeek）——已验证的原生配置方式与待改代码
owner: lead
status: current
updated: 2026-11-12
related: [docs/engineering/CONTRACTS.md, docs/tasks/PASSWORD-AUTH.md]
---

# DSH 走公司网关

## 结论（都在这台机器上实测过）

1. 网关可以**按用户自动建号 + 铸 key**：`POST /api/runtime/credentials` 返回 48 位明文、`remain_quota=10000000`、`expired_time=-1`。
2. 该 key 直接可用：`GET /v1/models` 返回 8 个（我们下发的白名单），`POST /v1/chat/completions` 返回 `OK`。
3. **明文只能从 `POST /api/token/{id}/key` 取**；列表/单条/搜索全部返回打码值（`1oAg**********L2Pk`）。
4. DSH 侧不要新建插件条目：patch 层按 **已存在的插件 id** 寻址，写一个不存在的 id 会直接报
   `patch: entry "llm-pi-ai-morechat" not found`。
5. 正确做法是 patch 现成的 **`llm-deepseek`**（`@deepseek-ai/dsh-llm-deepseek-api-key`），它接受
   `baseURL` 与 `apiKeyEnv`；并且 **`models` 必须显式声明**——该 provider 从 `${baseURL}/models`
   取清单，而我们的网关只在 `/v1/models` 提供，取不到就静默跳过（日志里只会看到官方账号那 2 个模型）。

## 可用的 `$DSH_HOME/cordis.patch.yml`

```yaml
- id: llm-deepseek
  config:
    baseURL: 'https://api.mxou.cn/v1'
    apiKeyEnv: 'MULTICA_RELAY_KEY'
    models:
      - id: 'deepseek-v4-flash'
        name: 'DeepSeek V4 Flash'
        contextWindow: 131072
        maxTokens: 8192
        inputModalities: ['text']
      - id: 'deepseek-v4-pro'
        name: 'DeepSeek V4 Pro'
        contextWindow: 131072
        maxTokens: 8192
        inputModalities: ['text']
```

配好后 `dsh --profile multica --list-models`（带 `MULTICA_RELAY_KEY`）返回 **4 个**模型：

```
deepseek-official/deepseek-v4-flash
deepseek-official/deepseek-v4-pro
deepseek-account/deepseek-v4-pro
deepseek-account/deepseek-flash
```

前两个来自我们的声明（走网关），后两个是官方账号路由；用户不登录 DeepSeek 时前两个即可用。

`llm-deepseek` 的 `models` 元素字段（从包里读出来的 `catalogModelFields`）：
`id`、`name`、`description`、`contextWindow`、`maxTokens`、`imagePixelBudget`、`inputModalities` 等。

## 待改代码（一处，需要连同测试一起改）

`apps/desktop/src/main/runtime-configurator/writers/dsh.ts` 目前写的是插件 id
`llm-pi-ai-morechat` 加 `providers: {…}` 结构，**这段配置不会被 DSH 采纳**。应改为：

- `id: llm-deepseek`（patch 已存在插件）；
- `config.baseURL` / `config.apiKeyEnv` 照旧；
- `config.models` 用服务端下发的白名单逐条展开（`id` + `name` + `contextWindow` + `maxTokens` + `inputModalities`）；
- `readPlannedDshValues` 同步从 `config` 直读（不再走 `providers.<id>`）。

我试过改完，但 `writers.test.ts` 与 `orchestrator.test.ts` 里有 7 个用例断言旧结构，需要一起更新
（`replaces the installer's empty [] document`、`points at the route when the base URL drifted` 等）。

## 桌面注入（已完成）

`903c58602`：配置成功后把 `MULTICA_RELAY_KEY` / `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` 收进内存，
`daemonSpawnEnv(env, extra)` 合并进每次 CLI spawn，登出清空，shell 里的旧值不会覆盖。单测 3 例通过。
