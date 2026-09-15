import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("friendly model choices submit exact IDs and preserve saved unlisted models", async ({
  page,
}) => {
  const saved: Record<
    string,
    { model: string; base_url: string; has_key: boolean }
  > = {
    deepseek: {
      model: "",
      base_url: "https://api.deepseek.com",
      has_key: false,
    },
    openai: {
      model: "previous-account-snapshot",
      base_url: "https://api.openai.com/v1",
      has_key: true,
    },
    kimi: { model: "", base_url: "https://api.moonshot.cn/v1", has_key: false },
    custom: { model: "", base_url: "", has_key: false },
  };
  let submitted: Record<string, string> = {};
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path === "/api/portal/sso/info")
      body = { code: 200, data: { id: 1, username: "模型选择体验" } };
    else if (path === "/api/agent/settings")
      body = {
        nickname: "",
        compact: false,
        default_provider: "",
        providers: [],
      };
    else if (path.startsWith("/api/agent/settings/providers/")) {
      const id = path.split("/").at(-1)!;
      if (route.request().method() === "POST") {
        submitted = route.request().postDataJSON();
        saved[id] = {
          model: submitted.model,
          base_url: submitted.base_url,
          has_key: true,
        };
      }
      body = {
        provider: id,
        ...saved[id],
        key_mask: saved[id].has_key ? "••••••••" : "",
      };
    } else {
      await route.fulfill({
        status: 404,
        json: { detail: "Unexpected test request" },
      });
      return;
    }
    await route.fulfill({ json: body });
  });
  await page.goto("/login");
  await page.evaluate(() =>
    sessionStorage.setItem("aster_portal", "Bearer synthetic-test-session"),
  );
  await page.goto("/app/settings?tab=models");
  const picker = page.getByRole("combobox", { name: "模型名称", exact: true });
  await expect(picker).toHaveValue("");
  await picker.selectOption({ label: "DeepSeek V4 Pro" });
  await expect(picker).toHaveValue("deepseek-v4-pro");
  await page.screenshot({
    path: resolve("../../.local/screenshots/model-picker.png"),
    fullPage: true,
  });
  await page
    .getByLabel("API Key", { exact: true })
    .fill("synthetic-not-a-real-key");
  await page.getByRole("button", { name: "保存模型配置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("模型配置已加密保存");
  expect(submitted.model).toBe("deepseek-v4-pro");
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "OpenAI", exact: true }).click();
  await expect(picker).toHaveValue("previous-account-snapshot");
  await expect(picker.locator("option:checked")).toContainText(
    "当前已保存模型",
  );
  await picker.selectOption({ label: "GPT-5 Mini" });
  await expect(picker).toHaveValue("gpt-5-mini");
  await page.getByRole("button", { name: "Kimi", exact: true }).click();
  await picker.selectOption({ label: "Kimi K3" });
  await expect(picker).toHaveValue("kimi-k3");
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "模型名称", exact: true })
    .fill("my-custom-model");
  await expect(
    page.getByRole("textbox", { name: "模型名称", exact: true }),
  ).toHaveValue("my-custom-model");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "DeepSeek", exact: true }).click();
  await expect(picker).toHaveValue("deepseek-v4-pro");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
