import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Plus, Sparkles, Square, RefreshCw, Trash2 } from "lucide-react";
import { token } from "./api";
import { ProductArt, Modal } from "./ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./agent.css";
import { HandoffButton } from "./Support";

type Event = { id: number; kind: string; data: Record<string, unknown> };
type Run = {
  id: string;
  input: string;
  provider: string;
  status: string;
  events: Event[];
};
type Session = { id: string; title: string; runs?: Run[] };
type Provider = {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  test?: boolean;
};
const active = (r: Run) =>
  ["QUEUED", "RUNNING", "CONFIRMING", "STOPPING"].includes(r.status);
const labels: Record<string, string> = {
  QUEUED: "等待处理",
  RUNNING: "正在处理",
  WAITING_CONFIRMATION: "等待你的确认",
  CONFIRMING: "正在提交",
  COMPLETED: "本次回复已完成",
  FAILED: "本次执行未完成",
  STOPPED: "已停止",
  STOPPING: "正在停止",
  UNCERTAIN: "提交结果待核实",
  INTERRUPTED: "服务重启，执行已中断",
};
const toolNames: Record<string, string> = {
  list_my_orders: "查询我的订单",
  get_my_order: "读取订单详情",
  list_my_after_sales: "查询售后进度",
  preview_after_sale: "生成售后预览",
  get_operation_status: "核实操作状态",
  search_policies: "检索已发布政策",
  search_products: "查找商品与价格",
  get_product: "核对商品详情与库存",
};
async function agent<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch("/api/agent" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: token("portal"),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json();
  if (res.status === 401)
    window.dispatchEvent(new Event("shop_agent_stack-session-expired"));
  if (!res.ok)
    throw new Error(
      typeof data.detail === "string" ? data.detail : "服务暂不可用，请重试",
    );
  return data;
}
const money = (v: unknown) =>
  Number(v ?? 0).toLocaleString("zh-CN", {
    style: "currency",
    currency: "CNY",
  });
function BusinessCards({ data }: { data: Record<string, unknown> }) {
  const orders = (data.orders || (data.order ? [data.order] : [])) as Record<
    string,
    unknown
  >[];
  const sales = (data.after_sales || []) as Record<string, unknown>[];
  const products = (data.products || []) as Record<string, unknown>[];
  return (
    <div className="agent-cards">
      {products.map((p) => (
        <a
          className="agent-data-card agent-product-card"
          key={String(p.id)}
          href={`/app?product=${Number(p.id)}`}
        >
          <ProductArt
            id={Number(p.id)}
            src={String(p.pic || "")}
            alt={String(p.name)}
          />
          <small>商品依据 {String(p.evidence_id)}</small>
          <span>{String(p.name)}</span>
          <strong>{money(p.price)}</strong>
          <small>查看商品与当前规格 →</small>
        </a>
      ))}
      {orders.map((o) => (
        <a className="agent-data-card" key={String(o.id)} href="/app/orders">
          <small>订单 #{String(o.id)}</small>
          <strong>{money(o.pay_amount)}</strong>
          <span>
            {["待付款", "待发货", "已发货", "已完成", "已关闭"][
              Number(o.status)
            ] || "其他状态"}
          </span>
          <small>查看订单 →</small>
        </a>
      ))}
      {sales.map((s) => (
        <a
          className="agent-data-card"
          key={String(s.id)}
          href="/app/after-sales"
        >
          <small>
            售后 #{String(s.id)} · 订单 #{String(s.order_id)}
          </small>
          <strong>{money(s.amount)}</strong>
          <span>
            {(
              {
                SUBMITTED: "待受理",
                CLAIMED: "处理中",
                REFUNDED: "已模拟退款",
                REJECTED: "已拒绝",
              } as Record<string, string>
            )[String(s.status)] || String(s.status)}
          </span>
          <small>查看进度 →</small>
        </a>
      ))}
      {data.orders && !orders.length ? (
        <p>还没有订单，去发现好物逛逛吧。</p>
      ) : null}
      {data.after_sales && !sales.length ? <p>目前没有售后申请。</p> : null}
      {data.operation ? (
        <p>
          操作状态：{String((data.operation as Record<string, unknown>).status)}
        </p>
      ) : null}
    </div>
  );
}

