import { useState } from "react";
import { api, money } from "./api";

type Row = { case_id: number; order_id?: number; amount?: number; job_status?: string; attempts?: number; last_error?: string; reconciliation: string };
type Snapshot = { summary: { total: number; pending: number; due: number; review: number; mismatches: number; oldest_pending_seconds: number }; rows: Row[]; next_before: number };
const labels: Record<string, string> = { CONSISTENT: "账目一致", PENDING: "处理中", REVIEW: "待人工核实", MISMATCH: "发现不一致", LEGACY_NOT_TRACKED: "历史同步退款，不在本次对账范围", NOT_STARTED: "尚未开始退款" };
const errors: Record<string, string> = { PUBLISH_UNCONFIRMED: "最近一次投递未获确认", BUSINESS_STATE_CONFLICT: "订单状态或金额不符合退款条件", CONSUMER_FAILURE: "退款处理发生异常", RETRY_EXHAUSTED: "自动尝试次数已用尽" };

export function RefundMonitor() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [checked, setChecked] = useState("");
  async function load(before = 0) {
    setBusy(true); setError("");
    try {
      const next = await api<Snapshot>("admin", `/shop_agent_stack/refunds/monitor?before=${before}`);
      setSnapshot(previous => ({ ...next, rows: before && previous ? [...previous.rows, ...next.rows] : next.rows }));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function check(id: number) {
    setBusy(true); setError(""); setChecked("");
    try {
      const row = await api<Row>("admin", `/shop_agent_stack/after-sales/${id}/refund-check`);
      setChecked(`售后 #${id}：${labels[row.reconciliation] || "未知核查状态"}。本次核查未修改任何账目。`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="panel" onToggle={e => { if (e.currentTarget.open && !snapshot && !busy) void load(); }}>
    <summary>退款监控与对账</summary>
    <p className="muted">统计异步模拟退款任务，不包含旧版同步退款。数据按刷新时点展示；积压是数据库待完成任务数，并非 RabbitMQ 消息数。</p>
    <button className="text-button" disabled={busy} onClick={() => void load()}>刷新退款监控</button>
    {error && <p className="error" role="alert">{error}</p>}
    {checked && <p className="notice" role="status">{checked}</p>}
    {busy && <p role="status">正在核查退款记录…</p>}
    {snapshot && <>
      <p>任务总数 {snapshot.summary.total} · 待完成 {snapshot.summary.pending} · 已到投递时间 {snapshot.summary.due} · 待人工核实 {snapshot.summary.review} · 不一致 {snapshot.summary.mismatches}</p>
      <p className="muted">最早待完成任务已等待 {Math.max(0, snapshot.summary.oldest_pending_seconds)} 秒。尝试次数指本轮投递尝试，不代表实际扣款次数。</p>
      {Number(snapshot.summary.mismatches) > 0 && <p className="error" role="alert">发现记录不一致，请先核实订单与退款记录，不要重复发起退款。</p>}
      <div style={{ overflowX: "auto" }}><table>
        <thead><tr><th>售后 / 订单</th><th>金额</th><th>核查结果</th><th>尝试次数</th><th>最近异常</th><th>操作</th></tr></thead>
        <tbody>{snapshot.rows.map(row => <tr key={row.case_id}>
          <td>#{row.case_id} / {row.order_id ?? "缺失"}</td><td>{row.amount == null ? "缺失" : money(row.amount)}</td>
          <td>{labels[row.reconciliation] || "未知"}</td><td>{row.attempts ?? "—"}</td><td>{row.last_error ? errors[row.last_error] || "待核实异常" : "—"}</td>
          <td><button className="text-button" disabled={busy} onClick={() => void check(row.case_id)}>核对 #{row.case_id}</button></td>
        </tr>)}</tbody>
      </table></div>
      {!snapshot.rows.length && <p>暂无异步退款任务。</p>}
      {snapshot.next_before > 0 && <button className="text-button" disabled={busy} onClick={() => void load(snapshot.next_before)}>加载更多退款任务</button>}
    </>}
  </details>;
}
