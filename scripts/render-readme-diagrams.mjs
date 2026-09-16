import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fixed coordinates keep README diagrams consistent across Markdown renderers.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/assets/diagrams');
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const colors = { blue: ['#eff6ff','#bfdbfe','#2563eb'], purple: ['#f5f3ff','#ddd6fe','#7c3aed'], green: ['#ecfdf5','#a7f3d0','#059669'], amber: ['#fffbeb','#fde68a','#b45309'], gray: ['#f8fafc','#e2e8f0','#475569'] };
let parts;
function text(x,y,s,size=16,color='#475569',weight=400) { parts.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`); }
function rect(x,y,w,h,fill,stroke='#e2e8f0',radius=16) { parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`); }
function card(x,y,w,h,title,lines,tone='gray') { const [fill,stroke,ink]=colors[tone]; rect(x,y,w,h,fill,stroke); parts.push(`<rect x="${x+18}" y="${y+21}" width="4" height="22" rx="2" fill="${ink}"/>`); text(x+34,y+39,title,20,'#172033',650); lines.forEach((s,i)=>text(x+24,y+69+i*25,s,16)); }
function line(d,dash=false,color='#94a3b8') { parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${dash?'stroke-dasharray="6 5"':''} marker-end="url(#arrow)"/>`); }
function start(title,subtitle,h) { parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${h}" viewBox="0 0 1200 ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(subtitle)}</desc><defs><marker id="arrow" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M1 1 L8 4.5 L1 8 Z" fill="#94a3b8"/></marker></defs><g font-family="Segoe UI, Microsoft YaHei, PingFang SC, sans-serif">`]; rect(1,1,1198,h-2,'#ffffff','#e2e8f0',24); text(36,42,'ASTER COMMERCE  /  ENGINEERING',12,'#7c3aed',700); text(36,82,title,29,'#172033',700); text(36,112,subtitle,16); }
function save(name) { parts.push('</g></svg>'); fs.mkdirSync(out,{recursive:true}); fs.writeFileSync(path.join(out,name),parts.join('\n')+'\n'); }

start('系统架构 · 业务、智能与数据的职责边界','三端协作 / 受控工具调用 / 权威业务数据 / 异步模拟退款',960);
card(36,146,1128,94,'React / TypeScript · 三端界面',['客户商城与 AI 助手    /    客服咨询与售后    /    管理员商品、库存与政策'],'purple');
line('M600 240 V262');
rect(36,264,1128,52,'#f8fafc'); text(60,297,'Nginx · 同源入口',19,'#172033',650); text(405,297,'REST API → Java     |     会话 API / SSE → FastAPI',17);
line('M216 316 V352'); line('M600 316 V352');
text(36,345,'01  业务服务',13,'#2563eb',700); text(420,345,'02  AGENT 服务',13,'#7c3aed',700); text(804,345,'03  检索服务',13,'#059669',700);
card(36,358,360,128,'Java / Spring Boot',['Portal + Admin · 权限与数据归属','商品 · 订单 · 库存 · 售后 · 政策'],'blue');
card(420,358,360,128,'FastAPI / LangGraph',['上下文 · 有界工具循环 · SSE','会话恢复 · 停止 · 个人模型配置'],'purple');
card(804,358,360,128,'政策混合检索',['BM25 + Milvus → RRF → BGE 精排','条款目录、版本与来源通过 Java 核验'],'green');
line('M600 486 V516');
card(420,522,360,102,'MCP 工具服务',['受控查询 · 售后确认预览'],'purple');
line('M414 554 H228 Q216 554 216 542 V494'); text(252,540,'授权调用',13);
line('M786 554 H972 Q984 554 984 542 V494'); text(807,540,'政策检索',13);
card(36,578,360,110,'MySQL + Redis',['MySQL：业务、政策、Outbox','Redis：登录相关缓存、验证码等'],'blue'); line('M104 486 V576');
card(804,578,360,110,'Milvus',['政策派生索引 · 代际管理','MySQL 中有效条款为权威来源'],'green'); line('M1098 486 V576');
rect(420,642,360,46,'#f8fafc'); text(438,671,'Agent 存储 · SQLite 会话与事件',16);
rect(36,718,1128,64,'#f8fafc'); text(60,746,'模型连接',14,'#7c3aed',650); text(60,768,'LangGraph → DeepSeek / OpenAI / Kimi / 自定义兼容接口；模型不直接写入业务数据库。',17);
rect(36,806,1128,112,'#fffbeb','#fde68a'); text(60,835,'异步模拟退款 · 发布器与消费者位于 Admin 应用',16,'#92400e',650);
text(60,876,'审批事务 + Outbox',18,'#172033',600); line('M249 870 H299'); text(315,876,'RabbitMQ',18,'#172033',600); line('M432 870 H480'); text(496,876,'幂等消费 + 模拟账本',18,'#172033',600); line('M706 870 H754'); text(770,876,'结果落库 / 有界重试 / 人工核实',18,'#172033',600);
text(36,942,'逻辑职责视图：卡片不代表独立微服务。支付、退款和物流均为模拟流程。',14);
save('system-architecture.svg');

