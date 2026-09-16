import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

test("checkout creates a pending order with atomic stock reservation", async ({
  request,
}) => {
  const username = "catalog_" + randomUUID().slice(0, 8),
    password = randomUUID() + "Aa9!",
    telephone = "000" + String(Date.now()).slice(-8);
  const otp = await (
    await request.get("/api/portal/sso/getAuthCode?telephone=" + telephone)
  ).json();
  expect(
    (
      await (
        await request.post("/api/portal/sso/register", {
          form: { username, password, telephone, authCode: otp.data },
        })
      ).json()
    ).code,
  ).toBe(200);
  const login = await (
    await request.post("/api/portal/sso/login", {
      form: { username, password },
    })
  ).json();
  expect(login.code).toBe(200);
  const headers = { Authorization: login.data.tokenHead + login.data.token };
  async function call(path: string, data?: unknown) {
    return (
      await request.fetch("/api/portal" + path, {
        headers,
        method: data === undefined ? "GET" : "POST",
        ...(data === undefined ? {} : { data }),
      })
    ).json();
  }
  expect(
    (
      await call("/member/address/add", {
        name: "库存验收用户",
        phoneNumber: "00000000000",
        defaultStatus: 0,
        province: "测试省",
        city: "测试市",
        region: "测试区",
        detailAddress: "合成地址",
      })
    ).code,
  ).toBe(200);
  const address = (await call("/member/address/list")).data[0].id;
  expect(
    (
      await call("/cart/add", {
        productId: 10002,
        productSkuId: 10002,
        quantity: 1,
      })
    ).code,
  ).toBe(200);
  const carts = (await call("/cart/list")).data.map(
    (c: { id: number }) => c.id,
  );
  const result = await call("/order/generateOrder", {
    memberReceiveAddressId: address,
    payType: 0,
    cartIds: carts,
  });
  expect(result.code).toBe(200);
  const id = result.data.order.id;
  try {
    expect((await call("/order/detail/" + id)).data.status).toBe(0);
  } finally {
    // Fixture cleanup, not a customer cancellation API. Match this exact synthetic owner and unpaid order.
    if (!Number.isSafeInteger(id) || !/^catalog_[a-f0-9]{8}$/.test(username))
      throw new Error("Invalid fixture identity");
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "shop_agent_stack-p0-mysql-1",
        "sh",
        "-c",
        'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -ushop_agent_stack -Dshop_agent_stack',
      ],
      {
        input: `START TRANSACTION;
SELECT o.id FROM oms_order o JOIN ums_member u ON u.id=o.member_id WHERE o.id=${id} AND u.username='${username}' AND o.status=0 FOR UPDATE;
UPDATE pms_sku_stock s JOIN oms_order_item i ON i.product_sku_id=s.id JOIN oms_order o ON o.id=i.order_id JOIN ums_member u ON u.id=o.member_id SET s.lock_stock=s.lock_stock-i.product_quantity WHERE o.id=${id} AND u.username='${username}' AND o.status=0 AND s.lock_stock>=i.product_quantity;
UPDATE oms_order o JOIN ums_member u ON u.id=o.member_id SET o.status=4 WHERE o.id=${id} AND u.username='${username}' AND o.status=0;
COMMIT;`,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  }
  expect((await call("/order/detail/" + id)).data.status).toBe(4);
});

test("administrator catalog UI, role checks and reversible inventory lifecycle", async ({
  page,
  request,
}) => {
  const accounts = JSON.parse(
    readFileSync(resolve("../../.local/p1-accounts.json"), "utf8").replace(
      /^\uFEFF/,
      "",
    ),
  );
  async function login(role: string) {
    const user = accounts.find((a: { role: string }) => a.role === role);
    const result = await (
      await request.post("/api/admin/admin/login", {
        data: { username: user.username, password: user.password },
      })
    ).json();
    expect(result.code).toBe(200);
    return result.data.tokenHead + result.data.token;
  }
  const admin = await login("ADMIN"),
    staff = await login("SERVICE");
  async function call(path: string, body?: unknown, auth = admin) {
    return (
      await request.fetch("/api/admin/shop_agent_stack/catalog" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: auth },
        ...(body === undefined ? {} : { data: body }),
      })
    ).json();
  }
  expect((await call("", undefined, staff)).code).toBe(403);
  const initial = await call("/10001");
  expect(initial.code).toBe(200);
  const product = initial.data,
    sku = product.skus[0];
  expect(
    (
      await call(
        "/10001/changes",
        {
          requestId: randomUUID(),
          action: "STOCK",
          skuId: sku.id,
          expected: sku.stock,
          value: 1,
          reason: "权限边界检查",
        },
        staff,
      )
    ).code,
  ).toBe(403);
  await page.goto("/login?next=/admin/products");
  await page.evaluate((t) => sessionStorage.setItem("shop_agent_stack_admin", t), admin);
  await page.goto("/admin/products");
  await expect(
    page.getByRole("heading", { name: "商品管理", exact: true }),
  ).toBeVisible();
  await page.getByLabel("搜索商品名称").fill(product.name);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.locator(".catalog-row")).toHaveCount(1);
  await page.screenshot({
    path: resolve("../../.local/screenshots/catalog-admin.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "管理", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const reason = "商品管理验收：补货与回滚";
  let payload: any;
  try {
    await page.getByLabel("调整数量").fill("3");
    await page.getByLabel("调整原因").fill(reason);
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/shop_agent_stack/catalog/10001/changes") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "保存库存调整" }).click();
    const response = await saved;
    payload = response.request().postDataJSON();
    expect((await response.json()).code).toBe(200);
    await expect(page.getByRole("status")).toContainText("调整已保存");
    expect((await call("/10001/changes", payload)).code).toBe(200);
    expect((await call("/10001")).data.skus[0].stock).toBe(sku.stock + 3);
    expect((await call("/10001/changes", { ...payload, value: 4 })).code).toBe(
      404,
    );
    expect(
      (
        await call("/10001/changes", {
          ...payload,
          requestId: randomUUID(),
          expected: sku.stock - 1,
        })
      ).code,
    ).toBe(404);
    await page.screenshot({
      path: resolve("../../.local/screenshots/catalog-inventory.png"),
      fullPage: true,
    });
    // Toggle only a previously published item, restoring its original state in finally.
    if (product.publish_status === 1) {
      expect(
        (
          await call("/10001/changes", {
            requestId: randomUUID(),
            action: "STATUS",
            skuId: 0,
            expected: 1,
            value: 0,
            reason,
          })
        ).code,
      ).toBe(200);
      const detail = await (
        await request.get("/api/portal/product/detail/10001")
      ).json();
      expect(detail.code).not.toBe(200);
    }
  } finally {
    const current = (await call("/10001")).data;
    // Undo only this test's delta; do not restore an old absolute stock snapshot.
    if (
      payload &&
      current.history.some((h: any) => h.request_id === payload.requestId)
    ) {
      expect(
        (
          await call("/10001/changes", {
            requestId: randomUUID(),
            action: "STOCK",
            skuId: sku.id,
            expected: current.skus[0].stock,
            value: -3,
            reason: "商品管理验收：撤回测试补货",
          })
        ).code,
      ).toBe(200);
    }
    if (current.publish_status !== product.publish_status) {
      expect(
        (
          await call("/10001/changes", {
            requestId: randomUUID(),
            action: "STATUS",
            skuId: 0,
            expected: current.publish_status,
            value: product.publish_status,
            reason: "商品管理验收：恢复上架状态",
          })
        ).code,
      ).toBe(200);
    }
  }
});
