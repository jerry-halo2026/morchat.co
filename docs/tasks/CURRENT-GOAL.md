---
purpose: "当前确认目标（Ethan，2026-11-09）"
owner: task-owners
status: current
updated: 2026-11-09
related: []
---
# 当前确认目标（Ethan，2026-11-09）
以现有 Multica 唯一底座，先交付本机可登录、可操作版本，再补原定企业功能。
当前工作树 E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co，codex/round1-continuous；D:\dev\morchat.co/main 用户改动不动，不迁移导入重做。

## 第一阶段：现有版本真正可用
保持已运行Web/API/独立Postgres。orange Supabase Auth使用已有邮箱密码，不靠邮件验证码、不重新注册。用户在浏览器真实登录、进入工作区、查看/创建项目和任务；mock不冒充真人验收。
只复用Supabase认证，业务库暂时本地隔离；不把Multica迁移跑到共用库，不读取密码哈希/service_role，不在聊天索要密码。

## 第二阶段：分支和工作树收束
已核2registeredworktrees/3branches；旧mc00共同祖先无独有提交，不重复merge。
保留main千川业务、全部用户未提交内容和round1WIP。启动/登录成果独审后白名单本地提交。main合流前逐路径冲突、保留和回归方案明确后再确认，不盲合、不删树、不stash/reset。

## 第三阶段：企业目标保留
多人原生任务协作与企业权限；@Bot→Windows完整DSH→进度→自动归档与真实用量；Leader组队回传汇总、版本撤权、自动保存和双设备接续。同一最终候选实机集成验收前，总Goal不完成。

## 约束
不扩建辅助验证框架作为启动/登录前置，保留必要TDD、安全负例和独审。
不覆盖用户改动、不push/生产部署/真实业务资料。真实模型先确认配置、型号、预算和上限。
按实际功能/运行结果/阻塞汇报并保留FAIL/NOTRUN。第一阶段完成不等于整个Goal完成。
用户已在Goal面板确认本版并恢复active；当前第一项只做Supabase密码登录→工作区→项目→任务。旧探针/编译配方不续跑。