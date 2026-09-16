import { useState, type ReactNode } from "react";
import { api, type Policy, type Side } from "./api";

export async function loadPolicies(side: Side): Promise<Policy[]> {
  const result: Policy[] = [];
  let before = 0;
  for (let page = 0; page < 100; page++) {
    const rows = await api<Policy[]>(side, `/shop_agent_stack/policies?before=${before}`);
    result.push(...rows);
    if (rows.length < 100) return result;
    const next = rows[rows.length - 1].id;
    if (before && next >= before) throw new Error("政策分页异常，请刷新后重试");
    before = next;
  }
  throw new Error("政策数量超出当前浏览范围，请联系管理员");
}

export function PolicyPages({ policies, children }: {
  policies: Policy[]; children: (policy: Policy) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = policies.filter(p => `${p.title} ${p.content}`.includes(query.trim()));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages - 1);
  return <div className="stack">
    {policies.length > 1 && <div className="panel">
      <label>搜索政策
        <input value={query} placeholder="输入政策名称或关键词" onChange={e => {
          setQuery(e.target.value); setPage(0);
        }} />
      </label>
      <p className="muted">共 {filtered.length} 份 · 第 {current + 1} / {pages} 页</p>
      <div className="input-row">
        <button className="button secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>上一页</button>
        <button className="button secondary" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>下一页</button>
      </div>
    </div>}
    {filtered.slice(current * 10, current * 10 + 10).map(children)}
    {!filtered.length && <p role="status">暂无匹配的已加载政策。</p>}
  </div>;
}
