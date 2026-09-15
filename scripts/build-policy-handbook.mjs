// Build review artifacts only; never connects to the application or publishes policies.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = text => createHash('sha256').update(text).digest('hex');
function readTsv(path) {
  const lines = readFileSync(resolve(root, path), 'utf8').trim().split(/\r?\n/);
  const keys = lines.shift().split('\t');
  return lines.map((line, i) => {
    const cells = line.split('\t');
    if (cells.length !== keys.length) throw Error(`${path}:${i + 2}: invalid columns`);
    return Object.fromEntries(keys.map((key, j) => [key, cells[j]]));
  });
}
const groups = [
  ['CUSTOMER', 'knowledge/authoring/policies.tsv', '客户服务政策手册'],
  ['STAFF', 'knowledge/authoring/staff-policies.tsv', '客服与知识运营规范'],
];
const ids = new Set(), titles = new Set(), clauses = new Set();
const catalog = [];
mkdirSync(resolve(root, 'knowledge/handbooks'), { recursive: true });
for (const [visibility, source, label] of groups) {
  const rows = readTsv(source);
  const sections = [`# 星序商城${label}`, '',
    '内容版本：2.0 · 状态：待人工审核、未发布 · 来源：独立原创模拟业务资料', '',
    '适用范围：Aster Commerce 当前学习环境。支付与退款为模拟流程，不发生真实资金流转。本文不是外部商家政策或真实交易承诺。文档生成日期不代表生效日期，线上生效版本以管理员发布记录为准。', '',
    '政策编号用于证据追踪，不属于标题。正文是待审阅的服务规则与指引；具体订单资格和办理结果仍须查询业务记录。', '', '## 目录', '',
    ...rows.map(r => `- [${r.title}](#${r.id.toLowerCase()})`), ''];
  for (const row of rows) {
    if (ids.has(row.id) || titles.has(row.title)) throw Error('Duplicate ID or title');
    ids.add(row.id); titles.add(row.title);
    if (!row.title.startsWith('星序') || row.title.length > 120) throw Error('Invalid formal title');
    const texts = [1, 2, 3].map(n => row[`clause_${n}`]);
    for (const text of texts) {
      if (!text?.trim() || clauses.has(text)) throw Error(`Empty or duplicated clause: ${row.id}`);
      clauses.add(text);
    }
    catalog.push({id: row.id, title: row.title, category: row.category, visibility,
      content_version: 2, publication_status: 'DRAFT', review_status: 'AI_AUTHORED_REQUIRES_HUMAN_REVIEW',
      effective_from: null, source, clauses: texts.map((text, i) => ({id: `${row.id}-C${i+1}`, sha256: hash(text)}))});
    sections.push(`<a id="${row.id.toLowerCase()}"></a>`, `## ${row.title}`, '',
      `编号：${row.id} · 分类：${row.category} · 可见范围：${visibility === 'CUSTOMER' ? '客户（发布后）' : '仅授权员工（发布后）'}`, '',
      ...texts.map((text, i) => `${i+1}. ${text}`), '');
  }
  writeFileSync(resolve(root, `knowledge/handbooks/${visibility.toLowerCase()}.md`), sections.join('\n'));
}
const questions = readTsv('evaluation/policy-scenarios-v2.tsv');
const evidence = new Set(catalog.flatMap(d => d.clauses.map(c => c.id)));
const questionIds = new Set();
for (const q of questions) {
  if (questionIds.has(q.id)) throw Error('Duplicate question');
  questionIds.add(q.id);
  if (!q.query || !q.expected_behavior) throw Error('Empty scenario');
  if (['answerable', 'multi'].includes(q.kind) && !q.relevant_clauses) throw Error('Missing gold evidence');
  for (const id of q.relevant_clauses.split(',').filter(Boolean)) {
    if (!evidence.has(id) || !id.startsWith('POL-')) throw Error(`Invalid customer gold: ${id}`);
  }
}
writeFileSync(resolve(root, 'knowledge/catalog-v2.json'), JSON.stringify({schema_version: 1,
  source: 'aster-original-synthetic', documents: catalog.length, clauses: clauses.size,
  customer_documents: catalog.filter(d => d.visibility === 'CUSTOMER').length,
  staff_documents: catalog.filter(d => d.visibility === 'STAFF').length,
  development_scenarios: questions.length, policies: catalog}, null, 2)+'\n');
console.log(JSON.stringify({documents: catalog.length, clauses: clauses.size, scenarios: questions.length,
  publication: 'none', checks: 'unique IDs, formal titles, distinct clauses, valid evidence references'}));
