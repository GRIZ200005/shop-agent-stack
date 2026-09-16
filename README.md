# Aster Commerce · 星序

**面向零售场景的智能交易与客户服务平台**

项目目录：`Aster-Commerce`。目标版本：v1.0。

当前状态：三侧业务闭环、Agent/MCP、在线混合检索、短期任务上下文、异步模拟退款和内部对账已运行验证。已完成首轮真实模型开发场景对照，尚无独立留出集回答准确率或生产容量结论。最新证据见 [真实模型评测](docs/23-p3g-live-agent-evaluation.md)、[可靠异步退款](docs/25-p4a-reliable-refunds.md) 和 [退款监控](docs/26-p4b-refund-monitor.md)。

核心组合：Java/Spring Boot 业务服务 + Python/LangGraph Agent + React/TypeScript 三侧工作台。基于公开 mall 项目建设订单与售后能力，核心差异化是受控 Agentic RAG、可靠工具执行、人工接管和可信评测。

## 文档

- [人工咨询闭环](docs/31-human-support.md)：客户转人工、客服领取回复、事务并发控制与使用步骤。
- [商品管理与库存调整](docs/32-catalog-management.md)：管理员商品搜索、上下架、库存调整记录及下单库存保护。
- [多轮选购与混合问题评测](docs/30-multiturn-shopping-evaluation.md)：偏好记忆、商品指代、开发/预留分组及真实调用结果。
- [商品 Agent 与真实模型验证](docs/29-product-agent-live-evaluation.md)：实时商品工具、引用复核、失败诊断及开发烟测。
- [100 件原创商品目录](docs/28-product-catalog.md)：独立配图、可重复导入、分类分页与商品测试。
- [P4c 只读性能基线](docs/27-read-performance-baseline.md)：并发短测、SQL 执行计划与数据规模限制。
- [最终项目计划](docs/01-product-and-architecture.md)：产品范围、三侧体验、架构、Agentic RAG、网络搜索、MCP。
- [Agent 与前端机制研究](docs/02-runtime-and-ux-design.md)：基于本地参考代码的机制分析与独立实现方案。
- [数据、评测与个人贡献](docs/03-data-evaluation-and-contribution.md)：数据来源、实验方法、验收口径。
- [实施与学习路线](docs/04-delivery-roadmap.md)：阶段、交付、完成门槛与学习任务。
- [仓库建立与来源规范](docs/05-repository-and-provenance.md)：私有仓库、VS Code 连接、信息隔离和上游许可证。
- [P0 运行手册](docs/06-p0-runbook.md)：环境、启动、测试、停止与排障。
- [P0 验收记录](docs/07-p0-verification.md)：已验证内容和剩余边界。
- [上游来源与改动](THIRD_PARTY_NOTICES.md)：mall 固定提交、Apache-2.0 许可证和自研范围。
- [P1 三侧体验与验收](docs/08-p1-runbook-and-verification.md)：页面入口、账号、售后闭环、实际证据及限制。
- [P2 助手与多模型接入](docs/09-p2-agent-runbook-and-verification.md)：真实 MCP、确认边界、模型配置、测试与未完成门槛。
- [P2.1 账户与模型设置](docs/10-p21-account-and-model-settings.md)：独立登录、账户菜单、个人密钥加密与界面配置。

## 本地运行

需要 Docker Desktop（Linux 容器）、PowerShell 7 和 Node.js 24；Java 17/Maven 在容器中运行，不修改本机 JDK。

```powershell
./scripts/start-p2.ps1 -Build
./scripts/smoke-p0.ps1
./scripts/verify-p0-data.ps1
```

页面入口：客户 `http://127.0.0.1:18030/app`、客服 `/service`、管理员 `/admin`。客户可自行创建体验账号；本地管理和客服初始凭据在被 Git 忽略的 `.local/p1-accounts.json`，不要上传或分享。首次启动需要下载依赖，已有产物时可省略 `-Build`。停止用 `./scripts/stop-p0.ps1`，包含前端在内的服务会停止，数据卷保留。

登录入口：`http://127.0.0.1:18030/login`；助手入口：`/app/assistant`。登录后从左下角账户菜单进入模型设置，支持 DeepSeek、OpenAI、Kimi 及自定义 Chat Completions 兼容接口，个人配置无需修改 `.env` 或重启；平台配置仍可由部署端初始化。

客户 API 仍位于 `http://127.0.0.1:18085`，管理 API 位于 `http://127.0.0.1:18080`；浏览器经同源 Nginx 代理访问它们。浏览器测试运行方式见 P1 文档。

本项目基于 [macrozheng/mall](https://github.com/macrozheng/mall) 的公开代码改造，保留原作者署名及 [Apache-2.0 许可证](services/commerce/LICENSE)，不宣称上游商品、会员和订单功能为从零自研。

## 项目边界

三侧是客户、客服、管理员；主管作为客服审核角色。第一版是单商家系统，真实资金支付和外部平台账号接入不属于默认运行条件。自建业务 MCP 属于 v1.0 必做，第三方电商 MCP 是有条件扩展。

仅使用公开许可的业务底座、公开或自建测试数据；本地参考工程只提炼通用设计机制，独立编写新实现，不迁移企业标识、内部配置、专有提示词或业务材料。

所有文档中的性能、规模和准确率数字均为拟定目标或实验规模，不是已达成成绩。
