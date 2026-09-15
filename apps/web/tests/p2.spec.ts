import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

async function business(
  request: APIRequestContext,
  path: string,
  token = "",
  data?: unknown,
  form = false,
) {
  const res = await request.fetch("/api/portal" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { Authorization: token },
    ...(data === undefined
      ? {}
      : form
        ? { form: data as Record<string, string> }
        : { data }),
  });
  const body = await res.json();
  expect(body.code).toBe(200);
  return body.data;
}
async function customer(request: APIRequestContext) {
  const telephone =
    "000" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const user = {
    username: "p2ui_" + randomUUID().slice(0, 8),
    password: randomUUID() + "Aa9!",
  };
  const authCode = await business(
    request,
    "/sso/getAuthCode?telephone=" + telephone,
  );
  await business(
    request,
    "/sso/register",
    "",
    { ...user, telephone, authCode },
    true,
  );
  const login = await business(request, "/sso/login", "", user, true);
  return login.tokenHead + login.token;
}
async function paidOrder(request: APIRequestContext, token: string) {
  await business(request, "/member/address/add", token, {
    name: "Synthetic",
    phoneNumber: "00000000000",
    defaultStatus: 0,
    province: "Test",
    city: "Test",
    region: "Test",
    detailAddress: "Fixture",
  });
  const addresses = await business(request, "/member/address/list", token);
  await business(request, "/cart/add", token, {
    productId: 1,
    productSkuId: 1,
    quantity: 1,
    productCategoryId: 1,
  });
  const cart = await business(request, "/cart/list", token);
  const result = await business(request, "/order/generateOrder", token, {
    memberReceiveAddressId: addresses[0].id,
    payType: 0,
    cartIds: cart.map((c: { id: number }) => c.id),
  });
  await business(
    request,
    `/aster/orders/${result.order.id}/simulate-payment`,
    token,
    {},
  );
  return result.order.id as number;
}
async function login(page: Page, bearer: string) {
  await page.goto("/login?next=/app/assistant");
  await page.evaluate(
    (value) => sessionStorage.setItem("aster_portal", value),
    bearer,
  );
  await page.goto("/app/assistant");
  await expect(page.getByLabel("选择模型服务")).toHaveValue("fixture");
}
async function send(page: Page, text: string) {
  await page.getByLabel("发送给星序助手").fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
}
async function agent(
  request: APIRequestContext,
  path: string,
  token: string,
  data?: unknown,
) {
  return request.fetch("/api/agent" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { Authorization: token },
    ...(data === undefined ? {} : { data }),
  });
}

test("P2 browser: real order cards, persisted preview, explicit confirmation, idempotent replay", async ({
  page,
  request,
}) => {
  const bearer = await customer(request),
    oid = await paidOrder(request, bearer);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, bearer);
  await send(page, "查询我的订单");
  await expect(
    page.locator(".agent-data-card").filter({ hasText: `订单 #${oid}` }),
  ).toBeVisible();
  await expect(page.locator(".agent-state").last()).toContainText(
    "本次回复已完成",
  );
  await send(page, `申请售后，订单 ${oid}，原因：尺寸不合适`);
  await expect(
    page.getByRole("button", { name: "确认提交售后" }),
  ).toBeVisible();
  const sid = await page.evaluate(() =>
    sessionStorage.getItem("aster_agent_session"),
  );
  const snapshot = await (
    await agent(request, "/sessions/" + sid, bearer)
  ).json();
  const run = snapshot.runs.at(-1),
    preview = run.events.find(
      (e: { kind: string }) => e.kind === "preview",
    ).data;
  expect(run.status).toBe("WAITING_CONFIRMATION");
  const before = await business(request, "/aster/after-sales", bearer);
  expect(before.some((c: { order_id: number }) => c.order_id === oid)).toBe(
    false,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "确认提交售后" }),
  ).toBeVisible();
  mkdirSync(resolve("../../.local/screenshots"), { recursive: true });
  await page.screenshot({
    path: resolve("../../.local/screenshots/p2-preview.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "确认提交售后" }).click();
  await expect(page.locator(".agent-success")).toContainText("售后申请已提交");
  const replay = await agent(request, `/runs/${run.id}/confirm`, bearer, {
    operation_id: preview.id,
    confirmation_token: preview.confirmationToken,
  });
  expect(replay.status()).toBe(200);
  const after = await business(request, "/aster/after-sales", bearer);
  expect(
    after.filter((c: { order_id: number }) => c.order_id === oid),
  ).toHaveLength(1);
  const full = await (await agent(request, `/runs/${run.id}`, bearer)).json();
  const cursor = full.events[1].id;
  const events = await (
    await agent(request, `/runs/${run.id}/events?after=${cursor}`, bearer)
  ).text();
  const ids = [...events.matchAll(/^id: (\d+)/gm)].map((m) => Number(m[1]));
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.every((id) => id > cursor)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: resolve("../../.local/screenshots/p2-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("P2 ownership, request idempotency, stopping and no automatic provider fallback", async ({
  page,
  request,
}) => {
  const bearer = await customer(request),
    stranger = await customer(request);
  const session = await (await agent(request, "/sessions", bearer, {})).json();
  const body = {
    message: "测试慢响应",
    provider: "fixture",
    request_id: randomUUID(),
  };
  const first = await (
    await agent(request, `/sessions/${session.id}/runs`, bearer, body)
  ).json();
  const replay = await (
    await agent(request, `/sessions/${session.id}/runs`, bearer, body)
  ).json();
  expect(replay.id).toBe(first.id);
  for (const path of [
    `/sessions/${session.id}`,
    `/runs/${first.id}`,
    `/runs/${first.id}/events`,
  ])
    expect((await agent(request, path, stranger)).status()).toBe(404);
  expect(
    (await agent(request, `/runs/${first.id}/stop`, stranger, {})).status(),
  ).toBe(404);
  expect((await agent(request, "/sessions", "")).status()).toBe(401);
  await login(page, bearer);
  await page.getByRole("button", { name: "测试慢响应", exact: true }).click();
  await page.getByRole("button", { name: "停止生成", exact: true }).click();
  await expect(page.locator(".agent-state").last()).toContainText("已停止");
  const stopped = await (
    await agent(request, `/runs/${first.id}`, bearer)
  ).json();
  expect(stopped.status).toBe("STOPPED");
  expect(
    stopped.events.some((e: { kind: string }) => e.kind === "operation"),
  ).toBe(false);
  expect(
    (
      await agent(request, `/sessions/${session.id}/runs`, bearer, {
        ...body,
        provider: "unknown",
        request_id: randomUUID(),
      })
    ).status(),
  ).toBe(503);
});
