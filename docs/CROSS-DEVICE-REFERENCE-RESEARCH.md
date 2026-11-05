# 跨设备协作与工作空间接续：参考项目证据

> 核查日期：2026-11-04。三路 subagent 分别研究 OpenMausBot、GitHub 分布式派工、文件/会话持久化；主审补读 Paperclip 核心源码并抽查关键结论。仅官方文档和固定源码静态核验，没有安装、运行、fork、实测跨机恢复或修改参考仓库。源码中的测试文件存在不等于本轮测试通过。
>
> 用户本轮写 openmusebot；公开搜索未确认另一个相关项目，本文沿用此前明确参考的 milind-soni/OpenMausBot，不擅自当作新项目。方案见 [任务与工作空间接续](D:/dev/morchat.co/docs/WORKSPACE-CONTINUITY.md)。

## 1. 研究问题与判定

必须分开：①跨设备查看/远控同一 host；②独立机器执行不同子任务；③文件副本同步；④原机不可用后从完整已确认版本继续未完成任务；⑤外部效果和权限在接手后仍正确。前几项成立不推出最后两项。

**结论：已有项目真正在做分布式派工，不必从零发明；Paperclip 的持久工作空间能力也比“任务看板”丰富。但本次没有确认一个项目可以原样覆盖我们的企业权限、员工本地完整 harness、公司 Key、非代码资产及安全异机接手全链路。** 未发现能力仅限已核查路径，不是证明仓库所有分支或未来版本永远没有。

| 项目 | 固定提交 | 已见核心能力 | 推荐位置 |
|---|---|---|---|
| Paperclip | 40ea7a9b8994e9bdb3d13794b5847388be0f7a92 | 任务/run、隔离 workspace、远程快照/恢复、提交代次、Agent 文件持久化 | 首选内核，优先适配原生文件基础，不重新堆一套任务库 |
| OpenMausBot | 597e70d7930db632747acfb4ea047ca520bd958c | 群委派、桌面本地引擎、离线文件副本和回写冲突保留 | 桌面/文件组件参考，不作为员工池故障接续整体底座 |
| Horde | 601b563bef8f0d9c1744342d838591c0b4ecb8b7 | 真正远端 worker 派工、worktree、子任务结果验收 | 最贴近设备池/分工协议的新增参考 |
| Code Coordinator | fee7824b71e45e1f8a11cbd3c2fc8a62bb7dfbc6 | GitHub issue→指定 worker→分支/worktree→PR | 开发任务交付模式参考，非产品源码底座 |
| OpenHands SDK | e1896aaf78878cc6e0bc1ab134981d51387ed2d6 | 会话事件冷加载、Git binary diff、目录归档 | 文件适配器备选与恢复反例 |
| Entire CLI | 5db73ffc6bb25d6f74b4204bd7f99a5a545cef3d | commit 与会话/checkpoint 追溯 | 证据关联参考，不作工作区同步器 |
| Happy | 9ed5bab6339041e241b8838ed10171aaef917501 | 设备 daemon、远端查看/会话恢复入口 | 远控体验与重连参考，不作文件迁移器 |
| Vibe Kanban | 08064e043c2d78ad123b473257ed867e7ce74768 | 本地多 worktree、差异审阅、远控 relay | UX/旧架构对照，不新增托管依赖 |

## 2. Paperclip：优先复用，但必须区分两条文件路径

### 2.1 项目工作空间已有真正的快照机制

