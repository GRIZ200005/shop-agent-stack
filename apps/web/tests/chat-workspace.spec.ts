import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("streaming workspace renders Markdown, deduplicates results and restores history", async ({
  page,
}) => {
  const events: { id: number; kind: string; data: Record<string, unknown> }[] =
    [];
  const run = {
    id: "synthetic-run",
    input: "我曾经买过哪些东西？",
    provider: "custom",
    status: "RUNNING",
    events,
  };
  await page.addInitScript(() => {
    sessionStorage.setItem("aster_portal", "Bearer synthetic-session");
    sessionStorage.setItem("aster_agent_session", "synthetic-session");
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      if (String(args[0]).includes("/events?")) {
        return new Response(
          new ReadableStream({
            start(controller) {
              (
                window as unknown as { chatChunk: (value: string) => void }
              ).chatChunk = (value) =>
                controller.enqueue(new TextEncoder().encode(value));
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return original(...args);
    };
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === "/api/portal/sso/info"
        ? { code: 200, data: { id: 1, username: "体验用户" } }
        : path === "/api/agent/settings"
          ? {
              nickname: "",
              compact: false,
              default_provider: "custom",
              providers: [
                {
                  id: "custom",
                  label: "演示模型",
                  model: "synthetic",
                  configured: true,
                },
              ],
            }
          : path === "/api/agent/sessions"
            ? [{ id: "synthetic-session", title: run.input }]
            : path === "/api/agent/sessions/synthetic-session"
              ? { id: "synthetic-session", title: run.input, runs: [run] }
              : run;
    await route.fulfill({ json: body });
  });
  await page.goto("/app/assistant");
  await page.waitForFunction(() =>
    Boolean((window as unknown as { chatChunk?: unknown }).chatChunk),
  );
  async function emit(kind: string, data: Record<string, unknown>) {
    const event = { id: events.length + 1, kind, data };
    events.push(event);
    await page.evaluate(
      (value) =>
        (window as unknown as { chatChunk: (v: string) => void }).chatChunk(
          value,
        ),
      `data: ${JSON.stringify(event)}\n\n`,
    );
  }
  await emit("tool", {
    name: "list_my_orders",
    tool_call_id: "one",
    status: "started",
  });
  await emit("tool", {
    name: "list_my_orders",
    tool_call_id: "one",
    status: "completed",
  });
  await emit("business", {
    orders: [{ id: 10, pay_amount: 378.9, status: 4 }],
  });
  await emit("business", { order: { id: 10, pay_amount: 378.9, status: 4 } });
  await emit("assistant_delta", {
    message_id: "reply",
    text: "您有 **1 笔订单**。\n\n",
  });
  await expect(page.locator(".agent-text strong")).toHaveText("1 笔订单");
  await expect(page.locator(".agent-state")).toContainText("正在处理");
  await emit("assistant_delta", {
    message_id: "reply",
    text: "- USB-C 数据线 × 1\n- 无线耳机 × 1\n\n订单已关闭。",
  });
  await expect(page.locator(".agent-text li")).toHaveCount(2);
  await expect(page.locator(".agent-data-card")).toHaveCount(1);
  const product = {id:10001,name:"晨白 陶瓷马克杯",price:39,pic:"/products/catalog-v1/ivory-mug.webp",evidence_id:"G10001"};
  await emit("business", {products:[product]});
  await expect(page.locator(".agent-product-card")).toHaveCount(0);
  await emit("product_sources", {products:[product,product]});
  await expect(page.locator(".agent-product-card")).toHaveCount(1);
  await expect(page.locator(".agent-product-card")).toHaveAttribute("href", "/app?product=10001");
  await expect(page.locator(".agent-product-card img")).toHaveAttribute("src", product.pic);
  await expect(page.locator(".agent-tool")).not.toBeVisible();
  await page.locator(".agent-process summary").click();
  await expect(page.locator(".agent-tool")).toHaveText("✓ 查询我的订单");
  await page.locator(".agent-process summary").click();
  const full =
    "您有 **1 笔订单**。\n\n- USB-C 数据线 × 1\n- 无线耳机 × 1\n\n订单已关闭。";
  await emit("assistant", { message_id: "reply", text: full });
  run.status = "COMPLETED";
  await emit("state", { status: "COMPLETED" });
  await expect(page.locator(".agent-text")).toHaveCount(1);
  await expect(page.locator(".agent-state")).toContainText("本次回复已完成");
  await page.reload();
  await expect(page.locator(".agent-text strong")).toHaveText("1 笔订单");
  await expect(page.locator(".agent-data-card")).toHaveCount(2);
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel("发送给星序助手")).toBeInViewport();
    const sizes = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      page: document.querySelector(".agent-page")!.getBoundingClientRect()
        .width,
      main: document.querySelector("main")!.getBoundingClientRect().width,
      font: getComputedStyle(document.querySelector(".agent-text")!).fontSize,
    }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.height + 1);
    expect(sizes.overflow).toBe(false);
    expect(sizes.page).toBe(sizes.main);
    expect(sizes.font).toBe("16px");
    await page.screenshot({
      path: resolve(`../../.local/screenshots/chat-workspace-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
});
