import { useCallback, useEffect, useState } from "react";
import { Search, RefreshCw, Package, ArrowUpRight } from "lucide-react";
import { api, money, date } from "./api";
import { Empty, Loading, Modal, ProductArt } from "./ui";
import "./catalog-management.css";

type Sku = {
  id: number;
  sku_code: string;
  stock: number;
  lock_stock: number;
  price: number;
  sp_data: string;
};
type Change = {
  request_id: string;
  action: string;
  sku_id: number;
  before_value: number;
  after_value: number;
  reason: string;
  actor_name: string;
  created_at: string;
};
type Item = {
  id: number;
  name: string;
  pic: string;
  price: number;
  product_category_name: string;
  publish_status: number;
  skus: Sku[];
  history: Change[];
};
const path = "/shop_agent_stack/catalog";

export function ProductManagement() {
  const [items, setItems] = useState<Item[]>([]),
    [total, setTotal] = useState(0);
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [revision, setRevision] = useState(0);
  const close = useCallback(() => setSelected(null), []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<{ items: Item[]; total: number }>(
      "admin",
      `${path}?query=${encodeURIComponent(query)}&page=${page}${status ? `&status=${status}` : ""}`,
    )
      .then((data) => {
        if (live) {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (live) {
          setItems([]);
          setError(e.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [query, status, page, revision]);
  return (
    <section className="page catalog-admin">
      <div className="catalog-heading">
        <div>
          <div className="eyebrow">CATALOG OPERATIONS</div>
          <h1>商品管理</h1>
          <p>从商品上架到库存补充，让每一件好物有序在售。</p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      <div className="catalog-summary">
        <Package size={24} />
        <div>
          <strong>{total}</strong>
          <span>件符合条件的商品</span>
        </div>
        <p>
          管理上下架与规格库存
          <br />
          调整记录可追溯
        </p>
      </div>
      <form
        className="catalog-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setQuery(draft.trim());
        }}
      >
        <label>
          <Search size={18} />
          <input
            aria-label="搜索商品名称"
            placeholder="搜索商品名称…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={80}
          />
        </label>
        <select
          aria-label="上架状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部状态</option>
          <option value="1">在售商品</option>
          <option value="0">已下架</option>
        </select>
        <button className="button" type="submit">
          搜索
        </button>
      </form>
      {error && (
        <p role="alert" className="catalog-error">
          {error}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty title="暂无可显示的商品">
          请调整筛选条件，或检查账户是否拥有管理员权限。
        </Empty>
      ) : (
        <div className="catalog-list">
          {items.map((item) => (
            <article className="catalog-row" key={item.id}>
              <ProductArt id={item.id} src={item.pic} alt={item.name} />
              <div className="catalog-name">
                <small>{item.product_category_name}</small>
                <h3>{item.name}</h3>
                <span>商品编号 {item.id}</span>
              </div>
              <strong>{money(item.price)}</strong>
              <span
                className={`catalog-status ${item.publish_status ? "on" : ""}`}
              >
                {item.publish_status ? "在售" : "已下架"}
              </span>
              <button
                className="button secondary"
                onClick={() => setSelected(item.id)}
              >
                管理
                <ArrowUpRight size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
      <div className="catalog-pagination">
        <button
          className="button secondary"
          disabled={page === 0 || loading}
          onClick={() => setPage((v) => v - 1)}
        >
          上一页
        </button>
        <span>
          第 {page + 1} / {Math.max(1, Math.ceil(total / 20))} 页
        </span>
        <button
          className="button secondary"
          disabled={(page + 1) * 20 >= total || loading}
          onClick={() => setPage((v) => v + 1)}
        >
          下一页
        </button>
      </div>
      {selected !== null && (
        <ProductEditor
          id={selected}
          onClose={close}
          onChanged={() => setRevision((v) => v + 1)}
        />
      )}
    </section>
  );
}

function ProductEditor({
  id,
  onClose,
  onChanged,
}: {
  id: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [item, setItem] = useState<Item | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [skuId, setSkuId] = useState(""),
    [delta, setDelta] = useState(""),
    [reason, setReason] = useState("");
  // Retain the exact request after a timeout: retrying must not apply a stock delta twice.
  const [pending, setPending] = useState<{
    requestId: string;
    action: string;
    skuId: number;
    expected: number;
    value: number;
    reason: string;
  } | null>(null);
  const reload = useCallback(async () => {
    const result = await api<Item>("admin", `${path}/${id}`);
    setItem(result);
    setSkuId((current) => current || String(result.skus[0]?.id || ""));
  }, [id]);
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, [reload]);
  const sku = item?.skus.find((s) => String(s.id) === skuId);
  async function submit(action: string) {
    if (!item || busy) return;
    const value = action === "STATUS" ? 1 - item.publish_status : Number(delta);
    if (
      !pending &&
      (!reason.trim() ||
        (action === "STOCK" && (!sku || !Number.isInteger(value) || !value)))
    ) {
      setError("请填写调整原因和有效的整数数量。");
      return;
    }
    const request = pending || {
      requestId: crypto.randomUUID(),
      action,
      skuId: action === "STOCK" ? sku!.id : 0,
      expected: action === "STOCK" ? sku!.stock : item.publish_status,
      value,
      reason: reason.trim(),
    };
    setBusy(true);
    setError("");
    setNotice("");
    setPending(request);
    try {
      await api("admin", `${path}/${id}/changes`, request);
      setPending(null);
      setReason("");
      setDelta("");
      setNotice("调整已保存，客户侧将在重新查询时读取最新数据。");
      await reload();
      onChanged();
    } catch (e) {
      // A server-declared rejection did not commit. Network uncertainty retains the retry token.
      if ([400, 401, 403, 404].includes((e as { code?: number }).code || 0))
        setPending(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="管理商品" onClose={onClose}>
      <div className="catalog-editor">
        {error && (
          <p role="alert" className="catalog-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="catalog-notice">
            {notice}
          </p>
        )}
        {!item ? (
          <Loading />
        ) : (
          <>
            <div className="catalog-editor-heading">
              <ProductArt id={id} src={item.pic} alt={item.name} />
              <div>
                <small>
                  {item.product_category_name} ·{" "}
                  {item.publish_status ? "在售" : "已下架"}
                </small>
                <h3>{item.name}</h3>
                <strong>{money(item.price)}</strong>
              </div>
            </div>
            <h3>规格库存</h3>
            <div className="catalog-stock-grid">
              <label>
                选择规格
                <select
                  value={skuId}
                  disabled={busy || !!pending}
                  onChange={(e) => setSkuId(e.target.value)}
                >
                  {item.skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sku_code || `规格 ${s.id}`}
                    </option>
                  ))}
                </select>
              </label>
              {sku && (
                <div className="catalog-stock-counts">
                  <span>
                    总库存<strong>{sku.stock}</strong>
                  </span>
                  <span>
                    订单占用<strong>{sku.lock_stock}</strong>
                  </span>
                  <span>
                    可售库存
                    <strong>{Math.max(0, sku.stock - sku.lock_stock)}</strong>
                  </span>
                </div>
              )}
            </div>
            <label>
              调整数量
              <input
                aria-label="调整数量"
                type="number"
                step="1"
                min="-1000000"
                max="1000000"
                placeholder="例如 20 补货，-5 盘亏"
                value={delta}
                disabled={busy || !!pending}
                onChange={(e) => setDelta(e.target.value)}
              />
            </label>
            {sku && delta && Number.isInteger(Number(delta)) && (
              <small>
                调整后总库存 {sku.stock + Number(delta)}，订单占用量保持不变。
              </small>
            )}
            <label>
              调整原因
              <textarea
                aria-label="调整原因"
                maxLength={200}
                rows={3}
                placeholder="填写补货、盘点或上下架原因，便于后续核对。"
                value={reason}
                disabled={busy || !!pending}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="catalog-editor-actions">
              {pending ? (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void submit(pending.action)}
                >
                  {busy ? "正在保存…" : "重试上次提交"}
                </button>
              ) : (
                <>
                  <button
                    className="button"
                    disabled={busy || !sku}
                    onClick={() => void submit("STOCK")}
                  >
                    保存库存调整
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void submit("STATUS")}
                  >
                    {item.publish_status ? "下架商品" : "重新上架"}
                  </button>
                </>
              )}
              <button
                className="button secondary"
                disabled={busy || !!pending}
                onClick={() =>
                  void reload()
                    .then(() => setError(""))
                    .catch((e) => setError(e.message))
                }
              >
                刷新库存
              </button>
            </div>
            <h3>最近调整记录</h3>
            {!item.history.length ? (
              <p className="muted">暂无调整记录。</p>
            ) : (
              <ol className="catalog-history">
                {item.history.map((h) => (
                  <li key={h.request_id}>
                    <div>
                      <strong>
                        {h.action === "STATUS"
                          ? h.after_value
                            ? "商品上架"
                            : "商品下架"
                          : `库存 ${h.before_value} → ${h.after_value}`}
                      </strong>
                      <small>
                        {date(h.created_at)} · {h.actor_name || "管理员"}
                        {h.action === "STOCK" ? ` · SKU ${h.sku_id}` : ""}
                      </small>
                    </div>
                    <p>{h.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
