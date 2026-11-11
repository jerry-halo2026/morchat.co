---
purpose: "参考项目的复用与非复用边界"
owner: docs-maintainers
status: reference
updated: 2026-11-06
related:
  - docs/MULTICA-BASE-EVALUATION.md
  - docs/EVOSE-PRODUCT-RESEARCH.md
  - docs/PAPERCLIP-BASE.md
---
# 参考项目的复用与非复用边界

> 2026-11-06，方案收敛阶段。当前设计方向：Multica 为统一产品与唯一任务/调度基座；Paperclip 借鉴公司治理；OpenMausBot 借鉴人机协作操作链；Evose 借鉴完整项目工作面、运行治理与资料体验。设计方向不等于企业 P0 验收或正式开发授权。沿用既有文档与证据，不另建第二套设计文档。

## 1. 核心结论

| 项目 | 固定样本 | 本期角色 | 复用方式 |
|---|---|---|---|
| Multica | 58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe | 统一客户端、协作后台与唯一任务/run/调度权威 | 优先复用整体前端、Electron壳、原生daemon、Issue/项目/小队、附件和用量；企业扩展进入同一套身份与数据，不并行部署Paperclip调度 |
| Paperclip | 40ea7a9b8994e9bdb3d13794b5847388be0f7a92 | 公司治理、组织/目标、审批/预算/审计及版本管理参考 | 保留已读源码和实测证据；先对照Multica缺口再决定迁入独立实现或按契约适配，不复制第二账本/审批状态机/调度器 |
| OpenMausBot | 597e70d7930db632747acfb4ea047ca520bd958c | 必须保留的人机协作操作链参考，不作为运行依赖 | 组队与岗位包、追问/审批、执行中补充/停止、过程折叠、文件交付、记忆/skill候选；先用Multica原生件，缺项才抽可独立子件，不移植整套ChatView/Store/runtime |
| Evose | 产品走查、官方介绍及 Ethan 终版运行治理报告；未取得可复用源码证据 | 完整项目工作面、规则与待办、权限解释/审计及资料体验参考 | 只采纳适用机制，报告观察/推断分别登记；不复制 bundle 或后台，不引入积分/套餐/三通道实时作为首轮前置；知识/表格继续后接 |
| DeepSeek Harness | fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159 | 官方独立 harness，已确认优先研究，发行物/安全组合未验收；不是仅模型 API | 官方 Multica JSONL v1 bundle/driver 优先复用，SDK/ACP 与插件按需评估，原生安全/公司凭据门禁未过，不同时引入第二套运行平台 |
| Microsoft MXC | v1.0.1 / fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2 | Windows原生隔离组件优先验证 | 候选 SDK 的 ProcessContainer；MIT；实际 build/tier/策略及能否采用须验证，尚非已验收依赖，不用VM、不从Codex拆整套沙箱 |
| ACP TypeScript SDK | 1.4.0 / e6463f444093ed7c5f1cc937c3f32afb5853e906 | 前序Paperclip实验参考；不是Multica DSH必需依赖 | 当前主路径用Multica官方DSH JSONL v1；不在其外再叠ACP桥，只有后续明确协议缺口才重新评估 |
| Nodo | 5c45fdf1c27f92d6369d03017dcea27e51040430 | 可选角色路由参考 | 不作为通用工作流或组织底座，不列为 MVP 必需依赖 |
| n8n / Coze Studio / FlowGram | 已有研究记录 | 本期全部暂缓 | 不安装、不建设画布或转换器；未来按需求重新评估 |
| Coze 云 | 未选具体产品/API/版本 | 未来外部能力候选 | 将来核验身份、输入输出、授权、数据传输和运行关联后再接入 |

当前DSH路径已实测官方 Multica bundle（571d7c036d15f58ee88c89fd80afb0a6c7f0023c）＋原生 JSONL v1 driver；旧 ACP/PCWS/Runner 方案是前序对照，不是当前必装栈。固定源码能力、真实功能链、生产权限/接续验收必须分开记录。详细结果见 [Multica 实测](../experiments/multica-spike/INTEGRATION-RESULT.md)。

### 1.1 OpenMausBot：保留哪些价值，如何落到 Multica

| 操作链 | 保留的设计价值 | 在当前基座上的落点 | 禁止直接继承的行为 |
|---|---|---|---|
| Bot/小队配置与岗位入职 | 成员选择、职责、工具/资料范围、模板差异预览 | 原生Agent/Squad基础＋真人负责人/岗位包扩展；同一成员身份 | 把侧栏Bot分组当部门ACL、导入个人记忆/秘密/旧授权 |
| 群讨论与定向协作 | @候选、谁负责回应、过程折叠、汇总与交接 | 原生结构化mention与Issue线程；群消息展示、上下文读取、执行唤醒分别授权 | 纯名字匹配、无@自动全员响应、Bot正文任意接力、默认Everyone |
| 追问与审批 | 可读问题卡、选项/自由答、工具参数与明确批准/拒绝 | 先盘点Multica与DSH实际能力；缺口进入唯一持久请求/运行协议；公司审批和工具许可区分 | 只存在进程内的待回答状态、模糊Always allow、Bot代真人批准 |
| 执行中补充与停止 | 草稿/排队/补充/停止范围可见 | 使用原生任务和取消路径；DSH同轮steer未验证时按安全下一轮处理；收到请求≠已停止 | Stop之后隐藏队列仍自动续跑、把单Bot停止称整次协作停止 |
| 文件交付 | 来源/文件列表/预览/回源/冲突反馈 | 原生附件＋run归属/哈希/接收确认；自动归档单独补齐 | 当前本机路径充当历史成果、个人Cloud充当公司资产库 |
| 记忆、模板与skill维护 | 候选→差异预览→评审→发布→回滚的操作体验 | 同一公司资产与版本契约；运行固定版本；借鉴实现前核对依赖和许可 | 自动review当测试通过、改当前正文当版本闭环、静默升级生产实例 |
| 运行就绪与人工接手 | 运行地点、工具缺失、离线原因、登录接手、诊断 | 复用Multica daemon/客户端，补受权设备状态与审批回执 | 搬OMB完整Host/Client引擎、默认个人Key回退或关闭员工本地harness |

“参考”不是删除这些功能，也不是承诺所有能力原生已有。源码复用按顺序：Multica已有→适配已有→审查OMB独立子件→确无可复用件才自建。每个候选写明固定源码、依赖闭包、许可、身份/事件/文件接口替换、测试和维护owner；不以保留外观为理由引入第二控制后台。

### 1.2 如何使用历史研究

本文件正文为当前复用边界；迁移前审计完整归档，作为源码事实和反例来源，不可直接派实现任务。以下外部资料研究保留原结论及明确的未实测状态，当前核心优先级不变。

### 1.3 知识库与多维表格：候选复用核查（2026-11-06）

本轮仅阅读官方文档/源码，没有安装或运行候选，不能记作集成/安全通过。多维表格是业务资料模块，不替换 Multica 的任务/run 或带入第二套 AI 调度。需求已确认，分期与选型尚未冻结。

| 候选 | 已读证据与能借用的部分 | 缺口/边界 | 当前处置 |
|---|---|---|---|
| smart_table | 固定源码 SHA bec464c7c3fb058ab4d2f3519c6408b1c50e2b44；Vue 3 + Flask，多视图、文档、分享、记录历史等可研究；LICENSE 为 MIT；已有高级权限迁移，不应说完全没有权限设计 | 已读单条记录读/写入口按 Base/表分享角色检查；OpenAPIService 明确应用以获授权 Base 所有者视角访问，不能直接代表员工/Bot 的行字段权限。高级权限表存在不证明所有入口强制执行；与当前 React/Go 产品栈不同，整套嵌入会增加身份和服务适配 | 保留功能/源码候选，不选作已满足要求的即插即用组件，不将开放 API 的整库授权直接给 Bot |
| Teable | 官方 Authority Matrix 描述按角色/部门、行条件和字段查看/写入，匹配需求，优先作权限能力对照 | 文档标 Business 及以上，管理员有豁免，多角色允许权限合并；自托管所需版本/许可、API/Bot 身份与撤权、导出/派生值必须验证。不能认定开源免费版等于该能力 | 优先核实可自托管版本与授权成本后做最小证明；非已选型，不引入其 AI/工作流栈 |
| Baserow | 官方字段权限负责限制修改；Restricted Views 可约束行和隐藏字段，适合作第二对照 | 单独的 field-level permissions 不限制读取；普通视图隐藏不是保密。受限视图与底层表权限组合、API/Bot token、版本许可仍待核实 | 备选；不可仅凭“字段权限”名称判满足字段读权 |
| Multica / OpenMausBot | 本地 Multica packages/ui 已有 react-markdown 渲染；先复用统一页面、已有内容/附件载体。OMB 已测 table-data 属于文件/CSV 预览处理，可用于交付物展示 | 渲染器不等于可编辑知识库、版本和服务端授权；CSV 预览不等于多维表格。Multica 附件匿名直链 P0 失败尚须修复，不能直接继承为安全知识存储 | 不另起知识/聊天后台；沿选定内容服务补身份/权限/版本引用，不默认自建文档引擎 |

**源码依据：**[smart_table README](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/README.md)、[MIT 许可](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/LICENSE)、[records 单条读写](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/routes/records.py)、[OpenAPIService](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/services/open_api_service.py)、[高级权限迁移](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/migrations/versions/20260807_0025_add_advanced_permission_models.py)。也读取了 PermissionService、TableShareService、RecordService 和表分享测试；本轮未运行测试、未完成全部 middleware/路由审计，不据此宣称已复现上游漏洞。

