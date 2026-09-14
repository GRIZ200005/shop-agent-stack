# Aster Commerce · 星序

**面向零售场景的智能交易与客户服务平台**

项目目录：`Aster-Commerce`。目标版本：v1.0。

当前状态：方案已建立，尚未初始化应用、接入业务底座或通过运行验收。项目名是本地开发名称。

核心组合：Java/Spring Boot 业务服务 + Python/LangGraph Agent + React/TypeScript 三侧工作台。基于公开 mall 项目建设订单与售后能力，核心差异化是受控 Agentic RAG、可靠工具执行、人工接管和可信评测。

## 文档

- [最终项目计划](docs/01-product-and-architecture.md)：产品范围、三侧体验、架构、Agentic RAG、网络搜索、MCP。
- [Agent 与前端机制研究](docs/02-runtime-and-ux-design.md)：基于本地参考代码的机制分析与独立实现方案。
- [数据、评测与个人贡献](docs/03-data-evaluation-and-contribution.md)：数据来源、实验方法、验收口径。
- [实施与学习路线](docs/04-delivery-roadmap.md)：阶段、交付、完成门槛与学习任务。
- [仓库建立与来源规范](docs/05-repository-and-provenance.md)：私有仓库、VS Code 连接、信息隔离和上游许可证。

## 项目边界

三侧是客户、客服、管理员；主管作为客服审核角色。第一版是单商家系统，真实资金支付和外部平台账号接入不属于默认运行条件。自建业务 MCP 属于 v1.0 必做，第三方电商 MCP 是有条件扩展。

仅使用公开许可的业务底座、公开或自建测试数据；本地参考工程只提炼通用设计机制，独立编写新实现，不迁移企业标识、内部配置、专有提示词或业务材料。

所有文档中的性能、规模和准确率数字均为拟定目标或实验规模，不是已达成成绩。
