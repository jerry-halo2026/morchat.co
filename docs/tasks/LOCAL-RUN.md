---
purpose: "当前源码本机运行（2026-11-09）"
owner: task-owners
status: current
updated: 2026-11-09
related: []
---
# 当前源码本机运行（2026-11-09）
Web：http://localhost:3000/login
API健康：http://localhost:8080/health

来源：当前 E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co / codex/round1-continuous；不是远程展示站或D主树重建。
Docker项目morchat-local-demo，新数据库/上传卷，端口只绑定127.0.0.1:3000/8080；旧数据库不改。
登录：orange Supabase已有邮箱密码，不需要本地邮件服务器、无需重新注册。账号密码只在页面输入；不在聊天或日志保存密码。外部会话最长1小时且不超provider期限，过期重新登录，不声称即时远端撤销。
认证复用Supabase，业务表仍在独立本地Postgres；不把本应用迁移灌到共用Supabase数据库。无service_role、模型Key或付费调用。

私有运行配置 E:\CodexData\morchat-r1-local\run\multica-local-demo\compose.yml 含随机本地凭据，禁止提交或公开。已审新增身份迁移只执行在本地，迁移前before-supabase.sql备份也仅放私有目录。

启动：
    docker compose -f E:\CodexData\morchat-r1-local\run\multica-local-demo\compose.yml up -d --no-build
状态：
    docker compose -f E:\CodexData\morchat-r1-local\run\multica-local-demo\compose.yml ps
停止并保留数据：
    docker compose -f E:\CodexData\morchat-r1-local\run\multica-local-demo\compose.yml stop

当前实机通过：Ethan本人密码登录进入工作区；测试项目“本地验收测试-20261109”和手动TITA-2创建成功，reload回读存在。细记录LOCAL-FIRST-STAGE-ACCEPTANCE.md。
前后端源码构建、TypeScript成功，数据库healthy/迁移完成、登录页及前端代理/API健康200，非法text/plain登录415且不设cookie。两条CSS highlight优化警告保留。
这只是第一阶段，不代表企业ACL/WindowsDSH/AI/用量归档/Leader/版本撤权保存/双设备全量验收。不要恢复旧辅助验证框架来阻塞可用版。
当前运行已切为已审Git提交51e23d9的标准导出构建（私有source-51e23d9），不再直接COPY脏树；compose.yml保留同名入口和原数据。临时导出只为build，非新仓或工作树。Web完成基础详情回归，Desktop/本机daemon执行仍待验证。

## 客户端启动按钮PATH缺口已实际修复（2026-11-09）
用户真实报错是旧GUI环境未带DSH路径；之前手动CLI注册成功不等于该GUI按钮能用。Root实读daemon.err确认no agent CLI，未要求用户重装DSH或插件。
已创建真实私有启动入口 E:\CodexData\morchat-r1-local\run\multica-local-demo\start-desktop.ps1，SHA DB38F3AD2D77B9B0EBDAC32067C0E92A2E2F31C9FCEB20BE00E4CD77E922A0AD。只为新进程补精确DSH PATH/MULTICA_DSH_PATH及原隔离HOME/DSH_HOME/agentsHome、telemetry关闭/self-update关闭，调用原dev.mjs；无全局PATH改动、无个人key/config复制、无手动daemon-start或伪造launched_by。
用户明确批准取消当前唯一排队聊天任务后再验证启动；Root从原生聊天“停止”正常取消，保留聊天与Bot，PG实核cancelled1、activequeue0。通过原生AltF4正常退出旧GUI28988，未强杀；确认原端口释放后，从上述入口真正重开同userData/profile与同source51e。新GUI28668/HWND594198、live exec8295，原登录保留，Electron自身自动启动daemon40672，health launched_by=desktop。
Root进一步从客户端实际点“停止”→观察0台在线/启动按钮→点“启动”→新daemon30736。a2622f独立health running/profile desktop-localhost-8080/launched_by desktop/agents[dsh]/active-running-wait0；PG runtime dsh online/近期heartbeat，queue仅cancelled1、task_usage0。最终CUA AX与截图显示“1台在线、DeepSeek Harness在线、由桌面端管理、全部空闲”，原按钮错误未复现。40672正常停是按钮测试，不是崩溃。
本次允许隔离无key的能力/模型列表元数据发现，不再把model-list请求本身当推理/收费或永久停机条件。未发送AI消息、未执行模型任务；真实模型结果/费用/企业全链路仍未验收。当前GUI及daemon保留运行，Web/API/DB不重启，原WIP/main不动。此为本机开发启动入口修复，不冒充通用安装包自动配置全部完成。完整Goal ACTIVE。
