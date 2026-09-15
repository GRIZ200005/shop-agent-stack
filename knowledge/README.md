# 星序知识资料

当前 V2 共 **96 份文档、288 条条款**：`authoring/policies.tsv` 包含 80 份客户政策与指引、240 条条款；`authoring/staff-policies.tsv` 包含 16 份内部规范、48 条条款。均使用正式业务标题与稳定编号。这些是为星序独立编写的 AI 辅助模拟业务资料，不是外部商家政策、真实交易承诺或已经人工审核的正式政策。

直接阅读：[客户服务政策手册](handbooks/customer.md)、[客服与知识运营规范](handbooks/staff.md)。数量、受众、条款哈希见 `catalog-v2.json`；编写与评测说明见 `../docs/16-policy-library-v2.md`。

经用户授权，本批 96 份资料已发布到当前本地模拟商城，80 份客户资料进入在线检索、16 份规范仅内部可见，见 `../docs/17-policy-library-local-release.md`。文件中的 DRAFT 表示编写包默认不自动生效，不是当前实例的发布状态；实例状态、生效时间及版本以 MySQL 为准。本轮代码对照由开发助手完成，不宣称已获独立人工审查。

`manifest.json` 记录客户语料哈希与数量，`catalog-v2.json` 同时记录两类资料。V1 原文、清单和旧题集保存在 `archive/v1`，旧编号及条款正文保留，V2 对旧标题做正式命名并新增资料。语料包版本与线上政策版本分别管理。新环境导入默认只预检，显式发布需使用已审核且获授权的内容。

检索基线位于 `services/agent/aster_agent/knowledge.py`，使用 LangChain Core `Document` 和独立实现的 BM25。默认排除草稿、内部资料和无效日期；只允许评测脚本显式预览草稿。在线 P3a 从 MySQL 读取已发布的有效客户政策，与离线文件加载分开。本轮没有调用嵌入模型、下载权重或连接外部模型。内部 TSV 不传入客户草案加载器；导入脚本依据目录明确设置 STAFF，不使用 CUSTOMER 默认值。

在仓库根目录复现（使用现有 Docker 镜像的 Python 依赖）：

```powershell
node scripts/build-policy-handbook.mjs
docker run --rm --mount "type=bind,source=$PWD,target=/workspace" -w /workspace aster-agent:p2 python scripts/evaluate-policy-scenarios.py
docker run --rm --mount "type=bind,source=$PWD,target=/workspace" -w /workspace aster-agent:p2 python scripts/evaluate-knowledge.py
docker run --rm --mount "type=bind,source=$PWD/services/agent,target=/app,readonly" aster-agent:p2 python -m pytest tests/test_knowledge.py -q -p no:cacheprovider
```

旧 24 题存于 `evaluation/retrieval-dev.tsv`，结果保存到忽略目录 `.local/knowledge-baseline.json`。新增 72 个场景存于 `evaluation/policy-scenarios-v2.tsv`，结果存于 `evaluation/reports/policy-scenarios-v2-bm25.json`。题目不进入知识索引。两批题均已被开发者观察，不能作为独立 holdout 或宣称泛化准确率；条款 Recall@5 与完整问答正确率不同。12 个行为场景尚未运行模型与在线授权验收，不计入检索得分。

来源为 `aster-original-synthetic`，本批没有导入其他项目原文、历史报告或私有元数据。公开第三方资料将单独建立固定版本、许可证、原文哈希、转换映射与拒绝导入清单，不混充本店政策。