**官方功能依据：**[Teable Authority Matrix](https://help.teable.ai/en/basic/authority-matrix)、[Baserow 字段权限](https://baserow.io/user-docs/field-level-permissions)、[Baserow 视图权限](https://baserow.io/user-docs/view-level-permissions)。Teable/Baserow 本轮是官方文档层核查，尚未固定源码版本或实测；具体许可、发行版和身份委托条件通过后才能确定复用方式。

**最短复用路线建议（由 §1.5–1.7 更新）：**飞书是已接受托管选项，新增腾讯候选核查期间不冻结优先项，Docmost 备选；Multica 保留统一展示与资产入口，不默认自建知识正文/版本引擎；后续表格优先适配已验证的表格数据服务/组件，而不是把 Vue/Flask 整套移进现有 React/Go 主产品。服务拆分不是硬要求；统一身份/权限与一份业务数据权威是硬要求。不自研网格、公式或协同引擎，也不为了一个表格模块另引任务、Bot、LLM Key 或工作流后台。验收见资产 §3.2–3.4。

### 1.4 Docmost：此前优先偏好与自托管备选（2026-11-06）

Ethan 此前明确偏向 Docmost，并接受考虑商业自托管授权；随后接受飞书内容托管，相关候选证据见 §1.6，最新腾讯对照及选型状态见 §1.7，Docmost 保留自托管备选。此确认是选型偏好与许可接受方向，不是购买、安装、产品开发或上线授权；具体版本、费用、嵌入方式及接入契约未冻结，也不代表已同意多维表格的分期。

- 复用优先级调整：先核验 Docmost 现成知识服务的空间、页面、编辑/历史、附件、搜索和授权接入，不因 Multica 缺少知识库就默认自建正文/修订引擎。Multica 的展示与资产入口仍可复用，不再作为必须自建完整知识后端的依据。
- 建议分工：Multica 保持统一客户端、协作和任务/run 权威；Docmost 承担知识正文及其版本/附件的内容权威，企业层维护稳定资源引用、归属/来源和授权衔接，不复制第二份可编辑正文。最终服务组合和页面嵌入方式须验证后确认。
- 官方资料已读：核心为 AGPL-3.0，商业功能另有许可；API 文档标需企业授权，MCP 文档标需 Business/Enterprise，并说明 OAuth 读写授权仍受用户空间/页面权限约束。具体采购版本须核对能力矩阵，不能用“可接受付费”推断所有所需能力均已获得。
- 必须补齐的企业约束：用户授权、Bot 自身授权、本次任务范围与设备/管理人承载资格同时成立；仅继承用户权限还不充分。不能把一个管理员 token 交给全部 Bot。
- 最小验证：个人工作文档→授权小队→Bot 按权读取/建议修改→条件保存新版本→撤权；覆盖搜索、历史、附件原址、实时会话和 Bot 的越权负例，同时验证身份与稳定资源引用。失败则评估最小适配，不靠扩大权限过关。
- 暂不同时部署多个知识产品；BookStack 保留对照，Outline 条件备选，RAGFlow 只在复杂解析/检索需求成立后研究。不用 Docmost 的表格功能外推为已满足行/字段四类权限。

依据：[官方介绍](https://docmost.com/docs/)、[版本与许可](https://docmost.com/docs/editions)、[API](https://docmost.com/docs/user-guide/api)、[MCP](https://docmost.com/docs/user-guide/mcp)。当前仅资料核查，未安装或运行 Docmost，不计为集成验证通过。

### 1.5 三路并行源码复核：Docmost、smart_table、Multica（2026-11-06）

只读审查，不是运行验证。父任务复核了 Docmost 附件/写入 DTO、smart_table 附件/广播、Multica 会话/MCP/桌面配置关键片段；没有修改参考仓、安装服务或调用模型。

| 固定样本 | 直接复用的原生基础 | morchat 适配或上游缺口 | 结论 |
|---|---|---|---|
| Docmost 33e47abca316e9f24d78d401e3dfa233efe1756b | 页面/空间、协作编辑、历史、PostgreSQL 按权搜索、私有附件鉴权；协作连接有 Redis 触发的重验/断开/只读降级 | 身份映射、委托人/Bot/task/设备联合授权；公开核心更新无 expected revision，旧 Bot replace 可能覆盖新编辑；公共附件 JWT 路径不重查即时 share/page ACL；协作撤权通知丢失需故障验证 | 可作为自托管知识服务候选，不能原样承诺条件写入和强一致撤权 |
| smart_table bec464c7c3fb058ab4d2f3519c6408b1c50e2b44 | 表/字段/记录、类型、视图、历史、计算及部分乐观冲突基础 | OAuth 仅观察到 client_credentials；应用 API 按 Base 授权，不是员工委托；标准单条接口缺行字段投影；附件原址和 Base 级广播是实质接入阻断；条件更新参数未由标准更新路由传入 | 不是现成企业权限组件；不安排与飞书同时建设 |
| Multica 58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe | 统一导航、task/run、workspace 守卫、task token；MCP 工具/schema/域/调用配额门禁及逐调用取凭据 | 外部用户 token 与 task 委托映射、资源参数鉴权；UI JWT 无即时服务端撤销；外部页面安全容器；既有 local uploads 匿名旁路待修复 | 保持唯一任务基座，复用已有 broker，不误称安装级 credential 已满足用户授权 |

**Docmost 精确证据与纠正**

- [JWT strategy](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/core/auth/strategies/jwt.strategy.ts)、[OAuth guard](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/common/guards/jwt-auth.guard.ts)：原生检查活动用户/会话，OAuth 需路由 scope；API key/OAuth 实现转交企业模块。SSO、MCP、API 等不可都按开源核心免费复用。
- [PageAccessService](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/core/page/page-access/page-access.service.ts) 与 [权限仓库](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/database/repos/page/page-permission.repo.ts)：原生确有页面/祖先访问检查；页面 writer 与 Space reader 的组合不是一律取最低角色，必须用真实权限矩阵验收。
- [UpdatePageDto](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/core/page/dto/update-page.dto.ts)、[PageService.update](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/core/page/services/page.service.ts#L229-L297)、[历史恢复](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/client/src/features/page-history/hooks/use-history-restore.tsx#L42-L77)：未见原子基线条件保存；CRDT 不能证明旧 Bot 整段替换安全；/pages/restore 是垃圾箱恢复，不是历史 CAS。初期可只开放独立草稿/评论，不以代理先读后写冒充 CAS。
- [附件 Controller](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/core/attachment/attachment.controller.ts#L179-L272)：私有原址检查当前页面权；公共原址依赖有期限 JWT，不在该函数实时重查分享状态。[TokenService](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/core/auth/services/token.service.ts) 的附件 token 为 1 小时；还须测缓存/Range。不能把“收回分享”当已发链接立即失效；关闭公开入口或修复后再验收。
- [协作认证](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/collaboration/extensions/authentication.extension.ts) 已有 skipCache 重验、断开/只读；[撤权发布](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/apps/server/src/collaboration/services/collab-access.service.ts) 仍需验 Redis 故障/丢事件和旧协作 token，不能列成完全从零开发或已强一致。
- [企业子模块](https://github.com/docmost/docmost/blob/33e47abca316e9f24d78d401e3dfa233efe1756b/.gitmodules) 指向 docmost/ee，固定子模块 ab54ba07f0fa1f777a0f0814170c7bce07e67737 本轮访问 404。EE 的 SSO/API/MCP/付费索引内部未审计。[OIDC](https://docmost.com/docs/user-guide/authentication/oidc) 登录组同步不替代 [SCIM](https://docmost.com/docs/user-guide/authentication/scim) 生命周期；[价格页](https://docmost.com/pricing) 与 [API 文档](https://docmost.com/docs/user-guide/api) 对套餐措辞有差异，采购前向厂商确认目标版本、API 能力和席位，不自行推断。

**smart_table 精确证据与纠正**

- [OAuth](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/routes/oauth.py#L39-L104) 为应用 client_credentials；[OpenAPIService](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/services/open_api_service.py) 不依赖当前用户。高级权限迁移存在不代表实际强制链成立。
- [普通更新](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/routes/records.py#L561-L594) 仅检查 Base/表分享角色；[Record.to_dict](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/models/record.py#L142-L158) 返回 values；已读认证/应用生命周期未发现统一行字段过滤。不是全部路由审计或运行复现。
- [RecordService.update_record](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/services/record_service.py#L348-L454) 有可选 expected_updated_at，但上述路由不传入，且对已加载对象比较时间不等于数据库原子 CAS。保留历史/冲突基础，撤回“标准接口已条件保存”的外推。
- [附件下载](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/routes/attachments.py#L158-L209) 资源授权仍 TODO；[uploads 原址](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/routes/attachments.py#L466-L518) 无认证装饰器。路径合法性不等于文档/行字段授权。
- [room join](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/routes/socketio_events.py#L119-L142) 和 [broadcast_change](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/services/collaboration_service.py#L406-L434) 以 Base 广播，未见逐接收者行字段投影。REST 补过滤仍不足；搜索、导出、历史、lookup/公式也必须纳入。
- [应用工厂](https://github.com/ldbinac/smart_table/blob/bec464c7c3fb058ab4d2f3519c6408b1c50e2b44/smarttable-backend/app/__init__.py) 初始化工作流执行/调度。若将来复用整服务，须明确关闭不使用的执行面，不只是隐藏菜单。

**Multica 原生接缝**

本地固定源码：[session.go](D:/dev/refs/multica/server/internal/auth/session.go) 20–27 明确 UI JWT 无服务端会话撤销；[plugin_mcp_transport.go](D:/dev/refs/multica/server/internal/service/plugin_mcp_transport.go) 的 AgentMCPConnections 按 workspace 安装收集连接；[plugin_mcp.go](D:/dev/refs/multica/server/internal/handler/plugin_mcp.go) 的 ResolvePluginMCPCredential 验 daemon/task/workspace 后取安装级凭据；[remote_mcp_broker.go](D:/dev/refs/multica/server/internal/daemon/remote_mcp_broker.go) 272–280 检查工具名而非资源参数授权。沿其接缝补委托/资源检查，不重写 MCP 引擎。

[renderer-web-preferences.ts](D:/dev/refs/multica/apps/desktop/src/main/renderer-web-preferences.ts) 仍 webSecurity:false 并带主 preload；[navigation-guard.ts](D:/dev/refs/multica/apps/desktop/src/main/navigation-guard.ts) 阻止外域主窗口导航。不能放宽主窗口守卫来嵌入飞书/Docmost；应验证官方组件或隔离外部内容容器。既有匿名 uploads 失败见 Multica 实验报告，禁止把知识附件复制进去绕过源站权限。

### 1.6 飞书内容主存储＋CLI/MCP：新增短路径（2026-11-06）

**已确认：**Ethan 接受文档和多维表格正文存放公司飞书租户，morchat 保留任务关联、操作审计及按策略归档的成果。此前建议优先飞书集成；新增腾讯候选后按 §1.7 先验证权限和公司接管，不再冻结提供方优先级。Docmost 保留自托管备选，smart_table 保留研究，不并行部署多套可编辑内容库。具体嵌入、CLI/MCP、写入范围与上线时间仍待验收；接受主存储不等于批准生产写入。

| 部分 | 可复用 | 适配/验证边界 |
|---|---|---|
| 文档界面 | 官方云文档组件提供第三方 Web 编辑/查看 | 核对租户权益、具体文档类型、鉴权/可信域、登录及 Electron；不外推完整知识库首页或全部多维表都可 iframe |
| CLI | 固定 larksuite/cli 05ac58ffa089fe7a171205ac1d1e97ee50196ec8；Docs/Wiki/Drive/Base 命令及官方 skills | 只保留需要的命令；不默认开放 IM/Mail/Task/Apps/权限管理/raw API，不能使飞书 Task 成为第二任务系统 |
| 企业扩展 | Credential、Transport、Restrict、Wrap、Observer 已有接缝，可 wrapper 构建，不重写 CLI | Restrict 是命令限制不是资源 ACL；Observer 不能阻断；规则按 OR 组合，统一策略 owner。还要核验文档/表/行/字段参数和授权 |
| 凭据代理 | authsidecar/多用户 demo 可参考 token 不进入工具进程的设计 | sidecar 仅同机 HTTP，明确拒绝跨机；demo 非生产且有 token 刷新等缺口，不是现成公司中央 broker |
| OpenAPI MCP | 固定 larksuite/lark-openapi-mcp 21920354ec6e3966b52e89152620c5085e496b55；工具选择、OAuth、固定 user token mode | README 仍标 Beta，并列文件上传下载/直接文档编辑限制；不能当成 CLI 能力全集 |
| 官方远程 MCP | 官方工具表列文档检索、读写与附件工具 | 与本地 OpenAPI MCP 不同；该表称云文档场景，不外推完整 Base 行字段工具。个人 MCP URL/凭据不得共用或入日志 |
| 内容权限 | 飞书文档协作者、用户/应用身份及 Base 高级权限 | 员工委托不自动改用应用身份；公司 Bot 不等于 CLI --as bot。Bot/task/设备与云模型外发权限仍需企业检查 |
| 版本与交接 | 优先原生内容历史、所有权/权限和导出接口 | 网页历史不证明 API 可固定读取每个历史版本；不可只留可变链接声称归档完成。需明确停用移交、备份、供应商不可用和权限撤销 |

**若最终选飞书，推荐接入：**优先验证官方 CLI 企业扩展，MCP 作对照，按真实编辑/文件/表格能力选择一条主写路径。Multica 已有 MCP broker 应扩展而非重写；CLI 通过企业受控工具调用。长期凭据不交通用 harness，中央可做授权/凭据注入/API 转发和审计，但不运行 Agent 模型—工具循环。仅删除 skill 或隐藏工具列表不能代替执行时强制策略。

**证据：**
- [官方嵌入方案](https://open.feishu.cn/solutions/detail/docs?lang=zh-CN)、[组件介绍](https://open.feishu.cn/document/client-docs/intro?from=op_develop_app)：存在正式组件路径，目标租户/浏览器/桌面尚未实测。
- [CLI README](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/README.md)、[扩展接口](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/extension/README.md)、[插件契约](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/extension/platform/README.md)。
- [Credential Provider](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/extension/credential/types.go)、[sidecar 协议](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/sidecar/protocol.go)、[demo 限制](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/sidecar/server-demo/README.md)。默认身份失败回退应用不能沿用到员工委托；服务端也须锁定身份，不只加客户端参数。
- [OpenAPI MCP README](https://github.com/larksuite/lark-openapi-mcp/blob/21920354ec6e3966b52e89152620c5085e496b55/README_ZH.md)、[官方远程 MCP 工具表](https://open.feishu.cn/document/mcp_open_tools/supported-tools?lang=zh-CN)：分别核验，不因 MCP 名称相同就混合功能承诺。
- [身份示例](https://open.feishu.cn/document/introduction-2?lang=zh-CN)、[Base 记录 API](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create)：需验证目标套餐与行字段权限，不能为 API 成功而授予管理员；按单文档写限制局部限流/冲突处理，不让全公司 Agent 串行排队。

部分动态官方页无法完整读取，依据可读官方页面/索引及固定源码交叉检查，实验冻结时再核对具体工具与权益。本轮未安装/登录/运行 CLI、MCP 或嵌入，未调用飞书业务 API，全部接入测试 NOT RUN。

### 1.7 企业微信、腾讯文档与 ima 对照（2026-11-06）

**结论：暂不替换飞书。最新补查与研究收口见 §1.8。**公司现用 IM 是企业微信，但 IM 选择不等于内容/API 产品已选定。新版企微 CLI 已有既有内容编辑入口，腾讯企业 SaaS 独立 OpenAPI/MCP/官方 Skill 已查实；本节此前关于 SaaS 接入未明的判断以 §1.8 更正。未实测权限不能计通过，不以 Bot 自建文档 CRUD 成功代替。此前接受飞书托管仍有效，Docmost 保留自托管备选，不同时上线多个可编辑主库。Multica 仍是唯一 task/run/调度权威。

**Ethan 已确认的验收前提：**Bot 获授权可修改，不永久降为只读；工作资产从创建起纳入公司可接管范围，个人隐私除外；撤权清理平台及受控客户端缓存、检索投影和 Bot 记忆，旧任务不得续用。公司原件/审计按权保留；不承诺擦除管理员自行复制、截图或离线设备中的副本，敏感资料禁止离线使用。完整语义见 ASSETS-AND-LEARNING §3.4，测试归 Discovery KD-01–08。

| 候选 | 已有证据与可复用部分 | 当前定位与缺口 |
|---|---|---|
| 企业微信原生文档/智能表格/知识库 | 官方 CLI Windows x64、文档链接/搜索定位后读取、追加和覆盖；原生知识库、内容权限及离职交接 | 普通应用 API 的自建限制不能套到新版 CLI。CLI 有授权真人身份入口，但其服务端动态能力和员工 ACL、撤权、交接尚未实测 |
| 腾讯文档企业版 SaaS | 独立 SaaS OpenAPI、MCP、腾讯文档团队 Skill 已查实；文件/文档权限、智能表及内容权限 API；原生离职转交与审计 | 不再记为只有 UI 或私有化 SDK。实际租户授权范围、行字段读写执行、版本冲突及撤销/交接仍未实测 |
| ima | 官网提供 OpenAPI/Skill，已读官方技能包 1.1.10；支持知识搜索/导入、原文获取、笔记读取/创建/追加 | 可做团队资料库/知识使用候选；该接口包没有证明公司组织管理、离职强制接管、成员 ACL 管理和历史版本闭环，不作为已合格公司资产主库；不是多维表格替代品 |
| 飞书、Docmost | 沿用 §1.5–1.6 已有证据 | 飞书作为对照与可接受托管选项，Docmost 为自托管备选；不同时部署多个可编辑主库 |

**企微：现成能力与硬边界。**

- [文档 API 概述](https://developer.work.weixin.qq.com/document/path/97392)（页面更新 2026-07-02）：应用仅能读取、编辑自己创建的文档；启用接口还需后台配置可调用应用。这足以否定“普通自建应用 API 经授权即可任意编辑成员既有文档”的方案，不代表所有新 CLI 路径都已被否定。
- [API 模式机器人文档说明](https://developer.work.weixin.qq.com/document/path/101468)（2026-03-13）：机器人为创建者且仅编辑自建文档，该 MCP 授权说明为 7 天。不能把这一期限套到所有 CLI 凭据；新 CLI 宣称的能力更广，与这条路径必须分开验证。新版 [CLI/MCP 授权帮助](https://open.work.weixin.qq.com/help2/pc/21676) 显示成员授权及部分能力的管理员审批，不等于任意 Bot 自动取得成员全部资料。
- [智能表格内容权限](https://open.work.weixin.qq.com/help2/pc/20821) 支持工作表/记录/字段控制；多条适用授权按较高权限生效，额外成员规则不能收窄全员已有权限。必须先收窄全员默认，再授额外权限。[内容权限 API](https://developer.work.weixin.qq.com/document/path/99935) 可管理规则，但应用能设置 ACL 不代表应用调用会按委托员工 ACL 裁剪；四类读写与派生数据均须实测。
- [离职成员数据交接](https://open.work.weixin.qq.com/help2/pc/19985) 对“我的空间”列出所有文件及满足其公开文档条件的在线文档；共享空间另走微盘离职文件转交入口，自动交给直属上级需安全高级功能。“公开文档”的准确范围还需核实，不得为交接而公开敏感资料。不得把有交接按钮外推成所有私密工作文档/知识库/附件都会自动接管。
- [原生知识库](https://open.work.weixin.qq.com/help2/pc/21754) 可迁入存量文档、按成员/部门授查看或编辑，并按权检索；创建者掌握完整权限、删除进入创建者回收站。可优先复用目录/编辑体验，但知识库本身及私密内容的离职移交、Bot API 覆盖仍需单独验。

**企微固定源码的其他风险（不是本租户实测）：**

1. 企微官方 `skills/wecomcli-smartsheet/references/smart-sheet-webhook.md` 记载：`851003/no authority` 可能对应企业可见范围超过 10 人的 CLI 写入限制；Webhook 仅兜底新增/更新，且只能更新此前经 Webhook 写入的记录，不能更新人工或普通接口创建的记录。这是特定接入路径的官方说明，不是本租户实测，也不能外推全部企微 API 都有该限制。必须验证真实企业范围及人工既有记录；不得把收到拒绝后自动换共享 Webhook 当作企业权限解决方案。
2. `wecomcli-doc-manage/SKILL.md` 声明搜索只返回当前调用者可访问文档，但这不能替代同表行/字段过滤和撤权测试。智能表格技能中的安全提示也不是服务端权限证明；该技能列明历史快照/恢复/操作日志等不在其能力范围，不代表产品 UI 没有这些功能。
3. CLI `auth/resolve.rs` 存在环境 Token 优先、否则本地凭据回退；`auth/crypto/keystore.rs` 的当前实现始终写入文件密钥，且优先读文件密钥。配置目录隔离可复用，但本地加密不等于 Agent 权限隔离，也不能保证可对抗同账号进程。禁止共享整个员工配置目录给所有 Bot；还需任务绑定、失效即拒绝、禁止静默换身份与日志脱敏。
4. SDK/API/MCP 提供工具调用，不等于可把编辑器安全嵌入 Multica。腾讯编辑器的具体 SDK、登录态、允许嵌入域名和 Electron 兼容性仍待核实；未通过时先用授权链接打开原站，不关闭浏览器安全设置强行内嵌。

**腾讯文档企业版：纠正个人 MCP 与企业产品混淆。**

- [企业 SaaS 管理员手册](https://cloud.tencent.com/document/product/1663/103165) 明确离职文档转交、共享空间超级管理员更换、企业回收站与操作审计；[SaaS 用户指南](https://cloud.tencent.com/document/product/1663/103166) 明列智能表子表、行列和字段权限。这是产品能力证据，不是 Bot/API 权限验收。
- [官方 FAQ](https://cloud.tencent.com/document/product/1663/83960) 多处将自有系统深度集成注明为私有化版本，不能据此否认 SaaS 接口；§1.8 已找到更直接的 SaaS 官方 OpenAPI/MCP 文档。仍须区分套餐、嵌入权益及真实租户的授权/写入条件；不能从个人版 MCP 或私有化 SDK 推出 SaaS 全部能力。未证明条件写入时禁止任意覆盖，不能把永久只读当目标完成。
- [OneID 数据源](https://identity.tencent.com/docs/guides/SyncConfig/) 有企微来源，但 [工作台集成](https://identity.tencent.com/docs/guides/IDPconfig/workspace/) 将企微标注为 OneID 私有化支持。组织同步不等于 SaaS 工作台免登，更不等于文档授权。管理员手册的 Agent 管理是 OneID 连接代理，不是本项目 AI 同事。

**ima：官方接入已证实，企业接管未证实。**

- 从 [官方 Agent 入口](https://ima.qq.com/agent-interface) 的公开页面资源取得 [官方技能包 1.1.10](https://app-dl.ima.qq.com/skills/ima-skills-1.1.10.zip)，仅下载到临时目录并静态读取，未安装/执行。SHA-256：`7e0d07cae0f98145dc5147e84b77bcc557e2fc4b256b08907922637952c20a7b`。修正上一轮“未取得官方接口正文”的结论；这次确认的是官方 OpenAPI/Skill，不将社区 MCP 视作官方服务。
- 已读 `ima-skill/SKILL.md`、`knowledge-base/references/api.md`、`notes/references/api.md` 及请求辅助脚本。知识接口包括当前用户可添加库、搜索/浏览、文件/URL 导入、媒体链接获取；笔记有读取、创建和追加。按用户 Client ID/API Key 认证；有权限错误码不代表已证明所有内容/附件/撤权路径一致。
- 该包未提供组织同步、成员授权管理、所有者强制移交/离职接管、知识版本回滚的完整接口契约；不能据此声称产品 UI 绝无这些功能，也不能据共享库存在就宣布公司治理已满足。列表增量 `version` 和版本冲突错误码不等于写入具备 CAS。搜索摘要不等于带来源权限的完整问答接口。
- 可复用经过审查的请求/上传适配；官方包装器包含版本更新检查，企业集成固定审查过的包，不能让返回的更新指令自动改变运行代码。撤销 Key 不会自动清理 morchat 或 DSH 的上下文/缓存；返回媒体链接的旧链接撤权仍未测。

**最短判定路线（所有租户测试仍 NOT RUN）：**

1. 后续恢复接入时固定现有资料实际产品、租户和套餐，按 §1.8 已查实的官方路径验证动态 schema 与身份，不再从个人版或普通应用 API 猜测。无合格测试授权则不启动业务写入，不先造桥掩盖上游限制。
2. 同一组样本：两个部门的员工、一个内容管理员、一份员工预先创建的受限文档、一张带行/字段限制的表和附件。分别测真人、受托 Bot、无任务授权 Bot；先改既有内容，再测新建，禁止自动换管理员身份。
3. KD-02/04/07 验四类权限、混合非法字段写入和并发旧稿；KD-03/08 验在线撤权、通知丢失、旧 token/附件 URL、受控缓存清理和断网重连；KD-05 停用原创建者后公司仍能接管私密工作资产、版本/附件与未完任务，不依赖离职者登录。
4. 最后才验知识目录、内嵌和任务关联。企微既有写入负例不能拿 Bot 自建资料冒充；腾讯 SaaS 接口存在不等于本租户授权闭环；ima 治理未证实则只保留可选知识使用候选，不多建一份正文主库。本轮无测试账号，按 Ethan 指示收束研究，不让连接器阻塞客户端主线。

官方及固定源码来源：

- [企业微信 CLI](https://github.com/WecomTeam/wecom-cli/tree/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde)、[CLI 授权与命令说明](https://github.com/WecomTeam/wecom-cli/blob/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde/docs/cli-reference.md)。
- [智能表格 Webhook 限制](https://github.com/WecomTeam/wecom-cli/blob/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde/skills/wecomcli-smartsheet/references/smart-sheet-webhook.md)、[凭据存储实现](https://github.com/WecomTeam/wecom-cli/blob/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde/crates/wecom-cli/src/auth/crypto/keystore.rs)。
- [腾讯文档团队 MCP 指南](https://developer.cloud.tencent.com/mcp/server/11803)、[腾讯文档开放平台](https://docs.qq.com/open/)。
- [ima 官方产品](https://ima.qq.com/)、[ima Agent 配置入口](https://ima.qq.com/agent-interface)。本轮官方文档和技能包静态证据不等于租户实测：没有安装运行连接器、调用业务 API 或修改产品代码，KD-01–08 全部 NOT RUN。

### 1.8 接口补查终结：官方路径已查实，租户验收保留（2026-11-06）

**本轮边界与结果：**Ethan 明确暂无企微 CLI 授权、腾讯 SaaS 测试租户/接口授权及两个测试员工账号，并要求完成官方核查后收束。检查 PATH 未找到 wecom-cli；默认配置目录不存在，仅检查存在性、没有读取秘密。未安装连接器、未发起授权、未调用业务 API、未运行合成写入或改产品代码。KD-01–08 全部 NOT RUN，缺的是合格租户验收，不是宣布产品失败。后续先做客户端交互和 Agent 协作，不继续横向寻找知识库候选。

#### 企微新版 CLI：有既有文档操作，不等于员工权限已证明

- 重新核对官方仓库 HEAD 仍为 `1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde`。[doc Skill](https://github.com/WecomTeam/wecom-cli/blob/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde/skills/wecomcli-doc/SKILL.md) 明确可从用户链接或搜索获得 docid，再读取、追加或覆盖；不是只列新建接口。智能文档另有 `smartpage blocks update`，不能把 doc、smartpage、smartsheet 混为同一种文档。
- [公共授权 Skill](https://github.com/WecomTeam/wecom-cli/blob/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde/skills/wecomcli-shared/SKILL.md) 提供扫码授权、`auth show --status` 和 `identity whoami` 获取机器人/授权真人身份。[CLI 参考](https://github.com/WecomTeam/wecom-cli/blob/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde/docs/cli-reference.md) 说明服务和方法 schema 由服务端在线下发。因此源代码有命令/用户身份路径，但不能仅凭客户端代码确认后端对所有员工既有文档的授权规则。
- [append](https://github.com/WecomTeam/wecom-cli/blob/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde/skills/wecomcli-doc/references/doc-contents-append.md) 与 [overwrite](https://github.com/WecomTeam/wecom-cli/blob/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde/skills/wecomcli-doc/references/doc-contents-overwrite.md) 已读参数未列 expected version；读取返回 version 不等于覆盖具备 CAS。覆盖和追加的并发/重复效果各自验证，默认不用覆盖演示冒充安全编辑。
- [transport backend](https://github.com/WecomTeam/wecom-cli/blob/1d48b6c9ecd1b4897c4bf728d564bfda1d62fbde/crates/wecom-cli/src/transport/backend.rs) 在特定过期码 `853004` 下可使用同源 Bot 凭据刷新并重放一次；这不是撤权绕过已被证实，但须测“过期”和“用户撤销”区别，重放前企业政策不得仍用旧授权。`cache clear` 清的是 discovery/schema 缓存，不是正文、下载文件、DSH 上下文或 Bot 记忆清理。
- **收口判断：**原来普通应用 API 的自建限制仅适用于对应路径，不能拿它否定新版 CLI；也不能从新 CLI 有编辑命令跳到“按员工权限完整可用”。后续只需恢复既有合成文档正例/只读拒写/撤销后拒读写及行字段负例，不另造 CLI。

#### 腾讯企业 SaaS：独立 OpenAPI + MCP + 官方 Skill 均存在

[SaaS 官方介绍](https://docs.qq.com/open/document/saas/) 明确面向 SaaS 企业，自建应用可操作企业用户文档数据，需在企业后台取得 Client ID/Secret；[鉴权头部](https://docs.qq.com/open/document/saas/common/api_info.html) 用 Access-Token 标识用户、Client-Id 标识应用。该证据修正 §1.7 初次研究的“SaaS 是否开放未查实”，不是私有化能力外推。

| 已读官方入口 | 直接可复用范围 | 仍需验收的边界 |
|---|---|---|
| [文件 API](https://docs.qq.com/open/document/saas/openapi/file/) | 查询/列表/搜索、修改文件信息、移动/副本/删除/恢复、图片/附件上传，导入导出/下载及异步进度 | 修改文件信息不等于修改正文；原附件、导出链接、异步任务撤销/撤权须测 |
| [文档权限 API](https://docs.qq.com/open/document/saas/openapi/permission/) | 查询用户访问权、读取和更新文件权限 | 不等于所有行字段已受限，也不能把普通编辑权限扩成权限管理权 |
| [智能表内容权限](https://docs.qq.com/open/document/saas/openapi/smartsheet/contentPermission/get_content_permission) | 工作表/字段可见可编辑、记录条件、额外成员规则的查询及对应更新 API | 读写/搜索/导出/公式的真实服务端执行、规则组合及原子拒绝仍未测 |
| [SaaS MCP](https://docs.qq.com/open/document/saas/mcp.html) | 独立账号授权后操作该账号的 SaaS 数据；公开页列基础版 100 次/天、专业版 2000 次/天（上线时重核） | 不代表全公司共享额度或完整 SLA；长期运行、撤销、生效时限与限流恢复待测 |
| [SaaS Skill](https://docs.qq.com/open/document/saas/skill.html) | 搜索/读取/编辑 Word、Excel、智能表、智能文档，知识空间及节点管理 | 不等于离职接管、版本冲突或 Bot task/device 范围已闭环 |

同时从腾讯 SkillHub 的公开接口核实 `@tencent-adm/tencent-saas-docs@1.0.35`，publisher 为认证的腾讯文档团队（腾讯科技（深圳）有限公司），不是社区转载。读取 `SKILL.md`、`references/auth.md`、`manage_references.md`、`smartsheet_references.md` 并核对目录公布 SHA-256；未执行其 setup/更新脚本。

- [官方包元数据](https://api.skillhub.tencent.com/api/v1/skills/tencent-saas-docs?namespace=tencent-adm)。`SKILL.md` SHA-256：`c36d56a14f59ec7c338d856ccf164b735890e3c722780288879e9f41e89df960`；`references/auth.md`：`3ac247eb13d07e8036020afbfdf92b7a2a1ae3d96c2c2d907dfd0b9067de8aee`。
- 官方包提供授权页面和现成 MCP 调用路线，主服务为 `https://saas.docs.qq.com/api/v6/open/agent/mcp`，Word/Excel/PPT 使用各自独立服务；实际工具以授权后的 schema 为准。OpenAPI 的 Access-Token/Client-Id 与该 Skill 的 Authorization 配置不是同一套请求头，禁止混拼社区票据示例。
- 包中 `manage.batch_query_permission` 返回文件读写权；`manage.set_privilege` 是企业内分享策略，不是行字段授权桥。其示例还存在策略编号/描述不一致，不能照搬到生产。智能表 `field_titles` 只是请求字段投影，不是安全 ACL；`update_records` 的已读参数没有条件版本，须验证并发拒绝机制。
- 包中授权/配置脚本为 bash、会配置 mcporter；现成工具协议可以复用，但本项目 Windows 原生接入不能因此引入 WSL，或让通用 harness 拿全量长期 Token。优先利用 Multica 现有 MCP 接缝，补资源/任务授权与审计；也不让包的升级指令自动改企业已审定代码。

**最终收口：**腾讯企业 SaaS 已从“接口存在性不明”提升为“有正式候选接入方式”；企微新版 CLI 已从“可能只能自建”澄清为“有既有内容操作入口，员工 ACL 待租户验证”。两者都未通过 KD，暂不替换飞书。下一阶段只保留 provider/tenant/resource/actor/delegation/task/version/审计接缝，不要求接通任何外部文档供应商才能开始客户端协作验证；不得把模拟连接器标作供应商集成成功。

## 2. Multica：唯一实施底座与源码落点

固定样本只用于可核对证据；真正开工必须在任务卡记录目标 SHA、补丁和依赖锁。以下为源码直接复用范围，不是“企业能力全部现成”。2026-11-06 三路复核后的纠偏：**整套原生产品直接使用，低保真只定义体验要求，不驱动重建页面和后台。**证据文件/行号集中在 [Multica 原生优先复核](MULTICA-BASE-EVALUATION.md#2026-11-06-原生优先复核完整产品复用不按低保真重建)。

| 模块 | 直接复用的源码/对象 | 必须适配或扩展 | 不引入 |
|---|---|---|---|
| 客户端 B02 | apps/web、apps/desktop、packages/core/views/ui；AppRail、我的工作、项目列表/看板/表格/泳道/甘特、Issue 评论、Inbox、Agent/Squad/附件整页 | 默认入口和当前授权范围、人工介入/归档与验收状态；原生 Project＋Issue 评论先验多人协作，S1-D 已确认独立群入口后补，不先造新 Chat；Web/桌面分别验收 | Paperclip 整套 UI、OMB ChatView/Store；按 v4 重建已有页面 |
| 原生任务 B02/B06 | handler/issue.go、comment.go、issue_trigger.go、issue_workflow.go、inbox.go；service/task.go；原生多目标 trigger_outcomes、队列合并、状态交接与取消 ACK | 关闭普通讨论的父回复/线程/assignee/leader 隐式回退，区分引用/Bot文本与获权交接；持久意图/根链限额及故障对账；expected_revision 非所有写入口强制 | 第二 Issue/run/工作流/收件箱/取消后台 |
| Bot/小队 B03 | handler/squad.go、agent_access.go 与原生 Agent/Skill；真人和 Agent roster；Agent Builder 配置草稿、Duplicate/CLI agent copy | project lead 可设真人，Squad leader 是 AI 协调者；Squad 不是部门 ACL。copy 会复制 invocation permission/allow-list，模板实例化必须重置或按当前政策重验；模板/实例发布与运行 pin 不完整 | 重造 Bot 配置设计器；OMB 侧栏团队分组冒充部门；PC reportsTo 冒充真人组织 |
| 执行 B05/B06 | server/internal/daemon、server/pkg/agent/dsh.go、apps/desktop/src/main/daemon-manager.ts；官方 @multica-ai/dsh-runtime | 权限域、授权设备池、断联/取消、自动检查点；保持原生 JSONL 协议 | 新 DSH 桥、PC remote adapter/Runner、OMB Host engine |
| 资料/资产 B04 | handler/file.go、storage、queries/attachment.sql；原生上传与鉴权下载 | 自动成果上传和绑定确认、私有对象和全 URL 授权、版本保留与清理/交接 | 单靠本机路径、公开 uploads、第二文档/表格引擎 |
| 身份和工具 B01 | Workspace 角色/成员、Agent Access、runtime owner/shared_with/public、task token、MCP broker；workspace_revoke 事务、WS断开、搜索/草稿清理 | 真实用户委托及部门/源资料/设备管理人交集；公司全域停用、责任交接、缓存/会话清理范围和回执；UI JWT/会话边界；工具名白名单不等于资料 ACL | 重建整套离职撤销/借机许可；共享管理员身份、公司秘密进入 custom_env |
| 模型 B08 | handler/daemon.go usage 接收、queries/task_usage.sql、原生统计 | 公司网关及限范围授权、预算预留、迟到/重试回执对账；未知不记零 | Paperclip 成本账或第二统计主账 |
| 版本/接续 B03/B07 | 原生 Skill bundle/hash/cache、run/session；repocache/local_worktree、脏状态重放/收尾自动 commit、终态报告持久重放 | 不可变发布包、实际加载、周期公司确认检查点、Git 分层/普通文件与恢复对账；现有 resolve 可能读最新普通 Skill | 把本地 commit/终态报告当公司文件保存，把 cache hash 当发布历史，把重连当跨机恢复 |
| VCS | 原生 GitHub/Forgejo/Gitea/GitLab 关联、webhook/CI 卡片、pr_auto_complete | 按验收政策配置 pr_merge_status=none（首轮建议）或 in_review；核验所有状态写入口，不依赖 prompt 保证人工验收 | 重造 Git/PR 后台、把 CI 绿或 PR merge 自动当业务验收 |
| 阶段/条件接续 B02/B06 | parent/subissue/stage、child_done/other_issue、持久 receipts/重试、wakeup 因果链与频率限制；issue_wakeup_system/condition/activity | 复核 in_review 与 barrier 闭合冲突、取消非成功、前阶段准入、固定成果版本；确保直接 @/分配也覆盖根限额/停止 | 第二阶段/依赖批次库；因单 Issue Workflow 就误判整产品没有跨任务协作 |

源码证据与已发现故障窗口见 [控制面审计](../experiments/multica-spike/control-plane-audit.md)。当前完成度：原生 Web @→DSH 文件/回复/token 已验证；自动归档未通过；匿名裸 uploads 是 P0 FAIL；Electron webSecurity:false 是发行风险。当前 C01–C08 仍 DRAFT，部门/撤权/版本/双设备门禁未通过。

### 2.1 Evose 补充报告带来的复用纠偏

2026-11-06 对读 Ethan 报告、Multica 官方资料及本节固定源码，详细证据见 [逐域对照 §7](EVOSE-PRODUCT-RESEARCH.md#7-ethan-补充报告与-multica-的逐域对照2026-11-06)。以下是复用边界修正，不新增首轮范围或运行 PASS：

- **定时计划已有 Autopilots。**不新建 cron；未来优先 create_issue 保留工作事实。run_only 离线可 skipped，旧 concurrency_policy 已删除，不能承诺原生已有通用 queue/replace/skip 重叠策略。
- **企微 IM 已有原生连接器。**后期先验证现有安装/绑定/长连接；不等于企微文档 API、公司通讯录同步或已满足租户权限。
- **Plugin V1 已有扩展基础。**issue_panel/modal、事件/计划/Agent hooks、HTTP/MCP、skill 资源可评估复用；默认关闭且不支持 sidebar_panel。小面板适合插件，核心 ACL 与执行准入不能仅靠插件 UI 补齐。
- **版本能力必须按对象区分。**plugin package 已有不可变发布版本/文件/digest 和指定版本安装；普通 skill 当前行仍可变，Bot 配置/模板的批准、生效、运行固定及回退仍需补齐。先评估复用包/版本存储，不能把包安装记录冒称运行实际加载证据。
- **共享 MCP、工具审批、secret/域限制已有基础。**沿原生连接和授权接缝补真实员工委托、资源参数与设备范围，不另造工具后台；工具清单/schema 审批不等于资料读写审批。

Evose 补充的是完整产品组织和治理需求，不是第二技术栈。公司/部门映射、当前资源授权、成果归属与验收仍为企业增量；知识库/多维表继续后接成熟服务。

### 2.2 对话组队与企业边界：已有基础先行

**实测更新：**2026-11-06 原生 API/CLI 合成实验已复现 A 直调 403、受托 Bot 修改 B 小队成功和创建归 B；单机成员并行回传成立，但最终汇总未在采集窗口闭环。详见 MULTICA-BASE-EVALUATION 合成组队节；不再仅称待测推导，也不把可复用等同权限合格。MC-01G 前置委托回归，MC-05G 先文本后资产验证；工具限制/指令影响与产品根因分开核查。

补核见 [Multica 对话组队与权限](MULTICA-BASE-EVALUATION.md#2026-11-06-对话组队leader-权限与企业能力补核)。不能把“企业差额”拆成五套从零系统：成员/角色、Agent Access（含 A2A 链首真人）、runtime 共享、离职事务与部分客户端清理、文件/skill/插件版本均有原生基础。

原生 squad CLI/API 和 Leader 协调直接复用；现有 squad 管理授权依据创建者/管理员，task token 的用户来自 runtime owner，不等于当前发起人的组队委托。补差在 B01/B03/B06 当前委托与回执，不新建团队/任务后台。OMB `team-setup-requests.ts` 的变更计划、目标 revision、回执与受条件约束的 Undo 可作为逻辑候选，依赖 Store/身份仍须替换；不直接迁入其默认 Full access 或 Chief 提权传播。Paperclip `agents:create` 动作检查及按政策审批作为设计/独立逻辑参考，不引入另一个审批服务。具体自治范围仍待契约冻结。

## 3. OpenMausBot：独立源码候选，而非第二产品

### 3.1 已有 dev 证据与候选清单

已从固定官方参考仓克隆独立开发副本，分支 `codex/openmausbot-dev-validation`，未创建 GitHub 远程 fork、未修改上游源码。当前机器上的原生 Node＋Vite＋真实服务已启动，前端/服务端类型检查与前端 build 通过；不依赖 Docker。测试报告与失败原始记录见 [OpenMausBot dev 验证](../experiments/openmausbot-spike/DEV-RESULT.md)。使用官方合成引擎，不计真实 DSH、真实模型用量、Windows 11 隔离或双设备通过。

**真实界面证据：**创建第二个 Bot 与两 Bot 群；群设置选择“仅在被提及时”后，无 @ 消息零 Bot 回复，@Cocoa 一次回复，同时 @ 两位分别一次回复；新任务线程与旧线程可切换且消息分开。此配置不是默认值，初始界面默认指定负责人回复。不能声称任何新群天然符合我们的普通讨论不唤醒规则，也不能把这三轮无循环等同全场景防风暴。

**新发现的 P0 反例：**新线程的官方合成引擎输入，实际带有另一个群任务和 Bot 私聊的近期摘要。因此“独立线程消息”不等于“模型上下文按任务隔离”。`server/recent-work.ts`已有可选 include 过滤，`server/index.ts`的 recentWorkFilter 在本次普通自托管模式返回空过滤；Team Cloud 是另一分支，本次不对它做漏洞推断。我们必须在 Multica 当前身份/任务授权下筛选摘要、检索、记忆及附件；用户/Bot 曾读过，不等于本轮获准再读。普通消息不唤醒也不代表它不会进入下一次 @ 的上下文。

| 候选 | 本次可复用判断 | 最小适配边界 |
|---|---|---|
| room-post-budget.ts | 无 import 的纯判定函数，11 项原生测试通过；适合规则/反例级提取 | 参数按公司需求评审；窗口、幂等与计数接唯一调度/持久事件，不原样搬进程内预算当分布式保证 |
| SkillRequestPreview＋shared/skill-request | 小型预览/精确内容 hash/未知答案拒绝规则；优先候选，不代表已移植 | 替换为公司资产版本/发布身份；预览通过不等于模型效果通过，不新增第二 skill 库 |
| table-data.ts | 仅依赖 PapaParse 的 CSV/TSV 解析/排序/筛选函数，7 项原生测试通过 | 借鉴成果预览；不是 Evose 式多维表数据库、在线编辑或公司知识库 |
| GroupView / ApprovalCard | 有真实界面与官方测试支撑，但依赖 Store/API、权限与多种卡片，不能原样拎走 | 学操作链与展示规则；在 Multica 现有页面和事件协议补最小交互 |
| 团队包导入导出 | HTTP 测试证明版本建议、稳定 key、脱敏、导入新实例、skill 关闭/例行暂停等行为 | 包版本不等于实例热升级或不可变运行 pin；导出默认可含记忆，内部新实例默认 Full access，均不能原样继承 |
| 追问/补充/停止与重启 | 官方合成引擎测试可验证具体协调分支，详细结果见报告 | 停当前 Bot、停本轮、停整个任务树分别定义；原地重启不等于换设备工作接续，不引入 OMB 第二 runtime |

**不改变基座选择：**保留 Multica 唯一任务/run/调度；Paperclip 仍作治理参考。OpenMausBot 提供可实测的交互与独立规则，不是安装后就获得公司部门 ACL、统一资产归档、受控版本发布或安全设备池。


### 3.2 可复制源码与只参考的分界

- **可优先评审复制的候选（尚未迁入）**：server/room-post-budget.ts；shared/skill-request.ts 与 src/components/SkillRequestPreview.tsx；src/lib/table-data.ts。先保留原测试，再接 Multica 身份、版本、事件、设计变量和持久计数。小而独立不代表无安全审核。
- **只参考操作链和测试反例**：GroupView/ApprovalCard、追问/补充/停止、Bot 入职和团队包、记忆整理、skill review。其 Store/API/runtime/发布语义耦合，当前没有获准整块复制。
- **明确不复用**：完整 ChatView/全局 Store、Host/Client 引擎、完整 importer/skill-memory 存储、默认 Full access/Everyone、全局 recent-work 上下文、个人 Cloud 资产权威。
- 核心固定 LICENSE 为 Apache-2.0；enterprise/LICENSE 独立，不能因内部使用就默认许可 enterprise 功能；迁入时保留许可/归属并审查第三方依赖。本轮未移植任何代码。

## 4. Paperclip：治理参考，不是隐藏的第二调度层

| 能力 | 当前处置 | 为何不直接搬整块 |
|---|---|---|
| 公司/组织/目标分解、审批/审计、预算面板 | 参考对象和流程，映射到 Multica 公司/部门扩展及同一 Issue/run | reportsTo 是 Agent 关系，不直接等于人类部门；原生服务依赖自己的身份和事务 |
| 预算准入/费用回执/防重 | 借鉴 service/heartbeat 和成本规则、负例 | 不能同时有 Paperclip 与 Multica 重试/取消/费用权威；B08 在同一运行域实现 |
| 指令/skill/模板版本、history/manifest/retention | 借鉴条件发布、内容引用、保留根、回滚和实际消费证据 | 源码深读已发现 GC/当前版本/回写等缺口，不是可直接接入的完整版本服务 |
| PCWS epoch/writer/parent 条件发布 | 接续算法与测试思路参考 | 有 paperrunner/sandbox 与 POSIX 约束，不列为 Windows 必装依赖；不照搬整套服务 |
| 独立校验/纯函数/测试向量 | 后续按具体任务评审候选 | **当前没有批准直接移植的 Paperclip 功能模块**；TS 服务不能无成本搬到 Go 后台 |
| 原生 UI、数据库schema、heartbeat/runner、审批/任务/版本/成本服务 | 不作为运行依赖 | 防止双账本、跨后端事务与升级绑定 |

固定 Paperclip LICENSE 为 MIT；仍需保留版权与依赖许可。源码独立性、维护成本和正确性需单独审查，不能把许可允许等同技术可移植。详细机制出处见 [Paperclip 治理参考](PAPERCLIP-BASE.md)；旧逐行审计见 历史复用审计，其中实施指令全部非规范。

## 5. 复用决策与维护规则

顺序：Multica 原生已有→同域适配/最小补丁→已审独立片段→确无现成组件才自建。每份移植卡必须列源仓/固定 SHA/文件、许可、依赖闭包、删去的权限假设、目标 owner、DTO/事务/事件替换、原测试及跨项目反例、上游同步策略。没有证据的只列候选；不因“同为 React/TS”就判组件可独立。

本期技术方向沿 Multica 原生 Web/Electron/React/TypeScript、Go API/daemon、PostgreSQL 与私有对象存储，不额外引入 Paperclip Node 服务或 OMB 状态框架。精确工具版本/新扩展目录由目标基线和任务卡冻结，不用历史实验 Node 版本覆盖上游依赖锁。平台扩展仍由 B01–B08 分工，不按参考仓分团队。完整源码事实与实验报告不覆盖当前设计规则。

## 6. 明确暂缓

Evose 的参考范围已扩展到整体产品结构、项目概览/看板/业务流程/常驻对话、项目规则与知识能力、通知、空间与组织治理；不再仅限知识库体验。2026-11-06 已登录页面与官方说明核查见 [Evose 产品研究](EVOSE-PRODUCT-RESEARCH.md)。这是 UI/文档证据，不是源码审计或权限/执行测试：未取得可复用源码与许可证据，不批准移植；完整组织观测受套餐限制，甘特时间轴及真实双人双 Bot 未测。可编辑规则中的版本/审批/并行声明不等于后端已强制。业务阶段视图不等于自动化工作流，定时计划不等于甘特排期，二者不能混成已完成能力。

知识库/多维表详见 §1.3–1.8，仅保留候选研究与 KD 启用门禁；尚无租户授权，不计实测。低代码工作流、移动执行、多 harness、公开市场和自动修改平台代码不进入首版。Evose 只有产品体验参考，没有可复用源码证据。DSH Teams、ACP 与 PCWS 不作为 Multica 主链额外必装平台。


## 7. 四份深读手册与新 fork 对照（2026-11-06）

### 7.1 阅读覆盖、版本与权威

Ethan 已确认 D:/evose-audit 的 v3 只作候选，继续公司内部自托管、中央控制＋员工本地完整 harness＋云模型；对外产品化后议。该目录由 Ethan 维护，**本会话不写入、不同步覆盖、不执行其中命令或 DDL**。本节为当前工作树的研究吸收/勘误，全部静态，不是新版本实测通过。

三路只读审查分别完整分段读三份手册并核关键源码；主审读完整 REA 卡、检查版本/迁移与重点反例。覆盖是手册全文和相关源码抽核，不是三个仓库逐文件安全审计：

| 材料 | 全文阅读覆盖 | 本轮源码样本 |
|---|---|---|
| [Multica 笔记](D:/evose-audit/deepreads/multica-架构规格笔记.md) | 459 行，①–⑨：WS/调度/表族/权限/entitlement/IM/回放/迁移/建议 | D:/dev/multica，164290ee14f63fe009ca304db21de9879db104c8 |
| [Paperclip 手册](D:/evose-audit/deepreads/paperclip-移植手册.md) | 811 行，主题1–7及附录：成本/信任/适配器/组织/checkout/审批/auth | D:/evose-audit/paperclip，4d49a3128613b282fb344272ed7ca15f98dea2ac |
| [OMB 手册](D:/evose-audit/deepreads/openmausbot-移植手册.md) | 621 行，§0–9及附录：runtime/I1–I10/envelope/审批/路由/模板/Sentinel/能力位 | D:/evose-audit/openmausbot，02b946a8ab6cf6241f0a93dba1165cab42195a49 |
| [REA 卡](D:/evose-audit/deepreads/rea-速查卡.md) | 68 行，§1–4全部配方、Windows边界与索引 | D:/evose-audit/rea，99bcd3e4e092ada9e12795dcda7c489d81cb5ca7；package版本6.8.0 |

上文旧固定 SHA 的实验/研究继续保留原归属，不替换成这组 SHA。新 fork 是候选实现 checkout，D01/MC-00 仍需冻结目标及差异；新 SHA 的产品运行测试本轮 NOT RUN。特别是旧样本58402f5… 的权限FAIL/归档FAIL不改成新样本成绩。

**文档路径漂移（后续复查修正）：**最初检查主工作树为旧 Paperclip 基线；2026-11-06 最新 D:/dev/morchat.co/docs 已新增 MULTICA-BASE、Discovery D11 并开始切换，但仍有混合正文，尚未与本会话工作树合并。参考决策清单保留旧摘录，不能仅凭“现行/定案”标题成为施工权威。新产品仓 AGENTS 只约束原生工程，不替代本项目企业契约；当前任务卡 revision 查 MINIMUM-CHAIN，不从历史摘录取值。

### 7.2 直接复用、适配、必须改与未测

| 范围 | 处置 | 真实差额与首轮归口 |
|---|---|---|
| 原生项目/Issue/Squad/混合名册/Inbox/看板甘特 | **直接复用** | 小队成员原生有 member 与 agent，Leader 当前必须 agent；真人业务负责人另有含义，不重造“人机协作容器” |
| Backend/DSH、队列、claim、取消、回放、receipt/stage | **直接复用基础** | 不是Paperclip adapter/checkout或OMB Runtime迁入目标；原生同Issue同Agent局部串行，不改成整Issue全局串行 |
| 自托管Cloud配置 | **配置适配** | MULTICA_CLOUD_URL留空有原生禁用路径，不必重写entitlement/Stripe；禁用商业门控不等于公司模型预算已实现 |
| task token 与小队管理 | **必须改业务强制点并复验** | runtime owner身份与originator委托分开；不能全局改token UserID假装修复所有语义。B01/MC-01G负责当前业务授权/归属 |
| 普通讨论与明确派工 | **必须适配原生触发和重放入口** | 原生父评论/线程/assignee可隐式唤醒；默认不执行，结构化@及登记依赖仍允许定向触发。MC-05负责 |
| 显式/兜底/晚到结果与Leader汇合 | **已有基础＋需验证的原生补丁** | 两种结果路径并不等价；不同review head阻挡时有已知持久义务缺口，复用现有queue/receipt修接缝。MC-05G负责，不建第二结果系统 |
| 追问/工具审批/停止 | **协议先验，再做薄UI适配** | DSH driver现有帧未见question/permission请求—应答闭环；要核官方bundle并证明可用接缝。卡片存在不等于能暂停/恢复本地工具。MC-04/07及OP-01–04负责 |
| 原生task_usage/rollup | **直接复用＋同域适配** | 已按task/provider/model覆盖累计快照；补公司网关、请求回执/顺序/最终态、责任归因、预算与未知费用。MC-03负责，不搬第二总账 |
| 原生成员撤销与资产基础 | **复用＋企业缺口验证** | 事务取消、运行时停用、grant清理已存在；细粒度资料撤权、真实设备停止/缓存清理/交接与自动归档仍须补验。MC-01/06及G3/G4负责 |
| Bot/skill/模板与接续 | **优先原生载体，缺口按原契约补** | 不照抄OMB importer带入旧记忆/Chief；固定版本/实际加载与周期跨机保存仍按C03/C07，不因新报告增加模板市场 |
| Paperclip/OMB UI | **仅独立小件候选／交互参考** | 完整Costs/Org/ApprovalCard依赖原Store/API/router/业务状态；沿Multica core/ui/views适配，不是“TS→TS零成本” |
| 知识表格、五通道IM、商业化、云runtime | **保留源码接缝，首轮不启用/不新增** | 不把功能已存在等同本轮有租户/权限验收；不新增积分、Stripe、外部host或云执行池 |

### 7.3 必须纠正的手册判断

**Multica：**笔记L3/421–445仍以“自研TS/SaaS照规格重写”为前提；本项目不采用。L201/444“只在in_progress claim/run绑死Issue”不准确，原生还支持Chat/无Issue路径；L269“每run都有唯一问责人类”不是当前所有路径事实。team grant保留但不匹配，不等于没有真人Squad。CHECK状态枚举不证明所有状态转换守卫。640是up文件数，最大前缀616，不是连续版本640；未来编号要按目标上游迁移规则分配，不在研究文档冻结617或641。

**Paperclip：**手册自身L172–198/245已说明预算best-effort，不能被总纲概括为绝对不超支；预留估计、未知费用与在途调用需单测。Adapter的SPEC概念不等于必须搬三个接口；原生Multica Backend/DSH已存在。requestDepth截到1024是数值饱和，不是第1025次委派被拒。Ed25519不改变bearer auth；未在Multica发现它不构成本项目必补身份系统。Paperclip反目标不是本项目宪法，不能撤回已确认的自动保存与资产接续。

**OMB：**I1–I10是有价值的测试问题，不是端到端证明：I1跳过running root，I7只重放status，I2/I3事件计数不证明外部副作用恰一次。outward缺失/失败后重跑一次不满足跨设备未知效果对账；report成功到reportedAt/wake之间有崩溃窗口。L176“在跑子保留进程”与stopRequester级联取消/abort不符。package-import的补偿删除不是数据库原子回滚，并会导入seed memory/Chief。信封是来源提示，不是授权边界；L305“own request仅1v1”与shared人类标签分支不符。Chief max权限传播、Full提前allow、lead/all/auto故障回退均不作为公司默认。

**REA：**卡片正确区分普通源码阅读与构建产物/运行证据分析；本轮无需安装/运行REA。仓内官方process-capture说明它不是沙箱、原生Windows新采集不可用，能比较既有capture不等于能启动Windows受控采集。zcode的历史doctor/229工具记录不证明当前Codex会话可调用全部工具，不自动执行setup，不把WSL替代原生Windows验收。

**DDL：**当前研究SQL实数为93条CREATE TABLE；标题后来标94也不能替代计数。其BIGINT与原生UUID、workspace/project/task/skill/usage等重叠对象须先映射；没有执行DDL，不能宣称草案语法、外键或租户隔离可用。不一次迁入，新增表与包只由当期切片差额决定。

### 7.4 可复核的最小源码证据

路径行号只适用于§7.1 SHA；这是抽核入口，不是所有相关实现的完整清单。

| 事实 | 源码落点 |
|---|---|
| 混合成员与Leader限制 | D:/dev/multica/apps/docs/content/docs/squads.mdx:23–39；server/internal/handler/squad.go:796–830 |
| owner签发→业务用户→小队管理 | D:/dev/multica/server/internal/handler/daemon.go:2501–2504；middleware/auth.go:122–144；handler/squad.go:120–124,339–350；新旧SHA的squad/auth/agent_access文件diff为空 |
| invoke与team例外 | D:/dev/multica/server/internal/handler/agent_access.go:73–132,205–238 |
| 正常评论触发与fallback差别 | D:/dev/multica/server/internal/handler/comment.go:1995,2666–2768；service/task.go:4763–4808,7811–7863；handler/daemon.go:5140–5196 |
| durable obligation静态缺口 | D:/dev/multica/server/internal/handler/daemon.go:5189–5196，日志明确comment needs a durable obligation record；不等于本轮已复现 |
| 原生领取/局部并行与撤销 | D:/dev/multica/server/pkg/db/queries/agent.sql:760–821；server/internal/handler/workspace_revoke.go:45–165,299–334 |
| 自托管不必替换Provider | D:/dev/multica/server/internal/entitlement/README.md:8–13；client.go:33–60；.env.example:234–238 |
| DSH接缝 | D:/dev/multica/server/pkg/agent/dsh.go:54–104,385–421；未见许可/追问往返帧不等于全平台不存在审批 |
| 累计快照与费用未知 | D:/dev/multica/server/pkg/db/queries/task_usage.sql:1–19；server/internal/handler/daemon.go:5489–5497,5500–5565，零值成本当前被归为NULL，未证明能区分真免费和未报告 |
| 预算预留不是封顶 | D:/evose-audit/paperclip/server/src/services/budget-reservations.ts:25–29,74–76；budgets.ts:263–275,837 |
| 不搬whole costs/trust/身份 | D:/evose-audit/paperclip/server/src/services/costs.ts:65–139；trust-preset-resolver.ts:273–350；packages/shared/src/constants.ts:225,268–270；doc/AGENT-IDENTITY.md:68 |
| UI依赖而非零成本搬运 | D:/evose-audit/paperclip/ui/src/pages/Costs.tsx:1–47；D:/evose-audit/openmausbot/src/components/ApprovalCard.tsx:1–21；D:/dev/multica/AGENTS.md |
| OMB不变量/停止/权限 | D:/evose-audit/openmausbot/server/runtime/invariants.ts:8–123；runtime.ts:575–590,655–689；level.ts:30–36；server/auto-approve.ts:110–116 |
| 模板补偿与信封限制 | D:/evose-audit/openmausbot/server/package-import.ts:352–354,452,499–510；provenance-label.ts:68–74；runtime/envelope.ts:171–181 |
| REA能力边界 | D:/evose-audit/rea/docs/process-capture.md:7–31；javascript-application-workflows.md:9–17；package.json |

### 7.5 本轮结论与下一步

必要修改集中在原生授权、触发/结果对账、DSH交互/隔离、自动归档与公司模型用量接缝；不是重写整个平台。当前明确需要改的普通评论默认唤醒和委托管理路径，与需要先实测定位的fallback汇合、DSH许可往返分开登记；新增不同review head负例，不能用一条顺利文本回传代替可靠性验证。

本次四手册复核时采用 MC-S1-r4（后续 D02 复核升 r5，见 §8，不改已确认范围）：MC-00锁新基线/fixture→MC-01/01G委托与私有资产→原生执行/公司模型前置→MC-05/05G文本汇合→MC-06与05G资产汇合→MC-07/08真实界面与独立验收。完整版本/撤权/双机接续仍依Discovery G1–G5。首轮不增卡、不加云池、商业积分、第二审批/账本/消息系统。未运行新SHA产品测试，全部C仍DRAFT。

## 8. 公司部门Workspace 映射复核（2026-11-06）

**后续决策更新：**Ethan 已确认一公司一个 Workspace、部门/资源细权，项目授权默认覆盖后续普通任务、私密单授。下述研究记录保留审查当时的推荐过程；当前政策查 ARCHITECTURE §4.1，任务卡当前为 MC-S1-r7（同仓工程准备），无模型规程为 MINIMUM-CHAIN §9（NM-ACL-r1）。确认政策不改变新 SHA 动态 NOT RUN 或旧版本 FAIL。

本次三路只读审查分别核新 fork 原生 ACL、最新参考/主目录文档差额、四类角色场景；主审抽核 SQL、WS、附件及官方文档。范围是与组织映射有关的路径，不是全仓安全审计。源码固定 D:/dev/multica@164290ee14f63fe009ca304db21de9879db104c8；新版本动态验证 NOT RUN，旧版本 FAIL 不覆盖。推荐正文在 ARCHITECTURE §4.1，走查在 PRODUCT-EXPERIENCE §4.3；任务卡更新为 MC-S1-r5，不扩大原产品范围。

### 8.1 官方说明与固定源码事实

[官方 Workspace](https://multica.ai/docs/zh/workspaces) 说明其为成员、任务、项目、Agent 等对象的最上层边界，且 workspace context 提供给区内 Agent；[成员权限](https://multica.ai/docs/zh/members-roles) 区分管理角色与日常协作、Bot 调用权；[Squad](https://multica.ai/docs/zh/squads) 说明真人/Agent 混合成员、Agent Leader 和角色说明不授权限。2026-11-06 已在线复读，不能由这些概念推出部门/私密资源 ACL。

以下路径相对 D:/dev/multica，行号仅适用上述 SHA：

| 核查结论 | 证据入口 | 复用/差额 |
|---|---|---|
| Project 列表/详情按 workspace，普通会员更新没有项目只读边界 | server/pkg/db/queries/project.sql:1–10,59–67；server/internal/handler/project.go:506–541 | 原生对象/查询保留；补资源判权及过滤统计，不用 project lead 当 ACL |
| Issue 加载按 workspace；Squad 全区可见，creator/admin 管理 | server/internal/handler/handler.go:1077–1115；squad.go:114–141 | 部门不是 Squad；不把创建人/指派人/订阅人等同完整读者集 |
| 个人 Chat 有 creator 检查，Agent invoke 与 Runtime 分享已有基础 | handler/chat.go:252–296；agent_access.go:14–132；queries/runtime.sql:11–17 | 复用，不把 private Agent/Chat/Runtime 误作私密多人项目 |
| 搜索同步包含全区 Issue/评论/项目和数量、文本量 | handler/search_index.go:278–314；queries/search_index.sql:11–59；packages/core/search-index/store.ts:62–63,174–176,216–222 | 必须同步改 manifest/snapshot/changes、IndexedDB 和撤权；过滤搜索 UI 不足 |
| Issue task 的 WS scope 对同区会员开放；Chat scope 单 creator | server/cmd/server/scope_authorizer.go:47–113；internal/realtime/hub.go:798–832 | 订阅及广播受众要用同一资源 ACL，连接有认证不等于内容有授权 |
| 附件下载检查 workspace 会员，未见所属 Chat creator/Issue ACL；本地裸 uploads 直接 ServeFile | handler/file.go:814–847,977–985；cmd/server/router.go:1531–1538 | 新 SHA 静态风险；旧匿名下载 FAIL 未解除，不声称新版本已动态复现。注释中的 canReadWorkspaceUpload 不是实际门禁 |
| 移除 workspace 成员已有事务、令牌/grant/运行收敛、断联及客户端清索引 | handler/workspace_revoke.go:15–263；workspace.go:763–766；packages/core/realtime/use-realtime-sync.ts:1425–1437 | 复用基础，补资源级撤权、在途上下文、设备停止/清理回执和资产交接，不从零重做离职系统 |
| daemon 可发现多个区，runtime 仍按区注册 | handler/daemon_workspace.go:23–28；queries/runtime.sql:67–99 | 部门分区不必一部门一进程，但仍拆开授权/Bot/任务域，不能宣称跨区同一 Bot 已原生可用 |

### 8.2 对更新参考的吸收与不采纳

- **吸收更新：**D:/evose-audit/README、总纲和部署图已对齐内部自托管/本地 harness；研究 SQL 已降为非迁移参考。D:/dev/morchat.co/docs 已启动 Multica 切换、新增 MULTICA-BASE 和 D11，不能继续写“完全未更新”。本工作树只吸收事实，不写这两个目录，也不声称已经合并。
- **消除编号冲突：**外部 MULTICA-BASE::MC-01–20 是门禁；本树 MINIMUM-CHAIN::MC-00–08/01G/05G 是任务卡。保留本树 PC 历史编号，由 MC-00 做逐项映射，不能批量改名或把外部“全部 NOT RUN”覆盖旧真实 FAIL。
- **不接收零改造承诺：**“中央协调＋本地执行”方向一致，不证明执行核无需适配。企业委托、资料资格、Windows 隔离、公司网关和 DSH 许可往返仍须逐项核验；Codex/OMB 的审批模式不证明 DSH driver 有相同能力。
- **不从零造治理：**“五件套四家全空白”过度绝对；原生撤销、用量、Squad 和 Paperclip 已有审批/审计等基础应复用，欠缺的是符合本公司约束的完整链。Paperclip 汇报树不是内容 ACL，OMB 工具审批级别也不是资料授权。
- **只取必要授权语义：**参考中的动作/来源矩阵、申请审批、依赖授权适合核对遗漏；不直接照搬多层角色合并或 dependency grant。普通部门/项目授权不能覆盖私密限制，依赖不能自动放大受众，所有授权/委托从可信身份及服务端资源关系计算，不信任客户端 X-Corp/X-Workspace 自报。
- **不扩范围：**首轮只补现有对象的组织关系/最小授权及相关强制点，不落整份研究 DDL、不固定未来迁移号、不造通用权限平台、多区编排或商业 SaaS 控制台。
