import { useEffect, useState } from "react";
import {
  ShoppingBag,
  Package as PackageIcon,
  Grid2X2,
  ReceiptText,
  LifeBuoy,
  BookOpen,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Headphones,
  Sparkles,
  Settings,
  ChevronsUpDown,
  ArrowRightLeft,
} from "lucide-react";
import { api, token, type Side } from "./api";
import { Customer } from "./Customer";
import { StaffWorkspace } from "./StaffWorkspace";
import { AgentWorkspace } from "./AgentWorkspace";
import { Login } from "./Login";
import { AccountSettings, accountApi } from "./AccountSettings";
import "./account.css";
import { SupportWorkspace } from "./Support";
import { ProductManagement } from "./ProductManagement";
import { FulfillmentWorkspace } from "./Fulfillment";

function safeNext(value: string | null) {
  try {
    if (value && !value.includes("\\")) {
      const target = new URL(value, location.origin);
      if (
        target.origin === location.origin &&
        /^\/(app|service|admin)(\/|$)/.test(target.pathname)
      )
        return target.pathname + target.search;
    }
  } catch {
    /* Invalid return targets go to the default workspace. */
  }
  return "/app/assistant";
}
function leave(next: string) {
  Object.keys(sessionStorage)
    .filter((k) => k.startsWith("shop_agent_stack_"))
    .forEach((k) => sessionStorage.removeItem(k));
  location.replace("/login?next=" + encodeURIComponent(next));
}
export function App() {
  const path = location.pathname,
    loginPage = path === "/login";
  const destination = loginPage
    ? safeNext(new URLSearchParams(location.search).get("next"))
    : path === "/"
      ? "/app/assistant"
      : path;
  const side: Side =
    destination.startsWith("/service") || destination.startsWith("/admin")
      ? "admin"
      : "portal";
  const [ready, setReady] = useState(false),
    [failure, setFailure] = useState("");
  const [menu, setMenu] = useState(false),
    [accountMenu, setAccountMenu] = useState(false);
  const [name, setName] = useState(
    sessionStorage.getItem(`shop_agent_stack_name_${side}`) || "商城用户",
  );
  const [compact, setCompact] = useState(false);
  const isAdmin = destination.startsWith("/admin");
  useEffect(() => {
    if (loginPage) return;
    if (!token(side)) {
      leave(destination + location.search);
      return;
    }
    let cancelled = false;
    api<Record<string, unknown>>(
      side,
      side === "portal" ? "/sso/info" : "/admin/info",
    )
      .then((info) => {
        if (cancelled) return;
        setName(String(info.username || info.nickName || "商城用户"));
        sessionStorage.setItem(
          `shop_agent_stack_name_${side}`,
          String(info.username || "商城用户"),
        );
        setReady(true);
        if (side === "portal")
          accountApi<{ nickname: string; compact: boolean }>("/settings")
            .then((p) => {
              if (!cancelled) {
                if (p.nickname) setName(p.nickname);
                setCompact(p.compact);
              }
            })
            .catch(() => {});
      })
      .catch((e) => {
        if (e.code === 401 || e.code === 403) leave(destination);
        else setFailure("暂时无法验证登录状态，请检查服务后重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [side, destination, loginPage]);
  useEffect(() => {
    function expired() {
      if (!loginPage) leave(destination + location.search);
    }
    window.addEventListener("shop_agent_stack-session-expired", expired);
    return () => window.removeEventListener("shop_agent_stack-session-expired", expired);
  }, [destination, loginPage]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenu(false);
        setMenu(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  if (loginPage)
    return (
      <div className="auth-page">
        <div className="auth-story">
          <a className="brand" href="/login">
            <img className="brand-mark" src="/brand/shop-agent-stack.svg" alt="" />
            <div>
              ShopAgentStack<span>AI COMMERCE & SERVICE</span>
            </div>
          </a>
          <div className="auth-art">
            <div className="auth-ring ring-one" />
            <div className="auth-ring ring-two" />
            <Sparkles size={58} />
            <span className="auth-chip chip-one">更自然的对话</span>
            <span className="auth-chip chip-two">更有序的服务</span>
          </div>
          <div>
            <div className="eyebrow">LESS FRICTION. MORE POSSIBILITY.</div>
            <h2>
              日常所需，
              <br />
              选购与服务，一站完成。
            </h2>
            <p>
              从一件好物，到一次安心的回应。
              <br />
              登录，让每一次连接更简单。
            </p>
          </div>
          <small>合成商品 · 模拟交易体验</small>
        </div>
        <div className="auth-panel">
          <div className="auth-role">
            {side === "portal"
              ? "客户空间"
              : isAdmin
                ? "管理员空间"
                : "客服空间"}
          </div>
          <Login
            side={side}
            onClose={() => {}}
            onSuccess={() => location.replace(destination)}
          />
          <div className="auth-role-links">
            <a href="/login?next=/app/assistant">客户登录</a>
            <a href="/login?next=/service">客服登录</a>
            <a href="/login?next=/admin">管理员登录</a>
          </div>
          <small className="auth-foot">
            SHOPAGENTSTACK · 让选购简单，让服务有序
          </small>
        </div>
      </div>
    );
  if (!ready)
    return (
      <div className="auth-loading" role="status">
        <Sparkles />
        <p>{failure || "正在验证登录状态…"}</p>
        {failure && (
          <button className="button" onClick={() => location.reload()}>
            重新连接
          </button>
        )}
      </div>
    );
  const links =
    side === "portal"
      ? ([
          [Sparkles, "购物助手", "/app/assistant"],
          [Grid2X2, "发现好物", "/app"],
          [ShoppingBag, "购物袋", "/app/cart"],
          [ReceiptText, "我的订单", "/app/orders"],
          [LifeBuoy, "售后服务", "/app/after-sales"],
          [Headphones, "人工咨询", "/app/support"],
          [BookOpen, "服务政策", "/app/policies"],
        ] as const)
      : ([
          [Headphones, "售后工作台", "/service"],
          [Headphones, "人工咨询", "/service/support"],
          [ShieldCheck, "管理中心", "/admin"],
          [PackageIcon, "商品管理", "/admin/products"],
          [ReceiptText, "订单履约", "/admin/orders"],
        ] as const);
  return (
    <div
      className={`shell ${compact ? "compact-mode" : ""} ${side === "portal" && (path === "/" || path === "/app/assistant") ? "assistant-shell" : ""}`}
    >
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a className="brand" href="/app/assistant">
          <img className="brand-mark" src="/brand/shop-agent-stack.svg" alt="" />
          <div>
            ShopAgentStack<span>AI COMMERCE & SERVICE</span>
          </div>
        </a>
        <button
          className="mobile-close icon-button"
          onClick={() => setMenu(false)}
          aria-label="收起导航"
        >
          <X />
        </button>
        <div className="workspace-label">
          {side === "portal" ? "YOUR PERSONAL SPACE" : "WORKSPACE"}
        </div>
        <nav>
          {links.map(([Icon, label, href]) => (
            <a
              key={href}
              className={destination === href ? "active" : ""}
              href={href}
            >
              <Icon size={19} />
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment">
            <i />
            体验环境 · 无真实支付
          </div>
          <div className="account-anchor">
            {accountMenu && (
              <>
                <button
                  className="account-dismiss"
                  aria-label="关闭账户菜单"
                  onClick={() => setAccountMenu(false)}
                />
                <div className="account-dropdown">
                  <small>{side === "portal" ? "我的账户" : "工作账户"}</small>
                  <a
                    href={
                      side === "portal"
                        ? "/app/settings"
                        : `${isAdmin ? "/admin" : "/service"}/settings`
                    }
                  >
                    <Settings size={16} />
                    个人设置
                  </a>
                  {side === "portal" && (
                    <a href="/app/settings?tab=models">
                      <Sparkles size={16} />
                      模型设置
                    </a>
                  )}
                  <button onClick={() => leave(destination)}>
                    <ArrowRightLeft size={16} />
                    切换账户
                  </button>
                  <button
                    onClick={() =>
                      leave(side === "portal" ? "/app/assistant" : destination)
                    }
                  >
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              </>
            )}
            <button
              className="account-trigger"
              aria-label="账户菜单"
              aria-expanded={accountMenu}
              onClick={() => setAccountMenu(!accountMenu)}
            >
              <span className="account-avatar">
                {name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{name}</strong>
                <small>
                  {side === "portal" ? "个人账户" : isAdmin ? "管理员" : "客服"}
                </small>
              </span>
              <ChevronsUpDown size={16} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="关闭导航"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              aria-label="展开导航"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span>
              {side === "portal"
                ? "商城首页"
                : isAdmin
                  ? "管理中心"
                  : "客户服务"}
            </span>
            <span className="slash">/</span>
            <small>欢迎回来，{name}</small>
          </div>
          <span className="local-tag">SHOPAGENTSTACK</span>
        </header>
        <main>
          {destination === "/admin/orders" ? (
            <FulfillmentWorkspace />
          ) : destination === "/admin/products" ? (
            <ProductManagement />
          ) : destination.endsWith("/support") ? (
            <SupportWorkspace staff={side === "admin"} />
          ) : destination.endsWith("/settings") ? (
            <AccountSettings
              name={name}
              side={side}
              onProfile={(nickname, dense) => {
                setName(
                  nickname ||
                    sessionStorage.getItem(`shop_agent_stack_name_${side}`) ||
                    "商城用户",
                );
                setCompact(dense);
              }}
              onLeave={() => leave(destination)}
            />
          ) : side === "portal" &&
            (path === "/" || path === "/app/assistant") ? (
            <AgentWorkspace signed requestLogin={() => leave(destination)} />
          ) : side === "portal" ? (
            <Customer
              path={path}
              signed
              requestLogin={() => leave(destination)}
            />
          ) : (
            <StaffWorkspace adminView={isAdmin} />
          )}
        </main>
        <footer>
          <span>SHOPAGENTSTACK</span>
          <span>让选购简单，让服务有序。</span>
          <small>合成商品 · 模拟交易体验</small>
        </footer>
      </div>
    </div>
  );
}
