# 配置、运维与排障

[文档首页](README.md) · [首次运行](getting-started.md) · [安全说明](../SECURITY.md)

## 配置来源

| 配置 | 来源 | 注意事项 |
|---|---|---|
| DB/MQ密码、两侧JWT密钥 | 本机`.env`，由`init-local.ps1`生成 | 文件已存在时不覆盖，不应手动复制示例占位值运行 |
| 管理员/客服初始密码 | `.env`中的bootstrap变量及`.local/p1-accounts.json` | 用于初始化，不能把修改文件当成可靠的已有账户密码重置方式 |
| 模型平台默认连接 | `.env.example`列出的各提供商变量 | 可选；个人设置可覆盖，密钥不提交 |
| 个人模型连接 | 页面保存到Agent持久化数据 | 服务端加密；模型标识需与账户能力匹配 |
| Agent加密密钥 | `.local/agent-encryption.key` | 必须与Agent数据一起安全备份；丢失后旧加密配置不可恢复 |
| 索引内部授权 | `.local/policy-index.key` | Portal与worker共享，只挂载给需要的进程 |
| 检索模型与参数 | `evaluation/retrieval-matrix.json` | 固定revision；改配置后要准备对应模型并检查索引代际 |
| 业务连接 | `deploy/config/application-shop_agent_stack.yml` | 连接容器服务名，不是宿主机`localhost` |

配置文件不等同于业务数据库。更换JWT密钥会使已有登录失效；更换数据库密码文件也不会自动更新现有MySQL用户。保持配置和已初始化数据一致。

## 本机端口

| 地址 | 用途 |
|---|---|
| `127.0.0.1:18030` | Web与统一API代理 |
| `127.0.0.1:18085` | Portal API |
| `127.0.0.1:18080` | Admin API |
| `127.0.0.1:13316` | MySQL调试入口 |
| `127.0.0.1:19530` | Milvus开发连接 |

Agent/MCP/检索worker经容器网络通信，默认无对应宿主机公开端口。Redis、MongoDB、RabbitMQ及Milvus依赖组件按当前Compose运行，不应直接搬到公网；尤其不要把默认内部认证当作生产安全配置。

## 启停和健康检查

```powershell
./scripts/start-p2.ps1
docker compose --env-file .env -f deploy/compose.p0.yml -f deploy/compose.p1.yml -f deploy/compose.p2.yml -f deploy/compose.p3c.yml ps
Invoke-RestMethod http://127.0.0.1:18085/actuator/health
Invoke-RestMethod http://127.0.0.1:18080/actuator/health
Invoke-RestMethod http://127.0.0.1:18030/api/agent/health
```

健康检查只表示相应服务能响应，不代表订单、模型回答或索引一定正确。MCP当前没有Docker健康检查，实际调用验证见[测试指南](testing.md)。

```powershell
# 有代码改动时构建并恢复服务
./scripts/start-p2.ps1 -Build
# 正常结束：移除容器/网络，保留命名数据卷
./scripts/stop-p0.ps1
```

只有前端改动时，可在 `apps/web` 执行 `npm run build`；当前Web通过挂载读取`dist`。Java单独构建会停止portal/admin，记得通过启动入口恢复。故障测试与并发写入测试应分开执行。

## 故障定位

| 现象 | 先检查 | 处理方向 |
|---|---|---|
| 检索镜像不存在/模型卷不存在 | 是否执行首次准备步骤 | 构建evaluation镜像并运行模型准备脚本，不靠跑全套评测间接安装 |
| worker模型加载失败 | 固定revision是否已缓存、模型卷是否只读挂载正确 | 重新准备缓存；在线worker使用`local_files_only=True` |
| 网页502 | portal/admin/agent健康、代理上游地址 | 应用重建后按启动入口重启web代理 |
| 登录或模型配置突然失效 | 数据卷和部署密钥是否来自同一套环境 | 恢复对应备份；不要生成新密钥覆盖旧文件“试一下” |
| 模型调用失败 | 提供商、准确模型ID、工具/SSE能力、Base URL、网络 | 先核对配置；错误不应静默替换成fixture答案 |
| 政策显示BM25降级 | 当前索引revision、worker、Milvus、来源摘要 | 等待发布后的索引完成；以实际retrieval元数据判断，不把降级当作混合检索 |
| 退款长时间处理中 | Outbox任务、broker、消费者错误、人工核实状态 | 用监控页只读核对；不得直接改账本伪造成功 |
| 商品不能调减库存 | 当前总库存与订单占用 | 刷新后核实占用，不覆盖`lock_stock` |
| 订单不能发货/确认 | 支付状态、售后冲突、已有配送节点、所属客户 | 按状态机处理，不打开旧接口绕过规则 |

查看特定服务日志时限定最近行数。例如：

```powershell
docker compose --env-file .env -f deploy/compose.p0.yml -f deploy/compose.p1.yml -f deploy/compose.p2.yml -f deploy/compose.p3c.yml logs --tail 100 retrieval-worker
```

日志、完整`docker inspect`、渲染后的Compose配置和浏览器网络导出可能带有凭据或请求内容。公开问题只提供必要的脱敏片段，不附整个`.local`或`.env`。

## 数据生命周期


- MySQL是业务权威；Agent卷保存会话与加密连接；Redis、RabbitMQ和MongoDB各有自己的命名卷。
- Milvus及其etcd/MinIO数据卷、固定模型缓存属于独立retrieval Compose项目。向量可从权威政策重建，但不能因此随意删除其他集合或共享卷。
- 备份需要覆盖数据库、Agent数据与对应密钥/配置；暂停写入后获得一致快照，恢复到隔离环境验证，不要直接覆盖正在演示的环境。
- 备份与恢复需自行配置，本项目不提供一键灾备脚本。
- 数据库迁移通过启动脚本执行。初始化SQL只在空MySQL数据目录执行，修改seed文件不会自动更新现有卷。

生产部署还需要单独设计TLS、认证与授权审计、网络隔离、限流、备份演练、日志脱敏、依赖更新、监控告警和容量验证。
