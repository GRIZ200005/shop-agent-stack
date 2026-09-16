import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const local = resolve("../../.local");
const accounts = JSON.parse(
  readFileSync(resolve(local, "p1-accounts.json"), "utf8").replace(
    /^\uFEFF/,
    "",
  ),
) as { username: string; password: string; role: string }[];
const admin = accounts.find((a) => a.role === "ADMIN")!,
  service = accounts.find((a) => a.role === "SERVICE")!;
const tag = () => Math.random().toString(36).slice(2, 12);
const publishedFixtureTitles: string[] = [];
test.afterEach(async ({ request }) => {
  if (!publishedFixtureTitles.length) return;
  const token = await loginApi(request, "admin", admin);
  const policies = await call(request, "admin", "/shop_agent_stack/policies", token);
  expect(policies.code).toBe(200);
  for (const title of publishedFixtureTitles.splice(0)) {
    const policy = policies.data.find((p: { title: string }) => p.title === title);
    if (policy?.status === "PUBLISHED") {
      const result = await call(request, "admin", `/shop_agent_stack/policies/${policy.id}/withdraw`, token, {});
      expect(result.code, "Withdraw this test's published policy").toBe(200);
    }
  }
});
async function call(
  request: APIRequestContext,
  side: string,
  path: string,
  token = "",
  body?: unknown,
  form = false,
) {
  const response = await request.fetch(`/api/${side}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: token ? { Authorization: token } : {},
    ...(body === undefined
      ? {}
      : form
        ? { form: body as Record<string, string> }
        : { data: body }),
  });
  return response.json();
}
async function loginApi(
  request: APIRequestContext,
  side: string,
  user: { username: string; password: string },
) {
  const r = await call(
    request,
    side,
    side === "portal" ? "/sso/login" : "/admin/login",
    "",
    user,
    side === "portal",
  );
  expect(r.code).toBe(200);
  return r.data.tokenHead + r.data.token;
}
async function customer(request: APIRequestContext) {
  const user = { username: "e2e_" + tag(), password: "ShopAgentStack!" + tag() + "Aa9" };
  const telephone =
    "000" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const otp = await call(
    request,
    "portal",
    "/sso/getAuthCode?telephone=" + telephone,
  );
  const r = await call(
    request,
    "portal",
    "/sso/register",
    "",
    { ...user, telephone, authCode: otp.data },
    true,
  );
  expect(r.code).toBe(200);
  return { ...user, token: await loginApi(request, "portal", user) };
}
async function loginUi(
  page: Page,
  path: string,
  user: { username: string; password: string },
) {
  await page.goto(path);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("用户名", { exact: true }).fill(user.username);
  await page.getByLabel("密码", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
async function order(request: APIRequestContext, token: string) {
  let r = await call(request, "portal", "/member/address/add", token, {
    name: "Synthetic",
    phoneNumber: "00000000000",
    defaultStatus: 0,
    province: "Test",
    city: "Test",
    region: "Test",
    detailAddress: "Fixture",
  });
  expect(r.code).toBe(200);
  r = await call(request, "portal", "/member/address/list", token);
  const addressId = r.data[0].id;
  r = await call(request, "portal", "/cart/add", token, {
    productId: 1,
    productSkuId: 1,
    quantity: 1,
    price: 0.01,
    productName: "ShopAgentStack USB-C Cable",
    productCategoryId: 1,
  });
  expect(r.code).toBe(200);
  r = await call(request, "portal", "/cart/list", token);
  const ids = r.data.map((c: { id: number }) => c.id);
  r = await call(request, "portal", "/order/generateOrder", token, {
    memberReceiveAddressId: addressId,
    payType: 0,
    cartIds: ids,
  });
  expect(r.code).toBe(200);
  expect(r.data.order.payAmount).toBe(49.9);
  return r.data.order.id as number;
}

test("three-role browser journey: purchase, review, refund, publish policy", async ({
  page,
  request,
  browser,
}) => {
  const user = await customer(request);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginUi(page, "/app", user);
  // The expanded catalog is paginated; locate the fixture instead of assuming it is on page one.
  await page.getByRole("textbox", { name: "搜索商品", exact: true }).fill("ShopAgentStack USB-C Cable");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ShopAgentStack USB-C Cable" }),
  ).toBeVisible();
  mkdirSync(resolve(local, "screenshots"), { recursive: true });
  await page.screenshot({
    path: resolve(local, "screenshots/p1-customer.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "加入购物袋 ShopAgentStack USB-C Cable", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "已加入购物袋" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "购物袋", exact: true }).click();
  await page.getByRole("button", { name: "填写地址并下单" }).click();
  await page.getByRole("button", { name: "确认创建订单" }).click();
  await expect(page).toHaveURL(/\/app\/orders/);
  await page.getByRole("button", { name: "模拟支付", exact: true }).click();
  await expect(
    page.getByText("已支付 · 待发货", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "申请售后", exact: true }).click();
  const reason = "希望退还未发货商品 " + tag();
  await page.getByLabel("申请原因").fill(reason);
  await page.getByRole("button", { name: "确认提交售后" }).click();
  await expect(page.getByRole("heading", { name: reason })).toBeVisible();
  const staffPage = await browser.newPage({
    baseURL: process.env.SHOP_AGENT_STACK_WEB_URL || "http://127.0.0.1:18030",
  });
  await loginUi(staffPage, "/service", service);
  await expect(
    staffPage.getByRole("heading", { name: "每一次回应，都有温度。" }),
  ).toBeVisible();
  await staffPage
    .getByRole("button")
    .filter({ has: staffPage.getByRole("heading", { name: reason }) })
    .click();
  await staffPage.getByRole("button", { name: "领取并人工处理" }).click();
  await staffPage.getByLabel("审核说明").fill("已核对，批准整单模拟退款。");
  await staffPage.getByRole("button", { name: "通过并模拟退款" }).click();
  await expect(
    staffPage.getByRole("dialog").getByText("模拟退款完成", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await staffPage.screenshot({
    path: resolve(local, "screenshots/p1-service.png"),
    fullPage: true,
  });
  await staffPage.getByRole("button", { name: "关闭" }).click();
  await staffPage.getByText("退款监控与对账", { exact: true }).click();
  await expect(staffPage.getByText("账目一致", { exact: true }).first()).toBeVisible();
  const monitor = await call(request, "admin", "/shop_agent_stack/refunds/monitor", await loginApi(request, "admin", service));
  expect(monitor.code).toBe(200);
  expect(monitor.data.scope).toBe("P4_ASYNC_SIMULATOR");
  const latest = monitor.data.rows[0];
  await staffPage.getByRole("button", { name: `核对 #${latest.case_id}`, exact: true }).click();
  await expect(staffPage.getByText(`售后 #${latest.case_id}：账目一致。本次核查未修改任何账目。`, { exact: true })).toBeVisible();
  const anonymous = await request.get("/api/admin/shop_agent_stack/refunds/monitor");
  const anonymousBody = await anonymous.json();
  expect([401,403]).toContain(anonymousBody.code);
  expect(anonymousBody.data?.rows).toBeUndefined();
  const customerDenied = await request.get("/api/admin/shop_agent_stack/refunds/monitor", { headers: { Authorization: user.token } });
  const customerBody = await customerDenied.json();
  expect([401,403]).toContain(customerBody.code);
  expect(customerBody.data?.rows).toBeUndefined();
  await staffPage.screenshot({ path: resolve(local, "screenshots/p4b-refund-monitor.png"), fullPage: true });
  await page.reload();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: reason }) })
    .click();
  await expect(
    page.getByRole("dialog").getByText("模拟退款完成", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("模拟退款已完成，无真实资金流转", { exact: true }),
  ).toBeVisible();
  const adminPage = await browser.newPage({
    baseURL: process.env.SHOP_AGENT_STACK_WEB_URL || "http://127.0.0.1:18030",
  });
  await loginUi(adminPage, "/admin", admin);
  await expect(
    adminPage.getByRole("heading", { name: "让服务，有章可循。" }),
  ).toBeVisible();
  await adminPage
    .getByRole("button", { name: "新建政策", exact: true })
    .click();
  const title = "售后体验政策 " + tag();
  publishedFixtureTitles.push(title);
  await adminPage.getByLabel("政策标题").fill(title);
  await adminPage
    .getByLabel("政策正文")
    .fill("测试发布内容：本商城仅进行模拟交易。");
  await adminPage.getByRole("button", { name: "保存", exact: true }).click();
  const card = adminPage
    .locator("article")
    .filter({ has: adminPage.getByRole("heading", { name: title }) });
  await card.getByRole("button", { name: "发布政策" }).click();
  await expect(card.getByText("已发布 · V1")).toBeVisible();
  await adminPage.screenshot({
    path: resolve(local, "screenshots/p1-admin.png"),
    fullPage: true,
  });
  await page.goto("/app/policies");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await staffPage.goto("/admin");
  await expect(
    staffPage.getByRole("heading", { name: "没有管理中心访问权限" }),
  ).toBeVisible();
  const cases = await call(request, "portal", "/shop_agent_stack/after-sales", user.token);
  const completed = cases.data.find(
    (s: { reason: string }) => s.reason === reason,
  );
  expect(completed.status).toBe("REFUNDED");
  writeFileSync(
    resolve(local, "p1-flow.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        caseId: completed.id,
        orderId: completed.order_id,
        amount: completed.amount,
        status: completed.status,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  await staffPage.close();
  await adminPage.close();
});

test("API boundaries, duplicate submit, concurrent claims, rejected refund, role restrictions", async ({
  request,
}) => {
  const a = await customer(request),
    b = await customer(request),
    staffToken = await loginApi(request, "admin", service),
    adminToken = await loginApi(request, "admin", admin);
  const id = await order(request, a.token);
  expect(
    (
      await call(
        request,
        "portal",
        `/order/paySuccess?orderId=${id}&payType=0`,
        a.token,
        {},
      )
    ).code,
  ).toBe(403);
  expect(
    (
      await call(
        request,
        "portal",
        `/shop_agent_stack/orders/${id}/simulate-payment`,
        b.token,
        {},
      )
    ).code,
  ).not.toBe(200);
  expect(
    (
      await call(request, "portal", "/shop_agent_stack/after-sales", a.token, {
        orderId: id,
        reason: "未支付",
      })
    ).code,
  ).not.toBe(200);
  expect(
    (
      await call(
        request,
        "portal",
        `/shop_agent_stack/orders/${id}/simulate-payment`,
        a.token,
        {},
      )
    ).code,
  ).toBe(200);
  expect(
    (
      await call(
        request,
        "portal",
        `/shop_agent_stack/orders/${id}/simulate-payment`,
        a.token,
        {},
      )
    ).code,
  ).toBe(200);
  expect(
    (
      await call(request, "portal", "/shop_agent_stack/after-sales", b.token, {
        orderId: id,
        reason: "越权",
      })
    ).code,
  ).not.toBe(200);
  const submitted = await call(
    request,
    "portal",
    "/shop_agent_stack/after-sales",
    a.token,
    { orderId: id, reason: "API synthetic case" },
  );
  expect(submitted.code).toBe(200);
  const caseId = submitted.data.id;
  const duplicate = await call(
    request,
    "portal",
    "/shop_agent_stack/after-sales",
    a.token,
    { orderId: id, reason: "API synthetic case" },
  );
  expect(duplicate.data.id).toBe(caseId);
  expect(
    (await call(request, "portal", `/shop_agent_stack/after-sales/${caseId}`, b.token))
      .code,
  ).not.toBe(200);
  expect(
    (await call(request, "portal", "/shop_agent_stack/after-sales", b.token)).data,
  ).toEqual([]);
  const claims = await Promise.all(
    [staffToken, adminToken].map((t) =>
      call(request, "admin", `/shop_agent_stack/after-sales/${caseId}/claim`, t, {}),
    ),
  );
  expect(claims.filter((c) => c.code === 200)).toHaveLength(1);
  const winner = claims[0].code === 200 ? staffToken : adminToken,
    loser = winner === staffToken ? adminToken : staffToken;
  expect(
    (
      await call(
        request,
        "admin",
        `/shop_agent_stack/after-sales/${caseId}/decision`,
        loser,
        { approved: true, note: "wrong assignee" },
      )
    ).code,
  ).not.toBe(200);
  expect(
    (
      await call(
        request,
        "admin",
        `/shop_agent_stack/after-sales/${caseId}/decision`,
        winner,
        { approved: false, note: "信息不足，拒绝本次申请" },
      )
    ).code,
  ).toBe(200);
  expect(
    (
      await call(
        request,
        "admin",
        `/shop_agent_stack/after-sales/${caseId}/decision`,
        winner,
        { approved: true, note: "duplicate" },
      )
    ).code,
  ).not.toBe(200);
  const rejected = await call(
    request,
    "portal",
    `/shop_agent_stack/after-sales/${caseId}`,
    a.token,
  );
  expect(rejected.data.status).toBe("REJECTED");
  expect(rejected.data.refund_reference ?? null).toBeNull();
  expect(
    (
      await call(request, "admin", "/shop_agent_stack/policies", staffToken, {
        title: "forbidden",
        content: "forbidden",
      })
    ).code,
  ).toBe(403);
  expect((await call(request, "admin", "/shop_agent_stack/staff", staffToken)).code).toBe(
    403,
  );
  expect((await call(request, "admin", "/admin/list", staffToken)).code).toBe(
    403,
  );
  expect(
    (
      await call(request, "admin", "/admin/register", "", {
        username: "forbidden_" + tag(),
        password: "UnusedPassword!12",
      })
    ).code,
  ).toBe(403);
  expect((await call(request, "admin", "/shop_agent_stack/me", a.token)).code).not.toBe(
    200,
  );
  const newUser = {
    username: "staff_" + tag(),
    password: "P1!" + tag() + "aA9",
  };
  expect(
    (
      await call(request, "admin", "/shop_agent_stack/staff", adminToken, {
        ...newUser,
        name: "Synthetic Staff",
        role: "SERVICE",
      })
    ).code,
  ).toBe(200);
  const newToken = await loginApi(request, "admin", newUser);
  expect((await call(request, "admin", "/shop_agent_stack/me", newToken)).data.role).toBe(
    "SERVICE",
  );
  const draftTitle = "Private draft " + tag();
  expect(
    (
      await call(request, "admin", "/shop_agent_stack/policies", adminToken, {
        title: draftTitle,
        content: "Not published",
      })
    ).code,
  ).toBe(200);
  const visible = await call(request, "portal", "/shop_agent_stack/policies", a.token);
  expect(
    visible.data.some((p: { title: string }) => p.title === draftTitle),
  ).toBe(false);
});

test("mobile navigation, real registration, empty state and service failure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/orders");
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({
    path: resolve(local, "screenshots/p1-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "还没有账户？创建账户" }).click();
  await page.getByLabel("用户名", { exact: true }).fill("mobile_" + tag());
  await page.getByLabel("密码", { exact: true }).fill("Synthetic!" + tag());
  await page
    .getByLabel("测试手机号")
    .fill("000" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"));
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByLabel("体验验证码")).not.toHaveValue("");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: "还没有订单" })).toBeVisible();
  await page.route("**/api/portal/product/search**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: 503, message: "测试：服务暂不可用" }),
    }),
  );
  await page.goto("/app");
  await expect(page.getByRole("alert")).toContainText("测试：服务暂不可用");
});
