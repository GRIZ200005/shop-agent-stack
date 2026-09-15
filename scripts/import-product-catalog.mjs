// Original local fixture importer. No external service, no overwrites or stock reset.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadCatalog, marker, root } from './catalog-lib.mjs';
const apply = process.argv.includes('--apply');
const data = loadCatalog({ requireImages: apply });
const literal = value => `CONVERT(0x${Buffer.from(String(value), 'utf8').toString('hex')} USING utf8mb4)`;
const guard = condition => `INSERT INTO import_guard(ok) SELECT IF(${condition},1,0);`;
const sql = ['SET NAMES utf8mb4;', 'CREATE TEMPORARY TABLE import_guard(ok INT NOT NULL CHECK(ok=1));',
  guard("GET_LOCK('aster_product_catalog_v1',10)=1"), 'START TRANSACTION;'];
sql.push(guard(`NOT EXISTS(SELECT 1 FROM pms_brand WHERE id=101 AND NOT(name <=> ${literal('Aster Studio')}))`));
sql.push(`INSERT INTO pms_brand(id,name,sort,show_status,product_count,product_comment_count,brand_story) SELECT 101,${literal('Aster Studio')},10,1,100,0,${literal('星序原创模拟生活用品目录；非真实品牌交易。')} WHERE NOT EXISTS(SELECT 1 FROM pms_brand WHERE id=101);`);
for (const [i, category] of data.categories.entries()) {
  const id = 1011 + i;
  sql.push(guard(`NOT EXISTS(SELECT 1 FROM pms_product_category WHERE id=${id} AND NOT(name <=> ${literal(category)} AND parent_id <=> 0))`));
  sql.push(`INSERT INTO pms_product_category(id,parent_id,name,level,product_count,product_unit,nav_status,show_status,sort,description) SELECT ${id},0,${literal(category)},0,10,${literal('件')},1,1,${10-i},${literal(marker)} WHERE NOT EXISTS(SELECT 1 FROM pms_product_category WHERE id=${id});`);
}
// Reject all collisions before inserting any products. A repeated import preserves live stock and sales.
for (const p of data.products) {
  sql.push(guard(`NOT EXISTS(SELECT 1 FROM pms_product WHERE (id=${p.id} OR product_sn=${literal(p.productSn)}) AND NOT(COALESCE(id=${p.id} AND product_sn=${literal(p.productSn)} AND COALESCE(note,'')=${literal(marker)} AND name=${literal(p.name)} AND pic=${literal(p.pic)} AND price=${p.price} AND brand_id=101 AND product_category_id=${p.categoryId},0)))`));
  sql.push(guard(`NOT EXISTS(SELECT 1 FROM pms_sku_stock WHERE (id=${p.skuId} OR sku_code=${literal(p.productSn + '-STD')} OR product_id=${p.id}) AND NOT(COALESCE(id=${p.skuId} AND product_id=${p.id} AND sku_code=${literal(p.productSn + '-STD')} AND price=${p.price},0)))`));
  sql.push(guard(`(SELECT COUNT(*) FROM pms_product WHERE id=${p.id})=(SELECT COUNT(*) FROM pms_sku_stock WHERE product_id=${p.id})`));
}
for (const p of data.products) {
  const columns = ['id','brand_id','product_category_id','product_attribute_category_id','name','pic','product_sn','delete_status','publish_status','new_status','recommand_status','verify_status','sort','sale','price','original_price','stock','low_stock','unit','weight','preview_status','promotion_type','gift_growth','gift_point','brand_name','product_category_name','sub_title','description','detail_title','detail_desc','note','keywords'];
  const values = [p.id,101,p.categoryId,0,literal(p.name),literal(p.pic),literal(p.productSn),0,1,0,1,1,100-(p.id-10001),0,p.price,p.price,p.stock,10,literal('件'),p.weight_g,0,0,0,0,literal('Aster Studio'),literal(p.category),literal(p.specification),literal(p.description),literal(p.name),literal(`材质：${p.material}\n规格：${p.specification}\n使用与养护：${p.care}\n本商品为原创合成体验商品，图片为 AI 生成示意图，参数不代表实物检测或认证；无真实发货。售后以平台服务政策和人工审核为准。`),literal(marker),literal(`${p.category} ${p.material}`)];
  sql.push(`INSERT INTO pms_product(${columns.join(',')}) SELECT ${values.join(',')} WHERE NOT EXISTS(SELECT 1 FROM pms_product WHERE id=${p.id});`);
  sql.push(`INSERT INTO pms_sku_stock(id,product_id,sku_code,price,stock,low_stock,sale,lock_stock,sp_data,pic) SELECT ${p.skuId},${p.id},${literal(p.productSn+'-STD')},${p.price},${p.stock},10,0,0,${literal(JSON.stringify([{key:'规格',value:p.specification},{key:'材质',value:p.material}]))},${literal(p.pic)} WHERE NOT EXISTS(SELECT 1 FROM pms_sku_stock WHERE id=${p.skuId});`);
}
sql.push('COMMIT;', "DO RELEASE_LOCK('aster_product_catalog_v1');", `SELECT COUNT(*) catalog_products FROM pms_product WHERE note=${literal(marker)};`);
const dir=resolve(root,'.local/catalog');mkdirSync(dir,{recursive:true});
writeFileSync(resolve(dir,'import.sql'),sql.join('\n')+'\n');
const manifest={version:1,sourceSha256:data.sourceSha256,products:100,skus:100,categories:10,mode:apply?'apply':'review-only',synthetic:true,externalCalls:0};
if (apply) {
  const result=spawnSync('docker',['compose','--env-file',resolve(root,'.env'),'-f',resolve(root,'deploy/compose.p0.yml'),'exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -uaster -Daster -N'],{cwd:root,input:sql.join('\n'),encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024});
  if(result.status!==0) { console.error('Import aborted; transaction rolls back on SQL failure. No automatic overwrite performed.'); if(result.error) console.error(result.error.code); else console.error(result.stderr.slice(0,1500));process.exit(1); }
  if(result.stdout.trim()!=='100') throw Error('Unexpected post-import product count');
  manifest.images=data.products.map(p=>({slug:p.slug,pic:p.pic,sha256:createHash('sha256').update(readFileSync(resolve(root,'apps/web/public'+p.pic))).digest('hex')}));
}
writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({mode:manifest.mode,products:100,skus:100,categories:10,stockReset:false,report:'.local/catalog/manifest.json'}));
