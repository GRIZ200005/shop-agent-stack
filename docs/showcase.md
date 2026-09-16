# 产品展示

[项目首页](../README.md) · [本地运行](getting-started.md) · [使用与回归记录](records/35-showcase-and-agent-regressions.md)

Aster Commerce 将商品选购、AI 问答、人工咨询、售后与后台运营连接到同一套业务数据。以下截图来自本机运行中的应用，由维护者提供；商品、身份和交易均为合成体验数据，商品配图为 AI 生成示意图。

[客户侧](#customer) · [客服侧](#service) · [管理员侧](#admin)

## 业务流程

| 环节 | 客户侧 | 客服 / 管理员侧 |
|---|---|---|
| 选购 | 分类搜索、商品详情、购物袋与下单 | 商品上下架与规格库存管理 |
| 配送 | 模拟支付、查看物流、确认收货 | 模拟发货、派送与配送备注 |
| 问答 | 商品规格查询、政策引用与人工咨询 | 维护政策、领取咨询并回复 |
| 售后 | 提交申请、查看处理进度 | 领取、审核、异步模拟退款与结果核实 |

<a id="customer"></a>

## 客户侧

### 商城与商品目录

分类、关键词搜索与商品卡片帮助客户找到商品；目录包含 100 件原创扩展商品和基础种子商品。

![商城与商品目录](assets/screenshots/customer-storefront.png)

### 商品问答

助手按预算查询商品，根据商品记录核对尺寸与适配条件，回答附带可打开的商品依据卡片。

![商品问答与规格核实](assets/screenshots/customer-agent.png)

### 政策问答与来源引用

到货破损咨询展示申请需要的信息、审核方及条款引用。来源卡片列出政策名称、版本和条款，客户可以打开原文。规则咨询与订单状态核实分别处理，咨询本身不会创建售后申请。

![政策问答与来源卡片](assets/screenshots/customer-policy-rag.png)

最近对话支持继续查看和删除；删除需确认，有未完成或待核实操作时须先处理该操作。

### 售后处理结果

同一笔申请展示提交、客服领取、审核说明和模拟退款结果，客户可查看完整处理时间线。

![客户售后处理结果](assets/screenshots/customer-after-sale-completed.png)

[返回角色导航](#产品展示)

<a id="service"></a>

## 客服侧

### 人工咨询工作台

查看客户确认的背景信息，领取咨询、回复并标记解决。消息与处理动态保存在同一咨询中。

![人工咨询工作台](assets/screenshots/service-consultation.png)

### 售后审核

客服领取申请后填写客户可见的审核说明，再决定通过或拒绝。审批通过后进入异步模拟退款处理。

![售后审核与处理操作](assets/screenshots/service-after-sale-review.png)

### 退款处理结果

审核说明与模拟退款结果追加到时间线，客户侧与客服侧查看同一笔业务记录。

![客服侧模拟退款完成](assets/screenshots/service-after-sale-completed.png)

[返回角色导航](#产品展示)

<a id="admin"></a>

## 管理员侧

### 正式政策与条款索引

搜索政策，查看客户可见范围、发布版本和条款索引状态；通过修订、发布与撤回管理政策生命周期。

![政策管理与索引状态](assets/screenshots/admin-policy.png)

### 商品规格与库存

按 SKU 查看总库存、订单占用和可售库存，填写调整数量与原因，管理商品上下架。图中展示调整入口，所选规格尚无调整记录。

![商品规格库存管理](assets/screenshots/admin-inventory.png)

### 订单履约

记录模拟发货与派送；客户确认收货后，管理端可以看到三个配送节点及备注。

![模拟发货、派送与确认收货](assets/screenshots/admin-fulfillment-completed.png)

[返回角色导航](#产品展示)

## 展示范围与素材维护

以上为功能截图，在线模型质量、检索指标与性能数据见[测试说明](testing.md)。支付、退款和配送不发生真实资金或物流流转。

图片保存在 docs/assets/screenshots/，[素材清单](assets/screenshots/manifest.json)记录来源和 SHA-256。更新图片时使用实际应用界面，检查所有可见区域，不上传密钥、令牌、真实客户资料或无权公开的内容。
