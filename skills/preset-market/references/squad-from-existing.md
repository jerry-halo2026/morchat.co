# 把已有 agent 组成小队

这条路径**不装市场内容**，只用工作区里已经存在的 agent。用户说"把 A 和 B 组个队""让这几个一起干 X"时走这里。

## 1. 先看清手上有什么

```bash
"$MULTICA_CLI_PATH" agent list --output json > agents.json
```

```powershell
(Get-Content agents.json -Raw | ConvertFrom-Json).agents |
  Select-Object id, name, description, status |
  Format-Table
```

按用户说的名字匹配；**匹配不上就把候选列给用户挑**，不要自己猜。确认每个 agent 都是 `active`（归档的先用 `agent restore`）。

## 2. 定 lead

小队只认一个 lead（派活、提及、autopilot 都路由给它）。

- 用户点名了就让那个人当 lead；
- 没点名就建议一个最贴近目标的，**并问一句**"用它当 lead 可以吗"。

## 3. 建 squad

```bash
"$MULTICA_CLI_PATH" squad create \
  --name "<队名>" \
  --description "<一句话用途>" \
  --leader "<LEAD_AGENT_ID>"
```

lead 会被服务端自动加入（role=leader），不用再 add。

## 4. 加成员

```bash
"$MULTICA_CLI_PATH" squad member add "<SQUAD_ID>" --member-id "<AGENT_ID>" --type agent --role member
```

每个成员一条命令。若要设副手，用 `--role` 的其它取值前先 `squad member set-role --help` 确认允许值。
返回"already a member"→ 视为成功。

## 5. 写协作规则

```bash
"$MULTICA_CLI_PATH" squad update "<SQUAD_ID>" --instructions "<协作规则>"
```

内容建议四行以内：**谁负责什么、卡住了找谁、交付物放哪、什么情况算完成**。这段是 lead 的 brief，写清职责比写流程更有效。

## 6. 验证后汇报

```bash
"$MULTICA_CLI_PATH" squad get "<SQUAD_ID>" --output json
"$MULTICA_CLI_PATH" squad member list "<SQUAD_ID>" --output json
```

核对成员数 = 用户点名的数 + lead，`instructions` 非空。向用户报：队名、lead 是谁、成员名单、协作规则一句摘要。

## 7. 边界

- 只新建 squad，**不改已有 agent 的 instructions**；要改先征得同意。
- 不 archive 任何 agent。
- 成员全是别的队里的人也能加，问一句"要不要保留它在原队"。
