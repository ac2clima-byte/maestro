"""
RuleEngine — porting Python di src/rules/RuleEngine.ts.

Stessa semantica:
  - Conditions: AND su `conditions[]`, op support: equals, not_equals,
    contains, not_contains, in, not_in, matches (regex), gt/gte/lt/lte,
    is_true, is_false. case_insensitive default True.
  - Fields: sender, subject, category, sentiment, suggestedAction,
    hasAttachments, attachmentType (lista), score.
  - Rules ordinate per priority desc.
  - Idempotenza: skippa email con ruleId già in `appliedRules`.

Esegue azioni tramite ActionRunner iniettato. Per la pipeline IRIS, il
runner concreto scrive su Firestore (Lavagna `nexo_lavagna`, marca
`appliedRules` su `iris_emails`, opzionalmente flagga archived).

NB: i Colleghi destinatari (ares/charta/dikea/echo) potrebbero non
esistere ancora come servizi attivi. La Lavagna è bus async: i messaggi
restano in `pending` finché un consumer li picka. Coerente con il
design "lazy materialization".
"""
from __future__ import annotations

import re
from typing import Any, Callable, Iterable, Optional


# ─── Conditions ──────────────────────────────────────────────────

VALID_OPS = {
    "equals", "not_equals", "contains", "not_contains",
    "in", "not_in", "matches", "gt", "gte", "lt", "lte",
    "is_true", "is_false",
}

VALID_FIELDS = {
    "sender", "subject", "category", "sentiment",
    "suggestedAction", "hasAttachments", "attachmentType", "score",
}


def _field_value(email: dict, field: str) -> Any:
    raw = email.get("raw") or {}
    cls = email.get("classification") or {}
    if field == "sender":
        return raw.get("sender") or ""
    if field == "subject":
        return raw.get("subject") or ""
    if field == "category":
        return cls.get("category")
    if field == "sentiment":
        return cls.get("sentiment") or "neutro"
    if field == "suggestedAction":
        return cls.get("suggestedAction")
    if field == "hasAttachments":
        return bool(raw.get("has_attachments")) or bool(email.get("attachments"))
    if field == "attachmentType":
        return [(a.get("detectedType") or "") for a in (email.get("attachments") or [])]
    if field == "score":
        return email.get("score") or 0
    return None


def _norm(v: Any, ci: bool) -> str:
    s = "" if v is None else str(v)
    return s.lower() if ci else s


def match_one(email: dict, c: dict) -> bool:
    field = c.get("field")
    op = c.get("op")
    if field not in VALID_FIELDS or op not in VALID_OPS:
        return False
    val = c.get("value")
    ci = c.get("caseInsensitive", True)
    raw = _field_value(email, field)

    if op in ("equals", "not_equals"):
        target = _norm(val, ci)
        if isinstance(raw, list):
            hit = any(_norm(x, ci) == target for x in raw)
        else:
            hit = _norm(raw, ci) == target
        return hit if op == "equals" else not hit

    if op in ("contains", "not_contains"):
        target = _norm(val, ci)
        if isinstance(raw, list):
            hit = any(target in _norm(x, ci) for x in raw)
        else:
            hit = target in _norm(raw, ci)
        return hit if op == "contains" else not hit

    if op in ("in", "not_in"):
        seq = val if isinstance(val, (list, tuple)) else [val]
        seq_norm = [_norm(x, ci) for x in seq]
        if isinstance(raw, list):
            hit = any(_norm(x, ci) in seq_norm for x in raw)
        else:
            hit = _norm(raw, ci) in seq_norm
        return hit if op == "in" else not hit

    if op == "matches":
        try:
            re_obj = re.compile(str(val or ""), re.IGNORECASE if ci else 0)
        except re.error:
            return False
        if isinstance(raw, list):
            return any(bool(re_obj.search(str(x or ""))) for x in raw)
        return bool(re_obj.search(str(raw or "")))

    if op in ("gt", "gte", "lt", "lte"):
        try:
            a, b = float(raw), float(val)
        except (TypeError, ValueError):
            return False
        return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]

    if op == "is_true":
        return bool(raw) is True
    if op == "is_false":
        return bool(raw) is False

    return False


def match_all_conditions(email: dict, conditions: Iterable[dict]) -> bool:
    cs = list(conditions or [])
    if not cs:
        return False
    return all(match_one(email, c) for c in cs)


# ─── Data extraction (extract_data action, evaluated inline) ────

def extract_data_from_email(email: dict, actions: list[dict]) -> dict:
    out: dict[str, str] = {}
    raw = email.get("raw") or {}
    haystacks = [
        raw.get("subject") or "",
        raw.get("body_text") or "",
    ]
    for a in (email.get("attachments") or []):
        if a.get("extractedText"):
            haystacks.append(a["extractedText"])
    for action in actions:
        if action.get("type") != "extract_data":
            continue
        for key, pat in (action.get("extractPatterns") or {}).items():
            try:
                regex = re.compile(pat, re.IGNORECASE)
            except re.error:
                continue
            for h in haystacks:
                m = regex.search(h)
                if m:
                    out[key] = m.group(1) if m.groups() else m.group(0)
                    break
    return out


