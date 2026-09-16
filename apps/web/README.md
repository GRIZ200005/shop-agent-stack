# Web 应用

[工程文档](../../docs/README.md) · [界面展示](../../docs/showcase.md)

React / TypeScript 三侧应用。`App.tsx` 管理登录入口、导航和角色空间，`api.ts` 封装 Java 业务响应与失效登录处理。

| 文件 | 职责 |
|---|---|
| `Customer.tsx` | 商品、购物袋、订单及客户售后 |
| `AgentWorkspace.tsx` | SSE 对话、执行进度、引用及业务卡片 |
| `AccountSettings.tsx` / `modelCatalog.ts` | 账户偏好、供应商与模型选择 |
| `StaffWorkspace.tsx` / `RefundMonitor.tsx` | 售后工作台与异步退款诊断 |
| `Support.tsx` | 客户和客服咨询 |
| `ProductManagement.tsx` / `Fulfillment.tsx` | 商品管理与模拟履约 |
| `datetime.ts` | UTC API 时间解析与本地显示 |

```powershell
npm ci
npm run build
npm run test:unit
```

运行中的本机后端与合成数据就绪后执行 `npm run test:v1`。该集合会创建合成业务；带模型或故障注入的测试单独执行。具体前提见[测试指南](../../docs/testing.md)。

页面路由、按钮禁用和 TypeScript 类型都不是后端授权。写操作由 Java 检查归属、角色、状态与幂等条件。密钥不进入浏览器存储；会话令牌与模型密钥是不同数据。
