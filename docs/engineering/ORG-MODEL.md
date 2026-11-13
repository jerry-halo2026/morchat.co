---
purpose: 公司/工作区/部门三层组织模型，以及"谁能看见什么"的落地边界
owner: lead
status: current
updated: 2026-11-13
related: [docs/engineering/CONTRACTS.md, docs/upstream/SEAMS.md, docs/ARCHITECTURE.md]
---

# 组织模型

本项目自托管、一家公司一套部署。下面把"公司—部门—人—资源"的关系定死，
以及每一项权限**由谁执行**。未标"已实现"的条目都还只是决定，不是能力。

## 1. 三层

| 层 | 是什么 | 在代码里 |
| --- | --- | --- |
| 实例 | 一套部署 = 一家公司 | 部署本身；没有 `company` 表 |
| 工作区 | 公司唯一的协作域，成员、任务、agent、技能、知识都在这里 | `workspace`，所有业务表带 `workspace_id` |
| 部门 | 公司内的组织单元：成员归属、默认可见范围、知识空间、报表归集 | **尚未建表**（见 §5） |

一个账号可以加入多个工作区，但那是"另一家公司/另一套数据"，不是部门。
**不要用工作区表达部门**：副作用是每台机器按工作区各注册一份 runtime
（`agent_runtime` 的 `UNIQUE(workspace_id, daemon_id, provider)`），
离开工作区会停用此人拥有的 runtime、归档绑定其上的 agent、取消未完成运行，
而跨部门协作在官方模型里没有任何机制。

## 2. 可见性矩阵

角色只有 `owner`（老板）、`admin`（总经理）、`member`（员工）；部门负责人是
`member` 加上"部门默认项目的 lead"，不是新角色。

| 资源 | owner / admin | 部门负责人 | 普通成员 |
| --- | --- | --- | --- |
| 工作区设置、成员、邀请 | 全 | 只读 | 只读 |
| 项目（部门私有） | 全见、可管理 | 本部门可见，可管理成员 | 本部门可见 |
| 项目（`workspace` 可见） | 全见 | 全见 | 全见 |
| 项目（其它部门私有） | 全见 | 不可见 | 不可见 |
| issue | 跟随所属项目 | 跟随所属项目 | 跟随所属项目 |
| 知识空间 | 全见 | 本部门空间 | 本部门空间 + 被共享 |
| 知识条目 `acl_mode=private` | 全见（待补，见 §5） | 仅本人 | 仅本人 |
| agent | 全见、可管理 | 见本部门 agent；运行仍受 Access 限制 | 同左 |
| runtime | 全见、可改名/删除 | 自己拥有的 + 被 `shared_with` | 同左 |
| squad / skill | 全见 | 全见（能力资产，不按部门隔离） | 全见 |

执行位置：

- 项目与 issue：`server/internal/projectaccess/`，`requireProjectVisible` /
  `requestHiddenProjects` 已铺在 issue 列表、表格、搜索、未读、inbox、视图、
  置顶、附件、项目资源、搜索索引等 20 余处；隐藏对象一律按"不存在"回答。
- agent：`canInvokeAgent`（调用权）与 `canAccessPrivateAgent`（可见性）分离；
  owner/admin 能看见并管理，但**不能**绕过 Access 运行别人的私有 agent。
- runtime：`visibility=public` 或 `shared_with` 名单；owner/admin 能管理，不代表能借用。
- 知识：`knowledge_items.acl_mode` 在 `search.go` 的 `visCond` 与 `canViewItem` 中判定。

## 3. "部门"如何表达（不新建 ACL）

1. 部门是可选的成员归属，不是权限表：`member.department_id`。
2. 一个部门可以有多个项目；新建项目默认 `visibility=private`，成员是本部门成员，
   lead 是部门负责人。跨部门项目才建 `workspace` 可见的项目，或手工加
   `project_member`——这正好是"涉及协作才可见"。
3. 知识按部门展示与检索：`knowledge_spaces.department_id`（现为死字段
   `team_key`），agent 侧通过 `knowledge_search{space_id}` 限定范围。
4. 普通 issue 必须落在项目里。**没有项目的 issue 默认全公司可见**，所以新规则只
   对新建生效，并且新建时自动落到本部门的 `department-inbox` 项目。

## 4. 上游对照（为什么不是"部门=工作区"）

| | Multica 官方 | Paperclip | 本项目 |
| --- | --- | --- | --- |
| 顶层边界 | workspace，完全隔离 | company + instance admin | 部署=公司，单工作区 |
| 权限粒度 | 3 角色，只管设置与成员 | 4 角色 + 21 权限键 + 作用域授权 + 资源授权表 | 3 角色 + 私有项目 + agent Access + runtime 借用 |
| 部门 | 不存在 | 不存在（用 grant 的 scope 表达） | 本文件 §3 |
| 资源授权 | 无 | `project_access_members`、`issue_access_grants(source)` | `project_member`（MUL-8472） |
| 导航 vs 授权 | — | 明确分开（`project_memberships` 只是侧栏） | 只有一张 `project_member`，它是**授权** |

Paperclip 的四条结构决定值得沿用：部门用 `scope` 数据表达而不是建 ACL；
"我加入的"与"我能看的"分表；项目授权派生到 issue 并记录来源；agent 的写入以
负责真人为上限。

## 5. 已知缺口（按修复顺序）

| # | 缺口 | 现状 | 处理 |
| --- | --- | --- | --- |
| 1 | 知识条目 `acl_mode=project` 等同 `workspace` | 声明了但未生效 | 按 `project_member` 真过滤；先 log-only 观测再强制 |
| 2 | 知识空间没有部门归属 | `team_key` 零引用 | 增加 `department_id`，列表/读取按部门过滤 |
| 3 | owner/admin 读不到别人 `acl_mode=private` 的知识 | `canViewItem` 只认 owner | 给管理角色补旁路 |
| 4 | 无项目 issue 全公司可见 | `issue.project_id` 可空 | 新建时落部门默认项目；历史不动 |
| 5 | 调岗不会同步项目成员 | 无事务 | 改 `member.department_id` 时批量增删部门项目成员并留审计 |
| 6 | 部门负责人无管理入口 | — | 部门默认项目的 lead 复用 `canManageProjectAccess` |

## 6. 红线

1. 不给部门做资源级 ACL 并改所有读路径——20 余处执行点，漏一处即越权。
2. 不批量回填存量项目/成员的部门——算错就是成片藏数据，且不可逆。
3. 不把工作区改造成部门——runtime 倍增、离开即停运行、跨部门无机制。
4. 不直接把 `acl_mode=project` 切成强制——存量条目会瞬间消失。
