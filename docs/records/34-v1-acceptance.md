# V1 整体验收记录与固定演示流程

> 验证记录：结果与限制对应文中列明的运行日期及配置。当前使用方式见[工程文档](../README.md)，不同实验结果不合并为统一准确率。

2026-09-16。验收基于 `b1f891f` 的已部署应用；本轮仅修正旧浏览器验收对首页商品位置的假设，并增加固定复跑入口。没有新增业务功能或模型评测矩阵。

## 结论与证据口径

固定业务集合共13项：首轮12项通过、1项失败。失败用例在扩展后的分页商品列表中直接寻找原来的 USB-C 商品；修改为通过搜索定位该商品后，定向复测1项通过。因此13项均有本轮通过证据，**不是首轮13/13，也没有将两次运行简单相加当成14个不同用例**。

随后真实 MCP 与在线混合检索4项一次通过；数据库核对确认本轮售后退款金额49.90、订单已关闭、唯一模拟退款记录及四条售后事件。退款仍是本地模拟账本，无真实资金流转。

本轮未重建Java，未重新执行上一阶段的35项Java回归；此前构建证据见文档33。本轮未调用付费模型、未切换线上服务为脚本模型，结束时 `ASTER_ENABLE_TEST_PROVIDER=false`。健康状态和MCP成功不等同于真实模型回答成功。

| 验收范围 | 本轮证据 | 能说明什么 |
|---|---|---|
| 商品浏览、目录与管理 | `catalog.spec.ts` 2项、`catalog-management.spec.ts` 2项 | 100件目录商品及配图、分页搜索、商品详情、库存调整和状态权限；包含夹具清理 |
| 购买、售后退款、政策发布 | `p1.spec.ts` 3项，包含1项修正后复测 | 三侧购买/模拟退款、角色隔离、数据库持久化、政策发布及测试政策撤回 |
| 账户与模型配置 | `p21.spec.ts` 1项 | 登录门禁、用户配置隔离、密钥不回显、切换账户；连接失败展示使用Mock，不代表外部连接验证 |
| 人工咨询 | `support.spec.ts` 2项 | 客户确认转人工、客服领取/回复/解决、轮询、所有权和幂等 |
| 订单履约 | `fulfillment.spec.ts` 1项 | 管理员模拟发货/派送、客户查看物流和确认收货，禁止越权及重复节点 |
| 聊天与模型选择展示 | `chat-workspace.spec.ts`、`model-picker.spec.ts` 各1项 | Mock事件下的流式Markdown、历史恢复、卡片去重和模型ID映射；不是模型质量评测 |
| MCP与政策检索 | `test_mcp_integration.py` 3项、`test_p3c_live.py::test_hybrid_availability` 1项 | 真实SDK/MCP/Java/MySQL链路、归属、确认令牌、重复提交、取消操作；在线 `HYBRID_RRF_RERANK`、来源哈希复核 |

### 当前本机状态

- 104件已上架商品，其中100件来自原创扩展目录；81份已发布客户政策、241条已发布条款。这是当前合成本地数据量，不是商家或客户规模。
- 最新政策索引修订228为 `READY`，本轮检索明确走混合召回/RRF/Rerank，而非只靠健康检查推断。
- admin、portal、agent、retrieval-worker、web及MySQL/Redis/RabbitMQ/Mongo容器运行且健康；commerce-mcp运行但未配置Docker健康检查，其可调用性由真实MCP测试证明。Milvus可用性由混合检索检查支持，本轮没有做停机故障演练。
- 原始报告留在被Git忽略的 `.local/v1-acceptance-20260916/`：`browser-initial.json`、`purchase-rerun.json`、`mcp-retrieval.xml`、`services.json`。截图在 `.local/screenshots/`；报告可能包含合成账号、页面状态和本机路径，不作为公开仓库素材直接提交。

## 固定复跑方法