官方工作空间文档明确是按任务运行隔离的目录/分支，并仍标为实验功能；跨 heartbeat 保留不等于原机物理丢失后自动完整恢复。[官方 workspaces](https://docs.paperclip.ing/guides/projects-workflow/workspaces/)

固定源码证据：

- [remote-workspace-snapshot-archive.ts L186–242](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspace-snapshot-archive.ts#L186-L242)：构造可移植归档，复制 Git refs/对象及所选 worktree 的 HEAD/index，独立化借用对象；不只是 git archive HEAD。普通文件逐项哈希，必要 Git 配置白名单化，不携带 hooks/credential helpers；[L108–120](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspace-snapshot-archive.ts#L108-L120) 拒绝进行中的 rebase/merge 等操作，不能宣称任何 Git 状态无损迁移。
- [remote-workspace-snapshot-storage.ts L99–152](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspace-snapshot-storage.ts#L99-L152)：已有上传状态、丢回执后核验已有对象、摘要校验、归档加密和作用域绑定。
- [remote-workspaces.ts L553–595](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspaces.ts#L553-L595)：先捕获/上传，再在事务中校验 epoch、writerRunId、父 snapshot；更新 committed、workspace 指针、run 引用和审计。**这正是“内容先保存，指针后生效”的可复用基础。**
- [迁移 L36–107](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspace-migration.ts#L36-L107) 检查任务绑定、活动执行、未决回写、租约、运行服务；[L160–199](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspace-migration.ts#L160-L199) 下载恢复验证并再检源摘要，之后迁到 cloud_sandbox 权威模式。

**适配缺口：**[入口 L62–73](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspaces.ts#L62-L73) 限定 paperclip_runner＋sandbox 环境，[存储前提 L102–116](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspaces.ts#L102-L116) 要求共享对象存储、外部数据库与稳定加密材料；[准备 L319–340](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspaces.ts#L319-L340) 旧 allocation 仍 dirty 时拒绝替换。不能仅打开开关就声称员工设备池、动态授权/非代码交付、硬断电后安全新尝试已覆盖。应复用存储/发布契约，适配员工节点 transport 与企业政策，不把云 sandbox 变成服务器默认 harness。

归档复制所有 refs 的做法还需企业 ACL 审查：一个 worktree 可见内容不代表接手人有权看仓库全部分支历史。原生归档的排除规则不是我们的隐私策略，不能直接镜像员工任意仓库。

### 2.2 Agent 文件目录不能直接当多人项目正式盘

[agent-file-durability.ts L141–199](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/agent-file-durability.ts#L141-L199) 已有共享对象存储、不可变内容哈希、代次指针；入口需启用相应持久化配置，且受单文件/目录额度约束。[agent-directory-working-copies.ts L403–448](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/agent-directory-working-copies.ts#L403-L448) 有增量保存及失败时不谎称保存。

但 [采集器 L117–122](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/scripts/agent-file-checkpoint.mjs#L117-L122) 明确只是逐文件检查，不是任意活动写者的原子目录快照；[store.apply L269–287](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/agent-file-store.ts#L269-L287) 对并发修改同文件采用 last-sync-wins。**这与企业项目禁止静默覆盖的要求冲突，不能不加区分地照搬。**

## 3. OpenMausBot：确有离线文件，不等于完整任务交接

应纠正“只有远程聊天”的过度简化：

- [官方 Files L20–43](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/files.md#L20-L43) 确认 My Cloud 可以读取原机离线前已复制的借用文件夹，显示新鲜度；获编辑授权的更改暂存，原机回连再写回。该路径仅 owner 自己的会话，原机仍为目录权威；终端/屏幕/应用仍需原机在线。
- [cloud-sync.ts L141–197](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/cloud-sync.ts#L141-L197) 有逐文件分块续传、哈希/大小校验及提交回执；[lent-staged.mjs L46–100](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/electron/lent-staged.mjs#L46-L100) 无冲突原位替换，有冲突保留两份，不是三方合并。
- [Git 识别 L29–48](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/electron/lent-git.mjs#L29-L48) 针对自身 .git 目录和 GitHub origin；[clone L57–78](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/lent-clone.ts#L57-L78) 请求的本地 commit 不在远端时回退远端分支，再由文件同步覆盖。工作字节不等于本地未推 commit/index/stash 全部语义。文档甚至举 .env 随文件规则传输为例，不能照搬为公司默认同步范围。
- [房间委派](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/verification/room-coordination.md#L200-L252) 有派工、等待、子会话与结果卡；[runtime L77–120](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/runtime/runtime.ts#L77-L120) 重启重整事件状态，不把所有已知外部动作盲重放。这不能替代动作成功但回执未存时的端到端核对。
- [迁移 L119–127](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/cloud-send-chats.ts#L119-L127) 剥除运行状态/恢复游标；[备份 L48–57](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/workspace-backup.ts#L48-L57) 排除外部项目目录和活动执行。未见一份绑定任务版本、全部工作文件与效果回执的完整跨机恢复包。

结论：文件传输、新鲜度、冲突保留和委派交互可优先参考；My Cloud 常驻执行和原机目录权威不是我们的方案。Team Cloud 私聊离职删除/备份排除策略也不符合“公司工作资产默认留存但独立授权”；详见 [离职处理](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/host/team-member-left.ts#L59-L115)。

## 4. Horde：新增参考中最贴近跨设备分工

[gethamster/horde](https://github.com/gethamster/horde) 并非仅遥控原机。

- [placement L82–174](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/src/federation/placement.rs#L82-L174) 按在线/新鲜度、空槽、能力和项目授权筛远端并登记派发；[RPC L786–846](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/src/federation.rs#L786-L846) 传任务/源码、轮询和回收成功快照。
- [git.rs L339–383](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/src/git.rs#L339-L383) 每个 worker 独立分支/worktree；[结果导入 L919–985](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/src/federation.rs#L919-L985) 限同仓、直接子任务并校验 hash/base，cherry-pick 冲突停止，父验收后确认。这支持“分工执行＋受控汇合”而非共享一个进程。
- **关键限制**：[归档 L108–147](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/src/federation/archive.rs#L108-L147) 只取 Git HEAD；[官方委派 L91–117](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/docs/delegation.md#L91-L117) 明说掉线等待、远端任务不能恢复为本地工作；[重启 L33–57](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/src/runtime.rs#L33-L57) 标记 uncertain/blocked。

借设备注册、路由、授权和子结果验收，不部署其 controller 取代/并列 Paperclip。每 worker 自有 provider 凭据不能直接满足公司中央 Key；[项目授权例外](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/src/projects.rs#L298-L337) 不照搬。[当前安装支持](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/docs/installing.md#L1-L12) 仅列 macOS/Linux，不能许诺其原生组件直接覆盖 Windows 员工端。

## 5. Code Coordinator：issue 分工与 PR 汇合，不是企业权限层

[JDonaghy/code-coordinator](https://github.com/JDonaghy/code-coordinator)：[claim L45–95](https://github.com/JDonaghy/code-coordinator/blob/fee7824b71e45e1f8a11cbd3c2fc8a62bb7dfbc6/coord/claim.py#L45-L95) 按 repo＋issue 查询活跃任务/分支；[dispatch L1530–1565](https://github.com/JDonaghy/code-coordinator/blob/fee7824b71e45e1f8a11cbd3c2fc8a62bb7dfbc6/coord/dispatch.py#L1530-L1565) 发给指定机器；[agent L9893–9952](https://github.com/JDonaghy/code-coordinator/blob/fee7824b71e45e1f8a11cbd3c2fc8a62bb7dfbc6/coord/agent.py#L9893-L9952) 机器建立 worktree 或从已推分支续做。结束/回收时 [WIP commit＋push](https://github.com/JDonaghy/code-coordinator/blob/fee7824b71e45e1f8a11cbd3c2fc8a62bb7dfbc6/coord/agent.py#L10011-L10038) 可抢救尚存原机的改动，但硬断电前没推送的内容不会凭空到别机。

查询防重复不等于已证实的跨节点强租约；[worker API](https://github.com/JDonaghy/code-coordinator/blob/fee7824b71e45e1f8a11cbd3c2fc8a62bb7dfbc6/docs/ARCHITECTURE.md#L67-L81) 信任 tailnet、无应用认证，不替代部门/人/Agent 权限。仅借 issue→候选分支→测试/PR/集成门禁的工作方法，不引入其身份、凭据或任务权威。

## 6. 其他三个恢复模块与一个远控对照

### OpenHands SDK

[Git 导出](https://github.com/OpenHands/software-agent-sdk/blob/e1896aaf78878cc6e0bc1ab134981d51387ed2d6/openhands-agent-server/openhands/agent_server/file_router.py#L410-L473) 使用临时 index＋binary diff，可带修改/删除/非忽略 untracked 和二进制，但不保留原 index 的 staged/unstaged 区分；[tar 导出](https://github.com/OpenHands/software-agent-sdk/blob/e1896aaf78878cc6e0bc1ab134981d51387ed2d6/openhands-agent-server/openhands/agent_server/file_router.py#L629-L700) 逐文件收集，跳过链接及采集中消失/截断文件，不是与会话同一保存截面。[会话 fork](https://github.com/OpenHands/software-agent-sdk/blob/e1896aaf78878cc6e0bc1ab134981d51387ed2d6/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py#L922-L952) 复用原 workspace，不是历史工作树回滚。

具体风险：恢复会 [重执行未配对的 action](https://github.com/OpenHands/software-agent-sdk/blob/e1896aaf78878cc6e0bc1ab134981d51387ed2d6/openhands-sdk/openhands/sdk/agent/agent.py#L747-L755)，而 [工具执行先于 observation 构造](https://github.com/OpenHands/software-agent-sdk/blob/e1896aaf78878cc6e0bc1ab134981d51387ed2d6/openhands-sdk/openhands/sdk/agent/agent.py#L1572-L1608)。由此推导：若工具成功后进程崩溃且结果尚未持久化，通用会话恢复可能重复效果；工具自身若有可靠幂等另论。这是静态反例，不是已跑出的故障。

### Entire CLI

[当前架构](https://github.com/entireio/cli/blob/5db73ffc6bb25d6f74b4204bd7f99a5a545cef3d/docs/architecture/sessions-and-checkpoints.md#L53-L62) 把提交 checkpoint 关联 commit、元数据和脱敏轨迹；[resume](https://github.com/entireio/cli/blob/5db73ffc6bb25d6f74b4204bd7f99a5a545cef3d/cmd/entire/cli/resume.go#L899-L921) 当前只恢复日志。不能把未提交态的路径/blob 哈希或 checkpoint 标记当已保存工作字节。借追溯和脱敏，不当恢复系统。

### Happy

[恢复入口](https://github.com/slopus/happy/blob/9ed5bab6339041e241b8838ed10171aaef917501/packages/happy-cli/src/resume/handleResumeCommand.ts#L53-L88) 使用原生 session ID 和 metadata.path；[daemon L827–852](https://github.com/slopus/happy/blob/9ed5bab6339041e241b8838ed10171aaef917501/packages/happy-cli/src/daemon/run.ts#L827-L852) 检查已有 cwd 再启动，不同步该目录内容。能从另一屏幕操作不等于执行节点可替换。[删设备保留历史](https://github.com/slopus/happy/blob/9ed5bab6339041e241b8838ed10171aaef917501/packages/happy-server/sources/app/api/routes/machinesRoutes.ts#L198-L235) 也不能当作公司按任务撤权/资产交接。

### Vibe Kanban

[中央 workspace](https://github.com/BloopAI/vibe-kanban/blob/08064e043c2d78ad123b473257ed867e7ce74768/crates/remote/src/routes/workspaces.rs#L65-L98) 存本地 ID/owner/issue/改动计数；[relay](https://github.com/BloopAI/vibe-kanban/blob/08064e043c2d78ad123b473257ed867e7ce74768/crates/relay-tunnel/src/server_bin/routes/path_routes.rs#L134-L146) 找指定在线 host，不在线返回错误，不自动换执行机。固定版本 [项目入口](https://github.com/BloopAI/vibe-kanban/blob/08064e043c2d78ad123b473257ed867e7ce74768/packages/web-core/src/pages/kanban/ProjectKanban.tsx#L106-L114) 已进入 SunsetPage；[官方公告](https://www.vibekanban.com/blog/shutdown) 说明托管协作关闭。保留 worktree/diff/review UX 参考，不把其托管服务列进依赖。

## 7. 许可初筛与直接复用的含义

“可复用”这里只表示值得做独立模块适配验证，不表示已经拿到所有商业授权或无需保留声明：

- Paperclip、[OpenHands SDK](https://github.com/OpenHands/software-agent-sdk/blob/e1896aaf78878cc6e0bc1ab134981d51387ed2d6/LICENSE)、[Entire](https://github.com/entireio/cli/blob/5db73ffc6bb25d6f74b4204bd7f99a5a545cef3d/LICENSE)、[Happy](https://github.com/slopus/happy/blob/9ed5bab6339041e241b8838ed10171aaef917501/LICENSE) 根许可为 MIT；[Paperclip 许可](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/LICENSE)。
- [Horde](https://github.com/gethamster/horde/blob/601b563bef8f0d9c1744342d838591c0b4ecb8b7/LICENSE)、[Vibe Kanban](https://github.com/BloopAI/vibe-kanban/blob/08064e043c2d78ad123b473257ed867e7ce74768/LICENSE) 根许可为 Apache-2.0。
- OpenMausBot 核心与 enterprise 不同：[许可总览](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/LICENSING.md)、[企业目录条款](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/enterprise/LICENSE)。企业生产、第三方托管/白标不可当作 Apache 核心自由复用。
- Code Coordinator 的 [FSL-1.1-MIT](https://github.com/JDonaghy/code-coordinator/blob/fee7824b71e45e1f8a11cbd3c2fc8a62bb7dfbc6/LICENSE#L23-L52) 有竞品使用限制及延后转换规则；我们保留产品化方向，因此只参考设计，不纳入源码底座。

这是固定文件的工程初筛，不是法律意见；引入前还须检查所选目录、第三方依赖、品牌、服务/API 条款及版本变动。

## 8. 本轮证伪结果与下一步

已被源码边界否定的过强假设：

1. “OpenMausBot 没有任何离线文件方案”——不对，它有文件副本，但不是企业任务整体交接。
2. “Paperclip 只管 issue，工作空间保存需要完全自建”——不对，它已有较完整快照、恢复和发布基础；具体员工节点接入仍待验证。
3. “远控/会话 resume/worktree 等于异机接续”——不对，文件内容、效果、权限和发布边界各自缺一不可。
4. “找一个分布式 Agent 项目 fork 就解决所有问题”——本次找到的最贴近项目也各有明确边界，不能用同类产品存在代替我们的组合测试。

未被实证确认：候选组合在两台员工设备断电/分区、重复提交、混合 Git/二进制文件与权限变化下满足全部企业契约。下一步应先评审设计，再授权小范围 P0 实验；具体反例和成功判据为 [WC-01–12](D:/dev/morchat.co/docs/WORKSPACE-CONTINUITY.md) 与 [DC-01–08](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md)。不增加完整参考产品运行依赖，不提前开工作流平台建设。

## 9. 2026-11-05 原生系统补充核查

新增 [原生运行与 Harness 核查](D:/dev/morchat.co/docs/NATIVE-RUNTIME-RESEARCH.md)：Paperclip 直接 Codex 启动存在，但 Windows 发布/整树终止/指定工具 IPC、通用隔离与 snapshot transport 有缺口；OpenMausBot 有 Windows/macOS 原生安装和 Codex/DeepSeek driver，可复用模块但不整体搬后台。DeepSeek Harness 官方样本 fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159 按最新多模型方向作为优先验证候选（未定选），原生 Windows ACL 写限制不能外推为读/网络隔离。

本补充不改变此前固定样本证据，不声称任何运行实验通过；最新以两台 Windows 11 x64 原生双向 NG/DV 方案为准，Mac 只预备平台接口、不阻塞首轮；这取代上一版 Win/Mac 必须同轮验证的安排，仍不使用 VM/WSL/Docker 代替员工原生环境。
