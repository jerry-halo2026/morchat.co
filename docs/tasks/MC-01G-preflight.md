---
purpose: "MC-01G 无模型权限切片：工程交接"
owner: task-owners
status: current
updated: 2026-11-06
related:
  - docs/MINIMUM-CHAIN.md
  - docs/tasks/MC-00-engineering.md
---
# MC-01G 无模型权限切片：工程交接

状态：NEEDS_CONTEXT / NOT RUN。这是 R1-01 的技术前置记录；R1-AUTH-r1 已授权无模型验证、隔离合成库与最小权限修复。C01/C02/C04/C06 精确子集仍须由真实工程角色完成 TEST-FROZEN，不等于自动冻结。

权威：[NM-ACL-r1](../MINIMUM-CHAIN.md#9-不调用模型的合成权限验证nm-acl-r1)。依赖：[MC-00](MC-00-engineering.md)。当前集成人见 ACTIVE；本卡实现 owner 与独立 reviewer 由接手会话登记，禁止抢先多写者开发；不沿用历史 agent ID 冒名。

## 原生接入点（固定 SHA 164290ee）

| 消费契约 | 原生位置 | 要补齐的验证，不另造子系统 |
|---|---|---|
| C01 身份与资源授权 | `server/internal/handler/issue.go`、project/workspace/member handler、`server/pkg/db` 的原查询与生成代码 | 合成公司/部门成员、普通与私密任务；项目只读授权对现存及后续任务的继承，查看与修改分离 |
| C02 @ 与委托 | 原生 comment/chat/agent task handler、`server/internal/daemonws` | 发起员工≠设备管理人时，委托不能借用设备所有者权限；不触发真实 DSH |
| C06 派工与回传 | 原生任务队列、daemon claim/completion 路径 | 设备＋管理人＋Bot＋任务资源交集；过期授权不得领取或回传，真实 policy 不 mock |
| C04 附件及受控缓存 | 原生附件 handler（含 `attachment_capability.go`）、storage、WS、客户端搜索/缓存 | 登录下载、capability URL、原始 URL、缓存/索引/WS 全部覆盖撤权；不能只测 UI 按钮 |

原生附件已有 capability 测试，不等于公司撤权规则成立；必须分别核验 TTL、撤权时刻、原件/衍生文本与下载链接，不能仅由已有测试名推断漏洞已修。

### 本轮已定位的真实路由与测试陷阱

路由权威是 `server/cmd/server/router.go`，不是假定的 `internal/handler/routes.go`。

- `GET/POST /api/issues`、`PUT /api/issues/{id}`、`POST /api/issues/{id}/comments`；还须覆盖 `/query`、`/search`、`/table/*`、batch 与 child-progress 等旁路，不能只测详情页。
- 人员本地索引同步 `/api/search-index/manifest`、`/snapshot`、`/changes`，与 Agent 通过 `/api/issues/search` 搜索分开验。
- 原生设备领取位于 `ClaimTasksByRuntime` / `ClaimTaskByRuntime`，在 `server/internal/handler/daemon.go`；测试不启动真实 daemon，只替换执行副作用，保留真实授权判断。
- 附件分别测 `/api/attachments/{id}/download`、`/signed-download`、`/uploads/*`；相关 handler 是 `DownloadAttachment`、`DownloadAttachmentWithCapability`、`ServeLocalUpload`。是否满足企业撤权规则仍 NOT RUN。
- 可复用 `internal/testutil.Fixture`、现有 `comment_reply_authz_handler_test.go`、claim/attachment测试的合成数据构造；不能把只调用 handler 的测试当完整认证链已经覆盖。

**防假绿 P0：**`server/internal/handler/handler_test.go` 的 `TestMain` 在未配置 `DATABASE_URL` 时默认尝试 localhost/multica；数据库不可达会打印 `Skipping tests` 并 `os.Exit(0)`。所以未来必须明确隔离库且预检可达、校验 `go test -json` 中预期 NM 用例确实执行且未 skip，缺用例/连接失败必须阻断。当前没有运行这组测试，也没有把退出0记为权限通过；不得为了“尝试一下”误连默认现有库。

## 执行前必须补齐

1. 对每个 NM-01–12 定到真实 route/handler/query/fixture/test 名称，填写匿名、同部门、跨部门、私密正负例的预期响应；本表只是路径定位，不是可执行契约。
2. 明确组织/细权字段的原生缺口与最小补丁；当前没有这些字段时登记原生缺口并在 TEST-FROZEN 后实现最小补齐；未补齐前该用例 BLOCKED，不用 mock policy 生成绿灯。
3. 隔离本地合成 PostgreSQL、附件目录与测试账号；不复用之前真实登录会话或默认工作数据库。已批准新建独立合成库的初始化/迁移；先登记并验证实际目标，禁止默认连接或运行 `make up` 猜数据库，无需再次泛问是否准许测试。
4. 冻结本轮消费的 fixture/拒绝语义、在线撤权参数与权限快照；执行授权单列，限制模型出口与真实 CLI，计数必须为零。
5. 指定真实 owner/reviewer，绑定当前专用集成分支的已审 commit＋未提交 hash，登记 main 差异但不以主树合流为前置。不能直接派多个 agent 各写一个授权判断。

当前没有 `test:nm-acl` 入口，不提供虚构命令；工程单测、类型检查和纯函数 Go 单测均不计入 NM 通过。完成以上准备后才能把状态变为 TEST-READY。
