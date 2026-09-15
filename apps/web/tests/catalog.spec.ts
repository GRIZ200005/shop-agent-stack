import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const cases = JSON.parse(
  readFileSync(resolve("../../catalog/search-cases.json"), "utf8"),
);
const images = JSON.parse(
  readFileSync(resolve("../../catalog/image-manifest.json"), "utf8"),
);

test("catalog: all 100 products, SKU details, image bytes, categories, queries and stable pagination", async ({
  request,
}) => {
  async function get(path: string) {
    const response = await request.get("/api/portal" + path);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.code).toBe(200);
    return body.data;
  }
  const found: any[] = [];
  for (let page = 1; page <= 5; page++) {
    const result = await get(
      `/product/search?brandId=101&pageNum=${page}&pageSize=20&sort=0`,
    );
    expect(result.total).toBe(100);
    found.push(...result.list);
  }
  expect(new Set(found.map((p) => p.id)).size).toBe(100);
  expect(found.map((p) => p.id).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 100 }, (_, i) => 10001 + i),
  );
  for (const p of found) {
    const detail = await get(`/product/detail/${p.id}`);
    expect(detail.product.detailDesc).toContain("材质：");
    expect(detail.product.detailDesc).toContain("合成体验商品");
    expect(detail.skuStockList).toHaveLength(1);
    expect(detail.skuStockList[0].price).toBe(p.price);
    const image = await request.get(p.pic);
    expect(image.ok()).toBeTruthy();
    expect(image.headers()["content-type"]).toContain("image/webp");
    expect(
      createHash("sha256")
        .update(await image.body())
        .digest("hex"),
    ).toBe(images.assets.find((a: any) => a.path === p.pic).sha256);
  }
  for (let id = 1011; id <= 1020; id++) {
    const result = await get(
      `/product/search?productCategoryId=${id}&pageSize=20&pageNum=1`,
    );
    expect(result.total).toBe(10);
    expect(
      result.list.every((p: any) => p.productCategoryId === id),
    ).toBeTruthy();
  }
  for (const row of cases.cases) {
    const result = await get(
      `/product/search?brandId=101&pageSize=100&pageNum=1&keyword=${encodeURIComponent(row.query)}`,
    );
    expect(
      result.list.map((p: any) => p.id).sort((a: number, b: number) => a - b),
    ).toEqual(row.expectedIds);
  }
  const sorted: any[] = [];
  for (let page = 1; page <= 5; page++)
    sorted.push(
      ...(
        await get(
          `/product/search?brandId=101&pageNum=${page}&pageSize=20&sort=3`,
        )
      ).list,
    );
  expect(new Set(sorted.map((p) => p.id)).size).toBe(100);
  for (let i = 1; i < sorted.length; i++) {
    expect(sorted[i].price).toBeGreaterThanOrEqual(sorted[i - 1].price);
    if (sorted[i].price === sorted[i - 1].price)
      expect(sorted[i].id).toBeGreaterThan(sorted[i - 1].id);
  }
});

test("catalog: customer browsing, detail, cart image and mobile layout", async ({
  page,
  request,
}) => {
  const user = {
      username: "catalog_" + randomUUID().slice(0, 8),
      password: randomUUID() + "Aa9!",
    },
    telephone = "000" + String(Date.now()).slice(-8);
  const otp = await (
    await request.get("/api/portal/sso/getAuthCode?telephone=" + telephone)
  ).json();
  expect(
    (
      await (
        await request.post("/api/portal/sso/register", {
          form: { ...user, telephone, authCode: otp.data },
        })
      ).json()
    ).code,
  ).toBe(200);
  await page.goto("/app");
  await page.getByLabel("用户名", { exact: true }).fill(user.username);
  await page.getByLabel("密码", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(20);
  const total = (
    await (
      await request.get("/api/portal/product/search?pageNum=1&pageSize=1")
    ).json()
  ).data.total;
  expect(total).toBeGreaterThanOrEqual(100);
  await expect(page.locator(".catalog-pagination")).toContainText(
    `共 ${total} 件`,
  );
  const first = await page.locator(".product-card h3").allTextContents();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".catalog-pagination")).toContainText("第 2 /");
  await expect(page.locator(".product-card h3").first()).not.toHaveText(first[0]);
  expect(
    (await page.locator(".product-card h3").allTextContents()).some((n) =>
      first.includes(n),
    ),
  ).toBeFalsy();
  await page.getByRole("button", { name: "杯壶饮具", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(10);
  await page
    .getByRole("button", { name: "查看商品 晨白 陶瓷马克杯", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("350 mL");
  await expect(dialog).toContainText("使用与养护");
  await page.screenshot({
    path: resolve("../../.local/screenshots/catalog-detail.png"),
  });
  await dialog.getByRole("button", { name: "加入购物袋", exact: true }).click();
  await expect(page.locator('.notice[role="status"]')).toContainText("已加入购物袋");
  await page.goto("/app/cart");
  await expect(page.locator(".cart-row img")).toHaveAttribute(
    "src",
    "/products/catalog-v1/ivory-mug.webp",
  );
  const cart = await page.evaluate(async () => {
    const token = sessionStorage.getItem("aster_portal");
    return (
      await (
        await fetch("/api/portal/cart/list/promotion", {
          headers: { Authorization: token || "" },
        })
      ).json()
    ).data;
  });
  // Remove only this test account's own cart row; no order or payment is created.
  for (const item of cart)
    await page.evaluate(async (id) => {
      await fetch("/api/portal/cart/delete?ids=" + id, {
        method: "POST",
        headers: {
          Authorization: sessionStorage.getItem("aster_portal") || "",
        },
      });
    }, item.id);
  await page.goto("/app?product=10001");
  await expect(page.getByRole("dialog")).toContainText("晨白 陶瓷马克杯");
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(20);
  await page.screenshot({
    path: resolve("../../.local/screenshots/catalog-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBeTruthy();
  await page.screenshot({
    path: resolve("../../.local/screenshots/catalog-mobile.png"),
    animations: "disabled",
  });
});
