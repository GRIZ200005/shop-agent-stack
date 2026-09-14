import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ShoppingBag,
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
} from "lucide-react";
import { api, clearToken, saveToken, token, type Side } from "./api";
import { Modal } from "./ui";
import { Customer } from "./Customer";
import { StaffWorkspace } from "./StaffWorkspace";

export function App() {
  const path = location.pathname;
  const side: Side =
    path.startsWith("/service") || path.startsWith("/admin")
      ? "admin"
      : "portal";
  const [signed, setSigned] = useState(!!token(side));
  const [login, setLogin] = useState(false);
  const [menu, setMenu] = useState(false);
  const isAdmin = path.startsWith("/admin");
  const links =
    side === "portal"
      ? ([
          [Grid2X2, "发现好物", "/app"],
          [ShoppingBag, "购物袋", "/app/cart"],
          [ReceiptText, "我的订单", "/app/orders"],
          [LifeBuoy, "售后服务", "/app/after-sales"],
          [BookOpen, "服务政策", "/app/policies"],
        ] as const)
      : ([
          [Headphones, "售后工作台", "/service"],
          [ShieldCheck, "管理中心", "/admin"],
        ] as const);
  return (
    <div className="shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a className="brand" href="/app">
          <span className="brand-mark">✳</span>
          <div>
            ASTER<span>COMMERCE · 星序</span>
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
          {side === "portal" ? "YOUR EVERYDAY, REFINED" : "WORKSPACE"}
        </div>
        <nav>
          {links.map(([Icon, label, href]) => (
            <a
              key={href}
              className={
                path === href || (path === "/" && href === "/app")
                  ? "active"
                  : ""
              }
              href={href}
            >
              <Icon size={19} />
              {label}
            </a>
          ))}
        </nav>
        {side === "portal" && (
          <div className="coming">
            <Sparkles size={20} />
            <strong>下一站，更懂你的星序</strong>
            <p>
              智能选购与服务助手
              <br />
              正在准备中。
            </p>
            <span>即将到来</span>
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="environment">
            <i />
            体验环境 · 无真实支付
          </div>
          <div className="role-links">
            <a href="/app">客户</a>
            <a href="/service">客服</a>
            <a href="/admin">管理员</a>
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
                ? "星序生活"
                : isAdmin
                  ? "管理中心"
                  : "客户服务"}
            </span>
            <span className="slash">/</span>
            <small>
              {side === "portal"
                ? "为日常，多一点恰到好处"
                : "让每一次服务都有回应"}
            </small>
          </div>
          <div className="topbar-right">
            <span className="local-tag">ASTER LAB</span>
            {signed ? (
              <button
                className="text-button"
                onClick={() => {
                  clearToken(side);
                  setSigned(false);
                  location.reload();
                }}
              >
                <LogOut size={16} />
                退出登录
              </button>
            ) : (
              <button className="button small" onClick={() => setLogin(true)}>
                登录账户 <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        <main>
          {side === "portal" ? (
            <Customer
              path={path}
              signed={signed}
              requestLogin={() => setLogin(true)}
            />
          ) : signed ? (
            <StaffWorkspace adminView={isAdmin} />
          ) : (
            <div className="staff-welcome">
              <div className="eyebrow">ASTER WORKSPACE</div>
              <h1>
                {isAdmin ? "管理有序，服务有度。" : "每一份信任，都值得回应。"}
              </h1>
              <p>登录{isAdmin ? "管理员" : "客服"}账户，开始今天的工作。</p>
              <button className="button" onClick={() => setLogin(true)}>
                登录工作台 <ArrowUpRight size={17} />
              </button>
            </div>
          )}
        </main>
        <footer>
          <span>ASTER COMMERCE</span>
          <span>让选购简单，让服务有序。</span>
          <small>独立学习项目 · 合成商品与模拟交易</small>
        </footer>
      </div>
      {login && (
        <Login
          side={side}
          onClose={() => setLogin(false)}
          onSuccess={() => {
            setSigned(true);
            setLogin(false);
          }}
        />
      )}
    </div>
  );
}
function Login({
  side,
  onClose,
  onSuccess,
}: {
  side: Side;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [phone, setPhone] = useState(""),
    [otp, setOtp] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (register)
        await api(
          side,
          "/sso/register",
          { username, password, telephone: phone, authCode: otp },
          true,
        );
      const data = await api<{ token: string; tokenHead: string }>(
        side,
        side === "portal" ? "/sso/login" : "/admin/login",
        { username, password },
        side === "portal",
      );
      saveToken(side, data.tokenHead + data.token);
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        register
          ? "创建你的星序账户"
          : side === "portal"
            ? "欢迎回到星序"
            : "登录工作台"
      }
      onClose={onClose}
    >
      <p className="muted">
        {side === "portal"
          ? "收藏日常所需，安心管理每一笔订单。"
          : "使用本地配置的客服或管理员账户。"}
      </p>
      <form onSubmit={submit} className="form-stack">
        <label>
          用户名
          <input
            autoComplete="username"
            required
            minLength={4}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={register ? 8 : 1}
            maxLength={64}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {register && (
          <>
            <label>
              测试手机号
              <input
                required
                pattern="[0-9]{11}"
                placeholder="使用虚拟号码，例如 00000000001"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label>
              体验验证码
              <div className="input-row">
                <input
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
                <button
                  type="button"
                  className="button secondary"
                  disabled={!/^\d{11}$/.test(phone) || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setOtp(
                        await api<string>(
                          side,
                          `/sso/getAuthCode?telephone=${encodeURIComponent(phone)}`,
                        ),
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  获取验证码
                </button>
              </div>
            </label>
            <small className="muted">
              本地体验验证码自动填入，不会发送真实短信。
            </small>
          </>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button disabled={busy} className="button wide">
          {busy ? "正在处理…" : register ? "注册并登录" : "登录"}
        </button>
        {side === "portal" && (
          <button
            type="button"
            className="text-button centered"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "已有账户？去登录" : "还没有账户？创建账户"}
          </button>
        )}
      </form>
    </Modal>
  );
}
