# 政策检索服务

[架构](../../docs/architecture.md) · [检索链路](../../docs/agent.md)

`online.py` 从 Java 权威政策目录读取一致快照，使用固定 BGE 模型建立 Milvus 索引，并提供 BM25、向量召回、RRF 融合与 CrossEncoder 精排。模型缓存以只读命名卷挂载，镜像与缓存准备见[安装指南](../../docs/getting-started.md)。

## 数据与执行约束

- MySQL 保存政策原文、版本、可见性及索引任务；Milvus 为可重建的派生索引。
- 构建前后校验代际与摘要，固定主键支持部分失败后的重复构建。
- 在线集合与实验集合隔离，只清理本服务拥有的在线集合前缀。
- 索引不可用或代际不匹配时，调用方明确降级，不能将过期索引结果当作权威依据。
- 当前 worker 按单实例运行；扩展前须实现租约、fencing 与并发发布约束。

`evaluation/retrieval-matrix.json` 位于仓库根目录，固定嵌入、精排模型及 revision。依赖锁和模型版本变更应伴随独立检索对照；本机 CPU 实验延迟不能当作线上服务容量。
