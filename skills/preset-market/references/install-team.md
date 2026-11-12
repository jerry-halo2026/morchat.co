# 安装整支团队

团队 = 多个 agent + 一个 squad。顺序：技能 → lead agent → 成员 agent → squad → 成员 → instructions。

## 0. 取数据

- `index.json` 里 `kind=team` 的条目：`id`、`leadAgent`、`members[]`、`skills[]`、`name`、`profession`、`description`
- `presets/team/<PACKAGE_ID>.preset.json` → `personaPath`（lead 的 md）、`conversationStarters`、`skills[]`、`team{leadAgent,members}`
- `catalog/packages/team/<PACKAGE_ID>/plugin.json` → `agents[]`（全部 agent md）、`displayName`、`profession`
- 每个 agent：`catalog/packages/team/<PACKAGE_ID>/agents/<AGENT_ID>.md`
- 每个技能：`catalog/packages/team/<PACKAGE_ID>/skills/<NS>/SKILL.md`

## 1. 查重 + runtime

```bash
"$MULTICA_CLI_PATH" agent list --output json
"$MULTICA_CLI_PATH" squad list --output json
"$MULTICA_CLI_PATH" runtime list --output json
```

同名 agent 或同名 squad 已存在 → 问用户"复用还是新建"，不覆盖。没有在线 runtime → "先去运行时页连接"，零写入。

## 2. 建团队技能（一次）

对 `preset.skills[]` 的每个 ns：

```bash
"$MULTICA_CLI_PATH" skill create --name "<NS>" --description "<短名>" --content-file "<NS>/SKILL.md"
```

记下 `NS → SKILL_ID`；有附加文件走 `skill files upsert <SKILL_ID> --path ... --content-file ...`。

## 3. 逐个建 agent（含 lead）

```bash
"$MULTICA_CLI_PATH" agent create \
  --name "<AGENT_DISPLAY_NAME>" \
  --description "<AGENT_PROFESSION_ZH>" \
  --instructions "$(cat <AGENT_ID>.md)" \
  --runtime-id "<RUNTIME_ID>"
"$MULTICA_CLI_PATH" agent skills add "<AGENT_UUID>" --skill-ids "<ID1>,<ID2>"
```

约定：团队技能挂给 lead 和每个成员（同一批 id），任一成员都能直接用团队能力。名称用 `members[].name.zh`，缺中文退回 `.en`。

## 4. 建 squad（leader 会被自动加成成员）

```bash
"$MULTICA_CLI_PATH" squad create --name "<TEAM_NAME_ZH>" --leader "<LEAD_AGENT_ID>"
```

`--leader` 接受名字或 ID，用 ID 更稳。**leader 已自动是成员，不要再 `member add`。**

## 5. 加其余成员

只对 `role=member` 的 agent 逐个执行（`--type agent` 是默认值，显式写出避免歧义）：

```bash
"$MULTICA_CLI_PATH" squad member add "<SQUAD_ID>" --member-id "<AGENT_UUID>" --type agent --role member
```

## 6. 写 squad instructions

```bash
"$MULTICA_CLI_PATH" squad update "<SQUAD_ID>" --instructions "<PROFESSION_ZH>

<DESCRIPTION_ZH>

成员：<名字·职业>、…（负责人：<LEAD_NAME>）"
```

三段：团队专业、团队能力描述、成员清单（含 lead 并标注负责人）。
## 7. 验证

```bash
"$MULTICA_CLI_PATH" squad get "<SQUAD_ID>" --output json
```

成员数 = `leadAgent` + 非 lead 成员数（多一个就是重复 add），instructions 非空。汇报：团队名、成员、lead 是谁、挂了几组技能。
