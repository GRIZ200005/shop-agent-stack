import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
async function customer(request: APIRequestContext) {
  const user = {
    username: "account_" + randomUUID().slice(0, 8),
    password: randomUUID() + "Aa9!",
  };
  const telephone =
    "000" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const otp = (
    await (
      await request.get("/api/portal/sso/getAuthCode?telephone=" + telephone)
    ).json()
  ).data;
  expect(
    (
      await (
        await request.post("/api/portal/sso/register", {
          form: { ...user, telephone, authCode: otp },
        })
      ).json()
    ).code,
  ).toBe(200);
  return user;
}
test("P2.1 login gate, private model settings, account switching and mobile menu", async ({
  page,
  request,
}) => {
  const a = await customer(request),
    b = await customer(request),
    secret = "synthetic-ui-key-" + randomUUID();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/settings?tab=models");
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({
    path: resolve("../../.local/screenshots/p21-login.png"),
    fullPage: true,
  });
  await page.getByLabel("用户名", { exact: true }).fill(a.username);
  await page.getByLabel("密码", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("密码", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/settings/);
  await page.getByRole("button", { name: "模型设置", exact: true }).click();
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await page.getByLabel("模型名称", { exact: true }).fill("synthetic-model");
  await page
    .getByLabel("API 基础地址", { exact: true })
    .fill("https://model.example/v1");
  await page.getByLabel("API Key", { exact: true }).fill(secret);
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/settings/providers/custom") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "保存模型配置", exact: true }).click();
  expect(await (await saved).text()).not.toContain(secret);
  await expect(
    page.getByText("模型配置已加密保存", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...sessionStorage, ...localStorage }),
    ),
  ).not.toContain(secret);
  await page.reload();
  await page.getByRole("button", { name: "模型设置", exact: true }).click();
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await expect(page.getByLabel("模型名称", { exact: true })).toHaveValue(
    "synthetic-model",
  );
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  await page.screenshot({
    path: resolve("../../.local/screenshots/p21-settings.png"),
    fullPage: true,
  });
  // UI error presentation is mocked; no credentials or billable requests go to an external provider.
  await page.route("**/settings/providers/custom/test", (r) =>
    r.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ detail: "连接测试失败，请检查配置" }),
    }),
  );
  await page.getByRole("button", { name: "测试已保存连接" }).click();
  await expect(page.getByRole("alert")).toContainText("连接测试失败");
  await page.getByRole("button", { name: "个人资料", exact: true }).click();
  await page.getByLabel("显示名称", { exact: true }).fill("商城体验者");
  await page.getByLabel("默认模型", { exact: true }).selectOption("custom");
  await page.getByRole("button", { name: "保存偏好" }).click();
  await expect(page.getByRole("status")).toContainText("偏好已保存");
  await page.goto("/app/assistant");
  await expect(page.getByLabel("选择模型服务")).toHaveValue("custom");
  await page.getByRole("button", { name: "账户菜单", exact: true }).click();
  await page.getByRole("button", { name: "切换账户", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("shop_agent_stack_portal")),
  ).toBeNull();
  await page.getByLabel("用户名", { exact: true }).fill(b.username);
  await page.getByLabel("密码", { exact: true }).fill(b.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/assistant/);
  await page.goto("/app/settings?tab=models");
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await expect(page.getByLabel("模型名称", { exact: true })).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "展开导航" }).click();
  await page.getByRole("button", { name: "账户菜单", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "退出登录", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve("../../.local/screenshots/p21-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.goto("/app/orders");
  await expect(page).toHaveURL(/\/login/);
  expect(errors).toEqual([]);
});
