# Aster 业务服务

[业务架构](../../../docs/architecture.md) · [上游来源](../../../THIRD_PARTY_NOTICES.md)

该模块集中 Aster 增量业务规则，供 Portal/Admin 控制器调用。名称保留模块兼容性，范围包括售后、商品查询与管理、人工咨询、履约及政策。

| 服务 | 责任 |
|---|---|
| `AfterSaleService` / `RefundService` | 售后状态、审核、模拟退款账本与重试 |
| `RefundWorker` / `RefundDiagnostics` | Outbox 投递、消费和只读核对 |
| `CatalogManagementService` | 上下架、库存变更、调整审计与库存占用 |
| `ProductQueryService` | 商品关键词、过滤与详情 |
| `FulfillmentService` | 模拟配送节点、客户收货与售后冲突 |
| `SupportService` | 工单归属、领取、消息幂等与解决 |
| `PolicyService` | 政策内容、发布与版本管理 |

事务边界在服务层。库存操作保持商品 → SKU 锁顺序；退款结果与本地模拟账本同事务；配送和咨询操作分别维护状态及重放约束。不要用直接 SQL 改状态来替代业务流程。

Java 回归通过仓库构建流程执行，详见[验证指南](../../../docs/testing.md)。控制器、服务与数据迁移共同决定接口契约，所有上游 API 并不自动属于 Aster 已验证范围。
