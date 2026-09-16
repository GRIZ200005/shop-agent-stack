// Local-only, explicit publication. Never prints credentials or connects to model providers.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publish = process.argv.includes('--publish');
const hash = s => createHash('sha256').update(s).digest('hex');
const catalog = JSON.parse(readFileSync(resolve(root, 'knowledge/catalog-v2.json'), 'utf8'));
function tsv(path) {
  const lines = readFileSync(resolve(root,path),'utf8').trim().split(/\r?\n/);
  const keys = lines.shift().split('\t');
  return lines.map(line => Object.fromEntries(line.split('\t').map((v,i)=>[keys[i],v])));
}
const customer = tsv('knowledge/authoring/policies.tsv');
const staff = tsv('knowledge/authoring/staff-policies.tsv');
const source = new Map([...customer,...staff].map(p=>[p.id,p]));
if (source.size !== catalog.documents) throw Error('Catalog count mismatch');
const plans = catalog.policies.map(p => {
  const row = source.get(p.id);
  const visibility = p.id.startsWith('SOP-') ? 'STAFF' : 'CUSTOMER';
  const clauses = [1,2,3].map(n=>row?.[`clause_${n}`]);
  if (p.visibility !== visibility || p.title !== row?.title || clauses.some((c,i)=>!c || hash(c)!==p.clauses[i].sha256))
    throw Error('Catalog is stale or visibility invalid; rebuild and review');
  return {source_id:p.id, title:p.title, visibility, content:clauses.join('\n'), clauses:p.clauses};
});
if (!publish) {
  console.log(JSON.stringify({mode:'review-only',customer:customer.length,staff:staff.length,mutations:0}));
} else {
  const credentials = JSON.parse(readFileSync(resolve(root,'.local/p1-accounts.json'),'utf8').replace(/^\uFEFF/,''));
  const admin = credentials.find(a=>a.role==='ADMIN');
  const base = 'http://127.0.0.1:18030/api/admin';
  let token = '';
  async function call(path, body) {
    const response = await fetch(base+path,{method:body===undefined?'GET':'POST',
      headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{})},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const result = await response.json();
    if(result.code!==200) throw Error(`Policy API failed: ${path} (code ${result.code})`);
    return result.data;
  }
  const auth = await call('/admin/login',{username:admin.username,password:admin.password});
  token=auth.tokenHead+auth.token;
  async function list() {
    const all=[]; let before=0;
    for(let page=0;page<100;page++) {
      const rows=await call('/shop_agent_stack/policies?before='+before);
      all.push(...rows);
      if(rows.length<100) return all;
      const next=rows.at(-1).id;
      if(before && next>=before) throw Error('Invalid pagination');
      before=next;
    }
    throw Error('Policy listing exceeds import budget');
  }
  // Preflight every collision before making the first mutation.
  const existing=await list();
  for(const p of plans) {
    const matches=existing.filter(r=>r.title===p.title);
    if(matches.length>1 || matches.some(r=>r.content!==p.content || r.visibility!==p.visibility || !['DRAFT','PUBLISHED'].includes(r.status)))
      throw Error(`Policy conflict ${p.source_id}; review and revise explicitly`);
  }
  const mapping=[];
  let created=0, published=0;
  mkdirSync(resolve(root,'.local'),{recursive:true});
  function save(complete) {
    writeFileSync(resolve(root,'.local/policy-library-v2-import.json'),JSON.stringify({complete,
      catalog_sha256:hash(readFileSync(resolve(root,'knowledge/catalog-v2.json'))),
      mappings:mapping},null,2)+'\n');
  }
  for(const p of plans) {
    let row=existing.find(r=>r.title===p.title);
    if(!row) {
      const id=await call('/shop_agent_stack/policies',{title:p.title,content:p.content,visibility:p.visibility});
      row={id,version:1,status:'DRAFT'}; created++;
    }
    mapping.push({source_id:p.source_id,policy_id:row.id,version:row.version,visibility:p.visibility,
      clauses:p.clauses.map((c,i)=>({source_clause_id:c.id,clause_no:i+1,content_hash:c.sha256,
        citation_id:`P${row.id}V${row.version}C${i+1}`}))});
    save(false);
    if(row.status==='DRAFT') {await call(`/shop_agent_stack/policies/${row.id}/publish`,{});published++;}
  }
  const after=await list();
  for(const p of plans) {
    const row=after.find(r=>r.title===p.title);
    if(!row || row.status!=='PUBLISHED' || row.visibility!==p.visibility || row.clause_count!==3 || row.content!==p.content)
      throw Error(`Post-publication validation failed ${p.source_id}`);
  }
  save(true);
  console.log(JSON.stringify({mode:'local-published',created,published,verified:mapping.length,
    customer:customer.length,staff:staff.length,mapping:'.local/policy-library-v2-import.json'}));
}
