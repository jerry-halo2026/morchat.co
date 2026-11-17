# 复刻 parity 清单（模板）

> 一页一份。复刻前填「原页事实」，复刻后勾「新页状态」，差异写进最后一节。
> 判据：清单外的功能一律不做；做不了就进差异表，等验收时裁决。

## 0. 基本信息

| 项 | 值 |
|---|---|
| 页面 | `<domain>/<page>`（例：`hr/recruit`） |
| 原文件 | `workstation-HR-main/index.html:4072-4524` |
| 原页标题 | 招聘看板 |
| 新页路径 | `/{slug}/hr/recruit`（或 tab） |
| 依赖能力件 | K1 看板、K4 导出 |

## 1. 字段（读写原 `S` 的哪些字段）

| 原字段 | 含义 | 类型/格式 | 必填 | 新模型落点 |
|---|---|---|---|---|
| `S.jobs[]` | 职位 | `{id,title,dept,headcount,level,salary,city,edu,years,urgent,status,owner,paperId,jd,keywords[]}` | — | `hr_job` |
| `S.candidates[].stage` | 阶段 | 8 值枚举 | 是 | `hr_candidate.stage` |
| … | | | | |

## 2. 交互（原 `UI.act` 的每个动作）

| 动作名 | 触发 | 行为 | 新页实现 | 状态 |
|---|---|---|---|---|
| `rec-job` | 拖卡到另一列 | 改 `candidate.stage` 并写 `log` | `<KanbanBoard onMove>` → PATCH | ☐ |
| `cand-import` | 点「导入」 | 打开粘贴导入 | `<ImportSheet>` | ☐ |
| … | | | | |

## 3. 状态（原页的分支）

| 状态 | 原表现 | 新页实现 | 状态 |
|---|---|---|---|
| 空数据 | 空态卡 + 「新建职位」按钮 | `CollectionPageState` | ☐ |
| 加载 | 无（同步渲染） | `CollectionList loading` 骨架 | ☐ |
| 请求失败 | 无（无网络） | `CollectionPageState tone="destructive"` + 重试 | ☐ |
| 无权限 | 无 | 禁用写入口 + 说明 | ☐ |
| 长文本 | 截断 | `truncate` + tooltip | ☐ |

## 4. UI 检查（逐条打勾，机器可验的用 grep）

| 检查 | 方法 | 状态 |
|---|---|---|
| 字号只用 `--text-*` | `grep 'text-\[' ` 与人工看 | ☐ |
| 零硬编码颜色 | `grep '#[0-9a-fA-F]\{3,6\}'` | ☐ |
| 间距与既有页一致 | `PAGE_GUTTER` / `h-12` / 表头 `h-9` / 行 36 | ☐ |
| 图标来自 `@morechat/ui/icons` | grep | ☐ |
| 五态齐全 | 组件测试 | ☐ |
| 键盘可达 | Tab / Enter / Esc / 焦点环 | ☐ |
| 三档宽度无横向滚动 | 截图 1024 / 1280 / 1440 | ☐ |
| 深浅色无对比度事故 | 截图两套 | ☐ |
| 8 语言 parity | `vitest run locales` | ☐ |

## 5. 截图

| 场景 | 原 HTML | 新页面 | 备注 |
|---|---|---|---|
| 默认视图（有数据） | ☐ | ☐ | 同一份种子数据 |
| 空态 | ☐ | ☐ | |
| 详情/侧栏打开 | ☐ | ☐ | |
| 1024 / 1280 / 1440 | ☐ | — | 只验新页 |

## 6. 差异表（没做的、改了行为的，都要写）

| # | 差异 | 原因 | 建议 |
|---|---|---|---|
| 1 | 例：原页 `office` 座位点击进员工档案，本页不做 | `office` 动画页整页不复刻 | — |
| 2 | 例：原页「AI 写 JD」直连 deepseek，本页走我们的 agent 通道 | 统一 AI 出口 | 需确认 |

## 7. 验收签署

| 项 | 谁 | 结论 |
|---|---|---|
| parity 清单全绿 | 执行者 | |
| 门禁（typecheck / lint / 测试 / 截图） | Lead | |
| 并排截图确认 | 你 | |
