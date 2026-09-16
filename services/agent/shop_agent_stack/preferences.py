"""Owner-scoped preferences; provider credentials are encrypted with a separate deployment key."""
import json
import os
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken
from . import providers
from .store import StoreError


class Preferences:
    def __init__(self, store, key_path=None):
        self.store = store
        self.cipher = Fernet(Path(key_path or os.getenv("SHOP_AGENT_STACK_KEY_FILE", "/run/secrets/agent_key")).read_bytes().strip())
        with store.db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS preferences(member_id INTEGER PRIMARY KEY, nickname TEXT NOT NULL DEFAULT '', compact INTEGER NOT NULL DEFAULT 0, default_provider TEXT NOT NULL DEFAULT '');
                CREATE TABLE IF NOT EXISTS provider_credentials(member_id INTEGER NOT NULL, provider TEXT NOT NULL, ciphertext BLOB NOT NULL, PRIMARY KEY(member_id,provider));
            """)

    def get(self, member):
        with self.store.db() as db:
            row = db.execute("SELECT nickname,compact,default_provider FROM preferences WHERE member_id=?", (member,)).fetchone()
        result = dict(row) if row else {"nickname": "", "compact": False, "default_provider": ""}
        result["compact"] = bool(result["compact"])
        result["providers"] = self.catalog(member)
        return result

    def update(self, member, nickname, compact, default):
        if default and not any(p["id"] == default and p["configured"] for p in self.catalog(member)):
            raise StoreError("请先配置所选默认模型", 400)
        with self.store.db() as db:
            db.execute("INSERT INTO preferences VALUES(?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET nickname=excluded.nickname,compact=excluded.compact,default_provider=excluded.default_provider", (member, nickname.strip(), compact, default))
        return self.get(member)

    def personal(self, member, provider):
        with self.store.db() as db:
            row = db.execute("SELECT ciphertext FROM provider_credentials WHERE member_id=? AND provider=?", (member, provider)).fetchone()
        if not row:
            return None
        try:
            config = json.loads(self.cipher.decrypt(row["ciphertext"]))
            # Bind ciphertext to its owner/provider as well as authenticating the encryption.
            if config.pop("member") != member or config["id"] != provider:
                raise ValueError()
            return config
        except (InvalidToken, ValueError, KeyError):
            raise StoreError("模型配置无法解密，请联系部署管理员检查加密密钥", 503) from None

    def resolve(self, member, provider):
        return self.personal(member, provider) or providers.settings(provider)

    def catalog(self, member):
        result = []
        for public in providers.public_providers():
            config = self.personal(member, public["id"])
            result.append(public | ({"model": config["model"], "configured": True, "source": "personal"} if config else {"source": "platform"}))
        return result

    def public_config(self, member, provider):
        if provider not in providers.PRESETS:
            raise StoreError("未知模型供应商", 400)
        config = self.personal(member, provider)
        # Never return full key or platform-specific URL. Even suffixes are unnecessary.
        return {"provider": provider, "model": config["model"] if config else "", "base_url": config["url"] if config else providers.PRESETS[provider][1], "has_key": bool(config), "key_mask": "••••••••" if config else "", "source": "personal" if config else "none"}

    def save(self, member, provider, model, url, key):
        if provider not in providers.PRESETS:
            raise StoreError("未知模型供应商", 400)
        url = url.strip() or providers.PRESETS[provider][1]
        from .outbound import validate_url
        validate_url(url)
        existing = self.personal(member, provider)
        # Changing the destination requires re-entering the key; never forward a stored key to a new host.
        if not key and existing and existing["url"] != url:
            raise StoreError("修改 API 地址时请重新输入密钥", 400)
        key = key or (existing["key"] if existing else "")
        if not key or not model.strip():
            raise StoreError("请填写模型名和 API Key", 400)
        config = {"member": member, "id": provider, "model": model.strip(), "url": url, "key": key, "personal": True}
        encrypted = self.cipher.encrypt(json.dumps(config).encode())
        with self.store.db() as db:
            db.execute("INSERT INTO provider_credentials VALUES(?,?,?) ON CONFLICT(member_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext", (member, provider, encrypted))
        return self.public_config(member, provider)

    def delete(self, member, provider):
        with self.store.db() as db:
            db.execute("DELETE FROM provider_credentials WHERE member_id=? AND provider=?", (member, provider))
            db.execute("UPDATE preferences SET default_provider='' WHERE member_id=? AND default_provider=?", (member, provider))
        return {"deleted": True}
