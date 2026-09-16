import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const accounts = JSON.parse(
  readFileSync(resolve("../../.local/p1-accounts.json"), "utf8").replace(
    /^\uFEFF/,
    "",
  ),
);
async function call(
  r: APIRequestContext,
  side: string,
  path: string,
  token: string,
  body?: unknown,
) {
  return (
    await r.fetch(`/api/${side}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: token },
      ...(body === undefined ? {} : { data: body }),
    })
  ).json();
}
async function login(r: APIRequestContext, side: string, user: any) {
  const response = await r.post(
    `/api/${side}${side === "portal" ? "/sso/login" : "/admin/login"}`,
    side === "portal" ? { form: user } : { data: user },
  );
  const b = await response.json();
  expect(b.code).toBe(200);
  return b.data.tokenHead + b.data.token;
}
async function customer(r: APIRequestContext) {
  const telephone = "000" + String(Date.now()).slice(-8),
    user = {
      username: "support_" + randomUUID().slice(0, 8),
      password: randomUUID() + "Aa9!",
    };
  const otp = await (
    await r.get("/api/portal/sso/getAuthCode?telephone=" + telephone)
  ).json();
  expect(
    (
      await (
        await r.post("/api/portal/sso/register", {
          form: { ...user, telephone, authCode: otp.data },
        })
      ).json()
    ).code,
  ).toBe(200);
  return login(r, "portal", user);
}

test("support ownership, duplicate requests and competing staff claim", async ({
  request,
}) => {
  const owner = await customer(request),
    other = await customer(request);
  const a = await login(
      request,
      "admin",
      accounts.find((u: any) => u.role === "ADMIN"),
    ),
    b = await login(
      request,
      "admin",
      accounts.find((u: any) => u.role === "SERVICE"),
    );
  const body = {
    requestId: randomUUID(),
    title: "并发领取验证",
    context: "合成咨询，仅测试人工服务流程",
  };
  const created = await call(request, "portal", "/shop_agent_stack/support", owner, body);
  expect(created.code).toBe(200);
  expect(
    (await call(request, "portal", "/shop_agent_stack/support", owner, body)).data.id,
  ).toBe(created.data.id);
  const path = "/shop_agent_stack/support/" + created.data.id;
  expect((await call(request, "portal", path, other)).code).not.toBe(200);
  expect(
    (
      await call(request, "portal", path + "/messages", other, {
        requestId: randomUUID(),
        content: "越权",
      })
    ).code,
  ).not.toBe(200);
  const claims = await Promise.all([
    call(request, "admin", path + "/claim", a, {}),
    call(request, "admin", path + "/claim", b, {}),
  ]);
  expect(claims.filter((c) => c.code === 200)).toHaveLength(1);
  const winner = claims[0].code === 200 ? a : b,
    loser = winner === a ? b : a;
  expect(
    (
      await call(request, "admin", path + "/messages", loser, {
        requestId: randomUUID(),
        content: "不可代回",
      })
    ).code,
  ).not.toBe(200);
  const reply = {
    requestId: randomUUID(),
    content: "并发领取已核实，仅一位客服接手。",
  };
  expect(
    (await call(request, "admin", path + "/messages", winner, reply)).code,
  ).toBe(200);
  expect(
    (await call(request, "admin", path + "/messages", winner, reply)).code,
  ).toBe(200);
  expect(
    (await call(request, "portal", path, owner)).data.messages.filter(
      (m: any) => m.author_role === "STAFF",
    ),
  ).toHaveLength(1);
  expect(
    (await call(request, "admin", path + "/resolve", winner, {})).code,
  ).toBe(200);
  expect(
    (
      await call(request, "portal", path + "/messages", owner, {
        requestId: randomUUID(),
        content: "已关闭",
      })
    ).code,
  ).not.toBe(200);
});

test("customer handoff, staff reply, polling and resolution", async ({
  page,
  browser,
  request,
}) => {
  const owner = await customer(request),
    staff = await login(
      request,
      "admin",
      accounts.find((u: any) => u.role === "SERVICE"),
    );
  await page.addInitScript(
    (t) => sessionStorage.setItem("shop_agent_stack_portal", t),
    owner,
  );
  await page.goto("/app/assistant");
  await page.getByRole("button", { name: "转人工客服", exact: true }).click();
  await page.getByLabel("咨询主题", { exact: true }).fill("扩展坞接口咨询");
  await page
    .getByLabel("问题描述与会话摘录", { exact: true })
    .fill(
      "关注扩界 USB-C 扩展坞。希望客服说明如何核对主机接口。此为合成测试咨询。",
    );
  await page
    .getByLabel("问题描述与会话摘录", { exact: true })
    .pressSequentially("补充说明");
  await expect(
    page.getByLabel("问题描述与会话摘录", { exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "确认提交咨询", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/support\?ticket=/);
  const id = new URL(page.url()).searchParams.get("ticket")!;
  const detail = page.locator(".support-conversation");
  await expect(detail).toContainText("等待客服");
  const worker = await browser.newPage({ baseURL: "http://127.0.0.1:18030" });
  try {
    await worker.addInitScript(
      (t) => sessionStorage.setItem("shop_agent_stack_admin", t),
      staff,
    );
    await worker.goto("/service/support?ticket=" + id);
    await worker.getByRole("button", { name: "领取咨询", exact: true }).click();
    await worker
      .getByLabel("回复客户", { exact: true })
      .fill(
        "请核对电脑 USB-C 接口是否支持视频输出；仅有 USB-C 外形不能保证显示器连接能力。",
      );
    await worker.getByRole("button", { name: "发送回复", exact: true }).click();
    await expect(detail).toContainText("仅有 USB-C 外形", { timeout: 12000 });
    await page
      .getByLabel("补充消息", { exact: true })
      .fill("收到，我会先核对设备说明书。");
    await page.getByRole("button", { name: "发送回复", exact: true }).click();
    await expect(worker.locator(".support-conversation")).toContainText(
      "先核对设备说明书",
      { timeout: 12000 },
    );
    await worker.screenshot({
      path: resolve("../../.local/screenshots/support-staff.png"),
      fullPage: true,
    });
    await worker
      .getByRole("button", { name: "标记已解决", exact: true })
      .click();
    await expect(detail).toContainText("本咨询已解决", { timeout: 12000 });
    await page.screenshot({
      path: resolve("../../.local/screenshots/support-customer.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page
          .locator(".sidebar")
          .evaluate((el) => el.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(0);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBeTruthy();
    await page.screenshot({
      path: resolve("../../.local/screenshots/support-mobile.png"),
      fullPage: true,
    });
  } finally {
    await worker.close();
  }
});
