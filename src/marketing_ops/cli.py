"""A dependency-free, evidence-backed draft queue for marketing operations."""

from __future__ import annotations

import argparse
import csv
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import fcntl
import hashlib
import io
import ipaddress
import json
from pathlib import Path
import re
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
KINDS = {"content", "prospect", "reply"}
SOURCE_STATUSES = {"ok", "failed", "pending"}
MAX_FEED_BYTES = 4 * 1024 * 1024


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def timestamp(value: object, field: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO timestamp with timezone")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO timestamp with timezone") from exc
    if result.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")
    return result


def public_url(value: object, field: str = "url") -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a public HTTPS URL")
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or
            parsed.password or parsed.hostname in {"localhost", "localhost.localdomain"}):
        raise ValueError(f"{field} must be a public HTTPS URL without credentials")
    if parsed.hostname.endswith((".localhost", ".local", ".internal")):
        raise ValueError(f"{field} must not use a local hostname")
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError(f"{field} must not use a private, loopback or reserved address")
    return value


def canonical_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    # Preserve identity-bearing parameters; remove only common tracking fields.
    query = [(k, v) for k, v in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
    return urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(),
                                    parsed.path or "/", urllib.parse.urlencode(sorted(query)), ""))


def required_string(item: dict, key: str) -> str:
    value = item.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return value.strip()


def score_component(item: dict, key: str, maximum: int) -> int:
    value = item.get(key, 0)
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
        raise ValueError(f"{key} must be an integer between 0 and {maximum}")
    return value


def validate_item(item: object) -> dict:
    if not isinstance(item, dict):
        raise ValueError("each item must be an object")
    result = dict(item)
    kind = required_string(result, "kind")
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {sorted(KINDS)}")
    result["kind"] = kind
    for key in ("platform", "title", "text"):
        result[key] = required_string(result, key)
    result["url"] = public_url(result.get("url"))
    timestamp(result.get("observed_at"), "observed_at")
    if result.get("published_at"):
        timestamp(result["published_at"], "published_at")
    if result.get("signal_at"):
        timestamp(result["signal_at"], "signal_at")
    if result.get("contact_url"):
        public_url(result["contact_url"], "contact_url")
    if result.get("language", "zh") not in {"zh", "en"}:
        raise ValueError("language must be zh or en")
    evidence = result.get("evidence", [])
    if not isinstance(evidence, list) or (kind in {"prospect", "reply"} and not evidence):
        raise ValueError("prospect/reply requires at least one evidence object")
    for entry in evidence:
        if not isinstance(entry, dict):
            raise ValueError("evidence must contain objects")
        public_url(entry.get("url"), "evidence.url")
        required_string(entry, "claim")
        timestamp(entry.get("observed_at"), "evidence.observed_at")
    for key, maximum in (("fit", 35), ("signal", 30), ("contactability", 15)):
        result[key] = score_component(result, key, maximum)
    for key in ("entity_key", "segment", "offer_hypothesis", "incoming_text"):
        if key in result and not isinstance(result[key], str):
            raise ValueError(f"{key} must be a string")
    result["entity_key"] = result.get("entity_key") or canonical_url(result["url"])
    result["evidence"] = evidence
    return result


def validate_check(check: object) -> dict:
    if not isinstance(check, dict):
        raise ValueError("source_checks must contain objects")
    required_string(check, "source_id")
    public_url(check.get("url"))
    if check.get("status") not in SOURCE_STATUSES:
        raise ValueError("source check status must be ok, failed or pending")
    timestamp(check.get("checked_at"), "checked_at")
    if not isinstance(check.get("detail", ""), str):
        raise ValueError("source check detail must be a string")
    return check


