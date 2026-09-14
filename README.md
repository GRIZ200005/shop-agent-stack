# Aster Commerce · 星序

**面向零售场景的智能交易与客户服务平台**

项目目录：`Aster-Commerce`。目标版本：v1.0。

当前状态：P1 首个三侧业务闭环已运行验证。客户可以选购、下单、模拟支付与申请售后；客服可以领取、审核并模拟退款；管理员可以创建团队账号和发布政策。AI 尚未接入。实际范围与测试见 [P1 运行及验收](docs/08-p1-runbook-and-verification.md)。

核心组合：Java/Spring Boot 业务服务 + Python/LangGraph Agent + React/TypeScript 三侧工作台。基于公开 mall 项目建设订单与售后能力，核心差异化是受控 Agentic RAG、可靠工具执行、人工接管和可信评测。

## 文档

- [最终项目计划](docs/01-product-and-architecture.md)：产品范围、三侧体验、架构、Agentic RAG、网络搜索、MCP。
- [Agent 与前端机制研究](docs/02-runtime-and-ux-design.md)：基于本地参考代码的机制分析与独立实现方案。
- [数据、评测与个人贡献](docs/03-data-evaluation-and-contribution.md)：数据来源、实验方法、验收口径。
- [实施与学习路线](docs/04-delivery-roadmap.md)：阶段、交付、完成门槛与学习任务。
- [仓库建立与来源规范](docs/05-repository-and-provenance.md)：私有仓库、VS Code 连接、信息隔离和上游许可证。
- [P0 运行手册](docs/06-p0-runbook.md)：环境、启动、测试、停止与排障。
- [P0 验收记录](docs/07-p0-verification.md)：已验证内容和剩余边界。
- [上游来源与改动](THIRD_PARTY_NOTICES.md)：mall 固定提交、Apache-2.0 许可证和自研范围。
- [P1 三侧体验与验收](docs/08-p1-runbook-and-verification.md)：页面入口、账号、售后闭环、实际证据及限制。

## 本地运行

需要 Docker Desktop（Linux 容器）、PowerShell 7 和 Node.js 24；Java 17/Maven 在容器中运行，不修改本机 JDK。

```powershell
./scripts/start-p1.ps1 -Build
./scripts/smoke-p0.ps1
./scripts/verify-p0-data.ps1
```

页面入口：客户 `http://127.0.0.1:18030/app`、客服 `/service`、管理员 `/admin`。客户可自行创建体验账号；本地管理和客服初始凭据在被 Git 忽略的 `.local/p1-accounts.json`，不要上传或分享。首次启动需要下载依赖，已有产物时可省略 `-Build`。停止用 `./scripts/stop-p0.ps1`，包含前端在内的服务会停止，数据卷保留。

客户 API 仍位于 `http://127.0.0.1:18085`，管理 API 位于 `http://127.0.0.1:18080`；浏览器经同源 Nginx 代理访问它们。浏览器测试运行方式见 P1 文档。

本项目基于 [macrozheng/mall](https://github.com/macrozheng/mall) 的公开代码改造，保留原作者署名及 [Apache-2.0 许可证](services/commerce/LICENSE)，不宣称上游商品、会员和订单功能为从零自研。

## 项目边界

三侧是客户、客服、管理员；主管作为客服审核角色。第一版是单商家系统，真实资金支付和外部平台账号接入不属于默认运行条件。自建业务 MCP 属于 v1.0 必做，第三方电商 MCP 是有条件扩展。

仅使用公开许可的业务底座、公开或自建测试数据；本地参考工程只提炼通用设计机制，独立编写新实现，不迁移企业标识、内部配置、专有提示词或业务材料。

所有文档中的性能、规模和准确率数字均为拟定目标或实验规模，不是已达成成绩。
