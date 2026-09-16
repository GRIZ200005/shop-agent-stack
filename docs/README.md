# 工程文档

本文档区分**当前工程指南**和**带日期的阶段记录**。安装/使用优先读当前指南；需要核对实验过程、原始失败与设计演变时再读阶段记录。早期计划中的“下一步”不是现在的完整待办列表。

## 当前指南

| 目的 | 文档 |
|---|---|
| 认识项目 | [项目README](../README.md) |
| 从克隆开始运行 | [安装与首次运行](getting-started.md) |
| 理解服务、存储与事务 | [系统架构](architecture.md) |
| 理解模型、工具、记忆与证据 | [Agent链路](agent.md) |
| 查找接口及重试边界 | [API导航](api.md) |
| 修改配置、启停、排障 | [运维指南](operations.md) |
| 了解数据、测试与数字 | [验证指南](testing.md) |
| 阅读代码、准备项目讲解 | [原创贡献与学习路线](engineering-guide.md) |
| 准备GitHub公开 | [发布检查](public-release.md) |
| 贡献/安全/许可 | [贡献](../CONTRIBUTING.md) · [安全](../SECURITY.md) · [许可证](../LICENSE) · [来源](../THIRD_PARTY_NOTICES.md) |

## 当前状态

- 业务与MCP固定验收见[记录34](34-v1-acceptance.md)，模型开发实验见记录23、29、30，口径不能相互替代。
- 全新机器复现、完整历史凭据审查、独立留出集答案审核、生产容量与安全审计尚不能视为完成。
- Windows/PowerShell与本机Docker工作流为已使用基线；不承诺所有平台即刻可运行。

## 阶段与设计记录

以下按原编号保留。数据/测试数字对应各文档日期与版本；后续实现可能已取代早期限制，当前解释见上面的专题指南。
- [01 · Aster Commerce v1.0 最终项目计划](01-product-and-architecture.md)
- [02 · Agent运行机制与前端设计索引](02-runtime-and-ux-design.md)
- [03 · 数据、评测与贡献证明](03-data-evaluation-and-contribution.md)
- [04 · 实施与学习路线](04-delivery-roadmap.md)
- [05 · 仓库来源与公开协作](05-repository-and-provenance.md)
- [06 · P0 本地运行手册](06-p0-runbook.md)
- [07 · P0 验收记录](07-p0-verification.md)
- [08 · P1：三侧页面、售后闭环与本机验收](08-p1-runbook-and-verification.md)
- [09 · P2：对话助手、多模型接入与真实业务 MCP](09-p2-agent-runbook-and-verification.md)
- [10 · P2.1：登录、账户与个人模型设置](10-p21-account-and-model-settings.md)
- [11 · 模型选择：显示名称与 API 标识](11-model-selection.md)
- [12 · 助手工作区与流式回答](12-assistant-streaming-workspace.md)
- [13 · P2 验收与 P3 知识工程实施](13-p3-knowledge-and-acceptance-plan.md)
- [14 · P3a：正式政策检索与引用闭环](14-p3a-policy-rag.md)
- [15 · 正式政策整理与向量检索计划](15-policy-curation-and-vector-plan.md)
- [16 · 星序服务政策库 V2：内容与开发评测](16-policy-library-v2.md)
- [17 · 政策库本地发布与在线验收](17-policy-library-local-release.md)
- [18 · Milvus、RRF 与精排对照实验](18-hybrid-retrieval-experiments.md)
- [19 · P3c 在线政策混合检索](19-p3c-online-policy-retrieval.md)
- [20 · P3d 政策证据检查、补查与补问](20-p3d-policy-evidence-gate.md)
- [21 · P3e 多轮任务状态与上下文管理](21-p3e-task-context.md)
- [22 · P3f 多轮 Agent 对照评测](22-p3f-agent-evaluation.md)
- [23 · P3g 首轮真实模型多轮评测](23-p3g-live-agent-evaluation.md)
- [24 · 回答质量审计与 v1.0 差距清单](24-quality-audit-and-v1-gaps.md)
- [25 · P4a 可靠异步模拟退款](25-p4a-reliable-refunds.md)
- [26 · P4b 退款监控与只读对账](26-p4b-refund-monitor.md)
- [27 · P4c：只读接口性能基线](27-read-performance-baseline.md)
- [28 · 原创生活商品目录 v1](28-product-catalog.md)
- [29 · 商品 Agent 接入与真实模型开发验证](29-product-agent-live-evaluation.md)
- [30 · 多轮选购与混合问题评测](30-multiturn-shopping-evaluation.md)
- [31 · 人工咨询闭环](31-human-support.md)
- [32 · 商品管理与库存调整](32-catalog-management.md)
- [33 · 订单履约与 V1 收尾范围](33-order-fulfillment.md)
- [34 · V1 整体验收记录与固定演示流程](34-v1-acceptance.md)
