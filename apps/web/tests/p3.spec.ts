import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const accounts = JSON.parse(
  readFileSync(resolve("../../.local/p1-accounts.json"), "utf8").replace(
    /^\uFEFF/,
    "",
  ),
) as { username: string; password: string; role: string }[];
const createdPolicies: number[] = [];
test("P3d evidence clarification, bounded supplement and abstention", async ({page,request}) => {
  test.skip(!existsSync(resolve("../../.local/policy-library-v2-import.json")), "requires policy library");
  const bearer=await customer(request);
  await page.goto("/login");
  await page.evaluate(bearer => sessionStorage.setItem("shop_agent_stack_portal",bearer),bearer);
  for (const [question, expected] of [
    ["政策测试补问：拆封耳机能不能退", "请说明是仅拆开包装"],
    ["政策测试补查：我需要查整单申请范围", ""],
    ["政策测试证据不足：具体保修月数是多少", "不足以完整回答这个问题"],
  ]) {
    await page.goto("/app/assistant");
    await page.getByRole("button",{name:"新对话",exact:true}).click();
    await page.getByLabel("选择模型服务").selectOption("fixture");
    await page.getByLabel("发送给购物助手").fill(question);
    await page.getByRole("button",{name:"发送消息",exact:true}).click();
    await expect(page.locator(".agent-state").last()).toContainText("本次回复已完成");
    if (expected) await expect(page.locator(".agent-text").last()).toContainText(expected);
    else await expect(page.locator(".agent-text").last()).not.toBeEmpty();
    const process=page.locator(".agent-process").last();
    await process.locator("summary").click();
    await expect(process).toContainText("证据检查");
    if(question.includes("测试补查")) {
      await expect(process).toContainText("需要补查相关政策");
      await expect(process).toContainText("第 2 次");
      await expect(page.locator(".agent-citations a")).not.toHaveCount(0);
      await expect(page.locator(".agent-citations")).toContainText("ShopAgentStack 商城整单售后申请范围指引");
    } else await expect(page.locator(".agent-citations a")).toHaveCount(0);
  }
  await page.screenshot({path:resolve("../../.local/screenshots/p3d-evidence-check.png"),fullPage:true});
});
test("P3 library publication, pagination, source hashes and staff isolation", async ({ page, request }) => {
  test.skip(!existsSync(resolve("../../.local/policy-library-v2-import.json")), "requires explicit policy library import");
  const imported = JSON.parse(readFileSync(resolve("../../.local/policy-library-v2-import.json"), "utf8"));
  expect(imported.complete).toBe(true);
  const admin = await staff(request, "ADMIN"), bearer = await customer(request);
  const collected: { id: number; visibility: string }[] = [];
  let before = 0, pageCount = 0;
  while (true) {
    const rows = await call(request, "admin", `/shop_agent_stack/policies?before=${before}`, admin);
    collected.push(...rows); pageCount++;
    if (rows.length < 100) break;
    const next = rows[rows.length - 1].id;
    expect(before === 0 || next < before).toBe(true);
    before = next;
    expect(pageCount).toBeLessThan(100);
  }
  // A fresh library has 96 documents. Exercise the cursor without depending
  // on fixtures left behind by previous test runs to exceed the page limit.
  expect(collected.length).toBeGreaterThan(1);
  const suffix = await call(request, "admin", `/shop_agent_stack/policies?before=${collected[0].id}`, admin);
  expect(suffix.map((p: { id: number }) => p.id)).toEqual(collected.slice(1, 101).map(p => p.id));
  expect(new Set(collected.map(p => p.id)).size).toBe(collected.length);
  for (const mapping of imported.mappings) {
    expect(collected.find(p => p.id === mapping.policy_id)?.visibility).toBe(mapping.visibility);
    const response = await request.get(`/api/portal/shop_agent_stack/policies/${mapping.policy_id}?version=${mapping.version}`, {
      headers: { Authorization: bearer },
    });
    const body = await response.json();
    if (mapping.visibility === "STAFF") expect(body.code).not.toBe(200);
    else {
      expect(body.code).toBe(200);
      expect(body.data.clauses.map((c: {content_hash: string}) => c.content_hash))
        .toEqual(mapping.clauses.map((c: {content_hash: string}) => c.content_hash));
    }
  }
  const grant = await call(request, "portal", "/shop_agent_stack/agent/context", bearer, {});
  const clauses: {policy_id: number; clause_no: number; content_hash: string}[] = [];
  let after = 0;
  for (let n = 0; n < 100; n++) {
    const res = await request.get(`/api/portal/shop_agent_stack/internal/agent/policies?after=${after}`, {
      headers: { "X-ShopAgentStack-Execution": grant.executionToken },
    });
    const body = await res.json(); expect(body.code).toBe(200);
    clauses.push(...body.data.items);
    if (!body.data.more) break;
    expect(body.data.next).toBeGreaterThan(after); after = body.data.next;
  }
  for (const mapping of imported.mappings) {
    const hits = clauses.filter(c => c.policy_id === mapping.policy_id);
    expect(hits).toHaveLength(mapping.visibility === "STAFF" ? 0 : 3);
  }
  await page.goto("/login");
  await page.evaluate(({admin,bearer}) => {
    sessionStorage.setItem("shop_agent_stack_admin", admin); sessionStorage.setItem("shop_agent_stack_portal", bearer);
  }, {admin,bearer});
  await page.goto("/app/policies");
  await expect(page.locator("article.policy")).toHaveCount(10);
  const firstTitle = await page.locator("article.policy h2").first().innerText();
  await page.getByRole("button", {name:"下一页",exact:true}).click();
  await expect(page.locator("article.policy h2").first()).not.toHaveText(firstTitle);
  await page.getByLabel("搜索政策").fill("整单售后申请范围");
  await expect(page.getByRole("heading", {name:"ShopAgentStack 商城整单售后申请范围指引",exact:true})).toBeVisible();
  await page.getByLabel("搜索政策").fill("ShopAgentStack客服工单领取规范");
  await expect(page.locator("article.policy")).toHaveCount(0);
  await page.getByLabel("搜索政策").fill("");
  await page.screenshot({path:resolve("../../.local/screenshots/policy-library-v2.png"),fullPage:true});
  await page.goto("/admin");
  await page.getByLabel("搜索政策").fill("ShopAgentStack客服工单领取规范");
  await expect(page.locator("article.policy")).toContainText("仅内部可见");
});
test.afterEach(async ({ request }) => {
  const token = await staff(request, "ADMIN");
  for (const id of createdPolicies.splice(0)) {
    const response = await request.post(
      `/api/admin/shop_agent_stack/policies/${id}/withdraw`,
      { headers: { Authorization: token }, data: {} },
    );
    const body = await response.json();
    if (body.code !== 200) expect(body.message).toBe("仅已发布政策可撤回");
  }
});
async function call(
  request: APIRequestContext,
  side: string,
  path: string,
  token = "",
  data?: unknown,
  form = false,
) {
  const res = await request.fetch(`/api/${side}${path}`, {
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
  const username = "p3_" + randomUUID().slice(0, 8),
    password = randomUUID() + "Aa9!";
  const authCode = await call(
    request,
    "portal",
    `/sso/getAuthCode?telephone=${telephone}`,
  );
  await call(
    request,
    "portal",
    "/sso/register",
    "",
    { telephone, username, password, authCode },
    true,
  );
  const login = await call(
    request,
    "portal",
    "/sso/login",
    "",
    { username, password },
    true,
  );
  return login.tokenHead + login.token;
}
async function staff(request: APIRequestContext, role: string) {
  const account = accounts.find((a) => a.role === role)!;
  const login = await call(request, "admin", "/admin/login", "", {
    username: account.username,
    password: account.password,
  });
  return login.tokenHead + login.token;
}

test("P3 publish, cite original, revise and withdraw against real services", async ({
  page,
  request,
}) => {
  const admin = await staff(request, "ADMIN"),
    bearer = await customer(request);
  const title = "包装核实政策 " + randomUUID().replaceAll("-", "");
  await page.goto("/login");
  await page.evaluate(
    ({ admin, bearer }) => {
      sessionStorage.setItem("shop_agent_stack_admin", admin);
      sessionStorage.setItem("shop_agent_stack_portal", bearer);
    },
    { admin, bearer },
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "新建政策", exact: true }).click();
  await page.getByLabel("政策标题", { exact: true }).fill(title);
  await page
    .getByLabel("政策正文", { exact: true })
    .fill("拆封商品需先核实是否已经佩戴使用，不能仅凭拆封判定退款资格。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const card = page
    .locator("article.policy")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toContainText("未进入正式检索");
  let policies = await call(request, "admin", "/shop_agent_stack/policies", admin);
  const first = policies.find((p: { title: string }) => p.title === title);
  createdPolicies.push(first.id);
  const source = (id: number, version: number) =>
    request.get(`/api/portal/shop_agent_stack/policies/${id}?version=${version}`, {
      headers: { Authorization: bearer },
    });
  expect((await (await source(first.id, 1)).json()).code).not.toBe(200);
  await card.getByRole("button", { name: "发布政策", exact: true }).click();
  await expect(card).toContainText("条款索引就绪");
  await page.goto("/app/assistant");
  await page.getByLabel("选择模型服务").selectOption("fixture");
  await page.getByLabel("发送给购物助手").fill("政策：" + title);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".agent-state").last()).toContainText(
    "本次回复已完成",
  );
  const citation = page
    .locator(".agent-citations a")
    .filter({ hasText: title });
  await expect(citation).toHaveCount(1);
  await page.screenshot({
    path: resolve("../../.local/screenshots/p3-policy-citation.png"),
    fullPage: true,
    animations: "disabled",
  });
  const sourceUrl = await citation.getAttribute("href");
  await citation.click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.locator("#clause-1")).toContainText(
    "P" + first.id + "V1C1",
  );
  await page.goto("/admin");
  await card.getByRole("button", { name: "修订政策", exact: true }).click();
  await page
    .getByLabel("政策正文", { exact: true })
    .fill("新版：拆封商品应记录使用情况并由客服核实；本政策不承诺自动退款。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const revision = page
    .locator("article.policy")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .filter({ hasText: "草稿" });
  await revision.getByRole("button", { name: "发布政策", exact: true }).click();
  await expect(revision).toHaveCount(0);
  policies = await call(request, "admin", "/shop_agent_stack/policies", admin);
  const second = policies.find(
    (p: { title: string; version: number }) =>
      p.title === title && p.version === 2,
  );
  createdPolicies.push(second.id);
  expect((await (await source(first.id, 1)).json()).code).not.toBe(200);
  expect((await (await source(second.id, 2)).json()).code).toBe(200);
  const published = page
    .locator("article.policy")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .filter({ hasText: "已发布" });
  await published
    .getByRole("button", { name: "撤回政策", exact: true })
    .click();
  await expect(
    page
      .locator("article.policy")
      .filter({ hasText: title })
      .filter({ hasText: "已撤回" }),
  ).toContainText("已从检索移除");
  expect((await (await source(second.id, 2)).json()).code).not.toBe(200);
  await page.goto(sourceUrl!);
  await expect(page.getByRole("alert")).toContainText("政策已失效或不可访问，请重新检索");
  await expect(page.getByRole("heading", {name:title,exact:true})).toHaveCount(0);
});

