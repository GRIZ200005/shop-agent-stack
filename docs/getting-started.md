# 安装与首次运行

[文档首页](README.md) · [运维排障](operations.md)

本文说明开发环境的依赖、构建和初始化顺序。**尚未在完全空白的第二台机器执行全部步骤**。遇到平台差异请附脱敏错误，不上传配置文件。

## 1. 前提

| 项目 | 要求 |
|---|---|
| 终端 | PowerShell 7（`pwsh`）；Windows PowerShell 5.1不作为完整脚本支持基线 |
| 运行环境 | Docker Desktop，Linux容器模式，Compose插件 |
| 前端工具 | Node.js 24与npm；使用仓库lockfile |
| 浏览器验收 | Microsoft Edge；测试默认使用`msedge`，也可配置已安装的Playwright channel |
| 网络 | 首次拉取容器、Maven/npm/Python依赖及Hugging Face固定模型需要网络 |
| 资源 | Java服务、Milvus和CPU精排同时运行；建议给Docker预留足够内存与磁盘。没有实测最小配置，不把推荐硬件当作验收门槛 |

不需要安装本机Java17或Python3.12，相关构建使用容器。GPU不是本地检索的必需条件。

```powershell
git clone https://github.com/GRIZ200005/aster-commerce.git
Set-Location aster-commerce
docker version
docker compose version
node --version
$PSVersionTable.PSVersion
```

以下命令均从仓库根目录执行，除非明确写了`Push-Location`。运行凭据由初始化脚本生成。

## 2. 首次准备检索镜像与模型缓存

在线检索服务使用外部命名卷 `aster-retrieval_models`，并以只读方式加载缓存。`start-p2.ps1 -Build` 会构建业务和Agent，但**不会构建检索镜像或下载模型**。

```powershell
docker compose -f deploy/compose.retrieval.yml build evaluation
if ($LASTEXITCODE -ne 0) { throw '检索镜像构建失败' }
docker compose -f deploy/compose.retrieval.yml run --rm --no-deps evaluation python scripts/prepare-retrieval-models.py
if ($LASTEXITCODE -ne 0) { throw '固定模型缓存准备失败' }
```

尽管Compose服务名为`evaluation`，此处显式覆盖命令，只下载配置中的固定模型，不运行评测，也不调用付费API。首次运行会创建模型卷；缓存已有时复用下载结果。模型与revision以 `evaluation/retrieval-matrix.json` 为准，当前为BGE中文嵌入和BGE精排，权重不进入Git。

## 3. 构建并启动

```powershell
./scripts/start-p2.ps1 -Build
```

该入口依次：

1. 初始化忽略提交的`.env`随机凭据、管理员/客服账户密码文件。
2. 启动基础组件并应用SQL迁移。
3. 生成独立Agent配置加密密钥和索引服务密钥。
4. 启动Milvus，构建Java/Agent/前端并启动应用与检索worker。
5. 重启Web代理以重新解析应用容器地址。

`build-p0.ps1`会暂时移除portal/admin应用容器，释放Windows下挂载的JAR文件锁；数据库卷不删除。单独执行该构建脚本不会替你恢复应用，正常使用上述完整启动入口。

正常启动不使用`-TestMode`。该选项会启用确定性测试提供商，仅供明确的测试流程使用，不能当成真实模型不可用时的静默替代。

## 4. 导入商品与政策

初始化仅提供基础合成数据。扩展目录与政策发布是显式操作：

```powershell
# 先检查，不修改数据库
node scripts/import-product-catalog.mjs
node scripts/import-policy-library.mjs

# 本地体验环境：确认导入原创合成数据后执行
node scripts/import-product-catalog.mjs --apply
node scripts/import-policy-library.mjs --publish
```

商品导入会检查ID/名称等冲突，不重置已有库存或销量。政策导入发布客户政策及员工SOP，客户查询按可见性过滤。已有数据有冲突时停止并人工核对，不删除旧库“重试”。政策发布会触发索引更新，完成前不能仅凭容器启动就宣称混合检索就绪。

导入源、数量和图片说明见[数据与测试](testing.md)、[商品目录记录](records/28-product-catalog.md)、[政策库记录](records/16-policy-library-v2.md)。

## 5. 登录与模型连接

- 打开 `http://127.0.0.1:18030/login`，客户可注册。体验验证码流程不发送真实短信，不是生产短信认证。
- 管理员/客服使用初始化生成的`.local/p1-accounts.json`，只在本机查看。
- 客户进入左下角账户菜单 → 模型设置。选择服务、模型并填写自己的API Key；自定义连接还需正确的Base URL。
- Base URL不要包含`/chat/completions`。自定义服务需支持对应协议、工具调用与流式输出；网络连接受公网HTTPS校验约束，本机私有地址不是默认支持范围。
- 保存配置不等于已验证连通性；点击连接测试或发送对话会访问模型服务，可能计费。
- 普通购买、模拟支付、客服处理和管理员页面无需模型Key。

不要修改他人的已保存配置，也不要用真实客户数据进行本项目演示。

## 6. 验证与日常使用

```powershell
Push-Location apps/web
try { npm run test:v1 } finally { Pop-Location }
```

需要完整前置数据；测试会写入合成账号、订单和事件。MCP/混合检索验证单独见[验收记录](records/34-v1-acceptance.md)。这不是必须每次启动都跑的步骤。

已有构建产物、镜像和模型卷时：

```powershell
./scripts/start-p2.ps1
# 结束本地运行，保留数据卷
./scripts/stop-p0.ps1
```

不要用 `down -v` 代替正常停止。配置、密钥和卷的备份/恢复关系见[运维指南](operations.md)。

## 完成标志

能登录三侧、搜索扩展商品、创建并模拟支付订单、处理人工咨询和模拟售后；配置模型后能明确看到真实提供商的结果或错误；MCP在线检索检查确认走到所期望的检索方式。首次环境复现需要记录机器、依赖、执行步骤及失败，不能仅引用开发机器历史报告。
