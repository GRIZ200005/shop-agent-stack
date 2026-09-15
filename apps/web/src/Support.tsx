import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, RefreshCw } from "lucide-react";
import { api, date, type Side, type Staff } from "./api";
import { Modal } from "./ui";
import "./support.css";

type Message = {
  id: string;
  author_role: "CUSTOMER" | "STAFF" | "SYSTEM";
  content: string;
  created_at: string;
};
type Ticket = {
  id: string;
  title: string;
  context_text: string;
  status: string;
  assignee_id: number | null;
  updated_at: string;
  messages: Message[];
};
const labels: Record<string, string> = {
  WAITING: "等待客服",
  IN_PROGRESS: "处理中",
  RESOLVED: "已解决",
};

export function HandoffButton({
  excerpt = "",
  initialTitle = "",
}: {
  excerpt?: string;
  initialTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        className="button secondary"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Headphones size={16} />
        转人工客服
      </button>
      {open && (
        <CreateSupport
          excerpt={excerpt}
          initialTitle={initialTitle}
          close={close}
        />
      )}
    </>
  );
}
function CreateSupport({
  excerpt,
  initialTitle,
  close,
}: {
  excerpt: string;
  initialTitle: string;
  close: () => void;
}) {
  const [title, setTitle] = useState(initialTitle.slice(0, 120)),
    [context, setContext] = useState(excerpt.slice(0, 6000));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef({ body: "", id: crypto.randomUUID() });
  const closeModal = useCallback(() => {
    if (!busy) close();
  }, [busy, close]);
  async function submit() {
    if (busy || !title.trim()) return;
    setBusy(true);
    setError("");
    const body = JSON.stringify({
      title: title.trim(),
      context: context.trim(),
    });
    if (request.current.body !== body)
      request.current = { body, id: crypto.randomUUID() };
    try {
      const result = await api<Ticket>("portal", "/aster/support", {
        requestId: request.current.id,
        title: title.trim(),
        context: context.trim(),
      });
      location.assign("/app/support?ticket=" + result.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title="联系人工客服" onClose={closeModal}>
      <form
        className="support-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p>说明需要帮助的问题。提交后，客服可查看并回复此咨询。</p>
        <label>
          咨询主题
          <input
            required
            maxLength={120}
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：商品规格不适合，想了解处理方式"
          />
        </label>
        <label>
          问题描述与会话摘录
          <textarea
            aria-label="问题描述与会话摘录"
            rows={8}
            maxLength={6000}
            value={context}
            disabled={busy}
            onChange={(e) => setContext(e.target.value)}
            placeholder="补充问题，也可以删除不希望交给客服的内容。"
          />
        </label>
        <small>
          摘录由你确认后交给客服，仅供了解问题；它不代表商品事实、退款承诺或已获批准。请勿填写密码、API
          Key 或支付信息。
        </small>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy || !title.trim()}>
          {busy ? "正在提交…" : "确认提交咨询"}
        </button>
      </form>
    </Modal>
  );
}

export function SupportWorkspace({ staff = false }: { staff?: boolean }) {
  const side: Side = staff ? "admin" : "portal";
  const [items, setItems] = useState<Ticket[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false);
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get("ticket") || "",
  );
  const [detail, setDetail] = useState<Ticket | null>(null),
    [me, setMe] = useState<Staff | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reply, setReply] = useState("");
  const [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true);
  const messageRequest = useRef({ body: "", id: crypto.randomUUID() });
  useEffect(() => {
    if (staff)
      void api<Staff>("admin", "/aster/me")
        .then(setMe)
        .catch((e) => setError(e.message));
  }, [staff]);
  useEffect(() => {
    let cancelled = false,
      fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const next = await api<{ items: Ticket[]; more: boolean }>(
          side,
          `/aster/support?page=${page}`,
        );
        if (!cancelled) {
          setItems(next.items);
          setMore(next.more);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        fetching = false;
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [side, page, refresh]);
  useEffect(() => {
    let cancelled = false,
      fetching = false;
    setDetail(null);
    if (!selected) return;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const d = await api<Ticket>(side, `/aster/support/${selected}`);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        fetching = false;
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [side, selected, refresh]);
  function choose(id: string) {
    setSelected(id);
    setReply("");
    setError("");
    history.replaceState(
      null,
      "",
      `${staff ? "/service" : "/app"}/support?ticket=${id}`,
    );
  }
  async function action(kind: "claim" | "resolve" | "messages") {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    const ticketId = detail.id;
    try {
      const body = JSON.stringify({ ticketId, content: reply.trim() });
      if (messageRequest.current.body !== body)
        messageRequest.current = { body, id: crypto.randomUUID() };
      await api(
        side,
        `/aster/support/${ticketId}/${kind}`,
        kind === "messages"
          ? { requestId: messageRequest.current.id, content: reply.trim() }
          : {},
      );
      if (kind === "messages") setReply("");
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const mine = detail?.assignee_id === me?.id;
  return (
    <section className="page support-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">HUMAN SUPPORT</div>
          <h1>{staff ? "人工咨询工作台" : "我的人工咨询"}</h1>
          <p>
            {staff
              ? "接住每一个问题，让服务继续。"
              : "与客服保持联系，查看问题处理进度。"}
          </p>
        </div>
        <div className="support-actions">
          {!staff && <HandoffButton />}
          <button
            className="button secondary"
            onClick={() => setRefresh((v) => v + 1)}
            disabled={busy}
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="support-grid">
        <aside className="support-list" aria-label="咨询列表">
          {!items.length && (
            <p>
              {loading
                ? "正在加载…"
                : "暂无咨询。有问题时，可以从星序助手转人工。"}
            </p>
          )}
          {items.map((t) => (
            <button
              disabled={busy}
              key={t.id}
              className={`support-ticket ${t.id === selected ? "selected" : ""}`}
              onClick={() => choose(t.id)}
            >
              <span className="badge">{labels[t.status]}</span>
              <strong>{t.title}</strong>
              <small>{date(t.updated_at)}</small>
            </button>
          ))}
          <div className="support-actions">
            <button
              className="text-button"
              disabled={!page || busy}
              onClick={() => setPage((v) => v - 1)}
            >
              上一页
            </button>
            <small>第 {page + 1} 页</small>
            <button
              className="text-button"
              disabled={!more || busy}
              onClick={() => setPage((v) => v + 1)}
            >
              下一页
            </button>
          </div>
        </aside>
        <div className="support-conversation" aria-label="咨询详情">
          {!detail ? (
            <div className="support-empty">
              <Headphones size={40} />
              <h2>{selected ? "正在读取咨询" : "选择一条咨询"}</h2>
              <p>消息和处理状态会每 5 秒自动更新。</p>
            </div>
          ) : (
            <>
              <header className="support-detail-header">
                <div>
                  <span className="badge">{labels[detail.status]}</span>
                  <h2>{detail.title}</h2>
                </div>
                <div className="support-actions">
                  {staff && detail.status === "WAITING" && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void action("claim")}
                    >
                      领取咨询
                    </button>
                  )}
                  {staff && mine && detail.status === "IN_PROGRESS" && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void action("resolve")}
                    >
                      标记已解决
                    </button>
                  )}
                </div>
              </header>
              {detail.context_text && (
                <details className="support-context" open>
                  <summary>客户确认的问题与会话摘录</summary>
                  <small>
                    客户提供的背景信息，业务事实和处理权限需另行核实。
                  </small>
                  <p>{detail.context_text}</p>
                </details>
              )}
              <div className="support-messages" aria-live="polite">
                {!detail.messages.length && (
                  <p>咨询已提交，等待客服接手。你可以继续补充信息。</p>
                )}
                {detail.messages.map((m) => (
                  <article
                    key={m.id}
                    className={`support-message ${m.author_role.toLowerCase()}`}
                  >
                    <small>
                      {m.author_role === "CUSTOMER"
                        ? "客户"
                        : m.author_role === "STAFF"
                          ? "客服"
                          : "处理动态"}{" "}
                      · {date(m.created_at)}
                    </small>
                    <p>{m.content}</p>
                  </article>
                ))}
              </div>
              {detail.status === "RESOLVED" ? (
                <p className="support-closed">
                  本咨询已解决。如仍需帮助，请新建咨询。
                </p>
              ) : staff && !mine ? (
                <p>请先领取咨询；其他客服已领取的咨询仅供查看。</p>
              ) : (
                <form
                  className="support-form support-reply"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action("messages");
                  }}
                >
                  <label>
                    {staff ? "回复客户" : "补充消息"}
                    <textarea
                      rows={3}
                      maxLength={2000}
                      disabled={busy}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                  </label>
                  <button className="button" disabled={busy || !reply.trim()}>
                    {busy ? "正在发送…" : "发送回复"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
