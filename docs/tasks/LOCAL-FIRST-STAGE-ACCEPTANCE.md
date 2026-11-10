---
purpose: "本地第一阶段实机验收（2026-11-09）"
owner: task-owners
status: current
updated: 2026-11-09
related: []
---
# 本地第一阶段实机验收（2026-11-09）

执行者/root（model unknown）；源码作者supabase_login_impl（configured gpt-6.1-sol high）；独审supabase_auth_review（configured gpt-6-astra high）。

## 实际通过
- user Goal面板已更新为当前三阶段目标并active，权威摘要CURRENT-GOAL.md。
- Supabase邮箱密码接入已独审：SUPABASE-LOGIN-REVIEW.md 原HOLD的登录CSRF已TDD最小修复并复审APPROVED。代码无邮箱自动合并，稳定project+subject映射，外部会话上限1小时且不续期，PAT/MAT/CSRF保留。
- author core151/sharedLogin42/webShell7、Gofocused及类型检查通过；后端/前端实际Docker构建成功。修复后端重新构建成功。部署仅morchat-local-demo本地项目，原本地DATABASE_URL未改，新身份映射迁移仅在本地执行。迁移前备份存私有运行目录before-supabase.sql。
- 三服务running；GET /auth/supabase/config enabled=true且orange固定URL；health ok。非JSON登录实测415/无Set-Cookie。未改共享Supabase表/权限/密码，无service_role。
- Ethan本人在浏览器输入原账号密码并回复“已登录并进入工作区”。随后实际浏览器显示 /titan-868o/issues 已登录工作区，不是mock。
- 原浏览页由用户继续使用，另开同会话测试页，未修改已有对象。
- 浏览器实际新建项目“本地验收测试-20261109”：
  http://localhost:3000/titan-868o/projects/fd14fa14-e4b8-4828-b3cc-35cbd5a71dbf
- 在该项目手动新建任务TITA-2“验收测试：Supabase登录后创建任务”：
  http://localhost:3000/titan-868o/issues/01a1bf47-2f47-7d26-9192-13db2a468350
- 页面显示创建成功；reload后等待异步回读完成，项目和TITA-2仍存在，项目任务数1。使用手动模式，不创建智能体，不触发模型。
- 密码未在聊天收集，账号密码只由Ethan在页面输入。本验收文件不含密码/token/email。

## 未完成范围
只完成第一阶段“本机能登录、进入工作区、创建项目与任务”。不等于总Goal完成。
第二阶段：Auth/启动精确写集尚未白名单提交，main用户改动和旧树未动；WORKTREE-STATUS.md已梳理2trees/3branches，待安全提交/后续逐路径整合方案。
第三阶段企业权限全量/WindowsDSH/模型用量/Leader/版本撤权保存/双设备仍未验收。真实模型费用尚未授权，不扩大验证工具。

## 当前运行
http://localhost:3000/login 已为密码登录，不再依赖本地邮件验证码。
配置 E:\CodexData\morchat-r1-local\run\multica-local-demo\compose.yml（随机私有凭据不可提交）。
Docker镜像frontend来自构建session10150 terminal0/dadbf3；后端最终session3624 terminal0/ad1078；部署aba3db，localDB表存在与415/noCookie/health验证0e0f64。
源码review最终SHA d9dcd03b281399000d0a1a155675b0e96b233e010a6f745c973726e3742423e5。
## 实机复查更正：任务详情链未通过（2026-11-09）
此前记录准确证明真人登录、工作区、项目创建、任务创建和列表刷新回读；没有证明单条任务详情。因此不应据此将第一阶段全部关闭。
Root后续浏览器只读复查：项目板上TITA-2仍存在，点击详情 /titan-868o/issues/01a1bf47-2f47-7d26-9192-13db2a468350 后UI显示“未找到该任务/不存在或已删除”。这是实际产品缺口，第一阶段详情查看验收重新打开（底层HTTP状态/原因待只读诊断，不能只凭UI定论）。
原COLLABORATION-NEXT已静态提示自然创建未写ACL policy风险，现需真实本地元数据确认。Root让原business owner仅只读查询自己创建的标记测试项目/任务与policy，提出最小修复。旧issue/source_context/generatedmodels等用户WIP不能擅动，不能凭creator放松权限或直接给policy造PASS；若必须修改dirty文件先明确最小hunk和备份方式，再请用户确认。
当前部署仍正常，登录安全修复已审并提交dc8fe73，启动配置已审并提交51e23d9，索引0。此缺口与Supabase密码校验不同，未再次收集密码或触发模型；不会用已提交/组件测试来代替详情业务成功。整个Goal继续，下一优先修可用性，再企业权限扩展。
## 已审提交运行基线修复任务详情（2026-11-09）
独审确认可用已提交原生权限基线，而非改creator绕过或给半成品补policy。切换前只读确认本地六ACL表全部0；候选所需642迁移与实际642账本完全匹配，pending0，无down/reset。
Root git archive 51e23d9仅作为私有标准Docker构建输入，不创建新仓/工作树、不恢复迁移、不反写原树；未提交issue/readguard/resource_access/generatedModels全部保留但不再进入运行镜像。新镜像committed-51e23d9前后端build62915 terminal0/cbb8e8。配置、数据库卷、JWT密钥和会话保持；切换cbd973三服务running/healthok，不将原生权限当企业部门ACL已实现。
实际UI回归：旧TITA-2详情从“未找到任务”恢复为正常标题/属性/创建动态；新建手动TITA-3“提交版回归：创建后可打开详情”，UUID01a1bf62-50e2-735e-b6bb-a313bab62aa6，立即打开和reload后完整详情均通过。项目fd14fa14-e4b8-4828-b3cc-35cbd5a71dbf内2个标记任务，未修改已有用户对象、无Bot/model。此前阶段1仅列表证明的缺口现以真实详情回读关闭，FAIL历史仍保留。
Desktop尚未运行，Web运行不当Desktop/harness通过。实际owner desktop_dev_run正从同已审export源，在私有上下文安装固定pnpm10.28.2/Desktop依赖，准备原生dev链、VITE_API_URL本地8080、app suffix和独立HOME/USERPROFILE，保护现有~/.multica。没有触发真实模型/DSH任务，用户模型预算未批。