start('政策 Agentic RAG · 从检索候选到可追溯回答','在线问答与索引维护分开呈现 / 最多两次政策搜索 / 最终来源再次核验',892);
rect(36,146,1128,70,'#f5f3ff','#ddd6fe'); text(60,174,'用户问题 → 受控政策搜索',20,'#4c1d95',650); text(60,201,'问题与当前任务进入证据子图，搜索次数受运行预算约束。',16);
line('M216 222 V270');
text(60,254,'01  混合召回与排序',15,'#2563eb',700); text(444,254,'02  证据检查与补查',15,'#7c3aed',700); text(828,254,'03  来源复核与回答',15,'#059669',700);
card(60,278,312,112,'双路召回',['BM25 关键词 + BGE 向量检索','Milvus 保存政策向量索引'],'blue');
card(60,434,312,112,'RRF + BGE Rerank',['排名融合后精排候选条款'],'blue'); line('M216 396 V426');
card(444,278,312,112,'合并本轮证据',['合并同轮多条搜索结果','检查问题所需依据是否充分'],'purple');
card(444,434,312,112,'证据判断',['足够：进入来源复核','需补查：检查剩余搜索预算'],'purple'); line('M600 396 V426');
line('M378 490 H396 Q408 490 408 478 V346 Q408 334 420 334 H436');
card(828,278,312,112,'核验当前权威来源',['MySQL：发布、可见性与版本','引用对应当前有效条款'],'green');
card(828,434,312,112,'回答与可追溯引用',['结论 + 条款标识 + 原文卡片'],'green'); line('M984 396 V426'); text(998,416,'通过',12,'#059669');
line('M762 490 H780 Q792 490 792 478 V346 Q792 334 804 334 H820');
card(444,602,312,112,'有界补查',['未达两次上限：补查并合并','需澄清或预算耗尽：说明缺口'],'amber'); line('M600 552 V594');
card(828,602,312,112,'补问或说明证据缺口',['信息不足、来源失效时不强答','不再继续执行业务写入'],'amber'); line('M762 658 H820');
line('M1146 334 H1156 Q1172 334 1172 350 V642 Q1172 658 1156 658 H1148',true); text(1016,581,'复核未通过',13,'#b45309');
line('M438 658 H420 Q408 658 408 646 V582 Q408 570 396 570 H40 Q24 570 24 554 V350 Q24 334 40 334 H52',true);
text(60,596,'预算内补查 · 返回召回',14,'#b45309');
rect(36,754,1128,78,'#f8fafc'); text(60,780,'索引维护 · 独立于单次问答执行',15,'#475569',650);
text(60,813,'政策发布 / 修订 / 撤回',16,'#172033',600); line('M285 807 H331',true); text(349,813,'MySQL + 事务 Outbox',16,'#172033',600); line('M559 807 H605',true); text(623,813,'索引 Worker',16,'#172033',600); line('M760 807 H806',true); text(824,813,'Milvus 代际更新',16,'#172033',600);
text(36,865,'实线：主要处理流程    虚线：补查、异常分支或索引维护    检索不可用时明确降级为 BM25。',14);
save('policy-agentic-rag.svg');
