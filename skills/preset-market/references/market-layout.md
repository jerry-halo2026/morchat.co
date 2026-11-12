# 市场目录结构

根：`https://raw.githubusercontent.com/jerry-halo2026/morechat.co-Assistant/main`

固定抓取方式（不需要 clone）：

```powershell
$base = 'https://raw.githubusercontent.com/jerry-halo2026/morechat.co-Assistant/main'
$index = (Invoke-WebRequest "$base/index.json" -UseBasicParsing).Content | ConvertFrom-Json
$packages = $index.packages          # 数组
```

```bash
curl -s "$BASE/index.json" -o index.json
node -e "const j=require('./index.json');console.log(j.packages.map(p=>[p.kind,p.id,p.name.zh,p.profession.zh].join(' | ')).join('\n'))"
```

`jq` 不保证存在，别在脚本里硬依赖。

## index.json

顶层：`schemaVersion`、`generator`、`generatedAt`、`source`、`avatarPolicy`、`hashAlgorithm`、`stats`、`packages`。

每个 package 条目：

- `id`：包 id，也是路径段
- `kind`：`agent` 或 `team`
- `name`：`{en, zh}`，人名（如 `{en:"Amy", zh:"深网网"}`）
- `profession`：`{en, zh}`，职业名（如 `{en:"AI Engineer", zh:"AI工程师"}`）
- `description` / `descriptionZh`：能力描述
- `version`、`path`（如 `packages/agent/ai-engineer`）、`files`、`bytes`、`sha256`
- `skills[]`：`{name, ns, path, files, bytes, sha256}`，其中 `ns` 是技能全名（`<package-id>--<skill-name>`），`path` 是 `skills/<ns>`
- `team` 包额外有 `leadAgent`（agentId）与 `members[]`：`{id, name{en,zh}, profession{en,zh}, role: lead|member}`
- `requires`（如 `python`、`canvas`）、`tags[{en,zh}]`、`categoryId`

## 包内文件

| 用途 | 路径 |
| --- | --- |
| 预设入口 | `presets/<kind>/<id>.preset.json` |
| 清单 | `catalog/packages/<kind>/<id>/plugin.json` |
| persona 正文 | `catalog/packages/<kind>/<id>/agents/<agentId>.md` |
| 技能正文 | `catalog/packages/<kind>/<id>/skills/<ns>/SKILL.md` |
| 技能附加文件 | 同上目录下的其他文件（references/、scripts/ 等） |

`preset.json` 关键字段：`personaPath`（相对仓库根，指向 lead 或唯一 agent 的 md）、`conversationStarters[]`、`skills[]`（ns 字符串数组）、`team{leadAgent, members}`（仅 team）。

`plugin.json` 关键字段：`name`、`version`、`agents[]`（`./agents/<agentId>.md` 列表）、`expertType`、`agentName`、`displayName{en,zh}`、`profession{en,zh}`、`displayDescription{en,zh}`。

## 拼 URL

```
$base/presets/<kind>/<id>.preset.json
$base/catalog/packages/<kind>/<id>/plugin.json
$base/catalog/packages/<kind>/<id>/agents/<agentId>.md
$base/catalog/packages/<kind>/<id>/skills/<ns>/SKILL.md
```

team 包的成员 agent 也用同一种路径，`<agentId>` 取自 `members[].id`；team 的技能取 `preset.json` 的 `skills[]` 或 `index.json` 里该 team 条目的 `skills[].ns`。

## 取字段示例

```powershell
$p = $index.packages | Where-Object { $_.id -eq $PACKAGE_ID }
$p.kind; $p.name.zh; $p.profession.zh; $p.skills.ns
```

```bash
node -e "const j=require('./index.json');console.log(j.packages.filter(p=>p.id===process.argv[1]).map(p=>JSON.stringify(p,null,2))[0])" $PACKAGE_ID
```

抓下来就存文件（`$base` 下同名），别为了同一个字段重复请求——未认证 GitHub 限 60 次/小时。
