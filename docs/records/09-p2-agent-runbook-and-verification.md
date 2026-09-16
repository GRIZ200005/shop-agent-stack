# P2：对话助手、多模型接入与真实业务 MCP

> 验证记录：结果与限制对应文中列明的运行日期及配置。当前使用方式见[工程文档](../README.md)，不同实验结果不合并为统一准确率。

日期：2026-09-14。P2 本地工程闭环已实现；真实模型 smoke 待个人凭据配置。这里的测试引擎不是大模型，不将工程测试通过率当作 AI 准确率。

2026-09-15 更新：个人用户现在可通过独立登录页及模型设置配置密钥，无需手改环境文件，见 [P2.1 说明](10-p21-account-and-model-settings.md)。下文 `.env` 方式保留为平台部署配置和 P2 历史记录。

## 1. 当前版本

客户入口 `/app/assistant` 已提供历史会话、供应商选择、订单/售后卡片、售后预览、显式确认、取消、停止生成和结果核实。客户、客服、管理员仍使用 P1 的独立入口；本轮没有客服聊天接管或管理员模型配置页。

后端链路：浏览器 → Nginx → FastAPI → LangGraph → MCP SDK Streamable HTTP → 常驻 Commerce MCP → Spring Boot → MySQL。MCP 与 Agent 是同一镜像的两个独立进程/容器；Python 不直接写 Java 业务库。

支持 DeepSeek、OpenAI、Kimi、自定义 **Chat Completions + function tools** 接口。这叫多供应商适配层或轻量模型网关；SaaS 是软件交付方式，目前的单商家本地项目不因支持多模型就变成 SaaS。兼容接口不代表所有供应商特性完全一致，具体模型仍须逐个 smoke。

语言：Java 处理权限、交易与事务；Python 处理模型协议、Agent 与 MCP；TypeScript/React 处理界面及 SSE。MySQL 存业务数据，Redis 继续用于 mall 认证/验证码等；P2 Agent 会话与事件使用独立 SQLite 数据卷，适用于当前单实例。尚未做多实例调度与数据库迁移，不为了技术数量强行引入组件。

## 2. 启动与个人模型配置

```powershell
# 项目根目录；首次或 Java/Python 代码有变更
./scripts/start-p2.ps1 -Build

# 已有构建产物，恢复服务 / 重新读取 .env
./scripts/start-p2.ps1

# 停止全部服务，保留数据卷
./scripts/stop-p0.ps1
```

地址：http://127.0.0.1:18030/app/assistant 。使用已有客户账户登录；注册方法沿用 P1。九个容器只对主机暴露原来的本地端口，Agent 与 MCP 无独立主机监听端口。

在本机被忽略的 `.env` 添加需要的配置，可配置一个或多个供应商。字段模板在 `.env.example`，密钥不要发到聊天、不要提交 Git，也不要填进浏览器。

| 供应商 | 必填字段 | 默认基础地址 |
|---|---|---|
| DeepSeek | `ASTER_DEEPSEEK_API_KEY`、`ASTER_DEEPSEEK_MODEL` | `https://api.deepseek.com` |
| OpenAI | `ASTER_OPENAI_API_KEY`、`ASTER_OPENAI_MODEL` | `https://api.openai.com/v1` |
| Kimi | `ASTER_KIMI_API_KEY`、`ASTER_KIMI_MODEL` | `https://api.moonshot.cn/v1` |
| 自定义 | `ASTER_CUSTOM_API_KEY`、`ASTER_CUSTOM_MODEL`、`ASTER_CUSTOM_BASE_URL` | 无 |

前三者也支持对应 `_BASE_URL` 覆盖。填写基础地址，不要包含 `/chat/completions` 后缀；必须为无凭据/查询参数的 HTTPS URL。模型名填写个人账户实际可调用且支持工具调用的标识。配置后执行 `start-p2.ps1`，页面下拉框会显示模型及可用状态。状态只代表配置齐全，联网可用性由 smoke 验证。

页面不保存密钥，不向客户端公开基础地址。适配层关闭重定向及环境代理自动继承；OpenAI 请求 `store=false`，不同供应商数据保留政策并不由这一参数统一控制。工具数据、问题和对话历史会发送到所选服务商；默认使用合成账户/订单进行验证。

推荐体验：先创建并模拟支付一笔订单 → 对话“查询我的订单” → “申请售后，订单 123，原因：尺寸不合适” → 核对预览并点击确认 → 在 `/app/after-sales` 查看真实申请 → 客服按 P1 流程领取处理。模型不必采用固定句式；上述句式也是显式测试引擎的约定输入。

前端热更新：`apps/web` 内执行 `npm run dev`，5173 的 Agent 路径代理到运行中的 18030。静态 18030 页面仍需 `npm run build` 更新。

## 3. 权限与业务正确性

- Java 从客户登录态签发 15 分钟执行上下文，数据库只保存令牌哈希。模型无 `member_id` 参数，MCP 请求头绑定单次运行身份；模型和 MCP 都不会收到原始客户 JWT。
- 模型可发现五个业务工具：本人订单列表/详情、售后列表、生成预览、核实操作。MCP 提供第六个 `submit_after_sale` 工具，但宿主白名单不把它暴露给模型，运行时也拒绝模型主动请求该名称。
- 预览在 Java 持久化订单、金额、原因、10 分钟期限与确认令牌哈希。确认令牌只进入经过用户鉴权的 UI 事件流，不进入模型消息或跨轮历史。
- 页面确认调用 Java 客户接口，校验拥有者、确认令牌及期限；宿主随后调用真实 MCP 提交工具。模型说“确认”不会触发这一接口。
- 消费操作时对操作与订单加行锁，重新校验金额，售后写入和操作 `SUCCEEDED` 在一个 MySQL 事务中完成。重放同一操作返回同一申请，唯一约束保证每订单一笔售后。这里的“一次性”指一次业务副作用，成功后的查询式重放可以返回相同结果。
- 提交响应丢失会标为 `UNCERTAIN`，页面通过权威 Java 操作记录核实，避免直接创建新的申请。停止生成不撤销已提交业务；确认进行中不允许用“停止”假装撤销。
- 执行上下文有效期内仍具有原有授权，尚无主动撤销机制；本阶段不是生产权限系统完备性的声明。