function Reply({ run }: { run: Run }) {
  const messages = new Map<string, string>();
  const orders = new Map<string, Record<string, unknown>>();
  const sales = new Map<string, Record<string, unknown>>();
  const products = new Map<string, Record<string, unknown>>();
  const steps: { name: string; id: string; complete: boolean }[] = [];
  for (const e of run.events) {
    if (e.kind === "product_sources")
      for (const p of (e.data.products || []) as Record<string, unknown>[])
        products.set(String(p.id), p);
    if (e.kind === "assistant" || e.kind === "assistant_delta") {
      const id = String(e.data.message_id || e.id);
      messages.set(
        id,
        e.kind === "assistant"
          ? String(e.data.text)
          : (messages.get(id) || "") + String(e.data.text),
      );
    }
    if (e.kind === "tool") {
      const id = String(e.data.tool_call_id);
      if (e.data.status === "started")
        steps.push({ id, name: String(e.data.name), complete: false });
      else {
        const step = [...steps]
          .reverse()
          .find((s) => s.id === id && !s.complete);
        if (step) step.complete = true;
      }
    }
    if (e.kind === "business") {
      for (const o of (e.data.orders ||
        (e.data.order ? [e.data.order] : [])) as Record<string, unknown>[])
        orders.set(String(o.id), o);
      for (const s of (e.data.after_sales || []) as Record<string, unknown>[])
        sales.set(String(s.id), s);
    }
  }
  return (
    <>
      <details className="agent-process">
        <summary>
          {active(run) ? "正在处理请求" : "执行过程"} ·{" "}
          {steps.filter((s) => s.complete).length} 项操作已完成
        </summary>
        <div className="agent-process-body">
          <p>展示业务工具的执行状态与结果，不展示模型内部推理。</p>
          {run.events
            .filter((e) => e.kind === "context")
            .map((e) => (
              <p key={e.id}>
                已接续当前会话
                {Number(e.data.dropped_messages) > 0
                  ? "，较早的对话已省略；缺少信息时会再次询问。"
                  : "。"}
              </p>
            ))}
          {run.events
            .filter((e) => e.kind === "context_update")
            .map((e) => (
              <p key={e.id}>
                {e.data.reset
                  ? "已在本轮重置任务信息。"
                  : "已在本轮整理用户补充的信息，业务结果仍需核实。"}
              </p>
            ))}
          {run.events
            .filter((e) => e.kind === "policy_check")
            .map((e) => (
              <p key={e.id}>
                证据检查 · 第 {String(e.data.attempt)} 次：
                {(
                  {
                    sufficient: "证据可用于回答，仍需校验引用",
                    retry: "需要补查相关政策",
                    clarify: "需要补充适用信息",
                    insufficient: "现有依据不足",
                  } as Record<string, string>
                )[String(e.data.decision)] || "检查结束"}
              </p>
            ))}
          {run.events
            .filter((e) => e.kind === "retrieval")
            .map((e) => (
              <p key={e.id}>
                政策检索：
                {e.data.method === "HYBRID_RRF_RERANK"
                  ? "混合检索与精排"
                  : "关键词检索"}{" "}
                · {String(e.data.count ?? 0)} 条证据 ·{" "}
                {String(e.data.elapsed_ms ?? 0)} ms
              </p>
            ))}
          {steps.map((s, i) => (
            <div className="agent-tool" key={i}>
              {s.complete ? "✓" : active(run) ? "◌" : "–"}{" "}
              {toolNames[s.name] || "业务工具"}
              {!s.complete ? (active(run) ? "…" : " · 未完成") : ""}
            </div>
          ))}
          {!steps.length && (
            <div className="agent-tool">
              {active(run) ? "正在等待模型响应…" : "本轮未调用业务工具"}
            </div>
          )}
        </div>
      </details>
      {run.events.some((e) => e.kind === "retrieval" && e.data.degraded) && (
        <p className="agent-partial" role="status">
          混合检索暂不可用，本次已使用当前有效政策的关键词检索。
        </p>
      )}
      {[...messages].map(([id, text]) => (
        <div className="agent-text" key={id}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{
              img: () => null,
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      ))}
      {active(run) && (
        <span className="agent-stream-status" role="status">
          {messages.size ? "正在生成回答…" : "正在连接模型与业务工具…"}
        </span>
      )}
      {messages.size > 0 &&
        ["FAILED", "STOPPED", "INTERRUPTED"].includes(run.status) && (
          <p className="agent-partial">
            以上是已收到的部分内容，本次回答未完整结束。
          </p>
        )}
      {(orders.size > 0 || sales.size > 0 || products.size > 0) && (
        <BusinessCards
          data={{
            ...(orders.size ? { orders: [...orders.values()] } : {}),
            ...(sales.size ? { after_sales: [...sales.values()] } : {}),
            ...(products.size ? { products: [...products.values()] } : {}),
          }}
        />
      )}
    </>
  );
}

export function AgentWorkspace({
  signed,
  requestLogin,
}: {
  signed: boolean;
  requestLogin: () => void;
}) {
  const [providers, setProviders] = useState<Provider[]>([]),
    [provider, setProvider] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]),
    [session, setSession] = useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    function resize() {
      const input = composerInput.current;
      if (!input) return;
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [message]);
  const followBottom = useRef(true);
  const runs = session?.runs || [];
  const executing = runs.some(active);
  const pendingRequest = useRef<{
    text: string;
    provider: string;
    sid: string;
    id: string;
  } | null>(null);
  function replaceRun(run: Run) {
    setSession((s) =>
      s
        ? { ...s, runs: (s.runs || []).map((r) => (r.id === run.id ? run : r)) }
        : s,
    );
  }
  async function removeSession() {
    if (!deleteTarget) return;
    setBusy(true);
    setDeleteError("");
    try {
      await agent("/sessions/" + deleteTarget.id, undefined, "DELETE");
      setSessions((items) => items.filter((s) => s.id !== deleteTarget.id));
      if (session?.id === deleteTarget.id) {
        setSession(null);
        setMessage("");
        pendingRequest.current = null;
        setError("");
      }
      if (sessionStorage.getItem("shop_agent_stack_session") === deleteTarget.id)
        sessionStorage.removeItem("shop_agent_stack_session");
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function select(id: string) {
    try {
      const s = await agent<Session>("/sessions/" + id);
      followBottom.current = true;
      setSession(s);
      sessionStorage.setItem("shop_agent_stack_session", id);
      setError("");
    } catch (e) {
      setError((e as Error).message);
      sessionStorage.removeItem("shop_agent_stack_session");
    }
  }
  useEffect(() => {
    let mounted = true;
    agent<{ providers: Provider[]; default_provider: string }>("/settings")
      .then((settings) => {
        const p = settings.providers;
        if (mounted) {
          setProviders(p);
          setProvider(
            p.find((x) => x.configured && x.id === settings.default_provider)
              ?.id ||
              p.find((x) => x.configured)?.id ||
              p[0]?.id ||
              "",
          );
        }
      })
      .catch((e) => setError(e.message));
    if (signed)
      agent<Session[]>("/sessions")
        .then((s) => {
          if (mounted) {
            setSessions(s);
            const id = sessionStorage.getItem("shop_agent_stack_session");
            if (id && s.some((x) => x.id === id)) void select(id);
          }
        })
        .catch((e) => setError(e.message));
    return () => {
      mounted = false;
    };
  }, [signed]);
  const liveId = runs.find(active)?.id;
  useEffect(() => {
    if (!liveId) return;
    const controller = new AbortController();
    let cursor = runs.find((r) => r.id === liveId)?.events.at(-1)?.id || 0;
    async function follow() {
      try {
        const res = await fetch(
          `/api/agent/runs/${liveId}/events?after=${cursor}`,
          {
            headers: { Authorization: token("portal") },
            signal: controller.signal,
          },
        );
        if (!res.ok || !res.body)
          throw new Error("连接中断，请刷新会话恢复进度");
        const reader = res.body.getReader(),
          decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const line = block.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6)) as Event;
            if (event.id <= cursor) continue;
            cursor = event.id;
            setSession((s) =>
              s
                ? {
                    ...s,
                    runs: s.runs?.map((r) =>
                      r.id === liveId
                        ? {
                            ...r,
                            events: [
                              ...r.events.filter((e) => e.id !== event.id),
                              event,
                            ],
                            status:
                              event.kind === "state"
                                ? String(event.data.status)
                                : r.status,
                          }
                        : r,
                    ),
                  }
                : s,
            );
          }
        }
        if (!controller.signal.aborted)
          replaceRun(await agent<Run>("/runs/" + liveId));
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }
    void follow();
    return () => controller.abort();
    // Reconnect from the persisted cursor when the active run or session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId, session?.id]);
  useEffect(() => {
    const el = scroller.current;
    if (el && followBottom.current) el.scrollTop = el.scrollHeight;
  }, [runs.at(-1)?.events.length, session?.id]);
  async function send() {
    if (!message.trim() || busy || executing) return;
    setBusy(true);
    setError("");
    followBottom.current = true;
    try {
      const s = session || (await agent<Session>("/sessions", {}));
      if (!session) {
        setSession({ ...s, runs: [] });
        sessionStorage.setItem("shop_agent_stack_session", s.id);
      }
      const text = message.trim();
      if (
        !pendingRequest.current ||
        pendingRequest.current.text !== text ||
        pendingRequest.current.provider !== provider ||
        pendingRequest.current.sid !== s.id
      )
        pendingRequest.current = {
          text,
          provider,
          sid: s.id,
          id: crypto.randomUUID(),
        };
      const run = await agent<Run>(`/sessions/${s.id}/runs`, {
        message: text,
        provider,
        request_id: pendingRequest.current.id,
      });
      setSession((old) => ({
        ...s,
        runs: [...(old?.runs || []).filter((r) => r.id !== run.id), run],
      }));
      setMessage("");
      pendingRequest.current = null;
      setSessions(await agent<Session[]>("/sessions"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(
    run: Run,
    kind: string,
    preview?: Record<string, unknown>,
  ) {
    setBusy(true);
    setError("");
    try {
      replaceRun(
        await agent<Run>(
          `/runs/${run.id}/${kind}`,
          kind === "confirm"
            ? {
                operation_id: preview!.id,
                confirmation_token: preview!.confirmationToken,
              }
            : {},
        ),
      );
    } catch (e) {
      setError((e as Error).message + "；可刷新会话核实当前状态");
      if (session) await select(session.id);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page agent-page">
      {!signed ? (
        <div className="agent-empty">
          <Sparkles size={32} />
          <h2>从你的第一句开始</h2>
          <p>登录后，可查询属于你的订单与售后进度。</p>
          <button className="button" onClick={requestLogin}>
            登录使用助手
          </button>
        </div>
      ) : (
        <div className="agent-layout">
          <aside className="agent-history">
            <button
              className="button secondary"
              disabled={busy || executing}
              onClick={() => {
                setSession(null);
                sessionStorage.removeItem("shop_agent_stack_session");
                setError("");
              }}
            >
              <Plus size={16} />
              新对话
            </button>
            <small>最近对话</small>
            {sessions.map((s) => (
              <div key={s.id} className={`agent-session-row ${s.id === session?.id ? "selected" : ""}`}>
              <button
                disabled={busy}
                className="agent-session-title"
                title={s.title}
                onClick={() => void select(s.id)}
              >
                {s.title}
              </button>
              <button className="agent-session-delete" aria-label={`删除对话：${s.title}`}
                title="删除对话" disabled={busy || (s.id === session?.id && executing)}
                onClick={() => { setDeleteError(""); setDeleteTarget(s); }}>
                <Trash2 size={15} />
              </button>
              </div>
            ))}
            {!sessions.length && <p>你的对话会保存在这里。</p>}
          </aside>
          <section className="agent-conversation" aria-label="助手会话">
            <div className="agent-toolbar">
              <Sparkles size={18} />
              <strong>购物助手</strong>
              <HandoffButton
                initialTitle={runs.at(-1)?.input || ""}
                excerpt={runs
                  .slice(-3)
                  .map(
                    (r) =>
                      `客户：${r.input}\n助手：${r.events
                        .filter((e) => e.kind === "assistant")
                        .map((e) => String(e.data.text))
                        .join("\n")}`,
                  )
                  .join("\n\n")
                  .slice(0, 6000)}
              />
              <label>
                模型
                <select
                  aria-label="选择模型服务"
                  value={provider}
                  disabled={busy || executing}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  {providers.map((p) => (
                    <option value={p.id} key={p.id} disabled={!p.configured}>
                      {p.label}
                      {p.model ? ` · ${p.model}` : ""}
                      {!p.configured ? " · 未配置" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {session && (
                <button
                  className="icon-button"
                  aria-label="刷新会话"
                  onClick={() => void select(session.id)}
                >
                  <RefreshCw size={16} />
                </button>
              )}
            </div>
            {!providers.some((p) => p.configured) && (
              <div className="agent-notice">
                还没有可用模型。
                <a href="/app/settings?tab=models">前往模型设置</a>，保存你的
                API Key 后即可开始对话。
              </div>
            )}
            {providers.find((p) => p.id === provider)?.test && (
              <div className="agent-notice">
                自动化验收模式：使用固定规则响应，未调用真实
                AI。订单查询与售后提交仍连接真实本地业务服务。
              </div>
            )}
            <div
              className="agent-messages"
              ref={scroller}
              onScroll={(e) => {
                const el = e.currentTarget;
                followBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              }}
            >
              {!runs.length && (
                <div className="agent-empty">
                  <div className="agent-orb">
                    <Sparkles size={30} />
                  </div>
                  <h2>有什么可以帮你？</h2>
                  <p>
                    支持订单、售后与已发布政策查询；政策回答附带原文依据。暂不支持联网搜索。
                  </p>
                  <div className="agent-suggestions">
                    {["查询我的订单", "查询我的售后进度"].map((t) => (
                      <button key={t} onClick={() => setMessage(t)}>
                        {t} ↗
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {runs.map((run) => (
                <article className="agent-turn" key={run.id}>
                  <div className="agent-user">{run.input}</div>
                  <div className="agent-answer">
                    <small className="agent-state">
                      <Sparkles size={14} />
                      {labels[run.status] || run.status}
                      {run.provider === "fixture" ? " · 非 AI 验收" : ""}
                    </small>
                    <Reply run={run} />
                    {run.events
                      .filter((e) => e.kind === "citations")
                      .map((e) => (
                        <div className="agent-citations" key={e.id}>
                          <small>回答依据 · 打开核对当前版本</small>
                          <div className="agent-cards">
                            {(e.data.sources as Record<string, unknown>[]).map(
                              (s) => (
                                <a
                                  className="agent-data-card"
                                  key={String(s.citation_id)}
                                  href={`/app/policies?policy=${Number(s.policy_id)}&version=${Number(s.version)}#clause-${Number(s.clause_no)}`}
                                >
                                  <strong>{String(s.title)}</strong>
                                  <span>
                                    V{String(s.version)} · 条款{" "}
                                    {String(s.clause_no)}
                                  </span>
                                  <small>{String(s.text)}</small>
                                  <span>查看原文 →</span>
                                </a>
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                    {run.events.map((e) =>
                      e.kind === "error" ? (
                        <p className="error" key={e.id}>
                          {String(e.data.message)}
                        </p>
                      ) : e.kind === "preview" ? (
                        <div className="agent-preview" key={e.id}>
                          <small>请核对 · 整单售后申请</small>
                          <h3>订单 #{String(e.data.order_id)}</h3>
                          <strong>{money(e.data.amount)}</strong>
                          <p>原因：{String(e.data.reason)}</p>
                          <small>
                            预览有效至{" "}
                            {new Date(
                              String(e.data.expires_at),
                            ).toLocaleTimeString("zh-CN")}
                            ，提交申请不代表退款已完成。
                          </small>
                          {run.status === "WAITING_CONFIRMATION" && (
                            <div className="agent-actions">
                              <button
                                className="button"
                                disabled={busy}
                                onClick={() =>
                                  void action(run, "confirm", e.data)
                                }
                              >
                                确认提交售后
                              </button>
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => void action(run, "stop")}
                              >
                                取消申请
                              </button>
                            </div>
                          )}
                        </div>
                      ) : e.kind === "operation" ? (
                        <div className="agent-success" key={e.id}>
                          ✓ 售后申请已提交 · 编号 #{String(e.data.case_id)}
                          <a href="/app/after-sales">查看售后进度 →</a>
                        </div>
                      ) : null,
                    )}
                    {run.status === "UNCERTAIN" && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => void action(run, "reconcile")}
                      >
                        核实提交结果
                      </button>
                    )}
                    {["QUEUED", "RUNNING"].includes(run.status) && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void action(run, "stop")}
                      >
                        <Square size={12} />
                        停止生成
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <form
              className="agent-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                ref={composerInput}
                rows={3}
                aria-label="发送给购物助手"
                placeholder="向助手提问，或描述你需要的帮助…"
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="agent-composer-toolbar">
                <span className="agent-composer-hint">
                  Enter 发送 <span>· Shift + Enter 换行</span>
                </span>
                {message.length > 0 && (
                  <small className="agent-character-count">
                    {message.length} / 2000
                  </small>
                )}
                <button
                  className="button"
                  aria-label="发送消息"
                  disabled={
                    busy ||
                    executing ||
                    !message.trim() ||
                    !providers.find((p) => p.id === provider)?.configured
                  }
                >
                  <ArrowUp size={20} />
                </button>
              </div>
            </form>
            <small className="agent-footnote">
              业务状态以订单和售后记录为准
            </small>
          </section>
        </div>
      )}
      {deleteTarget && (
        <Modal title="删除对话" onClose={() => { if (!busy) setDeleteTarget(null); }}>
          <p>确定删除“{deleteTarget.title}”吗？</p>
          <p className="muted">将删除这段对话的消息、执行记录与会话记忆，无法恢复。已创建的订单、售后和人工咨询不受影响。</p>
          {deleteError && <p className="error" role="alert">{deleteError}</p>}
          <div className="input-row">
            <button className="button secondary" disabled={busy} onClick={() => setDeleteTarget(null)}>取消</button>
            <button className="button" disabled={busy} onClick={() => void removeSession()}>{busy ? "正在删除…" : "确认删除"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
