import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

async function customer(request: APIRequestContext) {
  const user = {
      username: "fulfill_" + randomUUID().slice(0, 8),
      password: randomUUID() + "Aa9!",
    },
    telephone =
      "000" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
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
  const login = await (
    await request.post("/api/portal/sso/login", { form: user })
  ).json();
  expect(login.code).toBe(200);
  return login.data.tokenHead + login.data.token;
}

test("paid order → administrator shipment → customer receipt, with access boundaries", async ({
  page,
  request,
}) => {
  const accounts = JSON.parse(
    readFileSync(resolve("../../.local/p1-accounts.json"), "utf8").replace(
      /^\uFEFF/,
      "",
    ),
  );
  async function staff(role: string) {
    const account = accounts.find((a: { role: string }) => a.role === role);
    const r = await (
      await request.post("/api/admin/admin/login", {
        data: { username: account.username, password: account.password },
      })
    ).json();
    expect(r.code).toBe(200);
    return r.data.tokenHead + r.data.token;
  }
  const owner = await customer(request),
    other = await customer(request),
    admin = await staff("ADMIN"),
    service = await staff("SERVICE");
  async function call(
    side: string,
    path: string,
    token: string,
    body?: unknown,
  ) {
    return (
      await request.fetch(`/api/${side}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: token },
        ...(body === undefined ? {} : { data: body }),
      })
    ).json();
  }
  expect((await call("admin", "/shop_agent_stack/fulfillment", service)).code).toBe(403);
  expect(
    (
      await call("portal", "/member/address/add", owner, {
        name: "模拟收货人",
        phoneNumber: "00000000000",
        defaultStatus: 0,
        province: "测试省",
        city: "测试市",
        region: "测试区",
        detailAddress: "合成配送地址",
      })
    ).code,
  ).toBe(200);
  const address = (await call("portal", "/member/address/list", owner)).data[0]
    .id;
  const product = (await call("portal", "/product/detail/10003", owner)).data
    .product;
  expect(
    (
      await call("portal", "/cart/add", owner, {
        productId: 10003,
        productSkuId: 10003,
        quantity: 1,
        productName: product.name,
        productPic: product.pic,
        productCategoryId: product.productCategoryId,
      })
    ).code,
  ).toBe(200);
  const cartIds = (await call("portal", "/cart/list", owner)).data.map(
    (c: { id: number }) => c.id,
  );
  const created = await call("portal", "/order/generateOrder", owner, {
    memberReceiveAddressId: address,
    payType: 0,
    cartIds,
  });
  expect(created.code).toBe(200);
  const id = created.data.order.id,
    orderSn = created.data.order.orderSn;
  const shipment = `/shop_agent_stack/fulfillment/${id}`,
    owned = `/shop_agent_stack/orders/${id}`;
  expect(
    (
      await call("admin", shipment + "/advance", service, {
        stage: "SHIPPED",
        note: "不能越权发货",
      })
    ).code,
  ).toBe(403);
  expect(
    (
      await call("admin", shipment + "/advance", admin, {
        stage: "SHIPPED",
        note: "未支付不能发货",
      })
    ).code,
  ).not.toBe(200);
  expect((await call("portal", owned + "/shipment", other)).code).not.toBe(200);
  expect((await call("portal", owned + "/receive", owner, {})).code).not.toBe(
    200,
  );
  expect(
    (await call("portal", owned + "/simulate-payment", owner, {})).code,
  ).toBe(200);
  await page.goto("/login?next=/admin/orders");
  await page.evaluate((t) => sessionStorage.setItem("shop_agent_stack_admin", t), admin);
  await page.goto("/admin/orders");
  await page.getByLabel("搜索订单号").fill(orderSn);
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.locator(".fulfillment-row")).toHaveCount(1);
  await page.getByRole("button", { name: "查看履约" }).click();
  await expect(
    page.getByRole("dialog").getByText(product.name, { exact: true }),
  ).toBeVisible();
  await page.getByLabel("配送备注").fill("已完成打包，交由模拟配送。");
  await page.getByRole("button", { name: "确认模拟发货" }).click();
  await expect(
    page.getByRole("button", { name: "更新为派送中" }),
  ).toBeVisible();
  expect(
    (
      await call("admin", shipment + "/advance", admin, {
        stage: "SHIPPED",
        note: "已完成打包，交由模拟配送。",
      })
    ).code,
  ).toBe(200);
  expect(
    (
      await call("admin", shipment + "/advance", admin, {
        stage: "SHIPPED",
        note: "不允许覆盖已发货备注",
      })
    ).code,
  ).not.toBe(200);
  await page.getByLabel("配送备注").fill("模拟包裹已到达配送站。");
  await page.getByRole("button", { name: "更新为派送中" }).click();
  await expect(page.getByText("模拟派送中", { exact: true })).toBeVisible();
  await page.screenshot({
    path: resolve("../../.local/screenshots/fulfillment-admin.png"),
    fullPage: true,
  });
  await page.evaluate((t) => sessionStorage.setItem("shop_agent_stack_portal", t), owner);
  await page.goto("/app/orders");
  await page.getByRole("button", { name: "查看物流" }).click();
  await expect(page.getByText("模拟派送中", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确认收货", exact: true }).click();
  await page
    .getByRole("button", { name: "确认已收到商品", exact: true })
    .click();
  await expect(page.getByText("已确认收货", { exact: true })).toBeVisible();
  expect((await call("portal", owned + "/receive", owner, {})).code).toBe(200);
  expect((await call("portal", owned + "/receive", other, {})).code).not.toBe(
    200,
  );
  const result = await call("portal", owned + "/shipment", owner);
  expect(result.data.status).toBe(3);
  expect(result.data.events).toHaveLength(3);
  await page.screenshot({
    path: resolve("../../.local/screenshots/fulfillment-customer.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBeTruthy();
  await page.screenshot({
    path: resolve("../../.local/screenshots/fulfillment-mobile.png"),
    fullPage: true,
  });
});
