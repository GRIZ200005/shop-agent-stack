<div align="center">

# Aster Commerce · 星序

**连接商品选购、智能助手与客户服务的零售应用**

Java 17 / Spring Boot · Python / LangGraph · React / TypeScript

[快速开始](docs/getting-started.md) · [产品展示](docs/showcase.md) · [系统架构](docs/architecture.md) · [Agent 设计](docs/agent.md) · [工程文档](docs/README.md)

</div>

Aster Commerce 基于 [macrozheng/mall](https://github.com/macrozheng/mall) 的商品、会员和订单基础，构建客户、客服、管理员三侧应用。客户可以选购商品、管理订单、向 AI 助手查询商品与政策，也可以将问题交给人工客服；后端负责身份、库存、确认、审核与异步任务的执行边界。

项目使用原创合成商品和服务政策，支付、退款及配送均为模拟流程。基础交易与客服流程可独立运行；AI 功能通过个人模型连接启用。

## 产品展示

点击角色标题展开截图，客户侧默认展开。[查看完整图集](docs/showcase.md)。

<details open>
<summary><strong>客户侧 · 商城、智能助手与政策问答</strong></summary>

**商城与商品目录** — 分类、搜索与日常精选。

![客户商城与商品目录](docs/assets/screenshots/customer-storefront.png)

**商品问答** — 条件查询、规格核实与商品依据卡片。

![星序助手商品问答](docs/assets/screenshots/customer-agent.png)

**政策问答** — 回答中的条款标识与可查看原文的来源卡片。

![政策问答与来源引用](docs/assets/screenshots/customer-policy-rag.png)

[更多客户侧截图](docs/showcase.md#customer)

</details>

<details>
<summary><strong>客服侧 · 人工咨询与售后审核</strong></summary>

客户背景、咨询消息、处理动态与解决状态集中展示。

![客服人工咨询工作台](docs/assets/screenshots/service-consultation.png)

售后领取后填写审核说明，处理结果通过时间线同步给客户。

![客服售后审核](docs/assets/screenshots/service-after-sale-review.png)

[更多客服侧展示](docs/showcase.md#service)

</details>

<details>
<summary><strong>管理员侧 · 商品运营、规格库存与履约</strong></summary>

查看规格的总库存、订单占用与可售库存，按数量及原因提交调整。

![管理员规格库存界面](docs/assets/screenshots/admin-inventory.png)

管理正式服务政策，查看发布版本和条款索引状态。

![正式政策与条款索引](docs/assets/screenshots/admin-policy.png)

[更多管理员侧截图](docs/showcase.md#admin)

</details>

截图来自本机运行的合成业务环境。完整图集包含模拟发货、收货及售后处理结果；本地体验方式见[快速开始](#快速开始)。

## 功能地图

| 客户空间 | 客服工作台 | 管理中心 |
|---|---|---|
| 登录注册、账户与模型设置 | 售后领取、审核与拒绝 | 员工角色管理 |
| 分类、搜索、分页与商品详情 | 异步模拟退款进度 | 商品上下架、SKU 库存调整 |
| 购物袋、下单与模拟支付 | 退款重试与只读一致性核对 | 库存调整原因与审计记录 |
| 订单、配送与确认收货 | 人工咨询领取、回复与解决 | 订单查询、模拟发货与派送 |
| Agent 问答、政策引用与售后预览 | 客户背景信息与处理动态 | 政策发布、修订、撤回与索引状态 |

## 核心实现

### 受控 Agent 与业务工具

FastAPI 接收会话请求，LangGraph 组织有界工具循环，自建 MCP 连接 Java 业务服务。订单与售后查询按登录客户隔离；商品工具从数据库读取可售规格；售后写入必须经过客户显式确认。

- **模型连接**：DeepSeek、OpenAI、Kimi 与自定义 Chat Completions 兼容服务；模型列表选择、连接测试、服务端加密存储密钥。
- **上下文管理**：有界历史、会话任务快照、宿主管理的商品引用；价格、库存和订单状态重新读取。
- **执行体验**：SSE 进度、可折叠工具记录、Markdown 回答、来源与业务卡片、停止及事件恢复；支持确认后删除个人对话。
- **运行约束**：工具白名单、短期执行授权、轮次与用量阈值、失败保留；来源校验通过后才发布有依据的回答。

详见 [Agent 与上下文设计](docs/agent.md)。

### 有版本的政策 Agentic RAG

```mermaid
flowchart LR
    Q[用户问题] --> B[BM25 关键词召回]
    Q --> V[Milvus 向量召回]
    B --> F[RRF 排名融合]
    V --> F
    F --> R[BGE Rerank 精排]
    R --> G{证据检查}
    G -->|足够| C[政策版本与来源复核]
    G -->|预算内补查| Q
    G -->|信息不足| U[补问或说明缺口]
    C --> A[回答与条款引用]
```

政策发布与索引任务使用事务 Outbox。MySQL 保存权威条款，Milvus 保存派生索引；检索按可见性、版本和代际约束，索引不可用时明确降级。同轮多条搜索先合并证据再统一核查，整个运行最多执行两次政策搜索。最终回答再次复核政策来源；模型的语义判断与来源一致性分别验证。

### 交易一致性与异步业务

| 问题 | 实现机制 |
|---|---|
| 并发下单、管理库存竞争 | 商品 → SKU 锁顺序、条件更新、原子占用与事务回滚 |
| 重复点击、响应丢失后重试 | 请求标识、后端确认记录与状态检查 |
| 审批已提交、消息暂时未送达 | 同事务写业务状态与 Outbox，后台有界重试 |
| 重复退款消息 | 幂等消费、唯一模拟账本、业务结果同事务提交 |
| 重试耗尽 | 转入人工核实，保留错误与处理记录 |
| 客服并发领取 | 行锁与领取人权限，禁止其他员工代回复或处理 |
| 配送重复提交 | 订单锁、唯一配送阶段事件、客户归属检查 |

退款账本与业务库共享本地事务；该实现没有连接真实支付网关。设计及限制见[系统架构](docs/architecture.md)。

## 系统架构

```mermaid
flowchart LR
    UI[React / TypeScript] --> N[Nginx 同源入口]
    N --> J[Spring Boot / Portal + Admin]
    N --> A[FastAPI / LangGraph]
    A --> L[模型服务]
    A --> M[MCP 工具服务]
    M --> J
    M --> R[政策检索服务]
    R --> V[(Milvus)]
    R --> J
    J --> D[(MySQL)]
    J --> C[(Redis)]
    J --> Q[RabbitMQ]
    Q --> W[模拟退款消费者]
    W --> D
    A --> S[(SQLite 会话与事件)]
```

| 层次 | 技术与职责 |
|---|---|
| 交互 | React、TypeScript、Vite、SSE、React Markdown |
| 业务 | Java 17、Spring Boot、Spring Security、MyBatis、Spring JDBC |
| Agent | Python 3.12、FastAPI、LangGraph、LangChain Core、MCP SDK |
| 检索 | 中文 BM25、Milvus、RRF、BGE Embedding / CrossEncoder（CPU） |
| 存储与消息 | MySQL、Redis、RabbitMQ、SQLite；MongoDB 为上游依赖 |
| 交付与验证 | Docker Compose、Maven、pytest、Playwright、Node.js 测试 |

Java 持有业务规则与权威数据，Python 处理模型编排与检索，TypeScript 呈现交互。依赖版本以 Maven、lockfile 和 Compose 配置为准。

## 快速开始

开发工作流：**Windows + PowerShell 7 + Docker Desktop Linux 容器 + Node.js 24**。Java/Maven、Python 与检索模型在容器中运行。

```powershell
git clone https://github.com/GRIZ200005/aster-commerce.git
Set-Location aster-commerce

# 准备检索镜像与固定版本模型缓存
docker compose -f deploy/compose.retrieval.yml build evaluation
docker compose -f deploy/compose.retrieval.yml run --rm --no-deps evaluation python scripts/prepare-retrieval-models.py

# 构建应用、执行迁移并启动服务
./scripts/start-p2.ps1 -Build

# 导入原创合成商品与发布服务政策
node scripts/import-product-catalog.mjs --apply
node scripts/import-policy-library.mjs --publish
```

打开 **[http://127.0.0.1:18030](http://127.0.0.1:18030)**。客户可以注册；客服与管理员使用本机初始化账户。AI 连接在客户空间的“模型设置”中配置，不需要把 Key 写入源码。

首次运行的依赖顺序、失败处理、账户位置与数据冲突处理见[安装指南](docs/getting-started.md)。启动脚本保留现有卷；默认 Compose 仅绑定本机入口。其他操作系统和全新机器的完整复现尚未单独验收。

## 数据与验证

| 数据 | 内容 |
|---|---|
| 商品目录 | 100 件原创扩展商品、10 个分类、100 张独立 AI 配图；另有基础种子商品 |
| 政策库 | 80 份客户政策 + 16 份员工 SOP，共 288 条编写条款；员工材料不进入客户检索 |
| 业务夹具 | 合成用户、订单、咨询、售后和配送记录 |
| 评测材料 | 检索对照、Agent 契约、历史/任务状态消融、故障与只读性能实验 |

固定业务验收入口：

```powershell
Set-Location apps/web
npm run test:v1
```

2026-09-16 固定验收记录包含 13 项业务通过证据（其中 1 项修正测试假设后复测通过）及 4 项真实 MCP/在线检索通过证据。另有真实模型开发实验与离线检索比较；**契约通过率、检索指标和答案准确率分别统计**。详见[测试与指标口径](docs/testing.md)。

## 目录与源码导航

```text
apps/web/              客户、客服、管理员界面与页面测试
services/commerce/     mall 衍生模块与 Aster 业务服务
services/agent/        模型适配、Agent、MCP、上下文与会话存储
services/retrieval/    政策索引、混合召回与精排
deploy/                Compose、Nginx、配置与 SQL 迁移
catalog/               商品目录、图片及来源清单
knowledge/             政策编写源、条款目录与手册
evaluation/            题集、实验配置与结果摘要
scripts/               构建、启动、导入与验证工具
docs/                  架构、API、运维、验证与展示
```

[工程实现与归属](docs/engineering-guide.md) · [代码结构与维护](docs/maintainability.md) · [API 导航](docs/api.md) · [运维指南](docs/operations.md)

## 适用范围

项目面向单商家合成业务。未接入真实支付/快递、第三方商家 MCP、网络搜索或跨会话长期画像。商品查询使用 MySQL 关键词与过滤；政策索引为单 worker，Agent 使用 SQLite 持久化，多实例扩展需要额外设计。不将本机功能验收描述为生产容量、高可用或独立盲测准确率。

## 贡献与许可证

欢迎围绕具体问题提交改进，流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题见 [SECURITY.md](SECURITY.md)。

原创代码与文档采用 [Apache License 2.0](LICENSE)。商城基础来自 **macrozheng/mall**，保留上游许可证、作者与修改声明；依赖、模型和素材遵循各自许可。固定上游提交及增量范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
