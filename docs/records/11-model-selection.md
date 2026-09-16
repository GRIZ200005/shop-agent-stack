# 模型选择：显示名称与 API 标识

> 验证记录：结果与限制对应文中列明的运行日期及配置。当前使用方式见[工程文档](../README.md)，不同实验结果不合并为统一准确率。

2026-09-15：DeepSeek、OpenAI、Kimi 使用模型下拉框；自定义保留手填。UI 展示友好名称，提交准确 ID。新配置不自动选择付费模型，需用户选择后保存；已有非列表模型保留为“当前已保存模型”，不会清空或自动替换。

模型目录在 `apps/web/src/modelCatalog.ts`，仅收录本轮核对的公开模型，不代表完整目录、账户权限或已通过真实工具调用验收。不使用用户 Key 获取列表、不调用模型、不改变已保存的密钥和地址。原有加密、按账户隔离及配置保存接口保持一致。

| 服务商 | 界面名称 | API ID |
|---|---|---|
| DeepSeek | DeepSeek V4 Pro | `deepseek-v4-pro` |
| DeepSeek | DeepSeek Flash | `deepseek-flash` |
| OpenAI | GPT-5 Mini | `gpt-5-mini` |
| OpenAI | GPT-4.1 | `gpt-4.1` |
| Kimi | Kimi K3 | `kimi-k3` |
| Kimi | Kimi K2.6 | `kimi-k2.6` |
| Kimi | Kimi K2.7 Code | `kimi-k2.7-code` |
| Kimi | Kimi K2.7 Code 高速版 | `kimi-k2.7-code-highspeed` |

来源（实际打开页面核对，不能只根据搜索摘要更新）：[DeepSeek 官方快速开始](https://api-docs.deepseek.com/)、[OpenAI GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini)、[OpenAI GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1)、[Kimi 官方模型目录](https://platform.kimi.com/docs/models)。

本次 DeepSeek 页面提示 Flash 使用 `deepseek-flash`，旧 Flash 标识已成为兼容别名，因此新列表不推荐旧标识；Kimi 页面已将 K2.5 标为下线，新列表不加入。已有配置仍由用户决定是否迁移。

后续增加模型时核对准确 ID、Chat Completions / 工具能力与下线公告，再更新目录和本文件。该实现只采用通用的“显示名称映射 API ID”交互，不包含私有参考工程的代码或元数据。

本轮验证：前端生产构建通过；模型选择专项与账户设置回归两个浏览器场景通过，覆盖准确 ID 提交、未列入模型保留、三家下拉选择、自定义输入和手机宽度。专项使用隔离 HTTP mock，账户回归使用合成账户；均不调用真实模型，不访问用户已保存的密钥。
