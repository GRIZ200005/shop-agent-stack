import { useEffect, useState, type FormEvent } from "react";
import { Sparkles, UserRound, ShieldCheck, Check, Trash2 } from "lucide-react";
import { token, type Side } from "./api";
import { modelCatalog } from "./modelCatalog";

export async function accountApi<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const res = await fetch("/api/agent" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: token("portal"),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(50000),
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event("aster-session-expired"));
    throw new Error("登录已过期");
  }
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      typeof data.detail === "string" ? data.detail : "请求未完成",
    );
  return data;
}
type Provider = {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  source: string;
  test?: boolean;
};
type Profile = {
  nickname: string;
  compact: boolean;
  default_provider: string;
  providers: Provider[];
};
type Config = {
  provider: string;
  model: string;
  base_url: string;
  has_key: boolean;
  key_mask: string;
};
export function AccountSettings({
  name,
  side,
  onProfile,
  onLeave,
}: {
  name: string;
  side: Side;
  onProfile: (name: string, compact: boolean) => void;
  onLeave: () => void;
}) {
  const [tab, setTab] = useState(
    new URLSearchParams(location.search).get("tab") === "models"
      ? "models"
      : "profile",
  );
  const [profile, setProfile] = useState<Profile>({
    nickname: "",
    compact: false,
    default_provider: "",
    providers: [],
  });
  const [selected, setSelected] = useState("deepseek"),
    [config, setConfig] = useState<Config | null>(null),
    [key, setKey] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [remove, setRemove] = useState(false);
  async function refresh() {
    const p = await accountApi<Profile>("/settings");
    setProfile(p);
    setLoaded(true);
  }
  useEffect(() => {
    if (side === "portal") void refresh().catch((e) => setError(e.message));
  }, [side]);
  useEffect(() => {
    let active = true;
    setConfig(null);
    setKey("");
    setRemove(false);
    setNotice("");
    setError("");
    if (side === "portal")
      accountApi<Config>("/settings/providers/" + selected)
        .then((c) => {
          if (active) setConfig(c);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selected, side]);
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await accountApi("/settings", {
        nickname: profile.nickname,
        compact: profile.compact,
        default_provider: profile.default_provider,
      });
      onProfile(profile.nickname, profile.compact);
      setNotice("偏好已保存");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveModel(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setConfig(
        await accountApi<Config>("/settings/providers/" + selected, {
          model: config.model,
          base_url: config.base_url,
          api_key: key,
        }),
      );
      setKey("");
      await refresh();
      setNotice("模型配置已加密保存，可测试连接或开始对话");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function testConnection() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await accountApi<{ message: string }>(
        `/settings/providers/${selected}/test`,
        {},
      );
      setNotice(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteConfig() {
    setBusy(true);
    setError("");
    try {
      await accountApi(`/settings/providers/${selected}`, undefined, "DELETE");
      setConfig(await accountApi<Config>("/settings/providers/" + selected));
      setKey("");
      setRemove(false);
      await refresh();
      setNotice("个人配置已移除");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page settings-page">
      <div className="eyebrow">MAKE IT YOURS</div>
      <h1>你的空间，由你定义。</h1>
      <p className="muted">管理账户偏好，连接适合你的模型。</p>
      <div className="settings-layout">
        <nav className="settings-tabs">
          <button
            className={tab === "profile" ? "active" : ""}
            onClick={() => {
              setTab("profile");
              setNotice("");
              setError("");
            }}
          >
            <UserRound size={18} />
            个人资料
          </button>
          {side === "portal" && (
            <button
              className={tab === "models" ? "active" : ""}
              onClick={() => {
                setTab("models");
                setNotice("");
                setError("");
              }}
            >
              <Sparkles size={18} />
              模型设置
            </button>
          )}
        </nav>
        <section className="settings-card">
          {tab === "profile" || side !== "portal" ? (
            <>
              <div className="settings-card-title">
                <div className="account-avatar large">{name.slice(0, 1)}</div>
                <div>
                  <h2>{name}</h2>
                  <p>{side === "portal" ? "个人账户" : "员工账户"}</p>
                </div>
              </div>
              {side === "portal" ? (
                <form className="form-stack" onSubmit={saveProfile}>
                  <label>
                    显示名称
                    <input
                      maxLength={40}
                      value={profile.nickname}
                      placeholder={name}
                      onChange={(e) =>
                        setProfile({ ...profile, nickname: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    默认模型
                    <select
                      aria-label="默认模型"
                      value={profile.default_provider}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          default_provider: e.target.value,
                        })
                      }
                    >
                      <option value="">自动选择可用模型</option>
                      {profile.providers
                        .filter((p) => p.configured && !p.test)
                        .map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.label} · {p.model}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="preference-toggle">
                    <span>
                      紧凑界面<small>减少列表与对话区域的间距</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={profile.compact}
                      onChange={(e) =>
                        setProfile({ ...profile, compact: e.target.checked })
                      }
                    />
                  </label>
                  <button className="button" disabled={busy || !loaded}>
                    保存偏好
                  </button>
                </form>
              ) : (
                <p className="muted">
                  模型个人配置目前提供给客户账户；员工权限由管理员维护。
                </p>
              )}
              <div className="settings-account-actions">
                <button className="text-button" onClick={onLeave}>
                  切换账户
                </button>
                <button className="text-button" onClick={onLeave}>
                  退出登录
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="eyebrow">PERSONAL CONNECTIONS</div>
              <h2>连接你的模型</h2>
              <p className="muted">
                使用自己的 API Key，配置仅对当前账户生效。
              </p>
              <div className="provider-choices">
                {[
                  ["deepseek", "DeepSeek"],
                  ["openai", "OpenAI"],
                  ["kimi", "Kimi"],
                  ["custom", "自定义"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={selected === id ? "active" : ""}
                    disabled={busy}
                    onClick={() => setSelected(id)}
                  >
                    {label}
                    {profile.providers.find((p) => p.id === id)?.source ===
                      "personal" && <Check size={13} />}
                  </button>
                ))}
              </div>
              {config ? (
                <form className="form-stack" onSubmit={saveModel}>
                  <label>
                    模型名称
                    {selected === "custom" ? (
                      <input
                        required
                        maxLength={150}
                        placeholder="填写该服务商支持的模型标识"
                        value={config.model}
                        onChange={(e) =>
                          setConfig({ ...config, model: e.target.value })
                        }
                      />
                    ) : (
                      <select
                        aria-label="模型名称"
                        required
                        value={config.model}
                        onChange={(e) =>
                          setConfig({ ...config, model: e.target.value })
                        }
                      >
                        <option value="" disabled>
                          请选择模型
                        </option>
                        {config.model &&
                          !modelCatalog[selected]?.some(
                            (m) => m.id === config.model,
                          ) && (
                            <option value={config.model}>
                              当前已保存模型 · {config.model}（未在预设列表中）
                            </option>
                          )}
                        {(modelCatalog[selected] || []).map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                  {selected !== "custom" && (
                    <small className="muted">
                      {config.model ? (
                        <>
                          将使用模型标识：<code>{config.model}</code>。{" "}
                        </>
                      ) : (
                        "选择后会自动填写准确的模型标识。 "
                      )}
                      预设列表不代表账户已开通该模型；列表外的接口或模型可在“自定义”中填写。
                    </small>
                  )}
                  <label>
                    API 基础地址
                    <input
                      required
                      type="url"
                      maxLength={300}
                      placeholder="https://api.example.com/v1"
                      value={config.base_url}
                      onChange={(e) =>
                        setConfig({ ...config, base_url: e.target.value })
                      }
                    />
                  </label>
                  <small className="muted">
                    支持公网 HTTPS / 443；基础地址不包含 /chat/completions。
                  </small>
                  <label>
                    API Key
                    <input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={4096}
                      required={!config.has_key}
                      placeholder={
                        config.has_key
                          ? "已保存；留空保留，输入新密钥可替换"
                          : "输入你的 API Key"
                      }
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </label>
                  {config.has_key && (
                    <small className="saved-key">
                      <ShieldCheck size={14} />
                      密钥已加密保存 · {config.key_mask}
                    </small>
                  )}
                  <div className="settings-buttons">
                    <button className="button" disabled={busy}>
                      {busy ? "正在处理…" : "保存模型配置"}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || !config.has_key || !!key}
                      onClick={() => void testConnection()}
                    >
                      测试已保存连接
                    </button>
                    <a className="text-button" href="/app/assistant">
                      打开助手 →
                    </a>
                  </div>
                  <small className="muted">
                    测试使用已保存配置发送一条短请求，可能产生少量 API
                    费用。对话将把问题和相关业务数据发送给所选服务商。
                  </small>
                  {config.has_key && (
                    <div className="remove-config">
                      {remove ? (
                        <>
                          <span>移除当前账户的这份模型配置？</span>
                          <button
                            type="button"
                            disabled={busy}
                            className="text-button"
                            onClick={() => void deleteConfig()}
                          >
                            确认移除
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setRemove(false)}
                          >
                            保留
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => setRemove(true)}
                        >
                          <Trash2 size={14} />
                          移除个人配置
                        </button>
                      )}
                    </div>
                  )}
                </form>
              ) : (
                <p role="status">正在读取配置…</p>
              )}
              <div className="settings-note">
                <ShieldCheck size={18} />
                <p>
                  密钥不会回显或写入浏览器存储。个人配置优先于平台提供的模型配置。
                </p>
              </div>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="settings-success" role="status">
              {notice}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
