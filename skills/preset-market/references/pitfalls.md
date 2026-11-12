# 会踩的坑

装之前扫一眼这份，能省掉一半重试。

## 1. 技能名是 `ns`，不是 frontmatter 的 `name`

`multica skill import --url` 拿 SKILL.md frontmatter 的 `name` 当技能名；市场的命名空间是 `<包 id>--<技能目录>`。两者不一样就会挂错名字，agent 按 ns 找不到技能。

→ 要精确复刻，用 `skill create --name "<NS>" --content-file <SKILL.md>`。

**对照表**（实测）

| 来源 | 用它当技能名 |
| --- | --- |
| `skill import --url` | frontmatter `name`（错） |
| `skill create --name` | 你传的 `ns`（对） |

## 2. `squad create` 会自动把 lead 加成成员

传了 `--leader` 之后，再 `squad member add` 那个 lead 会报"already a member"。这不是错误，跳过即可。

## 3. `agent create` 没有 skills / avatar 参数

- 技能：`agent skills add <AGENT_ID> --skill-ids <ID,...>`（追加，不清空）；
- 头像：交给服务端默认的 Aora，不要手工传 png —— 市场包里已经不带图片。

## 4. GitHub 未认证 60 次/小时

同一文件只抓一次，存到本地再复用；`index.json`、`plugin.json`、`preset.json`、`SKILL.md` 顺序抓，别循环重抓。

命中限流（403/429）→ 告诉用户"市场暂时限流，稍后再试"，不要换 URL 硬试。

## 5. 同名对象先查，再问

```bash
"$MULTICA_CLI_PATH" agent list --output json
"$MULTICA_CLI_PATH" squad list --output json
"$MULTICA_CLI_PATH" skill list --output json
```

已存在就**问用户"复用还是新建"**。不覆盖、不 archive、不悄悄改名。

## 6. 没有在线 runtime 就停

`agent create` 必须带 `--runtime-id`。`runtime list` 里没有在线项时，直接回"先去运行时页连接运行时"，**零写入**、不要试错。

## 7. 环境里不一定有 jq

解析 JSON 用 PowerShell `ConvertFrom-Json` 或 `node -e`：

```powershell
(Get-Content index.json -Raw | ConvertFrom-Json).packages |
  Where-Object { $_.kind -eq 'team' } | Select-Object id, name
```

```bash
node -e "const j=require('./index.json');console.log(j.packages.filter(p=>p.kind==='agent').map(p=>p.id).join('\n'))"
```

## 8. 团队包的技能通常只有一个

别按"成员数 × 技能数"去建。先看 `preset.json` 的 `skills[]` 有几条，那就是要建的数量。

## 9. 失败怎么报

停在这一步，把三样东西给用户：**包 id、第几步、原始报错**。不静默重试超过一次；重试前先判断是不是第 4、6 条的原因。
