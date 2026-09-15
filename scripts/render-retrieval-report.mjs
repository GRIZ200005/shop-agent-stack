import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = process.argv[2];
if (!dir) throw Error('Supply a completed run directory');
const read = name => JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
const manifest = read('manifest.json'), summary = read('summary.json');
if (manifest.status !== 'COMPLETED') throw Error('Cannot publish an incomplete run report');
const lines = ['# 检索对照实验结果', '', `运行：${manifest.run_id}`, '',
  `语料哈希：${manifest.corpus_sha256}`, '', `题集哈希：${manifest.gold_sha256}`, '',
  `范围：${manifest.index.documents} 条客户证据，${Object.values(summary)[0].scored_cases} 个可回答开发场景；另 ${manifest.unscored_behavior_cases} 个行为场景未评分。无线上请求或回答正确率结论。`, '',
  '| 方案 | Recall@5 | MRR@5 | nDCG@5 | p50 ms | p95 ms |',
  '|---|---:|---:|---:|---:|---:|'];
for (const [mode, r] of Object.entries(summary)) lines.push(
  `| ${mode} | ${(r.recall_at_5 * 100).toFixed(2)}% | ${r.mrr_at_5.toFixed(4)} | ${r.ndcg_at_5.toFixed(4)} | ${r.latency_p50_ms.toFixed(1)} | ${r.latency_p95_ms.toFixed(1)} |`);
lines.push('', `运行 ${manifest.config.repeats} 轮，CPU 4 线程；延迟为串行基础组件之和，已预热，非线上并发延迟。`, '',
  `嵌入：${manifest.models.embedding.id} @ ${manifest.models.embedding.revision}`, '',
  `精排：${manifest.models.reranker.id} @ ${manifest.models.reranker.revision}`, '',
  `Milvus：${manifest.milvus_version}，COSINE / FLAT，候选 ${manifest.config.candidate_k}，最终 5，RRF 常数 ${manifest.config.rrf_constant}。`, '',
  '语料和题目由 AI 辅助共同编写，存在等价证据漏标风险；本表不是独立盲测、语义支持率或业务成功率，也未进行显著性检验。', '',
  '完整逐题分数、候选、失败题与环境清单保存在对应 .local/retrieval-runs 目录。临时向量集合在完成后清理；在线助手未切换。', '');
mkdirSync('evaluation/reports', {recursive:true});
const output = `evaluation/reports/${manifest.run_id}.md`;
writeFileSync(output, lines.join('\n'));
console.log(output);
