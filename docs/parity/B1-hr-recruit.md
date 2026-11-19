# B1 · 人事 · 招聘看板 parity 清单

> 原页：`workstation-HR-main/index.html:4072-4524`（453 行，23 个动作）
> 新页：`packages/views/hr/recruit/`（页面 + 看板 + 抽屉）
> 依赖能力件：K1 看板、K4 导出、K2 日历（面试小节预览）

## 1. 字段

| 原字段 | 含义 | 我们的落点 | 状态 |
|---|---|---|---|
| `S.jobs[]` | 职位/招聘需求 | `hr_job`（含 `edu/years/city/jd/urgent/keywords`） | ✅ 已有 |
| `S.candidates[].stage` | 8 值：`screen/test/iv1/iv2/offer/hired/out` | `hr_candidate.stage`（8 值硬 CHECK，一一对应） | ✅ 已有 |
| `S.candidates[].screen` | `{st, score, note, date}` 简历筛选结果 | `score_resume` + `note` | ✅ 已有 |
| `S.candidates[].test` | `{paperId, date, score, status}` 笔试 | `score_test` + `stage='test'`（**没有试卷实体**，见差异 1） | ⚠️ 部分 |
| `S.candidates[].interviews[]` | 多轮面试 | `hr_interview`（round/scheduled_at/interviewer_name/status） | ✅ 已有 |
| `S.candidates[].offer` | `{salary, start, status}` | `offer_salary` + `hired_at` | ✅ 已有 |
| `S.candidates[].skills[]` / `exp[]` / `summary` | 简历标签与摘要 | `resume_text`（正文）+ `keywords`（职位侧） | ⚠️ 无结构化简历（见差异 2） |
| `S.candidates[].log[]` | 阶段变更日志 | 无（issue 式事件流未建） | ❌ 见差异 3 |
| `S.papers[]` | 笔试卷 | 无表 | ❌ B1 后续页（tests）处理 |

## 2. 交互（23 个动作）

| 原动作 | 行为 | 新页实现 | 状态 |
|---|---|---|---|
| `rec-job` | 拖卡换阶段 | `KanbanBoard onMove` → `PATCH /workbench/hr/candidates/{id}` | ☐ |
| `out-ok` | 淘汰（填原因） | 抽屉内 `rejected_reason` + `stage='rejected'` | ☐ |
| `cand-restore` | 恢复到之前阶段 | PATCH 回 `stage` | ☐ |
| `open-cand` / `cand-tab` | 打开候选人抽屉、切分页 | `Sheet` + tab（档案/简历/面试/评价） | ☐ |
| `cand-save` | 保存档案改动 | `PATCH` 候选人 | ☐ |
| `cand-del` | 删除 | `DELETE`（软删） | ☐ |
| `of-save` | 录用（生成员工） | 既有 `hire-dialog` → `POST /hire` → `{candidate, employee_profile}` | ✅ 已有 |
| `test-unassign` | 解绑笔试 | 清 `stage='test'` 相关字段 | ☐ |
| `job-add` / `job-edit` / `job-save` / `job-del` | 职位 CRUD | `RecordForm`（domain=jobs） | ✅ 已有 |
| `jd-ai` | AI 写 JD | 走 agent 通道出草稿（**不直连 deepseek**，见差异 4） | ☐ |
| `cand-import` / `ci-go` | 粘贴导入候选人 | 既有 `ImportSheet`（domain=candidates） | ✅ 已有 |
| `cand-export` | 导出候选人 | 新增 `ExportButton`（K4） | ☐ |

## 3. 状态

| 状态 | 原表现 | 新页实现 | 状态 |
|---|---|---|---|
| 无职位 | 空态「先建一个职位」 | `CollectionPageState` + 新建按钮 | ☐ |
| 职位无候选人 | 列内 `—` | `KanbanBoard emptyColumn` | ☐ |
| 加载 | 无（同步） | 看板骨架（`loading`） | ☐ |
| 请求失败 | 无 | 页面级错误 + 重试 | ☐ |
| 无写权限 | 无 | 只读（拖拽禁用、按钮隐藏） | ☐ |

## 4. 与已建内容的关系

页面骨架可复用：`hr` 目录已有台账（`LedgerTable` domain=candidates）、`hire-dialog`、`match-score`（四维 40/20/20/20）、`import-sheet`、`resume-upload`。

**新页只需加：** 看板视图 + 候选人抽屉（把已有详情字段搬进 Sheet）+ 阶段变更 mutation。

## 5. 差异表（复刻时先填，交付时确认）

| # | 差异 | 原因 | 建议 |
|---|---|---|---|
| 1 | 原页「笔试卷」是实体（题目/答案/阅卷），我们只有 `score_test` 一个分数位 | 我们的 `tests` 页尚未复刻，题库表未建 | B1 的 `tests` 页一起建表 |
| 2 | 原页简历是结构化字段（skills/exp/summary），我们存整段 `resume_text` | 没有简历解析 | 先整段正文 + AI 抽取（agent 通道），不建结构表 |
| 3 | 原页每条候选人带 `log[]` 阶段变更日志，我们没有事件流 | `issue` 那套事件流太重 | 用 `comment` 表带 `metadata.kind='stage_change'` 承载，或写进候选人的 `note` |
| 4 | 原页 `jd-ai` 直连 deepseek | 统一 AI 出口 | 走 agent 起草 → 人工采纳；无模型时降级为模板 |

## 6. 验收

| 项 | 谁 | 结论 |
|---|---|---|
| parity 清单全绿 | 执行者 | ☐ |
| 门禁（typecheck / lint / 测试 / 截图三档宽度） | Lead | ☐ |
| 并排截图确认 | 你 | ☐ |