前提：现有本机环境已经按文档33启动，使用合成数据；已导入商品目录/政策库，退款消费者正常工作。测试会新建合成账号和订单，模拟支付会消耗合成库存，并保留业务记录。商品管理测试撤回自身补货，政策发布测试撤回自身测试政策；这不是对整个数据库无副作用的只读测试。

在项目根目录的 PowerShell 7 中执行，使用新目录保留每次失败与重试证据：

```powershell
$repo = $PWD.Path
$report = Join-Path $repo ('.local/v1-acceptance-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force $report | Out-Null
$savedReport = $env:PLAYWRIGHT_JSON_OUTPUT_NAME
try {
    $env:PLAYWRIGHT_JSON_OUTPUT_NAME = Join-Path $report 'browser.json'
    Push-Location apps/web
    try {
        npm run test:v1 -- --timeout 60000 --reporter=list,json
        if ($LASTEXITCODE -ne 0) { throw '业务验收失败：查看报告，只复测修复涉及的用例。' }
    } finally { Pop-Location }
} finally { $env:PLAYWRIGHT_JSON_OUTPUT_NAME = $savedReport }

docker run --rm --network aster-p0_default `
  -e ASTER_INTEGRATION=true -e ASTER_P3C_LIVE=true `
  --mount "type=bind,source=$repo/services/agent,target=/app,readonly" `
  --mount "type=bind,source=$report,target=/reports" `
  aster-agent:p2 python -m pytest tests/test_mcp_integration.py `
  tests/test_p3c_live.py::test_hybrid_availability `
  -q -p no:cacheprovider --junitxml=/reports/mcp-retrieval.xml
if ($LASTEXITCODE -ne 0) { throw 'MCP/检索验收失败。' }
./scripts/verify-p1-data.ps1
```

检查报告中的跳过与失败，不把缺少库数据导致的跳过当成通过。`ASTER_P3C_LIVE` 指本机在线检索，不是模型付费开关。此入口不会运行 `test_live_model.py`，也不会调用 `verify-p2.ps1` 的全量测试或改为TestMode。

## 固定人工演示脚本

1. 客户登录 `/app`，搜索并选购一件商品，下单并模拟支付；打开 `/app/orders` 核对金额。
2. 管理员 `/admin/products` 搜索商品，展示上架状态、规格库存、订单占用和调整历史；需要演示补货时填写明确原因。
3. 管理员 `/admin/orders` 搜索上述订单并模拟发货、记录派送节点；客户刷新物流并二次确认收货。
4. 客户在 `/app/assistant` 使用已配置的个人模型查询订单或商品，询问一条已发布政策并查看来源。此步骤会实际调用模型，**未作为本轮自动验收执行**；此前真实调用证据见文档23、29、30，不将旧结果冒充本轮结果。
5. 点击转人工，客户检查并确认摘录；客服在 `/service/support` 领取、回复、解决，客户侧查看结果。
6. 使用另一笔合成已支付订单申请售后，客服领取审核并模拟退款；客户查看状态，客服展示退款监控与对账结果。

演示过程不要展示本机密钥文件或账户密码。无需把真实支付、第三方电商MCP、互联网搜索、生产容量等尚未交付范围加入演示。

## 收尾清单

- [x] 本轮固定业务验收及关键缺陷定位：修正旧用例的首页位置依赖，无需改变商品排序。
- [x] 本轮真实MCP确认/权限及在线检索验证，保留初始结果和定向复测。
- [x] 核对退款持久化与当前部署状态，确保没有留下测试模型。
- [ ] 下一步：核对全新环境的启动前置条件、停止/恢复和配置说明，整理可复现的部署手册。
- [ ] 下一步：整理架构、实现归属、指标证据和局限，完善工程文档与复现材料。
- [ ] 公开前：独立执行完整历史、许可证、敏感信息和生成产物检查；本轮没有推送或发布。

V1整体验收部分已收尾，但没有宣称全新环境复现、生产就绪、独立留出集准确率或本轮真实模型演示全部完成。后续先完成最后两项交付材料工作；不继续扩张功能和评测矩阵。