def connect(data_dir: Path) -> sqlite3.Connection:
    data_dir.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(data_dir / "marketing.sqlite3", timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY, kind TEXT NOT NULL, platform TEXT NOT NULL,
            url TEXT NOT NULL, entity_key TEXT NOT NULL, content_hash TEXT NOT NULL,
            observed_at TEXT NOT NULL, payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS entity_idx ON items(entity_key);
        CREATE TABLE IF NOT EXISTS drafts (
            item_id TEXT PRIMARY KEY REFERENCES items(id), run_date TEXT NOT NULL,
            draft TEXT NOT NULL, score INTEGER, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS suppression (
            entity_key TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS source_checks (
            id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, url TEXT NOT NULL,
            status TEXT NOT NULL, checked_at TEXT NOT NULL, detail TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY, run_date TEXT NOT NULL, created_at TEXT NOT NULL,
            generated INTEGER NOT NULL, held INTEGER NOT NULL
        );
    """)
    return db


@contextmanager
def locked(data_dir: Path):
    data_dir.mkdir(parents=True, exist_ok=True)
    with (data_dir / "pipeline.lock").open("w") as lock_file:
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError("another marketing pipeline run is active") from exc
        try:
            yield
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)


def ingest(db: sqlite3.Connection, document: object) -> dict:
    if not isinstance(document, dict):
        raise ValueError("input must be an object with items and/or source_checks")
    items, checks = document.get("items", []), document.get("source_checks", [])
    if not isinstance(items, list) or not isinstance(checks, list):
        raise ValueError("items and source_checks must be arrays")
    # Validate the entire batch first; a bad record cannot leave a partial import.
    items = [validate_item(item) for item in items]
    checks = [validate_check(check) for check in checks]
    inserted, refreshed = 0, 0
    with db:
        for item in items:
            url = canonical_url(item["url"])
            content_hash = hashlib.sha256(item["text"].strip().encode()).hexdigest()
            identity = "\0".join((item["kind"], item["platform"].lower(), url, content_hash))
            item_id = hashlib.sha256(identity.encode()).hexdigest()[:24]
            suppressed = db.execute("SELECT 1 FROM suppression WHERE entity_key=?",
                                    (item["entity_key"],)).fetchone()
            cursor = db.execute(
                "INSERT OR IGNORE INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (item_id, item["kind"], item["platform"], url, item["entity_key"],
                 content_hash, item["observed_at"], json.dumps(item, ensure_ascii=False),
                 "suppressed" if suppressed else "new", now_iso()))
            inserted += cursor.rowcount
            if not cursor.rowcount:
                existing = db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
                previous = json.loads(existing["payload"])
                # A verified-again unchanged page is not a new item or buying
                # signal. Refresh only verification metadata and never reopen a
                # sent/suppressed record or overwrite a reviewed draft.
                existing_suppression = db.execute("SELECT 1 FROM suppression WHERE entity_key=?",
                                                  (existing["entity_key"],)).fetchone()
                if (existing["status"] not in {"sent", "suppressed"}
                        and not suppressed and not existing_suppression
                        and timestamp(item["observed_at"], "observed_at")
                        > timestamp(existing["observed_at"], "observed_at")):
                    merged_evidence = {}
                    for entry in previous.get("evidence", []) + item["evidence"]:
                        key = (canonical_url(entry["url"]), entry["claim"])
                        retained = merged_evidence.get(key)
                        if (retained is None or timestamp(entry["observed_at"], "evidence.observed_at")
                                > timestamp(retained["observed_at"], "evidence.observed_at")):
                            merged_evidence[key] = entry
                    previous["observed_at"] = item["observed_at"]
                    previous["evidence"] = list(merged_evidence.values())
                    db.execute("UPDATE items SET observed_at=?,payload=? WHERE id=?",
                               (item["observed_at"], json.dumps(previous, ensure_ascii=False), item_id))
                    refreshed += 1
        for check in checks:
            db.execute("INSERT INTO source_checks(source_id,url,status,checked_at,detail) VALUES(?,?,?,?,?)",
                       (check["source_id"], check["url"], check["status"], check["checked_at"],
                        check.get("detail", "")))
    return {"inserted": inserted, "duplicates": len(items) - inserted,
            "refreshed": refreshed, "source_checks": len(checks)}


def age_days(item: dict, run_date: date) -> int:
    # Use publication date for content. A fresh observation of an old article is not news.
    value = item.get("published_at") if item["kind"] == "content" else None
    observed = timestamp(value or item["observed_at"], "date").astimezone(NY).date()
    return (run_date - observed).days


def lead_score(item: dict, run_date: date) -> dict:
    age = age_days(item, run_date)
    # Verification date does not establish a fresh buying signal. Static public
    # pages get no recency credit unless a dated event is actually evidenced.
    signal_date = timestamp(item["signal_at"], "signal_at").astimezone(NY).date() if item.get("signal_at") else None
    signal_age = (run_date - signal_date).days if signal_date else None
    recency = (20 if 0 <= signal_age <= 7 else 12 if 7 < signal_age <= 30
               else 4 if 30 < signal_age <= 90 else 0) if signal_age is not None else 0
    parts = {key: item.get(key, 0) for key in ("fit", "signal", "contactability")}
    parts["recency"] = recency
    return {"total": sum(parts.values()), "components": parts, "age_days": age,
            "signal_age_days": signal_age,
            "signal_freshness": "unknown" if signal_age is None else "future" if signal_age < 0 else "dated"}


def draft_text(item: dict) -> str:
    fact = item["evidence"][0]["claim"] if item["evidence"] else item["text"]
    if item["kind"] == "content":
        return (f"【规则生成的选题草稿，待编辑核验】\n{item['title']}\n\n"
                f"已收集的摘要：{item['text']}\n\n建议结构：发生了什么 → 对目标读者的影响 → "
                "待核实问题 → 一个具体行动。\n"
                f"原始来源：{item['url']}\n"
                "尚未自动生成最终长文；法律适用、时效与跨平台改写需复核。")
    offer = item.get("offer_hypothesis")
    if item.get("language", "zh") == "en":
        if item["kind"] == "reply":
            return ("[Starter reply — review the full conversation before sending]\n"
                    "Thank you for getting back to us. Based on the point you raised, "
                    "could you share your main priority and preferred next step? "
                    "We can then check whether there is a useful fit.\n"
                    f"Reviewer context: {fact}\n"
                    "No price, timeline, legal conclusion or product capability has been promised.")
        return (f"Hi {item['title']} team — I saw this on your public site: {fact}\n\n"
                + (f"We would like to explore whether {offer} could be useful together. "
                   if offer else "We would like to explore whether there is a useful collaboration opportunity. ")
                + "Would a brief conversation with the person responsible for partnerships be useful?\n\n"
                "[Starter draft: collaboration is a hypothesis; verify capabilities and recipient before sending.]")
    if item["kind"] == "reply":
        return ("【回复起草提示，需结合完整对话修改】\n谢谢你的回复。方便说一下目前最优先解决的问题，"
                "以及希望的下一步吗？我们可以先核对是否适合合作。\n"
                f"供审核人参考的已提供证据：{fact}\n"
                "本稿未承诺报价、交付时间、产品能力或法律结论。")
    return (f"你好，{item['title']} 团队。我看到你们公开介绍中提到：{fact}\n\n"
            + (f"想探索一下能否围绕「{offer}」做一个小规模合作。" if offer
               else "想了解一下是否存在适合双方的小规模合作机会。")
            + "方便和负责合作的同事简短聊聊吗？\n\n"
            "【规则草稿：合作设想尚未确认，发送前核对对方、证据和实际可交付能力。】")


def daily(db: sqlite3.Connection, run_date: date) -> dict:
    generated, held = 0, 0
    rows = db.execute("SELECT * FROM items WHERE status='new' ORDER BY created_at,id").fetchall()
    with db:
        for row in rows:
            item = json.loads(row["payload"])
            if db.execute("SELECT 1 FROM suppression WHERE entity_key=?", (row["entity_key"],)).fetchone():
                db.execute("UPDATE items SET status='suppressed' WHERE id=?", (row["id"],))
                continue
            age = age_days(item, run_date)
            if age < 0 or age > (7 if item["kind"] == "content" else 90):
                held += 1
                continue
            # Do not restart a cold sequence when the same entity has already been contacted.
            sent = db.execute("SELECT 1 FROM items WHERE entity_key=? AND kind='prospect' AND status='sent'",
                              (row["entity_key"],)).fetchone()
            if item["kind"] == "prospect" and sent:
                held += 1
                continue
            # One active prospect draft per stable entity even if a second page was ingested.
            active = db.execute("SELECT 1 FROM items WHERE entity_key=? AND kind='prospect' AND status IN ('draft','reviewed')",
                                (row["entity_key"],)).fetchone()
            if item["kind"] == "prospect" and active:
                held += 1
                continue
            score = lead_score(item, run_date)["total"] if item["kind"] == "prospect" else None
            cursor = db.execute("INSERT OR IGNORE INTO drafts VALUES(?,?,?,?,?)",
                                (row["id"], run_date.isoformat(), draft_text(item), score, now_iso()))
            generated += cursor.rowcount
            db.execute("UPDATE items SET status='draft' WHERE id=?", (row["id"],))
        db.execute("INSERT INTO runs(run_date,created_at,generated,held) VALUES(?,?,?,?)",
                   (run_date.isoformat(), now_iso(), generated, held))
    return {"run_date": run_date.isoformat(), "generated": generated, "held": held}


def suppress(db: sqlite3.Connection, entity_key: str, reason: str) -> dict:
    with db:
        db.execute("INSERT OR REPLACE INTO suppression VALUES(?,?,?)", (entity_key, reason, now_iso()))
        changed = db.execute("UPDATE items SET status='suppressed' WHERE entity_key=?", (entity_key,)).rowcount
    return {"entity_key": entity_key, "suppressed_items": changed}


def mark(db: sqlite3.Connection, item_id: str, status: str) -> dict:
    row = db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
    if not row:
        raise ValueError("unknown item id")
    if row["status"] == "suppressed":
        raise ValueError("suppressed items cannot be marked reviewed or sent")
    if row["status"] == "new":
        raise ValueError("generate and review a draft before recording a disposition")
    if row["status"] == "sent" and status != "sent":
        raise ValueError("sent items cannot be reopened by mark")
    with db:
        db.execute("UPDATE items SET status=? WHERE id=?", (status, item_id))
    return {"item_id": item_id, "status": status,
            "note": "Local bookkeeping only. This command does not send or publish."}


def atomic_write(path: Path, text: str) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def report(db: sqlite3.Connection, data_dir: Path, run_date: date) -> dict:
    queues = {"content": [], "prospect": [], "reply": []}
    rows = db.execute("SELECT i.*,d.draft,d.score,d.run_date FROM items i JOIN drafts d ON d.item_id=i.id "
                      "WHERE i.status IN ('draft','reviewed') ORDER BY COALESCE(d.score,0) DESC,i.id").fetchall()
    for row in rows:
        item = json.loads(row["payload"])
        queues[row["kind"]].append({"id": row["id"], "status": row["status"], "draft_date": row["run_date"],
            "title": item["title"], "url": item["url"], "platform": item["platform"],
            "entity_key": row["entity_key"], "observed_at": item["observed_at"],
            "evidence": item["evidence"], "segment": item.get("segment"),
            "score": lead_score(item, run_date) if row["kind"] == "prospect" else None,
            "draft": row["draft"], "days_in_queue": (run_date - date.fromisoformat(row["run_date"])).days,
            "review_required": True})
    checks = [dict(row) for row in db.execute(
        "SELECT * FROM source_checks WHERE id IN (SELECT MAX(id) FROM source_checks GROUP BY source_id) ORDER BY id DESC")]
    latest = {}
    for check in checks:
        latest.setdefault(check["source_id"], check)
    counts = {row["status"]: row["n"] for row in db.execute("SELECT status,count(*) n FROM items GROUP BY status")}
    output = {"as_of": run_date.isoformat(), "timezone": "America/New_York", "mode": "draft_only",
              "queues": queues, "item_status_counts": counts, "source_coverage": list(latest.values()),
              "limitations": ["Rule-based starter drafts; no LLM or platform publishing is connected.",
                              "Lead scores are prioritization hypotheses, not proof of buying intent.",
                              "Failed/pending sources do not mean no new content."]}
    destination = data_dir / "reports" / run_date.isoformat()
    destination.mkdir(parents=True, exist_ok=True)
    atomic_write(destination / "review.json", json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    lines = [f"# Marketing review queue — {run_date}", "", "时区：America/New_York · 模式：仅草稿 · 未发送/发布", "",
             "所有草稿均需复核。评分代表排序假设，不代表已确认需求。", "", "## 来源覆盖", ""]
    for check in latest.values():
        lines.append(f"- {check['source_id']}: **{check['status']}** — {check['detail']}")
    if not latest:
        lines.append("尚无采集记录；不能据此宣称已覆盖任何平台。")
    for kind, items in queues.items():
        lines.extend(["", f"## {kind} ({len(items)})", ""])
        for item in items:
            lines.extend([f"### {item['title']}", "", f"ID: `{item['id']}` · 状态: {item['status']} · 草稿日期: {item['draft_date']}",
                          f"来源：{item['url']}", f"观察时间：{item['observed_at']}", ""])
            if item["score"]:
                lines.extend([f"评分：{item['score']['total']}/100；分项：{item['score']['components']}", ""])
            lines.extend([item["draft"], ""])
    atomic_write(destination / "review.md", "\n".join(lines) + "\n")
    table = io.StringIO(newline="")
    writer = csv.writer(table)
    writer.writerow(["kind", "id", "title", "url", "platform", "status", "score", "draft"])
    for kind, items in queues.items():
        for item in items:
            # Prevent spreadsheet formula execution when a public title starts with =,+,-,@.
            safe = lambda value: "'" + str(value) if str(value).startswith(("=", "+", "-", "@")) else value
            writer.writerow([safe(v) for v in [kind, item["id"], item["title"], item["url"], item["platform"],
                item["status"], item["score"]["total"] if item["score"] else "", item["draft"]]])
    atomic_write(destination / "review.csv", table.getvalue())
    return {"reports": str(destination), "queues": {key: len(value) for key, value in queues.items()},
            "source_failures": sum(check["status"] == "failed" for check in latest.values()),
            "sources_pending": sum(check["status"] == "pending" for check in latest.values())}


def plain_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", value)).strip()


def parse_feed(data: bytes, source: dict, observed_at: str) -> list[dict]:
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("feed XML declarations are not supported")
    root = ET.fromstring(data)
    atom = {"a": "http://www.w3.org/2005/Atom"}
    if root.tag == "rss" and root.find("channel") is not None:
        nodes = root.findall("./channel/item")
    elif root.tag == "{http://www.w3.org/2005/Atom}feed":
        nodes = root.findall("a:entry", atom)
    else:
        raise ValueError("response is not a supported RSS channel or Atom feed")
    items = []
    for node in nodes[:50]:
        title = node.findtext("title") or node.findtext("a:title", namespaces=atom) or ""
        url = node.findtext("link")
        if not url:
            link = next((x for x in node.findall("a:link", atom) if x.get("rel", "alternate") == "alternate"), None)
            url = link.get("href") if link is not None else None
        if not url or not title:
            continue
        description = (node.findtext("description") or node.findtext("a:summary", namespaces=atom)
                       or node.findtext("a:content", namespaces=atom) or title)
        published = (node.findtext("pubDate") or node.findtext("a:published", namespaces=atom)
                     or node.findtext("a:updated", namespaces=atom))
        item = {"kind": "content", "platform": source.get("platform", "rss"), "url": url,
                "title": plain_text(title), "text": plain_text(description)[:12000], "observed_at": observed_at,
                "evidence": [{"url": url, "claim": plain_text(title), "observed_at": observed_at}]}
        if published:
            try:
                dt = timestamp(published, "feed published_at")
            except ValueError:
                dt = parsedate_to_datetime(published)
                if dt.tzinfo is None:
                    raise ValueError("feed publication date lacks timezone")
            item["published_at"] = dt.isoformat()
        items.append(validate_item(item))
    return items


def fetch_feed(url: str) -> bytes:
    class PublicRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            public_url(newurl, "redirect URL")
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    request = urllib.request.Request(public_url(url), headers={"User-Agent": "MarketingOps/0.1 RSS reader"})
    opener = urllib.request.build_opener(PublicRedirect())
    with opener.open(request, timeout=20) as response:
        data = response.read(MAX_FEED_BYTES + 1)
    if len(data) > MAX_FEED_BYTES:
        raise ValueError("feed exceeds 4 MiB")
    return data


def collect(db: sqlite3.Connection, config: object) -> dict:
    if not isinstance(config, dict) or not isinstance(config.get("sources"), list):
        raise ValueError("source config must have a sources array")
    checks, items = [], []
    for source in config["sources"]:
        if not isinstance(source, dict):
            raise ValueError("source must be an object")
        source_id = required_string(source, "id")
        url = public_url(source.get("url"))
        checked_at = now_iso()
        check = {"source_id": source_id, "url": url, "checked_at": checked_at}
        if source.get("enabled") is not True:
            checks.append({**check, "status": "pending", "detail": source.get("note", "Source not enabled.")})
            continue
        if source.get("type") not in {"rss", "atom"}:
            checks.append({**check, "status": "pending", "detail": "Only RSS/Atom is implemented; source needs an authorized adapter."})
            continue
        try:
            source_items = parse_feed(fetch_feed(url), source, checked_at)
            items.extend(source_items)
            checks.append({**check, "status": "ok", "detail": f"Feed read; {len(source_items)} entries parsed. This is not full site coverage."})
        except (OSError, ValueError, ET.ParseError) as exc:
            checks.append({**check, "status": "failed", "detail": f"{type(exc).__name__}: {str(exc)[:300]}"})
    result = ingest(db, {"items": items, "source_checks": checks})
    result.update({"failed": sum(c["status"] == "failed" for c in checks),
                   "pending": sum(c["status"] == "pending" for c in checks)})
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path(".local"))
    sub = parser.add_subparsers(dest="command", required=True)
    load = sub.add_parser("ingest", help="Import validated evidence records")
    load.add_argument("--file", type=Path, required=True)
    fetch = sub.add_parser("collect", help="Collect enabled RSS/Atom sources")
    fetch.add_argument("--config", type=Path, default=Path("config/sources.json"))
    for command in ("daily", "report"):
        p = sub.add_parser(command)
        p.add_argument("--date", type=date.fromisoformat, default=datetime.now(NY).date())
    stop = sub.add_parser("suppress", help="Persist a do-not-contact entity")
    stop.add_argument("--entity-key", required=True)
    stop.add_argument("--reason", default="Do not contact")
    disposition = sub.add_parser("mark", help="Record a local disposition; does not send")
    disposition.add_argument("--item-id", required=True)
    disposition.add_argument("--status", choices=("reviewed", "sent"), required=True)
    args = parser.parse_args(argv)
    try:
        with locked(args.data_dir):
            db = connect(args.data_dir)
            try:
                if args.command == "ingest":
                    result = ingest(db, json.loads(args.file.read_text(encoding="utf-8")))
                elif args.command == "collect":
                    result = collect(db, json.loads(args.config.read_text(encoding="utf-8")))
                elif args.command == "daily":
                    result = daily(db, args.date)
                    result.update(report(db, args.data_dir, args.date))
                elif args.command == "report":
                    result = report(db, args.data_dir, args.date)
                elif args.command == "suppress":
                    result = suppress(db, args.entity_key, args.reason)
                else:
                    result = mark(db, args.item_id, args.status)
            finally:
                db.close()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, sqlite3.Error) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
