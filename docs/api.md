# API导航与错误约定

[文档首页](README.md) · [架构](architecture.md)

本文是阅读和调试入口，不替代控制器、参数校验与运行时OpenAPI。浏览器使用Nginx同源路径；不要把内部接口直接暴露给公网客户端。

## 分区

| 浏览器前缀 | 上游 | 说明 |
|---|---|---|
| `/api/portal/` | Portal | 客户账户、商品、订单与客户ShopAgentStack业务 |
| `/api/admin/` | Admin | 员工登录、管理与客服业务，进一步校验角色 |
| `/api/agent/` | Agent | 会话、设置、运行和SSE |

Portal/Admin使用 `Authorization: Bearer …`；登录响应返回token及tokenHead，客户端按实际响应组合。两侧令牌不能因为都是Bearer就混用。MCP内部调用使用短期执行授权，不是让模型持有客户JWT。

## 业务接口

下表路径相对于相应分区前缀：

| 分区 | 方法与路径 | 约束 |
|---|---|---|
| Portal | `POST /shop_agent_stack/orders/{id}/simulate-payment` | 仅本人可支付订单，模拟扣款 |
| Portal | `GET /shop_agent_stack/orders/{id}/shipment` | 仅本人订单的模拟物流 |
| Portal | `POST /shop_agent_stack/orders/{id}/receive` | 归属、状态、售后及发货节点检查 |
| Portal | `GET/POST /shop_agent_stack/after-sales` | 列出本人售后或按订单提交申请 |
| Portal | `GET /shop_agent_stack/policies` | 已发布客户政策 |
| Admin | `GET /shop_agent_stack/catalog` | 管理员商品列表，query/status/page |
| Admin | `GET /shop_agent_stack/catalog/{id}` | 管理员查看规格、库存和调整记录 |
| Admin | `POST /shop_agent_stack/catalog/{id}/changes` | 幂等编号、旧值、调整量、原因与库存约束 |
| Admin | `GET /shop_agent_stack/fulfillment` | 管理员订单列表，query/status/page |
| Admin | `GET /shop_agent_stack/fulfillment/{id}` | 管理员订单履约详情 |
| Admin | `POST /shop_agent_stack/fulfillment/{id}/advance` | stage为SHIPPED或DELIVERING，需note |
| Agent | `GET/POST /sessions` | 列出本人会话或创建会话 |
| Agent | `GET /sessions/{sid}` | 读取本人会话和运行事件 |
| Agent | `DELETE /sessions/{sid}` | 删除本人已结束的会话、消息与任务记忆；未决操作返回 409 |
| Agent | `POST /sessions/{sid}/runs` | 创建运行；request_id 用于幂等重试 |
| Agent | `GET /runs/{rid}/events` | 本人运行的 SSE 事件，支持 after 游标 |

人工咨询接口、客服售后与政策管理的具体参数见对应 [controller](../services/commerce/mall-admin/src/main/java/com/macro/mall/shopagentstack/admin)；Agent API看 [app.py](../services/agent/shop_agent_stack/app.py)。上游 API 存在不代表当前 UI 使用或允许调用，部分支付/取消路径有明确拦截。

## 返回码

Java通常返回 `{"code":200,"message":"…","data":...}`。调用者必须同时检查HTTP状态和业务code；HTTP200可能带业务失败。当前沿用上游 `VALIDATE_FAILED=404` 业务码，它不必等同于HTTP404。401/403表示登录或权限问题；具体错误仍以当前处理器为准。

Agent使用FastAPI响应和SSE事件，不能套用Java的CommonResult解析。流式回答可能包含工具进度、最终回答、停止或失败；流断开不表示后台写操作未发生。

## 重试

只读查询可在有界范围内重试。写请求要保留业务幂等标识或查询现有状态，不能在网络超时后不断生成新请求编号重放。客户确认、发货节点、咨询消息和库存调整各有自己的幂等/状态约束，不能假设所有接口共享统一的Idempotency-Key头。

涉及库存、金额、角色或用户归属的参数校验必须在后端完成，前端禁用按钮只用于体验。
