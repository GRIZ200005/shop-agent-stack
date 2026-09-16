# P0 本地运行手册

> 阶段记录：保留当时的方案、结果与限制，不代表当前全部状态。安装和当前能力以[工程文档首页](README.md)为准；后续更新不改写此处原始实验结论。

本文保留 P0 环境说明。当前代码已进入 P1，首次启动和管理员账号初始化请以 08 文档及 `start-p1.ps1` 为准；P0 smoke 现在使用 P1 本地管理账号并验证公开注册已关闭。

## 范围与前提

P0 使用 mall 的商品、会员、订单、管理接口，固定上游提交见 THIRD_PARTY_NOTICES.md。Java 17、Maven 3.9.9 在容器内运行，Spring Boot 版本为上游 3.5.14。需要运行中的 Docker Desktop Linux engine 和 PowerShell 7；首次启动需要联网下载镜像及依赖。镜像目前固定版本标签，尚未按 digest 锁定，不能声称构建逐字节可复现。

## 启动与检查

在项目根目录 PowerShell 7 终端运行：

```powershell
./scripts/start-p0.ps1 -Build
./scripts/smoke-p0.ps1
./scripts/verify-p0-data.ps1
```

已有 jar 且源码未变时使用 `./scripts/start-p0.ps1`。构建脚本会先移除本项目 portal/admin 应用容器，释放 Windows 占用的 jar；数据库容器及卷保留，因此重建期间 API 会短暂不可用。不要直接在仍挂载旧 jar 时调用 Maven 打包。

`init-local.ps1` 自动生成独立随机凭据到 `.env`；存在时不覆盖。不要上传该文件，也不要在共享终端输出完整 Compose 配置。普通使用不需要运行 import-upstream.ps1，该脚本仅记录最初的固定版本导入过程，已有源码时会拒绝覆盖。

| 服务 | 本机入口 | 用途 |
|---|---|---|
| portal | http://127.0.0.1:18085/swagger-ui.html | 客户 API 文档 |
| admin | http://127.0.0.1:18080/swagger-ui.html | 管理 API 文档 |
| MySQL | 127.0.0.1:13316 | 数据库 aster，用户名 aster，密码在本机 .env |
| Redis | 仅容器网络 | 会员缓存、验证码、订单号序列 |
| RabbitMQ | 仅容器网络 | 上游超时订单队列 |
| MongoDB | 仅容器网络 | 上游 portal Repository 的启动依赖 |

MongoDB 收藏/浏览历史功能没有在 P0 验收，后续可按范围移除。两个应用的 `/actuator/health` 用于健康检查。Swagger 是接口文档，不是客户或客服工作台。

## 数据和验收

初始化只执行 76 张上游表的 DDL 和自建的一款商品（49.90 元）。不导入上游账号、地址和订单。测试通过 API 创建随机客户、虚拟地址、管理账号和订单，故数据库中的记录会随重复运行增长。测试账号密码仅存在脚本内存；无真实手机号、资金支付或短信发送。

smoke 还会刻意传入 0.01 元的客户端价格，验证后端两件商品仍按 99.80 元下单；使用第二个客户验证订单详情与列表隔离。最后通过 SQL 单独验证订单归属、金额和明细。报告写入 `.local/p0-smoke.json`，不纳入版本控制。测试订单沿用上游未支付超时逻辑，不用于验证退款或支付。

构建执行 `OrderOwnershipTest` 与 `CartPricingTest`，不是全部上游测试。原有 Spring Context 测试没有为隔离测试环境重新配置；运行真实 Compose 服务的 API smoke 是单独的集成验证。初始化 SQL 只在新 MySQL 卷执行；后续修改表结构需要迁移脚本，不能通过修改 init SQL 假设已有数据库会更新。

## 停止与排障

```powershell
./scripts/stop-p0.ps1
docker compose --env-file .env -f deploy/compose.p0.yml ps
docker compose --env-file .env -f deploy/compose.p0.yml logs --tail 80 portal admin
```

停止脚本保留数据。不使用 `down -v` 作为常规重启方法。若凭据文件丢失，既有数据库卷不会自动接受新密码，应恢复本地凭据或明确迁移数据。若端口被占用，调整 Compose 和 smoke 的 Portal/Admin 参数。日志可能有测试请求信息，分享前先检查。

## 下一阶段

先补管理员授权引导和客户/客服权限模型，关闭公开管理员注册，再做 React/TypeScript 三侧第一个售后闭环。P0 保留的本地验证码与管理员注册入口只适合开发；尚未审计支付、取消订单、库存并发等全部上游路径，不应将此配置直接用于公网业务。
