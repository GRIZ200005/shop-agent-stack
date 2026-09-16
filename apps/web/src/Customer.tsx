import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { PolicyPages, loadPolicies } from "./PolicyPages";
import { ShipmentButton } from "./Fulfillment";

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
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [pages, setPages] = useState(1);
  const [category, setCategory] = useState(""),
    [keyword, setKeyword] = useState("");
  const [categories, setCategories] = useState<
    { id: number; name: string; showStatus: number }[]
  >([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const loadSequence = useRef(0);
  useEffect(() => {
    let active=true;
    const id=new URLSearchParams(location.search).get("product");
    if(catalog && signed && id && /^[1-9]\d{0,14}$/.test(id)) {
      void api<{product:Product}>("portal",`/product/detail/${id}`)
        .then(result=>{if(active)setSelectedProduct(result.product);})
        .catch(e=>{if(active)setError((e as Error).message);});
    }
    return ()=>{active=false;};
  },[catalog,signed]);
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
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      if (catalog) {
        const result = await api<{
          list: Product[];
          total: number;
          totalPage: number;
        }>(
          "portal",
          `/product/search?pageNum=${page}&pageSize=20&sort=${sort}&keyword=${encodeURIComponent(keyword)}${category ? `&productCategoryId=${category}` : ""}`,
        );
        if (sequence !== loadSequence.current) return;
        setProducts(result.list || []);
        setTotal(result.total);
        setPages(Math.max(1, result.totalPage));
      } else if (signed) {
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
          setSales(await api<Sale[]>("portal", "/shop_agent_stack/after-sales"));
        if (path.endsWith("/policies")) {
          const query = new URLSearchParams(window.location.search);
          const id = query.get("policy"),
            version = query.get("version");
          setPolicies(
            id && version
              ? [
                  await api<Policy>(
                    "portal",
                    `/shop_agent_stack/policies/${encodeURIComponent(id)}?version=${encodeURIComponent(version)}`,
                  ),
                ]
              : await loadPolicies("portal"),
          );
        }
      }
    } catch (e) {
      if (sequence === loadSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      loadSequence.current++;
    };
  }, [path, signed, sort, page, category, keyword]);
  useEffect(() => {
    let current = true;
    if (catalog)
      void api<{ id: number; name: string; showStatus: number }[]>(
        "portal",
        "/product/categoryTreeList",
      )
        .then((rows) => {
          if (current) setCategories(rows.filter((c) => c.showStatus === 1));
        })
        .catch(() => {
          if (current) setCategories([]);
        });
    return () => {
      current = false;
    };
  }, [catalog]);
  useEffect(() => {
    if (!signed || detail?.status !== "REFUNDING") return;
    let cancelled = false,
      fetching = false;
    const timer = setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const next = await api<Sale>(
          "portal",
          `/shop_agent_stack/after-sales/${detail.id}`,
        );
        if (!cancelled) {
          setDetail(next);
          setSales((items) => items.map((s) => (s.id === next.id ? next : s)));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        fetching = false;
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [signed, detail?.id, detail?.status]);
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
        productPic: product.pic,
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
        <div className="eyebrow">MY SHOP</div>
        <h1>{heading}</h1>
        <Empty title="登录后，继续你的购物旅程">
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
              <span className="pill light">SHOP ESSENTIALS</span>
              <h2>
                收集日常的
                <br />
                每一份美好。
              </h2>
              <p>
                从晨间的一杯咖啡，到周末的一次出行。
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
              <ProductArt
                id={10001}
                src="/products/catalog-v1/ivory-mug.webp"
                alt="晨白陶瓷马克杯 · AI 商品示意图"
                large
              />
              <span className="hero-caption">ShopAgentStack Studio · 日常生活图录</span>
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
                日常精选 <span>共 {total} 件</span>
              </h2>
            </div>
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault();
                if (page === 1 && keyword === search.trim()) void load();
                else {
                  setPage(1);
                  setKeyword(search.trim());
                }
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
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="0">精选推荐</option>
              <option value="3">价格从低到高</option>
              <option value="4">价格从高到低</option>
            </select>
          </div>
          <div
            className="catalog-categories"
            role="group"
            aria-label="商品分类"
          >
            <button
              className={category === "" ? "active" : ""}
              onClick={() => {
                setCategory("");
                setPage(1);
              }}
            >
              全部好物
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={category === String(c.id) ? "active" : ""}
                onClick={() => {
                  setCategory(String(c.id));
                  setPage(1);
                }}
              >
                {c.name === "Test Accessories" ? "初始体验商品" : c.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="page-heading">
          <div>
            <div className="eyebrow">MY SHOP</div>
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
        <>
          <div className="product-grid">
            {products.map((p) => (
              <article className="product-card" key={p.id}>
                <div className="art-wrap">
                  <button
                    className="product-image-button"
                    aria-label={`查看商品 ${p.name}`}
                    onClick={() => setSelectedProduct(p)}
                  >
                    <ProductArt
                      id={p.id}
                      src={p.pic}
                      alt={`${p.name} · 商品示意图`}
                    />
                  </button>
                  <span className="product-tag">{p.brandName}</span>
                </div>
                <div className="product-meta">
                  <span>
                    {p.productCategoryName === "Test Accessories"
                      ? "数码生活"
                      : p.productCategoryName}{" "}
                    / 商品示意图
                  </span>
                  <h3>
                    <button
                      className="product-title-button"
                      onClick={() => setSelectedProduct(p)}
                    >
                      {p.name}
                    </button>
                  </h3>
                  <p className="product-spec">{p.subTitle || "日常实用之选"}</p>
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
          {total > 0 && (
            <nav className="catalog-pagination" aria-label="商品分页">
              <button
                className="button secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span>
                第 {page} / {pages} 页 · 共 {total} 件
              </span>
              <button
                className="button secondary"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </nav>
          )}
        </>
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
                    <ProductArt
                      id={item.productId}
                      src={item.productPic}
                      alt={item.productName}
                    />
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
                    <ProductArt
                      id={item.productId}
                      src={item.productPic}
                      alt={item.productName}
                    />
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
                  <ShipmentButton id={o.id} onChanged={() => {
                    void api<{list:Order[]}>("portal", "/order/list?status=-1&pageSize=100").then(r => setOrders(r.list || [])).catch(e => setError(e.message));
                  }} />
                  {o.status === 0 ? (
                    <button
                      disabled={busy}
                      className="button"
                      onClick={() =>
                        void run(async () => {
                          await api(
                            "portal",
                            `/shop_agent_stack/orders/${o.id}/simulate-payment`,
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
                        await api<Sale>("portal", `/shop_agent_stack/after-sales/${s.id}`),
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
        <PolicyPages policies={policies}>
          {(p) => (
            <article className="panel policy" key={p.id}>
              <span className="pill">已发布 · V{p.version}</span>
              <h2>{p.title}</h2>
              {p.clauses ? (
                p.clauses.map((c) => (
                  <section key={c.clause_no} id={`clause-${c.clause_no}`}>
                    <small>
                      条款 {c.clause_no} · P{p.id}V{p.version}C{c.clause_no}
                    </small>
                    <p>{c.content}</p>
                  </section>
                ))
              ) : (
                <p>{p.content}</p>
              )}
            </article>
          )}
        </PolicyPages>
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
      {selectedProduct && (
        <ProductDetails
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAdd={add}
          busy={busy}
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
function ProductDetails({
  product,
  onClose,
  onAdd,
  busy,
}: {
  product: Product;
  onClose: () => void;
  onAdd: (product: Product) => Promise<void>;
  busy: boolean;
}) {
  const [data, setData] = useState<{
    product: Product;
    skuStockList: { stock: number; lockStock: number }[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<{
      product: Product;
      skuStockList: { stock: number; lockStock: number }[];
    }>("portal", `/product/detail/${product.id}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [product.id]);
  const p = data?.product || product;
  const available = data?.skuStockList[0]
    ? Math.max(
        0,
        data.skuStockList[0].stock - (data.skuStockList[0].lockStock || 0),
      )
    : 0;
  return (
    <Modal title={product.name} onClose={onClose}>
      <div className="catalog-detail">
        <ProductArt id={p.id} src={p.pic} alt={`${p.name} · AI 商品示意图`} />
        <span className="muted">
          {p.brandName} · {p.productCategoryName}
        </span>
        <div className="between">
          <strong className="catalog-detail-price">{money(p.price)}</strong>
          {data && (
            <span>
              {available > 0 ? `可售库存 ${available} 件` : "暂时缺货"}
            </span>
          )}
        </div>
        <p>{p.description || p.subTitle}</p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : !data ? (
          <Loading />
        ) : (
          <p className="catalog-detail-specs">
            {p.detailDesc || p.subTitle || "请咨询客服了解商品详情。"}
          </p>
        )}
        <button
          className="button wide"
          disabled={busy || !data || available <= 0}
          onClick={() => {
            onClose();
            void onAdd(p);
          }}
        >
          加入购物袋
        </button>
      </div>
    </Modal>
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
            defaultValue="商城体验空间 1 号"
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
            await api("portal", "/shop_agent_stack/after-sales", {
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
