// Usage: node scripts/compare-retrieval-runs.mjs <baseline-run-dir> <candidate-run-dir>
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [left, right] = process.argv.slice(2);
if (!left || !right) throw Error('Supply baseline and candidate run directories');
const read = (dir, file) => JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
const a = read(left, 'manifest.json'), b = read(right, 'manifest.json');
if (a.status !== 'COMPLETED' || b.status !== 'COMPLETED') throw Error('Only completed runs can be compared');
for (const key of ['corpus_sha256', 'gold_sha256', 'split']) {
  if (a[key] !== b[key]) throw Error(`Not comparable: ${key} differs; establish a new baseline`);
}
for (const key of ['candidate_k', 'final_k', 'query_instruction', 'device']) {
  if (a.config[key] !== b.config[key]) throw Error(`Controlled comparison requires equal ${key}`);
}
const sa = read(left, 'summary.json'), sb = read(right, 'summary.json');
console.log('Mode | Recall@5 delta (percentage points) | MRR delta | p95 delta (ms)');
console.log('--- | ---: | ---: | ---:');
for (const mode of Object.keys(sb)) {
  if (!sa[mode]) continue;
  console.log(`${mode} | ${((sb[mode].recall_at_5-sa[mode].recall_at_5)*100).toFixed(2)} | ${(sb[mode].mrr_at_5-sa[mode].mrr_at_5).toFixed(4)} | ${(sb[mode].latency_p95_ms-sa[mode].latency_p95_ms).toFixed(1)}`);
}
console.log('\nObserved development-set differences only; confirm hardware, model revisions and code hashes in both manifests. No significance claim.');
