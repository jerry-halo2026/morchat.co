---
purpose: "TASK-DETAIL-404 — 自然创建与读取政策未接通"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# TASK-DETAIL-404 — 自然创建与读取政策未接通

2026-11-09；owner `/root/collaboration_business_baseline`（模型未暴露）；consumer `/root`；独立业务/安全审核待分配。基线 `51e23d9e7a8d6d3b3cdf46db7df68ad1b0938271`，`codex/round1-continuous`，工作树 `E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co`。本次仅诊断/方案，未授权产品修改。

## 已确认的症状与因果

Root 实机 CUA：同登录用户的项目 `fd14fa14-e4b8-4828-b3cc-35cbd5a71dbf` 看板存在 TITA2；打开 `/titan-868o/issues/01a1bf47-2f47-7d26-9192-13db2a468350` 显示“未找到任务”。这是 Root 报告的 UI 实证，本 worker 未重新操作浏览器，也未把 UI 文案冒充已捕获的 HTTP 状态码。

获准 stock 命令（未读取 compose/env 内容）：

```powershell
$sql | docker compose -f 'E:\CodexData\morchat-r1-local\run\multica-local-demo\compose.yml' exec -T postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 -U multica_demo -d multica_demo
```

实际执行的精简 `$sql`：

```sql
BEGIN READ ONLY;
SELECT EXISTS(SELECT 1 FROM issue_access_policy WHERE issue_id='01a1bf47-2f47-7d26-9192-13db2a468350') AS issue_policy,
       EXISTS(SELECT 1 FROM project_access_policy WHERE project_id='fd14fa14-e4b8-4828-b3cc-35cbd5a71dbf') AS project_policy;
COMMIT;
```

exit0，结果 `issue_policy=f, project_policy=f`。另一同样 READ ONLY 查询确认 `current_database()='multica_demo'`、`transaction_read_only=on`；两根测试行存在、任务属于该项目、同 workspace/同 member creator、creator仍是该 workspace 的 owner/member。对应 issue/project policy、creator部门成员关系、issue直接read、project read计数均0。仅返回布尔/计数/角色与12个政策表列定义；未读姓名、邮箱、密码、token、其他业务行。

**根因：写入链未产出读取链的强制政策，不是任务没落库；owner并不豁免业务授权。** 相对此工作树的实际源路径：

- `server/internal/handler/issue.go:2478`：GetIssue凭据失败为403；只有 `ErrIssueReadInvisible` 转404。本次未调用认证接口，不能伪称已捕获真实请求身份/响应。
- `server/internal/handler/issue_access.go:23,82`：native-v1可信会话进入原生读取事务。
- `server/pkg/db/queries/enterprise_acl.sql:12`：LEFT JOIN得到空policy；`server/internal/service/resource_access.go:305,450–494` 无issue policy即不授allow，项目任务还必须有同部门project policy，最终 invisible。当前两测试行满足此拒绝条件。
- `server/internal/handler/issue.go:3457` 调统一 `IssueService.Create`；干净的 `server/internal/service/issue.go:237,402,515` 已有真实创建事务，却没写部门/项目/任务policy/grant。`server/internal/handler/project.go:418–477` 无资源走非事务，有资源走事务，同样无policy。没有默认授权触发器补齐。

## 部署根因补证：已审 HEAD 与运行工作树不是同一候选

Root补充4e9d88实证后，本worker实际执行 `git show HEAD:server/internal/handler/issue.go`：**提交51e的GetIssue仍调用原生loadIssueForUser**，没有typed ACL guard；`git ls-tree HEAD`确认 `issue_access.go`、`resource_access.go`、`enterprise_acl.sql.go` 不在提交中，只有617 schema已提交。`Dockerfile:12` 是 `COPY server/ ./server/`，其ignore并不排除未跟踪Go源。因此从脏工作树构建会带入未审/未完成ACL，而Auth/startup提交本身没有这个GET变化。Root报告当前运行镜像正来自该工作树；本worker未另查容器env/镜像内容。

这把根因分成两层：**直接机制是WIP读取要求policy而自然创建没生成；眼下可用性事故的更上游原因是把未集成WIP误部署了。** 第一优先不应继续补半套ACL来修部署污染。

## Top 1：仅从已审提交导出构建上下文，先恢复已审原生版本

优先Root提出的 `git archive` 路径。它不是修改/恢复脏源码，不是新repo/worktree，也不是给现有GetIssue加creator旁路；它部署明确的已审Auth+startup+原生权限候选，完整企业ACL目标和WIP都保留。

后继允许写集应只有Root指定的、仓外全新临时构建目录/归档及镜像标签；**仓库源码写集为空、数据库写集为空**。本诊断未创建归档/目录、build、重启或改运行配置。

