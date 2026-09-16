"""Single-instance P2 event store. SQLite is isolated from Java's MySQL business tables."""
import json
import os
import sqlite3
import time
from contextlib import contextmanager
from uuid import uuid4


class StoreError(Exception):
    def __init__(self, message, code=409):
        super().__init__(message)
        self.code = code


class Store:
    def __init__(self, path=None):
        self.path = path or os.getenv("ASTER_AGENT_DB", "/data/agent.sqlite")
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with self.db() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, member_id INTEGER NOT NULL, title TEXT NOT NULL, created REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, request_id TEXT NOT NULL, input TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, created REAL NOT NULL, UNIQUE(session_id,request_id));
                CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id,id);
                CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(member_id,created);
                CREATE TABLE IF NOT EXISTS task_context(session_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            """)
            for row in db.execute("SELECT id,status FROM runs WHERE status IN ('QUEUED','RUNNING','CONFIRMING','STOPPING')").fetchall():
                status = "UNCERTAIN" if row["status"] == "CONFIRMING" else "INTERRUPTED"
                db.execute("UPDATE runs SET status=? WHERE id=?", (status, row["id"]))
                self._event(db, row["id"], "state", {"status": status, "message": "服务已重启，请核实业务结果或重新提问"})

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def _event(db, run_id, kind, payload):
        db.execute("INSERT INTO events(run_id,kind,payload) VALUES(?,?,?)", (run_id,kind,json.dumps(payload,ensure_ascii=False)))

    def sessions(self, member):
        with self.db() as db:
            return [dict(r) for r in db.execute("SELECT id,title,created FROM sessions WHERE member_id=? ORDER BY created DESC LIMIT 100",(member,))]

    def new_session(self, member):
        sid = str(uuid4())
        with self.db() as db:
            db.execute("INSERT INTO sessions VALUES(?,?,?,?)",(sid,member,"新对话",time.time()))
        return {"id":sid,"title":"新对话"}

    def delete_session(self, sid, member):
        # Serialize deletion with run creation and confirmation transitions.
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM sessions WHERE id=? AND member_id=?", (sid, member)).fetchone():
                raise StoreError("会话不存在或无权访问", 404)
            if db.execute("SELECT 1 FROM runs WHERE session_id=? AND status NOT IN ('COMPLETED','FAILED','STOPPED','INTERRUPTED')", (sid,)).fetchone():
                raise StoreError("请先停止执行、取消待确认操作，或核实业务提交结果后再删除对话", 409)
            db.execute("DELETE FROM events WHERE run_id IN (SELECT id FROM runs WHERE session_id=?)", (sid,))
            db.execute("DELETE FROM task_context WHERE session_id=?", (sid,))
            db.execute("DELETE FROM runs WHERE session_id=?", (sid,))
            db.execute("DELETE FROM sessions WHERE id=? AND member_id=?", (sid, member))
        return {"deleted": True}

    def session(self, sid, member):
        with self.db() as db:
            row = db.execute("SELECT * FROM sessions WHERE id=? AND member_id=?",(sid,member)).fetchone()
            if not row:
                raise StoreError("会话不存在或无权访问",404)
            runs = [dict(r) for r in db.execute("SELECT * FROM runs WHERE session_id=? ORDER BY created",(sid,))]
        for run in runs:
            run["events"] = self.events(run["id"])
        return {"id":sid,"title":row["title"],"runs":runs}

    def create_run(self, sid, member, request_id, message, provider):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM sessions WHERE id=? AND member_id=?",(sid,member)).fetchone():
                raise StoreError("会话不存在或无权访问",404)
            previous = db.execute("SELECT id FROM runs WHERE session_id=? AND request_id=?",(sid,request_id)).fetchone()
            if previous:
                return previous["id"], False
            if db.execute("SELECT 1 FROM runs WHERE session_id=? AND status IN ('QUEUED','RUNNING','CONFIRMING','STOPPING')",(sid,)).fetchone():
                raise StoreError("当前会话仍在执行，请等待或停止后再发送")
            rid = str(uuid4())
            db.execute("INSERT INTO runs VALUES(?,?,?,?,?,?,?)",(rid,sid,request_id,message,provider,"QUEUED",time.time()))
            db.execute("UPDATE sessions SET title=? WHERE id=? AND title='新对话'",(message[:28],sid))
            self._event(db,rid,"state",{"status":"QUEUED","message":"已接收请求"})
            return rid, True

    def run(self, rid, member):
        with self.db() as db:
            row = db.execute("SELECT r.* FROM runs r JOIN sessions s ON s.id=r.session_id WHERE r.id=? AND s.member_id=?",(rid,member)).fetchone()
        if not row:
            raise StoreError("执行不存在或无权访问",404)
        result = dict(row)
        result["events"] = self.events(rid)
        return result

    def events(self, rid, after=0):
        with self.db() as db:
            return [{"id":r["id"],"kind":r["kind"],"data":json.loads(r["payload"])} for r in db.execute("SELECT * FROM events WHERE run_id=? AND id>? ORDER BY id",(rid,after))]

    def emit(self,rid,kind,payload):
        with self.db() as db:
            self._event(db,rid,kind,payload)

    def state(self,rid,status,message=""):
        with self.db() as db:
            db.execute("UPDATE runs SET status=? WHERE id=?",(status,rid))
            self._event(db,rid,"state",{"status":status,"message":message})

    def begin_confirm(self,rid):
        with self.db() as db:
            changed=db.execute("UPDATE runs SET status='CONFIRMING' WHERE id=? AND status='WAITING_CONFIRMATION'",(rid,)).rowcount
            if not changed:
                raise StoreError("确认已处理或当前状态不可确认，请刷新核实")
            self._event(db,rid,"state",{"status":"CONFIRMING","message":"正在提交已确认操作"})

    def begin_stop(self,rid):
        with self.db() as db:
            if not db.execute("UPDATE runs SET status='STOPPING' WHERE id=? AND status IN ('QUEUED','RUNNING','WAITING_CONFIRMATION')",(rid,)).rowcount:
                raise StoreError("执行状态已变化，请刷新核实")

    def history(self,sid,member,current_rid):
        messages=[]
        with self.db() as db:
            if not db.execute("SELECT 1 FROM sessions WHERE id=? AND member_id=?",(sid,member)).fetchone():
                raise StoreError("会话不存在或无权访问",404)
            runs = db.execute("SELECT * FROM runs WHERE session_id=? AND id!=? AND status IN ('COMPLETED','WAITING_CONFIRMATION') ORDER BY created DESC,rowid DESC LIMIT 10",(sid,current_rid)).fetchall()
        for run in reversed(runs):
            messages.append({"role":"user","content":run["input"]})
            for event in self.events(run["id"]):
                if event["kind"] == "assistant":
                    messages.append({"role":"assistant","content":event["data"]["text"][:3000]})
        return messages

    def task_context(self, sid, member):
        from .context import empty
        with self.db() as db:
            if not db.execute("SELECT 1 FROM sessions WHERE id=? AND member_id=?", (sid,member)).fetchone():
                raise StoreError("会话不存在或无权访问",404)
            row = db.execute("SELECT payload FROM task_context WHERE session_id=?", (sid,)).fetchone()
        return json.loads(row["payload"]) if row else empty()

    def finish_task(self, rid, member, task, status, message):
        # Context and terminal state commit together. Stopped/failed runs never promote their claims.
        with self.db() as db:
            row = db.execute("SELECT r.session_id FROM runs r JOIN sessions s ON s.id=r.session_id WHERE r.id=? AND s.member_id=? AND r.status='RUNNING'", (rid,member)).fetchone()
            if not row:
                raise StoreError("任务已停止或无权更新")
            db.execute("INSERT INTO task_context VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET payload=excluded.payload", (row["session_id"],json.dumps(task,ensure_ascii=False)))
            db.execute("UPDATE runs SET status=? WHERE id=?", (status,rid))
            self._event(db,rid,"state",{"status":status,"message":message})