test("P3 catalog pagination and private policies never enter customer retrieval", async ({
  request,
}) => {
  const admin = await staff(request, "ADMIN"),
    service = await staff(request, "SERVICE"),
    bearer = await customer(request);
  const tag = randomUUID().replaceAll("-", "");
  const large = await call(request, "admin", "/shop_agent_stack/policies", admin, {
    title: "分页 " + tag,
    content: Array.from(
      { length: 205 },
      (_, i) => `分页条款 ${tag} ${i}：仅用于合成检索验收。`,
    ).join("\n"),
  });
  const privateId = await call(request, "admin", "/shop_agent_stack/policies", admin, {
    title: "内部 " + tag,
    content: "内部专用文字 " + tag,
    visibility: "STAFF",
  });
  createdPolicies.push(large, privateId);
  await call(request, "admin", `/shop_agent_stack/policies/${large}/publish`, admin, {});
  await call(
    request,
    "admin",
    `/shop_agent_stack/policies/${privateId}/publish`,
    admin,
    {},
  );
  const denied = await request.post(
    `/api/admin/shop_agent_stack/policies/${large}/withdraw`,
    { headers: { Authorization: service }, data: {} },
  );
  expect((await denied.json()).code).not.toBe(200);
  const grant = await call(
    request,
    "portal",
    "/shop_agent_stack/agent/context",
    bearer,
    {},
  );
  let after = 0,
    all: { policy_id: number; clause_no: number }[] = [],
    pages = 0;
  while (true) {
    const res = await request.get(
      `/api/portal/shop_agent_stack/internal/agent/policies?after=${after}`,
      { headers: { "X-ShopAgentStack-Execution": grant.executionToken } },
    );
    const body = await res.json();
    expect(body.code).toBe(200);
    all.push(...body.data.items);
    pages++;
    if (!body.data.more) break;
    after = body.data.next;
    expect(pages).toBeLessThan(20);
  }
  expect(pages).toBeGreaterThan(1);
  expect(all.filter((c) => c.policy_id === large)).toHaveLength(205);
  expect(all.some((c) => c.policy_id === privateId)).toBe(false);
  for (const id of [large, privateId])
    await call(request, "admin", `/shop_agent_stack/policies/${id}/withdraw`, admin, {});
});