Root/独审确认后：

1. 绑定完整SHA `51e23d9e7a8d6d3b3cdf46db7df68ad1b0938271`，`git archive --format=tar --output=绝对临时路径.tar 51e23d9e7a8d6d3b3cdf46db7df68ad1b0938271`；仅解压到全新临时目录，不反写工作树。不得从脏树补拷任何Go源/生成物/旧helper；构建参数COMMIT绑定同SHA。
2. 检查归档中GetIssue为已提交原生实现、三份未提交guard源不存在、Auth/startup/ignore在内；固定Dockerfile和依赖锁。按现有忽略边界排除文档/密钥/缓存，不建立新构建框架。先构建候选，未通过前保留当前服务运行。
3. 仅做不会触发handler/cmd TestMain的现有构建/纯测试；不以包exit0假装业务通过。上线前核现库迁移与归档候选相容且无待执行写迁移；不downgrade/rollback/reset617/618。若入口会产生新迁移写入则停下另审，不能借“仅换镜像”越过DB零写范围。
4. Root独立审核候选后才另批准切换本地Web/API，Postgres/卷不动，旧镜像保留回退。复用Root当前会话，先对原两测试资源重开UUID/identifier，再走新创建→重开→改标题→回读的真实流程；UI与HTTP错误分开记录。DELETE若需操作Root测试资源须单独明确授权。

安全负例：匿名401、无workspace成员资格拒绝、跨workspace资源不泄漏；已审原生版本**不提供企业部门/项目细粒度权限**，本地只有Root/Ethan测试资料时限定验收，不部署多人真实敏感资料，不把已知企业权限缺口洗成PASS。恢复自然创建详情可用不等于R1-01完成。企业ACL后续仍按独立合成库、明确分类/写权限/撤权生命周期和消费者审核推进。

## 后继ACL修复仅保留诊断，不在本卡实施

干净 `server/internal/service/issue.go` 的真实事务可在新issue插入后/commit前接入受审政策helper，不必碰dirty handler；干净project.go需覆盖有/无resources两路。但默认部门语义尚未确定，而且617六ACL表UPDATE/DELETE抛0A000、native资源FK是NO ACTION；只补policy会使DELETE受阻。因此新增trigger/helper/backfill不是本次最短安全修法，生产设计/任何DB修复现在停止，不占迁移号、不改旧契约/trigger。

## 本次结果与保护

两次只读SQL均exit0，已确认测试资源存在且policy全缺；RootUI复现FAIL保留。归档/build/切换/新业务回归本轮全NOT RUN，无修复成功断言。未读密码/token/远程Supabase，未写DB、重启、模型调用、stage/commit或访问main。dirty issue.go/source_context.go/models.go及四个旧guard文件hash写前后保持；原COLLABORATION-NEXT SHA `b0a14f2d35926dc109af5c112a61ea452bcce397d03099cc64b4a0ddfeb8fa61` 保持。本文为本次唯一NEW1。

## 切换前补证：六ACL表全库聚合（2026-11-09）

Auth独审要求检查的不只是上述两测试行。先按617源码第6/17/30/43/57/71行核六表名，再用同一stock psql命令、`BEGIN READ ONLY`查询当前demo库；未访问其他库或读取业务行。实际SQL：

```sql
BEGIN READ ONLY;
SELECT json_build_object('database_matches',current_database()='multica_demo','read_only',current_setting('transaction_read_only'));
WITH counts AS (
 SELECT 'department'::text AS acl_table,count(*) AS total FROM public.department
 UNION ALL SELECT 'department_member',count(*) FROM public.department_member
 UNION ALL SELECT 'project_access_policy',count(*) FROM public.project_access_policy
 UNION ALL SELECT 'issue_access_policy',count(*) FROM public.issue_access_policy
 UNION ALL SELECT 'project_access_grant',count(*) FROM public.project_access_grant
 UNION ALL SELECT 'issue_access_grant',count(*) FROM public.issue_access_grant
)
SELECT json_build_object('counts',json_object_agg(acl_table,total ORDER BY acl_table),'all_empty',bool_and(total=0)) FROM counts;
COMMIT;
```

实际exit0，`database_matches=true`、`read_only=on`；department=0、department_member=0、project_access_policy=0、issue_access_policy=0、project_access_grant=0、issue_access_grant=0，**all_empty=true**。不是仅两个policy为空：六ACL表全部无企业分类/授权行。因此本次只读快照未发现切换已审原生reader会忽略的已落库企业隔离政策；满足Auth reviewer的这一项切换前条件，不证明完整企业权限或其他部署/业务验收。Root报告已导出private构建上下文、尚未build/deploy；本worker未构建、切换或写DB。原诊断历史保留。
