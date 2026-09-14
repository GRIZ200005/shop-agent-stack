import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Plus,
  Minus,
  Trash2,
  ShieldCheck,
  Truck,
  Headphones,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  api,
  date,
  money,
  saleLabels,
  type Product,
  type Cart,
  type Order,
  type Sale,
  type Policy,
} from "./api";
import { Empty, Loading, Modal, ProductArt } from "./ui";

export function Customer({
  path,
  signed,
  requestLogin,
}: {
  path: string;
  signed: boolean;
  requestLogin: () => void;
}) {
  const catalog = path === "/app" || path === "/";
  const [products, setProducts] = useState<Product[]>([]),
    [cart, setCart] = useState<Cart[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [sales, setSales] = useState<Sale[]>([]),
    [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("0");
  const [checkout, setCheckout] = useState(false),
    [returnOrder, setReturnOrder] = useState<Order | null>(null),
    [detail, setDetail] = useState<Sale | null>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      if (catalog)
        setProducts(
          (
            await api<{ list: Product[] }>(
              "portal",
              `/product/search?pageNum=1&pageSize=40&sort=${sort}&keyword=${encodeURIComponent(search)}`,
            )
          ).list || [],
        );
      else if (signed) {
        if (path.endsWith("/cart"))
          setCart(await api<Cart[]>("portal", "/cart/list/promotion"));
        if (path.endsWith("/orders"))
          setOrders(
            (
              await api<{ list: Order[] }>(
                "portal",
                "/order/list?status=-1&pageSize=100",
              )
            ).list || [],
          );
        if (path.endsWith("/after-sales"))
          setSales(await api<Sale[]>("portal", "/aster/after-sales"));
        if (path.endsWith("/policies"))
          setPolicies(await api<Policy[]>("portal", "/aster/policies"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [path, signed, sort]);
  async function run(action: () => Promise<void>, message = "操作已完成") {
    setBusy(true);
    setError("");
    try {
      await action();
      setNotice(message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function add(product: Product) {
    if (!signed) {
      requestLogin();
      return;
    }
    await run(async () => {
      const d = await api<{
        skuStockList: { id: number; skuCode: string; price: number }[];
      }>("portal", `/product/detail/${product.id}`);
      const sku = d.skuStockList[0];
      if (!sku) throw new Error("该商品暂时没有可售规格");
      await api("portal", "/cart/add", {
        productId: product.id,
        productSkuId: sku.id,
        quantity: 1,
        price: sku.price,
        productName: product.name,
        productSkuCode: sku.skuCode,
        productCategoryId: product.productCategoryId,
        productBrand: product.brandName,
        productSn: product.productSn,
      });
    }, "已加入购物袋");
  }
  const heading = path.endsWith("/cart")
    ? "你的购物袋"
    : path.endsWith("/orders")
      ? "我的订单"
      : path.endsWith("/after-sales")
        ? "售后服务"
        : "服务政策";
  if (!catalog && !signed)
    return (
      <section className="page">
        <div className="eyebrow">MY ASTER</div>
        <h1>{heading}</h1>
        <Empty title="登录后，继续你的星序旅程">
          订单与售后仅对你本人可见。
        </Empty>
        <button className="button centered" onClick={requestLogin}>
          登录账户
        </button>
      </section>
    );
  return (
    <section className="page">
      {catalog ? (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">THE EVERYDAY COLLECTION</div>
              <h1>
                好物，让日常恰到好处<span className="dot">.</span>
              </h1>
              <p>从桌面到旅途，发现简单、耐用、合心意的选择。</p>
            </div>
            <span className="season">VOL. 01 / 日常灵感</span>
          </div>
          <div className="hero">
            <div className="hero-copy">
              <span className="pill light">ASTER ESSENTIALS</span>
              <h2>
                连接生活的
                <br />
                每一种可能。
              </h2>
              <p>
                从一根线开始，整理你的数字日常。
                <br />
                少一点繁杂，多一点从容。
              </p>
              <a className="button dark" href="#collection">
                探索日常精选 <ArrowUpRight size={17} />
              </a>
              <div className="hero-foot">DESIGNED FOR EVERYDAY MOMENTS</div>
            </div>
            <div className="hero-art">
              <div className="orbit one" />
              <div className="orbit two" />
              <ProductArt large />
              <span className="hero-caption">Aster Essentials · USB-C</span>
            </div>
          </div>
          <div className="benefits">
            <span>
              <ShieldCheck size={18} />
              价格清晰，安心选购
            </span>
            <span>
              <Truck size={18} />
              订单状态，随时掌握
            </span>
            <span>
              <Headphones size={18} />
              人工售后，认真回应
            </span>
          </div>
          <div className="collection-heading" id="collection">
            <div>
              <div className="eyebrow">CURATED FOR YOU</div>
              <h2>
                日常精选{" "}
                <span>{products.length.toString().padStart(2, "0")}</span>
              </h2>
            </div>
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
            >
              <Search size={18} />
              <input
                aria-label="搜索商品"
                placeholder="搜索你的下一件好物"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="text-button" type="submit">
                搜索
              </button>
            </form>
            <select
              aria-label="商品排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="0">精选推荐</option>
              <option value="3">价格从低到高</option>
              <option value="4">价格从高到低</option>
            </select>
          </div>
        </>
      ) : (
        <div className="page-heading">
          <div>
            <div className="eyebrow">MY ASTER</div>
            <h1>{heading}</h1>
            <p>
              {path.endsWith("/after-sales")
                ? "每一个问题，都有进展可循。"
                : path.endsWith("/orders")
                  ? "从下单到售后，在这里安心掌握。"
                  : path.endsWith("/cart")
                    ? "好物已就位，下一步交给你。"
                    : "清楚的规则，是安心服务的开始。"}
            </p>
          </div>
          <button className="text-button" onClick={() => void load()}>
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="text-button" onClick={() => void load()}>
            重新加载
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Check size={16} />
          {notice}
          {catalog && (
            <a href="/app/cart">
              查看购物袋 <ArrowRight size={14} />
            </a>
          )}
          <button
            className="text-button"
            onClick={() => setNotice("")}
            aria-label="关闭提示"
          >
            ×
          </button>
        </div>
      )}
      {loading ? (
        <Loading />
      ) : catalog ? (
        <div className="product-grid">
          {products.map((p, i) => (
            <article className="product-card" key={p.id}>
              <div className="art-wrap">
                <ProductArt id={p.id} />
                <span className="product-tag">
                  {i === 0 ? "日常之选" : "ASTER LAB"}
                </span>
              </div>
              <div className="product-meta">
                <span>数码生活 / 合成体验商品</span>
                <h3>{p.name}</h3>
                <div className="product-bottom">
                  <strong>{money(p.price)}</strong>
                  <button
                    className="add-button"
                    disabled={busy}
                    onClick={() => void add(p)}
                    aria-label={`加入购物袋 ${p.name}`}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </article>
          ))}
          {products.length === 0 && (
            <Empty title="暂时没有匹配的商品">试试其他关键词。</Empty>
          )}
        </div>
      ) : path.endsWith("/cart") ? (
        <>
          {cart.length === 0 ? (
            <Empty title="购物袋还是空的">
              <a href="/app">去发现好物 →</a>
            </Empty>
          ) : (
            <div className="cart-layout">
              <div className="panel">
                {cart.map((item) => (
                  <div className="cart-row" key={item.id}>
                    <ProductArt id={item.productId} />
                    <div className="grow">
                      <h3>{item.productName}</h3>
                      <p>{money(item.price)} / 件</p>
                      <div className="quantity">
                        <button
                          aria-label="减少数量"
                          disabled={busy || item.quantity <= 1}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                "portal",
                                `/cart/update/quantity?id=${item.id}&quantity=${item.quantity - 1}`,
                              );
                            })
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          aria-label="增加数量"
                          disabled={busy || item.quantity >= 10}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                "portal",
                                `/cart/update/quantity?id=${item.id}&quantity=${item.quantity + 1}`,
                              );
                            })
                          }
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <strong>{money(item.price * item.quantity)}</strong>
                    <button
                      className="icon-button"
                      aria-label="移除商品"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(
                            "portal",
                            `/cart/delete?ids=${item.id}`,
                            {},
                          );
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
              </div>
              <aside className="panel summary">
                <div className="eyebrow">YOUR SELECTION</div>
                <h2>订单摘要</h2>
                <div className="between">
                  <span>商品数量</span>
                  <strong>{cart.reduce((n, c) => n + c.quantity, 0)} 件</strong>
                </div>
                <div className="between total">
                  <span>预计合计</span>
                  <strong>
                    {money(cart.reduce((n, c) => n + c.price * c.quantity, 0))}
                  </strong>
                </div>
                <p className="muted">
                  最终金额以下单结果为准。本环境不发生真实支付。
                </p>
                <button
                  className="button wide"
                  disabled={busy}
                  onClick={() => setCheckout(true)}
                >
                  填写地址并下单 <ArrowRight size={17} />
                </button>
              </aside>
            </div>
          )}
        </>
      ) : path.endsWith("/orders") ? (
        <div className="stack">
          {orders.length === 0 ? (
            <Empty title="还没有订单">
              <a href="/app">挑选你的第一件好物 →</a>
            </Empty>
          ) : (
            orders.map((o) => (
              <article className="panel order-card" key={o.id}>
                <div className="between order-top">
                  <span>
                    订单 #{o.id} <small>· {date(o.createTime)}</small>
                  </span>
                  <span className={`pill ${o.status === 0 ? "amber" : ""}`}>
                    {
                      [
                        "待支付",
                        "已支付 · 待发货",
                        "已发货",
                        "已完成",
                        "已关闭",
                        "无效订单",
                      ][o.status]
                    }
                  </span>
                </div>
                {o.orderItemList.map((item, i) => (
                  <div className="order-item" key={i}>
                    <ProductArt id={item.productId} />
                    <div>
                      <h3>{item.productName}</h3>
                      <p>数量 {item.productQuantity}</p>
                    </div>
                  </div>
                ))}
                <div className="between order-bottom">
                  <span>
                    合计 <strong>{money(o.payAmount)}</strong>
                  </span>
                  {o.status === 0 ? (
                    <button
                      disabled={busy}
                      className="button"
                      onClick={() =>
                        void run(async () => {
                          await api(
                            "portal",
                            `/aster/orders/${o.id}/simulate-payment`,
                            {},
                          );
                        }, "模拟支付完成，没有真实扣款")
                      }
                    >
                      模拟支付
                    </button>
                  ) : o.status >= 1 && o.status <= 3 ? (
                    <button
                      className="button secondary"
                      onClick={() => setReturnOrder(o)}
                    >
                      申请售后
                    </button>
                  ) : (
                    <a href="/app/after-sales" className="text-button">
                      查看售后 <ArrowRight size={15} />
                    </a>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      ) : path.endsWith("/after-sales") ? (
        <div className="stack">
          {sales.length === 0 ? (
            <Empty title="暂时没有售后申请">
              如有需要，可以从“我的订单”发起申请。
            </Empty>
          ) : (
            sales.map((s) => (
              <button
                className="panel sale-row"
                key={s.id}
                onClick={() =>
                  void run(
                    async () =>
                      setDetail(
                        await api<Sale>("portal", `/aster/after-sales/${s.id}`),
                      ),
                    "已加载售后进度",
                  )
                }
              >
                <div className="grow">
                  <span className="eyebrow">
                    售后 #{s.id} · 订单 #{s.order_id}
                  </span>
                  <h3>{s.reason}</h3>
                  <p>
                    {date(s.created_at)} · {money(s.amount)}
                  </p>
                </div>
                <span
                  className={`pill ${s.status === "REFUNDED" ? "green" : ""}`}
                >
                  {saleLabels[s.status]}
                </span>
                <ArrowUpRight size={19} />
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="stack">
          {policies.map((p) => (
            <article className="panel policy" key={p.id}>
              <span className="pill">已发布 · V{p.version}</span>
              <h2>{p.title}</h2>
              <p>{p.content}</p>
            </article>
          ))}
        </div>
      )}
      {checkout && (
        <Checkout
          cart={cart}
          onClose={() => setCheckout(false)}
          onDone={() => {
            location.href = "/app/orders";
          }}
        />
      )}
      {returnOrder && (
        <ReturnForm order={returnOrder} onClose={() => setReturnOrder(null)} />
      )}
      {detail && (
        <Modal title={`售后 #${detail.id}`} onClose={() => setDetail(null)}>
          <SaleTimeline sale={detail} />
        </Modal>
      )}
    </section>
  );
}
function Checkout({
  cart,
  onClose,
  onDone,
}: {
  cart: Cart[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("portal", "/member/address/add", {
        name: f.get("name"),
        phoneNumber: f.get("phone"),
        defaultStatus: 0,
        province: "体验省",
        city: "体验市",
        region: "体验区",
        detailAddress: f.get("address"),
      });
      const addresses = await api<
        { id: number; detailAddress: string; name: string }[]
      >("portal", "/member/address/list");
      const address = addresses
        .filter(
          (a) =>
            a.name === f.get("name") && a.detailAddress === f.get("address"),
        )
        .sort((a, b) => b.id - a.id)[0];
      if (!address) throw new Error("地址保存失败，请重试");
      await api("portal", "/order/generateOrder", {
        memberReceiveAddressId: address.id,
        payType: 0,
        cartIds: cart.map((c) => c.id),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="确认订单" onClose={onClose}>
      <p className="muted">请填写虚拟收件信息用于体验。不会安排真实发货。</p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          收件人
          <input
            name="name"
            required
            maxLength={30}
            defaultValue="体验收件人"
          />
        </label>
        <label>
          联系电话
          <input
            name="phone"
            required
            pattern="[0-9]{11}"
            defaultValue="00000000000"
          />
        </label>
        <label>
          详细地址
          <input
            name="address"
            required
            maxLength={100}
            defaultValue="星序体验空间 1 号"
          />
        </label>
        <div className="between total">
          <span>商品预计金额</span>
          <strong>
            {money(cart.reduce((n, c) => n + c.quantity * c.price, 0))}
          </strong>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="button wide" disabled={busy}>
          {busy ? "正在提交…" : "确认创建订单"}
        </button>
      </form>
    </Modal>
  );
}
function ReturnForm({ order, onClose }: { order: Order; onClose: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="申请售后" onClose={onClose}>
      <p className="muted">
        订单 #{order.id} · 整单金额 {money(order.payAmount)}
        。每笔订单可提交一次，由客服审核。
      </p>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const reason = new FormData(e.currentTarget).get("reason");
          setBusy(true);
          try {
            await api("portal", "/aster/after-sales", {
              orderId: order.id,
              reason,
            });
            location.href = "/app/after-sales";
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          申请原因
          <textarea
            name="reason"
            required
            maxLength={500}
            rows={4}
            placeholder="请描述遇到的问题，方便客服为你处理"
          />
        </label>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <button className="button wide" disabled={busy}>
          {busy ? "正在提交…" : "确认提交售后"}
        </button>
      </form>
    </Modal>
  );
}
export function SaleTimeline({ sale }: { sale: Sale }) {
  return (
    <>
      <div className="between">
        <span className="pill">{saleLabels[sale.status]}</span>
        <strong>{money(sale.amount)}</strong>
      </div>
      <p className="reason">{sale.reason}</p>
      <ol className="timeline">
        {sale.events?.map((e, i) => (
          <li key={i}>
            <i />
            <div>
              <strong>{e.note}</strong>
              <small>{date(e.created_at)}</small>
            </div>
          </li>
        ))}
      </ol>
      {sale.refund_reference && (
        <p className="notice">
          模拟退款凭证：{sale.refund_reference}
          <br />
          本次操作无真实资金流转。
        </p>
      )}
    </>
  );
}
