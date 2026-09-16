import { useState, type FormEvent, type ReactNode } from "react";
import { api, saveToken, type Side } from "./api";
function LoginCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <section className="auth-card" aria-label={title}>
      <div className="eyebrow">YOUR SPACE, YOUR POSSIBILITIES</div>
      <h1>{title}</h1>
      {children}
    </section>
  );
}
export function Login({
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
      sessionStorage.setItem(`shop_agent_stack_name_${side}`, username);
      sessionStorage.removeItem("shop_agent_stack_session");
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LoginCard
      title={
        register
          ? "创建你的商城账户"
          : side === "portal"
            ? "欢迎回来"
            : "登录工作台"
      }
      onClose={onClose}
    >
      <p className="muted">
        {side === "portal"
          ? "收藏日常所需，安心管理每一笔订单。"
          : "使用已分配的客服或管理员账户登录。"}
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
    </LoginCard>
  );
}
