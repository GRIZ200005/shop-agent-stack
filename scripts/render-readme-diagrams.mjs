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
function line(d,dash=false,color='#94a3b8') { parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" ${dash?'stroke-dasharray="6 5"':''} marker-end="url(#arrow)"/>`); }
function start(title,subtitle,h) { parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${h}" viewBox="0 0 1200 ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(subtitle)}</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1 L7 4 L1 7" fill="none" stroke="#94a3b8" stroke-width="1.5"/></marker></defs><g font-family="Segoe UI, Microsoft YaHei, PingFang SC, sans-serif">`]; rect(1,1,1198,h-2,'#ffffff','#e2e8f0',24); text(36,42,'ASTER COMMERCE  /  ENGINEERING',12,'#7c3aed',700); text(36,82,title,29,'#172033',700); text(36,112,subtitle,16); }
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
line('M420 554 H216 V488'); text(252,540,'授权调用',13);
line('M780 554 H984 V488'); text(807,540,'政策检索',13);
card(36,578,360,110,'MySQL + Redis',['MySQL：业务、政策、Outbox','Redis：登录相关缓存、验证码等'],'blue'); line('M104 486 V576');
card(804,578,360,110,'Milvus',['政策派生索引 · 代际管理','MySQL 中有效条款为权威来源'],'green'); line('M1098 486 V576');
rect(420,642,360,46,'#f8fafc'); text(438,671,'Agent 存储 · SQLite 会话与事件',16);
rect(36,718,1128,64,'#f8fafc'); text(60,746,'模型连接',14,'#7c3aed',650); text(60,768,'LangGraph → DeepSeek / OpenAI / Kimi / 自定义兼容接口；模型不直接写入业务数据库。',17);
rect(36,806,1128,112,'#fffbeb','#fde68a'); text(60,835,'异步模拟退款 · 发布器与消费者位于 Admin 应用',16,'#92400e',650);
text(60,876,'审批事务 + Outbox',18,'#172033',600); line('M249 870 H299'); text(315,876,'RabbitMQ',18,'#172033',600); line('M432 870 H480'); text(496,876,'幂等消费 + 模拟账本',18,'#172033',600); line('M706 870 H754'); text(770,876,'结果落库 / 有界重试 / 人工核实',18,'#172033',600);
text(36,942,'逻辑职责视图：卡片不代表独立微服务。支付、退款和物流均为模拟流程。',14);
save('system-architecture.svg');

start('政策 Agentic RAG · 从检索候选到可追溯回答','在线问答与索引维护分开呈现 / 最多两次政策搜索 / 最终来源再次核验',872);
rect(36,146,1128,70,'#f5f3ff','#ddd6fe'); text(60,174,'用户问题 → 受控政策搜索',20,'#4c1d95',650); text(60,201,'问题与当前任务进入证据子图，搜索次数受运行预算约束。',16);
line('M216 216 V276');
text(36,254,'01  混合召回与排序',15,'#2563eb',700); text(420,254,'02  证据检查与补查',15,'#7c3aed',700); text(804,254,'03  来源复核与回答',15,'#059669',700);
card(36,278,360,106,'双路召回',['BM25 关键词 + BGE 向量检索','Milvus 保存政策向量索引'],'blue');
card(36,418,360,100,'RRF + BGE Rerank',['排名融合后精排候选条款'],'blue'); line('M216 384 V416');
card(420,278,360,106,'合并本轮证据',['合并同轮多条搜索结果','检查问题所需依据是否充分'],'purple');
card(420,418,360,100,'证据判断',['足够 → 复核；需补查 → 预算检查'],'purple'); line('M600 384 V416');
line('M396 468 H408 V331 H418');
card(804,278,360,106,'核验当前权威来源',['MySQL：发布状态、可见性与版本','引用需对应当前有效条款'],'green');
card(804,418,360,100,'回答与可追溯引用',['结论 + 条款标识 + 原文卡片'],'green'); line('M984 384 V416'); text(994,404,'通过',12,'#059669');
line('M780 468 H792 V331 H802');
card(420,564,360,100,'有界补查',['未达两次上限：补查并重新合并','需澄清或预算耗尽：说明缺口'],'amber'); line('M600 518 V562');
card(804,564,360,100,'补问或说明证据缺口',['信息不足、来源失效时不强答','不会因此继续执行业务写入'],'amber'); line('M780 614 H802');
line('M1164 332 H1179 V614 H1166',true); text(1060,551,'复核未通过',13,'#b45309');
line('M420 614 H408 V544 H24 V265 H216 V276',true);
text(36,569,'预算内补查',14,'#b45309');
rect(36,704,1128,104,'#f8fafc'); text(60,734,'索引维护 · 独立于单次问答执行',16,'#475569',650);
text(60,774,'政策发布 / 修订 / 撤回',17,'#172033',600); line('M297 768 H338',true); text(354,774,'MySQL + 事务 Outbox',17,'#172033',600); line('M580 768 H618',true); text(634,774,'索引 Worker',17,'#172033',600); line('M772 768 H810',true); text(826,774,'Milvus 代际更新',17,'#172033',600);
text(36,838,'实线：主要处理流程    虚线：补查、异常分支或索引维护    检索不可用时明确降级为 BM25。',14);
save('policy-agentic-rag.svg');
