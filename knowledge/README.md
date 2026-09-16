# 星序知识库

[Agent 与检索设计](../docs/agent.md) · [数据与验证](../docs/testing.md)

知识包包含 **96 份原创合成文档、288 条条款**：80 份客户政策（240 条）与 16 份员工规范（48 条）。标题按业务主题命名，稳定编号用于关联条款、版本和评测标签。这些资料描述模拟商城规则，不是外部商家的真实政策或法律意见。

## 文件结构

| 路径 | 内容 |
|---|---|
| `authoring/policies.tsv` | 客户政策编写源 |
| `authoring/staff-policies.tsv` | 员工规范编写源 |
| `handbooks/customer.md` / `handbooks/staff.md` | 可阅读手册 |
| `catalog-v2.json` | 两类文档、条款、可见性与哈希 |
| `manifest.json` | 客户语料规模与来源清单 |
| `archive/v1/` | 用于复核旧实验的固定版本语料 |

## 发布与检索

编写包中的 `DRAFT` 表示文件不会自动生效。导入脚本先预检，显式发布后以 MySQL 中的状态、有效时间与版本为准。客户检索只使用已发布且有效的客户条款，员工资料不可进入客户检索或客户草稿加载器。

在线政策发布触发索引 Outbox；单 worker 构建 Milvus 派生索引。MCP 结合 BM25、向量召回、RRF 与精排，并在回答发布前复核权威来源。文件版本、线上政策版本和索引代际分别管理。

```powershell
# 仓库根目录：检查编写源，预览导入
node scripts/build-policy-handbook.mjs
node scripts/import-policy-library.mjs

# 显式发布合成服务政策
node scripts/import-policy-library.mjs --publish
```

依赖、冲突处理及索引前提见[安装指南](../docs/getting-started.md)。修改正文必须重新生成清单、核对标签并修订线上政策；不能直接改向量索引来覆盖原文。

## 评测与来源

检索题目与知识条款分开管理，题目不进入索引。开发题集、标签和对应结果按版本保留，参考[政策库验证记录](../docs/records/16-policy-library-v2.md)与[检索实验](../docs/records/18-hybrid-retrieval-experiments.md)。开发集表现不等于独立留出集准确率，条款 Recall 也不等于完整答案正确率。

来源标记为 `aster-original-synthetic`。第三方材料须另行记录固定版本、许可证、原文哈希与转换关系，不得混充本店服务政策。语料扩展不自动构成独立人工质量审核。
