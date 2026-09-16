# Agent 与 MCP

[运行说明](../../docs/getting-started.md) · [Agent 设计](../../docs/agent.md)

FastAPI 提供会话、模型连接、运行和 SSE 接口；LangGraph 编排工具循环及政策证据子图。MCP 通过短期执行授权调用 Java 业务接口。

| 文件 | 职责 |
|---|---|
| `aster_agent/app.py` | HTTP 接口、身份校验和事件流 |
| `aster_agent/runtime.py` | 轮次预算、工具执行、来源复核与终态 |
| `aster_agent/providers.py` / `outbound.py` | 模型协议与公网 HTTPS 连接约束 |
| `aster_agent/tools.py` / `mcp_server.py` | MCP 工具目录、连接与服务 |
| `aster_agent/business.py` | Java API 适配 |
| `aster_agent/policy_gate.py` | 证据检查、补充检索、澄清与终止 |
| `aster_agent/context.py` / `store.py` | 会话任务快照、运行、事件及持久化 |
| `aster_agent/preferences.py` | 用户范围内的加密模型配置 |

依赖由 `requirements.lock` 固定，通过根目录启动脚本构建容器。源码、配置密钥、SQLite 数据库分别存储；不要将运行数据库加入版本库。

工具不能接受模型自定的客户身份。敏感业务写入由后端确认路径执行，不能仅根据聊天中的确认文字提交。包含来源的回答在权威复核通过后发布；失败或停止的运行不提升任务快照。

测试分为确定性单元测试、真实 MCP/业务集成及显式付费模型实验。入口与证据见[测试指南](../../docs/testing.md)，不能将脚本引擎作为模型失败时的静默替代。
