import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const marker = 'shop_agent_stack-catalog-v1-original-synthetic';
export const promptPrefix = 'Use case: product-mockup. Create one square individual product catalog photograph for ShopAgentStack, a fictional demo store. ';
export const promptSuffix = '. Premium realistic editorial ecommerce product photography, seamless pale warm grey background, soft diffuse studio daylight with subtle shadow, product centered and fully visible with comfortable margins. Show exactly the described product or set only. Accurate materials and construction, understated minimalist design. No brand logos, no writing or labels, no watermarks, no decorative props, no collage, no people.';
export function loadCatalog({ requireImages = false } = {}) {
  const source = readFileSync(resolve(root, 'catalog/products.tsv'), 'utf8').replace(/^\uFEFF/, '');
  const lines = source.trim().split(/\r?\n/), fields = lines.shift().split('|');
  const categories = [];
  const products = lines.map((line, index) => {
    const cells = line.split('|');
    if (cells.length !== fields.length || cells.some(c => !c.trim())) throw Error(`Invalid catalog row ${index + 2}`);
    const row = Object.fromEntries(fields.map((f, i) => [f, cells[i]]));
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(row.slug) || !/^\d+\.\d{2}$/.test(row.price)) throw Error('Invalid slug or price');
    for (const field of ['stock', 'weight_g']) if (!/^\d+$/.test(row[field]) || +row[field] <= 0) throw Error(`Invalid ${field}`);
    if (!categories.includes(row.category)) categories.push(row.category);
    const pic = `/products/catalog-v1/${row.slug}.webp`;
    if (requireImages && !existsSync(resolve(root, 'apps/web/public' + pic))) throw Error(`Missing product image: ${row.slug}`);
    return { ...row, id: 10001 + index, skuId: 10001 + index, categoryId: 1011 + categories.indexOf(row.category),
      brandId: 101, productSn: `SHOP_AGENT_STACK-LIFE-${row.slug.toUpperCase()}`, pic,
      prompt: promptPrefix + 'Subject: ' + row.image_subject + promptSuffix };
  });
  if (products.length !== 100 || new Set(products.map(p => p.slug)).size !== 100 || new Set(products.map(p => p.name)).size !== 100 || categories.length !== 10) throw Error('Expected 100 unique products in 10 categories');
  return { sourceSha256: createHash('sha256').update(source).digest('hex'), categories, products };
}