# ─── Engine ─────────────────────────────────────────────────────

class RuleEngine:
    """
    runner: oggetto con metodi:
      - write_lavagna(to, message_type, payload, priority, source_email_id) -> str (id)
      - notify_echo(channel, text, source_email_id) -> str (id)
      - archive_email(email_id) -> None
      - tag_email(email_id, tags) -> None
      - set_priority(email_id, priority) -> None
      - mark_rule_applied(email_id, rule_id) -> None
    """

    def __init__(self, runner: Any, rules_loader: Optional[Callable[[], list[dict]]] = None):
        self.runner = runner
        self.rules_loader = rules_loader
        self.rules: list[dict] = []

    def load_rules(self) -> list[dict]:
        all_rules = self.rules_loader() if self.rules_loader else []
        self.rules = sorted(
            [r for r in all_rules if r.get("enabled")],
            key=lambda r: int(r.get("priority", 0)),
            reverse=True,
        )
        return self.rules

    def set_rules(self, rules: list[dict]) -> None:
        self.rules = sorted(
            [dict(r) for r in rules if r.get("enabled")],
            key=lambda r: int(r.get("priority", 0)),
            reverse=True,
        )

    def evaluate(self, email: dict) -> dict:
        first = None
        extras: list[dict] = []
        extracted: dict = {}
        for rule in self.rules:
            if not match_all_conditions(email, rule.get("conditions") or []):
                continue
            if first is None:
                first = rule
                extracted = extract_data_from_email(email, rule.get("actions") or [])
                if rule.get("stopOnMatch", True):
                    break
            else:
                extras.append(rule)
        return {
            "matchedRule": first,
            "actions": (first or {}).get("actions") or [],
            "additionalMatches": extras,
            "extractedData": extracted or None,
        }

    def execute(self, email: dict, rule: dict, extracted: Optional[dict] = None) -> dict:
        results = []
        rule_id = rule.get("id") or "?"
        if rule_id in (email.get("appliedRules") or []):
            return {
                "emailId": email.get("id"),
                "ruleId": rule_id,
                "results": [{"action": {"type": "tag_email"}, "ok": True, "detail": "already-applied"}],
                "ok": True,
            }

        for action in rule.get("actions") or []:
            try:
                detail = self._run_action(email, action, rule, extracted)
                results.append({"action": action, "ok": True, "detail": detail})
            except Exception as e:
                results.append({"action": action, "ok": False, "error": str(e)})

        try:
            self.runner.mark_rule_applied(email.get("id"), rule_id)
        except Exception as e:
            results.append({"action": {"type": "tag_email"}, "ok": False,
                            "error": f"mark applied failed: {e}"})

        return {
            "emailId": email.get("id"),
            "ruleId": rule_id,
            "results": results,
            "ok": all(r["ok"] for r in results),
        }

    def _run_action(self, email: dict, action: dict, rule: dict, extracted: Optional[dict]) -> str:
        atype = action.get("type")
        if atype == "write_lavagna":
            to = action.get("to")
            if not to:
                raise ValueError("write_lavagna requires 'to'")
            payload = {
                **(action.get("payload") or {}),
                **(extracted or {}),
                "emailId": email.get("id"),
                "subject": (email.get("raw") or {}).get("subject"),
                "sender": (email.get("raw") or {}).get("sender"),
                "ruleId": rule.get("id"),
                "ruleName": rule.get("name"),
            }
            mid = self.runner.write_lavagna(
                to=to,
                message_type=action.get("messageType") or "iris_event",
                payload=payload,
                priority=action.get("priority") or "normal",
                source_email_id=email.get("id"),
            )
            return f"lavagna:{mid} → {to}"
        if atype == "notify_echo":
            text = action.get("text") or _default_notify_text(email, rule)
            mid = self.runner.notify_echo(
                channel=action.get("channel") or "wa",
                text=text,
                source_email_id=email.get("id"),
            )
            return f"echo:{action.get('channel') or 'wa'}:{mid}"
        if atype == "archive_email":
            self.runner.archive_email(email.get("id"))
            return "archived"
        if atype == "tag_email":
            tags = action.get("tags") or []
            self.runner.tag_email(email.get("id"), tags)
            return f"tagged:{','.join(tags)}"
        if atype == "set_priority":
            prio = action.get("priority") or "normal"
            self.runner.set_priority(email.get("id"), prio)
            return f"priority:{prio}"
        if atype == "extract_data":
            return "extracted (in-evaluate)"
        raise ValueError(f"Unsupported action type: {atype}")


def _default_notify_text(email: dict, rule: dict) -> str:
    raw = email.get("raw") or {}
    return f"[IRIS · {rule.get('name')}] {raw.get('subject') or '(senza oggetto)'} — {raw.get('sender')}"