## 4. 会话、事件与恢复

会话/run/event 持久化在 `agent_data` 卷；前端令牌只走 Authorization 请求头，不放 SSE URL。每个事件有单调递增 ID，SSE 接受 `after` 游标，刷新从快照恢复，客户端按 ID 去重。run 记录关联预览 operation ID，工具事件关联 tool-call ID。

当前状态流：`QUEUED → RUNNING → COMPLETED / WAITING_CONFIRMATION / FAILED / STOPPED`；确认进入 `CONFIRMING → COMPLETED / UNCERTAIN`。异常重启发现尚未结束的确认会转为待核实，普通执行转为中断，不自动重放写操作。正常关闭会取消正在生成的任务。未完成的取消也可核实。

SSE 已扩展为运行状态、工具进度、供应商增量正文与最终完整回答；按 message_id 合并恢复，细节见 [12](12-assistant-streaming-workspace.md)。没有分布式 trace 平台，run ID 与 operation ID 是本阶段的本地关联方式。

每次最多 4 轮模型、8 次工具调用、90 秒总时限；单次模型输出上限 1024 token。累计供应商报告 token 达到 8000 后停止下一轮，这是事后软预算，不是首个请求输入长度或费用的严格上限。供应商要求的 reasoning 字段只在内存回传，不作为 UI 思维链或持久化日志。

后续商品 Agent 阶段已将继续请求阈值调整为 16000，并增加末轮收尾，见 [当前预算与验证](29-product-agent-live-evaluation.md)。上段保留 P2 当时的配置记录。

## 5. 可复现验证

```powershell
# 构建并验收：显式开启规则引擎，最后自动恢复普通模式
./scripts/verify-p2.ps1 -Build

# 已有当前版本产物时
./scripts/verify-p2.ps1
```

测试只创建合成账户和模拟订单，会保留这些测试记录。`compose.p2-test.yml` 显式开启 fixture；页面醒目标注“非 AI”，正常启动强制关闭该引擎，真实接口失败也不降级为 fixture。

本机已执行的检查与证据：

| 检查 | 范围 | 不代表什么 |
|---|---|---|
| Java 定向回归 | 原 P1 的 9 项 + 3 项操作过期/未确认/授权拒绝测试 | 不是全部上游测试 |
| Python 单元与 HTTP 合约 | 会话隔离、并发确认、重启状态、预算/工具白名单、预览隔离、四种供应商协议字段与错误脱敏 | HTTP mock 不是实际供应商验证 |
| 真实 MCP 集成 | 官方 SDK initialize/list/call，Java 归属校验、确认阻断、取消、并发重放仅一笔售后 | 没有真实资金交易 |
| P2 浏览器 | 真实订单卡、预览前无申请、刷新恢复、确认后落库、重放、SSE 游标、越权拒绝、停止、手机布局 | 规则引擎不计入 AI 成功率 |
| P1 浏览器与 API 回归 | 原三角色购物到模拟退款闭环 | 非负载/生产验收 |

本轮通过：Java 12 项；Python 15 项通过、1 项真实模型 smoke 因未配置而跳过；浏览器 5 个场景（P1 三个、P2 两个）；原 API smoke 17 项；MySQL 售后状态/金额/审计事件核对通过。详细结果和截图只保存在被忽略的 `.local`，不会把带请求内容的运行产物自动发布。测试脚本与锁文件随源码保留，结果不代表负载性能。

配置真实服务商后，下面的显式 smoke 会产生少量 API 费用，创建合成订单，验证真实模型查询及售后预览，最后取消预览，不提交售后：

```powershell
docker compose --env-file .env -f deploy/compose.p0.yml -f deploy/compose.p1.yml -f deploy/compose.p2.yml exec -T -e ASTER_LIVE_PROVIDER=deepseek agent python -m pytest tests/test_live_model.py -q -p no:cacheprovider
```

将 `deepseek` 换为 `openai`、`kimi` 或 `custom` 可验证另一家，必须分别配置并运行。当前这些真实 smoke **未运行**；正常测试默认跳过。通过 smoke 后仍需 P5 的版本化问题集、基线对照及失败分类，才能讨论模型任务成功率、幻觉率、延迟和成本。

## 6. 后续阶段与实现归属

本轮自研范围是模型网关、LangGraph 工具编排、真实 MCP 适配、Java 确认消费、事件恢复与对话界面；商品、会员及订单底座继续归属 mall，上游与改动见 THIRD_PARTY_NOTICES.md。没有导入私有工程代码、配置、历史或业务资料。

未实现：Agentic RAG、政策检索/引用、网络搜索、第三方电商 MCP、客服会话接管、多实例 Agent、耐久异步退款、完整 AI 评测/压测。先配置一个真实模型验证当前链路，再进入 P3 政策索引与检索分支。当前的测试数量不能写成“AI 准确率 100%”。

确认请求链路：React → REST → Agent → MCP → Java 事务 → MySQL。
