import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 90000,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "../../.local/p1-playwright.json" }],
  ],
  use: {
    baseURL: process.env.SHOP_AGENT_STACK_WEB_URL || "http://127.0.0.1:18030",
    channel: process.env.SHOP_AGENT_STACK_BROWSER_CHANNEL || "msedge",
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1000 },
  },
});
