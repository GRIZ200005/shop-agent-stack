import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clock,
  Inbox,
  RefreshCw,
  ShieldCheck,
  Plus,
} from "lucide-react";
import {
  api,
  date,
  money,
  saleLabels,
  type Sale,
  type Staff,
  type Policy,
} from "./api";
import { Empty, Loading, Modal } from "./ui";
import { SaleTimeline } from "./Customer";
import { PolicyPages, loadPolicies } from "./PolicyPages";
import { RefundMonitor } from "./RefundMonitor";

export function StaffWorkspace({ adminView }: { adminView: boolean }) {
  const [me, setMe] = useState<Staff | null>(null),
    [sales, setSales] = useState<Sale[]>([]),
    [policies, setPolicies] = useState<Policy[]>([]),
    [accounts, setAccounts] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<Sale | null>(null),
    [filter, setFilter] = useState("ALL"),
    [tab, setTab] = useState("policies"),
    [form, setForm] = useState(false);
  const [revision, setRevision] = useState<Policy | null>(null);
  async function load() {
    setError("");
    try {
      const identity = await api<Staff>("admin", "/shop_agent_stack/me");
      setMe(identity);
      if (adminView && identity.role !== "ADMIN") return;
      if (adminView) {
        setPolicies(await loadPolicies("admin"));
        setAccounts(await api<Staff[]>("admin", "/shop_agent_stack/staff"));
      } else setSales(await api<Sale[]>("admin", "/shop_agent_stack/after-sales"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [adminView]);
  useEffect(() => {
    if (detail?.status !== "REFUNDING") return;
    let cancelled = false, fetching = false;
    const timer = setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const next = await api<Sale>("admin", `/shop_agent_stack/after-sales/${detail.id}`);
        if (!cancelled) { setDetail(next); setSales(items => items.map(s => s.id === next.id ? next : s)); }
      } catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { fetching = false; }
    }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [detail?.id, detail?.status]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (adminView && me?.role !== "ADMIN")
    return (
      <div className="page">
        <Empty title="没有管理中心访问权限">
          当前账户可以处理客服工单，政策发布和账号配置需要管理员权限。
        </Empty>
        <a className="button centered" href="/service">
          进入客服工作台
        </a>
      </div>
    );
  const filtered = sales.filter(
    (s) =>
      filter === "ALL" ||
      (filter === "MINE" && s.assignee_id === me?.id) ||
      filter === s.status,
  );
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {adminView ? "GOVERNANCE" : "CUSTOMER CARE"} / SHOPAGENTSTACK WORKSPACE
          </div>
          <h1>{adminView ? "让服务，有章可循。" : "每一次回应，都有温度。"}</h1>
          <p>
            {me?.nick_name || me?.username}，欢迎回来。
            {adminView
              ? "管理政策与团队权限。"
              : "从待领取工单开始，跟进每一次售后。"}
          </p>
        </div>
        <button className="text-button" onClick={() => void load()}>
          <RefreshCw size={16} />
          刷新数据
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <RefundMonitor />
      {adminView ? (
        <>
          <div className="metrics">
            <div className="panel">
              <BookIcon />
              <span>已发布政策</span>
              <strong>
                {policies.filter((p) => p.status === "PUBLISHED").length}
              </strong>
            </div>
            <div className="panel">
              <Clock />
              <span>政策草稿</span>
              <strong>
                {policies.filter((p) => p.status === "DRAFT").length}
              </strong>
            </div>
            <div className="panel">
              <ShieldCheck />
              <span>团队账户</span>
              <strong>{accounts.length}</strong>
            </div>
          </div>
          <div className="collection-heading">
            <div className="tabs">
              <button
                className={tab === "policies" ? "selected" : ""}
                onClick={() => setTab("policies")}
              >
                服务政策
              </button>
              <button
                className={tab === "staff" ? "selected" : ""}
                onClick={() => setTab("staff")}
              >
                团队与权限
              </button>
            </div>
            <button className="button" onClick={() => setForm(true)}>
              <Plus size={16} />
              {tab === "policies" ? "新建政策" : "创建账号"}
            </button>
          </div>
          {tab === "policies" ? (
            <PolicyPages policies={policies}>
              {(p) => (
                <article className="panel policy" key={p.id}>
                  <div className="between">
                    <span
                      className={`pill ${p.status === "PUBLISHED" ? "green" : "amber"}`}
                    >
                      {(
                        {
                          PUBLISHED: "已发布",
                          DRAFT: "草稿",
                          WITHDRAWN: "已撤回",
                          SUPERSEDED: "已被新版替代",
                        } as Record<string, string>
                      )[p.status] || p.status}{" "}
                      · V{p.version}
                    </span>
                    {p.status === "DRAFT" && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              "admin",
                              `/shop_agent_stack/policies/${p.id}/publish`,
                              {},
                            );
                          })
                        }
                      >
                        发布政策
                      </button>
                    )}
                  </div>
                  <p className="muted">
                    {p.visibility === "STAFF" ? "仅内部可见" : "客户可见"} ·{" "}
                    {p.index_status === "READY"
                      ? `条款索引就绪 · ${p.clause_count || 0} 条`
                      : p.index_status === "WITHDRAWN"
                        ? "已从检索移除"
                        : "未进入正式检索"}
                  </p>
                  <h2>{p.title}</h2>
                  <p>{p.content}</p>
                  <div className="input-row">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setRevision(p);
                        setForm(true);
                      }}
                    >
                      修订政策
                    </button>
                    {p.status === "PUBLISHED" && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              "admin",
                              `/shop_agent_stack/policies/${p.id}/withdraw`,
                              {},
                            );
                          })
                        }
                      >
                        撤回政策
                      </button>
                    )}
                  </div>
                </article>
              )}
            </PolicyPages>
          ) : (
            <div className="panel table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>成员</th>
                    <th>用户名</th>
                    <th>角色</th>
                    <th>权限范围</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.nick_name}</td>
                      <td>{a.username}</td>
                      <td>
                        <span className="pill">
                          {a.role === "ADMIN" ? "管理员" : "客服"}
                        </span>
                      </td>
                      <td>
                        {a.role === "ADMIN"
                          ? "政策发布、创建账号、售后处理"
                          : "工单查看、领取、审核"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="metrics">
            <div className="panel">
              <Inbox />
              <span>待领取</span>
              <strong>
                {sales.filter((s) => s.status === "SUBMITTED").length}
              </strong>
            </div>
            <div className="panel">
              <Clock />
              <span>我正在处理</span>
              <strong>
                {
                  sales.filter(
                    (s) => s.status === "CLAIMED" && s.assignee_id === me?.id,
                  ).length
                }
              </strong>
            </div>
            <div className="panel">
              <Check />
              <span>已完成模拟退款</span>
              <strong>
                {sales.filter((s) => s.status === "REFUNDED").length}
              </strong>
            </div>
          </div>
          <div className="collection-heading">
            <h2>售后队列</h2>
            <div className="tabs">
              {[
                ["ALL", "全部"],
                ["SUBMITTED", "待领取"],
                ["MINE", "我的工单"],
                ["REFUNDED", "已退款"],
                ["REFUNDING", "退款处理中"],
                ["REFUND_REVIEW", "退款待核实"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={filter === value ? "selected" : ""}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="stack">
            {filtered.length === 0 ? (
              <Empty title="当前没有待处理工单">
                客户提交的售后会出现在这里。
              </Empty>
            ) : (
              filtered.map((s) => (
                <button
                  className="panel sale-row"
                  key={s.id}
                  onClick={() =>
                    void run(async () =>
                      setDetail(
                        await api<Sale>("admin", `/shop_agent_stack/after-sales/${s.id}`),
                      ),
                    )
                  }
                >
                  <div className="case-icon">
                    <Inbox size={21} />
                  </div>
                  <div className="grow">
                    <span className="eyebrow">
                      售后 #{s.id} · 订单 #{s.order_id}
                    </span>
                    <h3>{s.reason}</h3>
                    <p>
                      {date(s.created_at)} · {s.assignee_name || "等待客服领取"}
                    </p>
                  </div>
                  <strong>{money(s.amount)}</strong>
                  <span
                    className={`pill ${s.status === "REFUNDED" ? "green" : s.status === "SUBMITTED" ? "amber" : ""}`}
                  >
                    {saleLabels[s.status]}
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))
            )}
          </div>
        </>
      )}
      {detail && (
        <Modal title={`处理售后 #${detail.id}`} onClose={() => setDetail(null)}>
          <SaleTimeline sale={detail} />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {detail.status === "SUBMITTED" ? (
            <button
              className="button wide"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(
                    "admin",
                    `/shop_agent_stack/after-sales/${detail.id}/claim`,
                    {},
                  );
                  setDetail(
                    await api<Sale>("admin", `/shop_agent_stack/after-sales/${detail.id}`),
                  );
                })
              }
            >
              领取并人工处理
            </button>
          ) : detail.status === "CLAIMED" && detail.assignee_id === me?.id ? (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const button = (e.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement;
                void run(async () => {
                  await api(
                    "admin",
                    `/shop_agent_stack/after-sales/${detail.id}/decision`,
                    {
                      approved: button.value === "approve",
                      note: f.get("note"),
                    },
                  );
                  setDetail(
                    await api<Sale>("admin", `/shop_agent_stack/after-sales/${detail.id}`),
                  );
                });
              }}
            >
              <label>
                审核说明
                <textarea
                  name="note"
                  required
                  maxLength={500}
                  rows={3}
                  placeholder="记录核实结果，客户可以看到此说明"
                />
              </label>
              <p className="muted">
                通过后将排队处理 {money(detail.amount)}{" "}
                的整单模拟退款，完成前显示处理中，不发生真实资金流转。
              </p>
              <div className="input-row">
                <button
                  className="button secondary"
                  disabled={busy}
                  value="reject"
                >
                  拒绝申请
                </button>
                <button className="button" disabled={busy} value="approve">
                  通过并模拟退款
                </button>
              </div>
            </form>
          ) : detail.status === "CLAIMED" ? (
            <p className="notice">该工单由其他客服处理，你可以查看进度。</p>
          ) : detail.status === "REFUNDING" ? (
            <p className="notice">退款任务已排队，系统会自动更新结果；请勿重复申请。</p>
          ) : detail.status === "REFUND_REVIEW" && detail.assignee_id === me?.id ? (
            <button className="button" disabled={busy} onClick={() => void run(async () => {
              await api("admin", `/shop_agent_stack/after-sales/${detail.id}/refund-retry`, {});
              setDetail(await api<Sale>("admin", `/shop_agent_stack/after-sales/${detail.id}`));
            })}>已核实，重试模拟退款</button>
          ) : null}
        </Modal>
      )}
      {form && (
        <AdminForm
          kind={tab}
          revision={revision}
          onClose={() => {
            setForm(false);
            setRevision(null);
          }}
          onDone={() => {
            setForm(false);
            setRevision(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
function BookIcon() {
  return <ShieldCheck />;
}
function AdminForm({
  kind,
  revision,
  onClose,
  onDone,
}: {
  kind: string;
  revision: Policy | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={
        kind === "policies"
          ? revision
            ? "修订政策草稿"
            : "新建政策草稿"
          : "创建团队账号"
      }
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await api(
              "admin",
              kind === "policies"
                ? revision
                  ? `/shop_agent_stack/policies/${revision.id}/revise`
                  : "/shop_agent_stack/policies"
                : "/shop_agent_stack/staff",
              Object.fromEntries(f),
            );
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {kind === "policies" ? (
          <>
            <label>
              政策标题
              <input
                name="title"
                aria-label="政策标题"
                required
                maxLength={120}
                defaultValue={revision?.title}
              />
            </label>
            <label>
              政策正文
              <textarea
                name="content"
                aria-label="政策正文"
                required
                maxLength={20000}
                rows={7}
                defaultValue={revision?.content}
              />
            </label>
            <label>
              可见范围
              <select
                name="visibility"
                defaultValue={revision?.visibility || "CUSTOMER"}
              >
                <option value="CUSTOMER">客户可见</option>
                <option value="STAFF">仅内部可见</option>
              </select>
            </label>
            <p className="muted">
              保存为草稿后，需要管理员发布才会对客户可见。
            </p>
          </>
        ) : (
          <>
            <label>
              成员姓名
              <input name="name" required maxLength={40} />
            </label>
            <label>
              用户名
              <input
                name="username"
                required
                pattern="[a-zA-Z0-9_]{4,32}"
                autoComplete="off"
              />
            </label>
            <label>
              初始密码
              <input
                name="password"
                required
                minLength={12}
                maxLength={64}
                type="password"
                autoComplete="new-password"
              />
            </label>
            <label>
              角色
              <select name="role">
                <option value="SERVICE">客服：领取与审核售后</option>
                <option value="ADMIN">管理员：政策、账号与售后</option>
              </select>
            </label>
          </>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <button disabled={busy} className="button wide">
          {busy ? "正在保存…" : "保存"}
        </button>
      </form>
    </Modal>
  );
}
