import { test, expect } from "@playwright/test";

test("delete conversation requires confirmation, handles conflicts and clears selection", async ({ page }) => {
  let deleted = false;
  let conflict = true;
  let deletes = 0;
  await page.addInitScript(() => {
    sessionStorage.setItem("shop_agent_stack_portal", "Bearer synthetic-session");
    sessionStorage.setItem("shop_agent_stack_session", "delete-test");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "DELETE") {
      expect(path).toBe("/api/agent/sessions/delete-test");
      deletes++;
      if (conflict) return route.fulfill({ status: 409, json: { detail: "请先停止执行后再删除对话" } });
      deleted = true;
      return route.fulfill({ json: { deleted: true } });
    }
    const body = path === "/api/portal/sso/info" ? { code: 200, data: { id: 1, username: "体验用户" } }
      : path === "/api/agent/settings" ? { providers: [], default_provider: "" }
      : path === "/api/agent/sessions" ? (deleted ? [] : [{ id: "delete-test", title: "售后规则咨询" }])
      : { id: "delete-test", title: "售后规则咨询", runs: [] };
    await route.fulfill({ json: body });
  });
  await page.goto("/app/assistant");
  const remove = page.getByRole("button", { name: "删除对话：售后规则咨询" });
  await remove.click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(deletes).toBe(0);
  await expect(remove).toBeVisible();
  await remove.click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请先停止执行");
  await expect(remove).toBeAttached();
  conflict = false;
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(remove).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("shop_agent_stack_session"))).toBeNull();
  await page.reload();
  await expect(page.getByText("你的对话会保存在这里。")).toBeVisible();
});
