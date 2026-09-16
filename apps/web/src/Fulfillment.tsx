import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Truck, PackageCheck } from "lucide-react";
import { api, date, money, type Side } from "./api";
import { Empty, Loading, Modal, ProductArt } from "./ui";
import "./fulfillment.css";

const labels = ["待支付", "待发货", "配送中", "已完成", "已关闭", "无效订单"];
type Summary = {
  id: number;
  order_sn: string;
  status: number;
  pay_amount: number;
  create_time: string;
};
type Detail = Summary & {
  delivery_company: string;
  delivery_sn: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_province: string;
  receiver_city: string;
  receiver_region: string;
  receiver_detail_address: string;
  after_sale_open: boolean;
  items: {
    product_id: number;
    product_name: string;
    product_pic: string;
    product_quantity: number;
    product_price: number;
  }[];
  events: { stage: string; note: string; created_at: string }[];
};

export function FulfillmentWorkspace() {
  const [items, setItems] = useState<Summary[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(0),
    [status, setStatus] = useState("1"),
    [draft, setDraft] = useState(""),
    [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<number | null>(null);
  const close = useCallback(() => setSelected(null), []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<{ items: Summary[]; total: number }>(
      "admin",
      `/shop_agent_stack/fulfillment?query=${encodeURIComponent(query)}&page=${page}${status ? `&status=${status}` : ""}`,
    )
      .then((r) => {
        if (live) {
          setItems(r.items);
          setTotal(r.total);
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
    <section className="page fulfillment-page">
      <div className="between">
        <div>
          <div className="eyebrow">ORDER FULFILLMENT</div>
          <h1>订单履约</h1>
          <p>从准备发货，到客户安心收货。</p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      <div className="fulfillment-banner">
        <Truck size={26} />
        <div>
          <strong>每一程，都有迹可循</strong>
          <p>当前使用模拟配送，不向真实快递公司提交订单。</p>
        </div>
      </div>
      <form
        className="fulfillment-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(draft.trim());
          setPage(0);
        }}
      >
        <input
          aria-label="搜索订单号"
          placeholder="搜索订单号"
          value={draft}
          maxLength={64}
          onChange={(e) => setDraft(e.target.value)}
        />
        <select
          aria-label="订单状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部订单</option>
          {labels.map((s, i) => (
            <option key={s} value={i}>
              {s}
            </option>
          ))}
        </select>
        <button className="button">查询</button>
      </form>
      {error && (
        <p role="alert" className="shipment-error">
          {error}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : !items.length ? (
        <Empty title="暂无符合条件的订单">
          客户模拟支付后，订单会进入待发货列表。
        </Empty>
      ) : (
        <div className="stack">
          {items.map((o) => (
            <article key={o.id} className="panel fulfillment-row">
              <div>
                <small>订单 #{o.id}</small>
                <h3>{o.order_sn}</h3>
                <span>{date(o.create_time)}</span>
              </div>
              <span className="pill">{labels[o.status]}</span>
              <strong>{money(o.pay_amount)}</strong>
              <button
                className="button secondary"
                onClick={() => setSelected(o.id)}
              >
                查看履约
              </button>
            </article>
          ))}
        </div>
      )}
      <div className="fulfillment-pages">
        <button
          className="button secondary"
          disabled={!page || loading}
          onClick={() => setPage((v) => v - 1)}
        >
          上一页
        </button>
        <span>
          {total} 笔 · 第 {page + 1} 页
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
        <ShipmentDialog
          id={selected}
          side="admin"
          onClose={close}
          onChanged={() => setRevision((v) => v + 1)}
        />
      )}
    </section>
  );
}

export function ShipmentButton({
  id,
  onChanged,
}: {
  id: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        <Truck size={16} />
        查看物流
      </button>
      {open && (
        <ShipmentDialog
          id={id}
          side="portal"
          onClose={close}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function ShipmentDialog({
  id,
  side,
  onClose,
  onChanged,
}: {
  id: number;
  side: Side;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [confirm, setConfirm] = useState(false);
  const path =
    side === "admin"
      ? `/shop_agent_stack/fulfillment/${id}`
      : `/shop_agent_stack/orders/${id}/shipment`;
  const load = useCallback(async () => {
    setDetail(await api<Detail>(side, path));
  }, [side, path]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function submit(stage?: string) {
    setBusy(true);
    setError("");
    try {
      await api(
        side,
        stage ? `${path}/advance` : `/shop_agent_stack/orders/${id}/receive`,
        stage ? { stage, note: note.trim() } : {},
      );
      await load();
      setNote("");
      setConfirm(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const stage = detail?.status === 1 ? "SHIPPED" : "DELIVERING";
  const canAdvance =
    detail &&
    !detail.after_sale_open &&
    (detail.status === 1 ||
      (detail.status === 2 &&
        detail.events.some((e) => e.stage === "SHIPPED") &&
        !detail.events.some((e) => e.stage === "DELIVERING")));
  return (
    <Modal
      title={side === "admin" ? "订单履约详情" : "物流详情"}
      onClose={onClose}
    >
      <div className="shipment-detail">
        {error && (
          <p role="alert" className="shipment-error">
            {error}
          </p>
        )}
        {!detail ? (
          <Loading />
        ) : (
          <>
            <div className="shipment-state">
              <PackageCheck size={28} />
              <div>
                <strong>{labels[detail.status]}</strong>
                <small>订单 {detail.order_sn}</small>
              </div>
              <span className="pill">模拟配送</span>
            </div>
            <div className="shipment-address">
              <strong>
                {detail.receiver_name} · {detail.receiver_phone}
              </strong>
              <p>
                {detail.receiver_province} {detail.receiver_city}{" "}
                {detail.receiver_region} {detail.receiver_detail_address}
              </p>
            </div>
            {detail.items.map((i, index) => (
              <div className="shipment-product" key={index}>
                <ProductArt
                  id={i.product_id}
                  src={i.product_pic}
                  alt={i.product_name || `商品 #${i.product_id}`}
                />
                <div>
                  <strong>{i.product_name || `商品 #${i.product_id}`}</strong>
                  <p>
                    数量 {i.product_quantity} · {money(i.product_price)}
                  </p>
                </div>
              </div>
            ))}
            {detail.delivery_sn && (
              <p className="shipment-tracking">
                {detail.delivery_company} · {detail.delivery_sn}
              </p>
            )}
            <h3>配送动态</h3>
            {!detail.events.length ? (
              <p className="muted">尚未发货，暂无配送记录。</p>
            ) : (
              <ol className="shipment-timeline">
                {detail.events.map((e) => (
                  <li key={e.stage}>
                    <strong>
                      {{
                        SHIPPED: "已模拟发货",
                        DELIVERING: "模拟派送中",
                        RECEIVED: "已确认收货",
                      }[e.stage] || e.stage}
                    </strong>
                    <small>{date(e.created_at)}</small>
                    <p>{e.note}</p>
                  </li>
                ))}
              </ol>
            )}
            {detail.after_sale_open && detail.status !== 4 && (
              <p className="shipment-hint">
                该订单存在售后处理，暂时无法继续履约。请先在售后工作台核实处理结果。
              </p>
            )}
            {side === "admin" && canAdvance && (
              <div className="shipment-actions">
                <label>
                  配送备注
                  <textarea
                    aria-label="配送备注"
                    rows={3}
                    maxLength={300}
                    value={note}
                    disabled={busy}
                    placeholder={
                      stage === "SHIPPED"
                        ? "例如：已完成打包，交由模拟配送。"
                        : "例如：模拟包裹已到达配送站。"
                    }
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  className="button"
                  disabled={busy || !note.trim()}
                  onClick={() => void submit(stage)}
                >
                  {busy
                    ? "正在提交…"
                    : stage === "SHIPPED"
                      ? "确认模拟发货"
                      : "更新为派送中"}
                </button>
              </div>
            )}
            {side === "portal" &&
              detail.status === 2 &&
              !detail.after_sale_open &&
              detail.events.some((e) => e.stage === "SHIPPED") && (
                <div className="shipment-actions">
                  {confirm ? (
                    <>
                      <p>
                        确认后订单将标记为已完成，请在确认商品已收到后提交。
                      </p>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void submit()}
                      >
                        确认已收到商品
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => setConfirm(false)}
                      >
                        暂不确认
                      </button>
                    </>
                  ) : (
                    <button className="button" onClick={() => setConfirm(true)}>
                      确认收货
                    </button>
                  )}
                </div>
              )}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void load().catch((e) => setError(e.message))}
            >
              <RefreshCw size={15} />
              刷新动态
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
