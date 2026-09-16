// Packaging only: lossily encode generated PNGs as smaller WebP assets; retain originals locally.
import { chromium } from '../apps/web/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { root, loadCatalog } from './catalog-lib.mjs';
const {products}=loadCatalog();
const overrides=JSON.parse(readFileSync(resolve(root,'catalog/image-prompt-overrides.json'),'utf8'));
const target=resolve(root,'apps/web/public/products/catalog-v1');
const originals=resolve(root,'.local/catalog/originals');mkdirSync(originals,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const assets=[];
try {
  const page=await browser.newPage();
  for(const p of products) {
    const source=overrides[p.slug] ? resolve(root,'.local/catalog',p.slug+'-v2.png') : existsSync(resolve(target,p.slug+'.png')) ? resolve(target,p.slug+'.png') : resolve(originals,p.slug+'.png');
    const bytes=readFileSync(source);
    const result=await page.evaluate(async data => {
      const image=new Image();image.src=data;await image.decode();
      const factor=Math.min(1,800/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*factor);canvas.height=Math.round(image.naturalHeight*factor);
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      return {data:canvas.toDataURL('image/webp',.86),width:canvas.width,height:canvas.height};
    },'data:image/png;base64,'+bytes.toString('base64'));
    if(!result.data.startsWith('data:image/webp;base64,')) throw Error('WebP encoding failed');
    const output=Buffer.from(result.data.split(',')[1],'base64');
    writeFileSync(resolve(target,p.slug+'.webp'),output);
    assets.push({slug:p.slug,path:`/products/catalog-v1/${p.slug}.webp`,width:result.width,height:result.height,bytes:output.length,sha256:createHash('sha256').update(output).digest('hex'),sourceSha256:createHash('sha256').update(bytes).digest('hex'),prompt:overrides[p.slug] || (p.slug==='ivory-mug' ? 'Use case: product-mockup. Create one square catalog product photograph for ShopAgentStack fictional personal demo store. Subject: a single matte warm ivory ceramic coffee mug with large rounded handle, straight slightly tapered walls, no saucer, 350 ml proportions. Background seamless pale warm gray, soft daylight studio shadows, premium editorial ecommerce photography, product centered fully visible with comfortable margin, realistic ceramic texture. No writing, no logo, no watermark, no extra objects, no collage. Image must show only this one product. Save generated asset for integration into project.' : p.prompt)});
  }
} finally {await browser.close();}
if(new Set(assets.map(a=>a.sha256)).size!==100)throw Error('Expected 100 distinct product illustrations');
// Move only this manifest's newly generated PNGs, after every WebP was successfully encoded.
for(const p of products){
  const src=resolve(target,p.slug+'.png'),dst=resolve(originals,p.slug+'.png');
  if(relative(target,src).startsWith('..') || relative(originals,dst).startsWith('..')) throw Error('Asset path escaped workspace');
  if(existsSync(src)) {if(existsSync(dst))throw Error('Original archive already exists');renameSync(src,dst);}
}
writeFileSync(resolve(root,'catalog/image-manifest.json'),JSON.stringify({generator:'built-in image_gen',kind:'AI-generated fictional product illustrations',transform:'WebP quality 0.86; max edge 800; no visual retouching',assets},null,2)+'\n');
console.log(JSON.stringify({images:assets.length,totalBytes:assets.reduce((n,a)=>n+a.bytes,0)}));
