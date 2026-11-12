# 安装单个 agent

前置：路径与字段见 `market-layout.md`。CLI 用 `"$MULTICA_CLI_PATH"`（pwsh 用 `& $env:MULTICA_CLI_PATH`）。

## 0. 取数据（每文件只抓一次，存本地）

- `index.json` → 定位 `kind=agent` 且 `id=<PACKAGE_ID>` 的条目
- `presets/agent/<PACKAGE_ID>.preset.json` → `personaPath`、`conversationStarters`、`skills[]`（ns）
- `catalog/packages/agent/<PACKAGE_ID>/plugin.json` → `displayName`、`profession`、`agents[]`
- `catalog/packages/agent/<PACKAGE_ID>/agents/<AGENT_ID>.md` → persona 正文
- `catalog/packages/agent/<PACKAGE_ID>/skills/<NS>/SKILL.md` → 每个技能的正文

## 1. 查重 + runtime（先做，避免白干）

```bash
"$MULTICA_CLI_PATH" agent list --output json > agents.json
"$MULTICA_CLI_PATH" runtime list --output json > runtimes.json
```

```powershell
$existing = (Get-Content agents.json -Raw | ConvertFrom-Json).agents
$existing | Where-Object { $_.name -eq $NAME_ZH }
$rt = (Get-Content runtimes.json -Raw | ConvertFrom-Json)
$rt | Select-Object id, status
```

- 已存在同名 → 问用户"复用还是新建"，不覆盖、不 archive。
- 没有在线 runtime（`status` 非在线/无记录）→ 回复"先去运行时页连接"，零写入，结束。

## 2. 建技能（必须早于 agent，agent 只能挂已有 skill id）

对 `preset.skills[]` 的每个 ns：

```bash
"$MULTICA_CLI_PATH" skill create --name "<NS>" --description "<短名>" --content-file "<NS>/SKILL.md"
```

- 返回 JSON 里的 `id` 记成 `NS → SKILL_ID`
- 用 `--name <NS>` 才是精确 ns；`skill import --url` 会用 frontmatter `name` 当技能名
- 技能包里有附加文件时：`"$MULTICA_CLI_PATH" skill files upsert <SKILL_ID> --path "references/x.md" --content-file "references/x.md"`

## 3. 建 agent

```bash
"$MULTICA_CLI_PATH" agent create \
  --name "<DISPLAY_NAME>" \
  --description "<PROFESSION_ZH>" \
  --instructions "$(cat <AGENT_ID>.md)" \
  --runtime-id "<RUNTIME_ID>" \
  --conversation-starters '<JSON 数组，最多 3 条 {"label","prompt"}>'
```

- `--instructions` 传 persona md 全文（连 frontmatter 一起传）
- `agent create` 没有 skills / avatar 参数：技能下一步补，头像用服务端默认 Aora
- `--conversation-starters` 从 `preset.json` 取，超 3 条就截前 3 条
- 记录返回的 `AGENT_ID`

## 4. 挂技能

```bash
"$MULTICA_CLI_PATH" agent skills add "<AGENT_ID>" --skill-ids "<ID1>,<ID2>,<ID3>"
```

`--skill-ids` 逗号分隔；这是追加，不会清掉已有分配。

## 5. 验证后汇报

```bash
"$MULTICA_CLI_PATH" agent get "<AGENT_ID>" --output json
```

核对：名称、`--instructions` 非空、技能数量 = `preset.skills` 长度（不一致就补挂）。向用户报：装了什么、挂了几个技能、在哪个 runtime、描述一句。失败即停，把报错原文贴给用户。
