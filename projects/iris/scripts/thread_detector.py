"""
ThreadDetector — pure-Python port of src/threads/ThreadDetector.ts.

Groups emails into conversation threads using:
  1. Header-based linking (in_reply_to / references → message_id).
  2. Subject + participants linking (normalized subject + ≥1 shared participant).

Sender↔recipient is bidirectional because the participant set is symmetric.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional


REPLY_PREFIX_RE = re.compile(
    r"^(\s*(?:re|r|fw|fwd|i|inoltra|inoltro|tr|rif|aw|antw|sv|vs)\s*[:：]\s*)+",
    re.IGNORECASE,
)
TAG_PREFIX_RE = re.compile(r"^(\s*\[[^\]]{1,40}\]\s*)+")
WS_RE = re.compile(r"\s+")


def normalize_subject(raw: Optional[str]) -> str:
    if not raw:
        return ""
    s = str(raw)
    s = TAG_PREFIX_RE.sub("", s)
    while True:
        new = REPLY_PREFIX_RE.sub("", s)
        if new == s:
            break
        s = new
    return WS_RE.sub(" ", s).strip().lower()


def _norm_addr(addr: Optional[str]) -> str:
    return (addr or "").strip().lower()


def _participants_key(participants: Iterable[str]) -> str:
    return "|".join(sorted({_norm_addr(p) for p in participants if _norm_addr(p)}))


def _safe_id(raw: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", raw).strip("_")
    return safe[:150] or "thread"


def thread_id_for(normalized_subject: str, participants: Iterable[str]) -> str:
    raw = f"{normalized_subject}__{_participants_key(participants)}"
    return _safe_id(raw) or "thread_unknown"


def _parse(item: dict) -> dict:
    """item = {"email": <emailDict>, "classification": <classDict|None>}"""
    e = item.get("email") or item
    cls = item.get("classification") or {}
    participants = []
    sender = _norm_addr(e.get("sender"))
    if sender:
        participants.append(sender)
    for r in e.get("to_recipients") or []:
        n = _norm_addr(r)
        if n:
            participants.append(n)
    return {
        "id": e.get("message_id") or "",
        "normalized_subject": normalize_subject(e.get("subject")),
        "participants": list(dict.fromkeys(participants)),
        "received_at": e.get("received_time"),
        "in_reply_to": _norm_addr(e.get("in_reply_to") or ""),
        "references": [_norm_addr(r) for r in (e.get("references") or []) if _norm_addr(r)],
        "sentiment": (cls or {}).get("sentiment"),
    }


class ThreadDetector:
    def detect(self, items: list[dict]) -> list[dict]:
        if not items:
            return []

        parsed = [_parse(it) for it in items]
        n = len(parsed)

        # union-find
        parent = list(range(n))

        def find(i: int) -> int:
            cur = i
            while parent[cur] != cur:
                cur = parent[cur]
            # path compression
            p = i
            while parent[p] != cur:
                nxt = parent[p]
                parent[p] = cur
                p = nxt
            return cur

        def union(a: int, b: int) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        # 1. header-based
        id_to_idx = {}
        for i in range(n):
            mid = _norm_addr(parsed[i]["id"])
            if mid:
                id_to_idx[mid] = i
        for i in range(n):
            refs = [parsed[i]["in_reply_to"], *parsed[i]["references"]]
            for r in refs:
                if not r:
                    continue
                j = id_to_idx.get(r)
                if j is not None and j != i:
                    union(i, j)

        # 2. subject + participants (within subject buckets)
        by_subject: dict[str, list[int]] = {}
        for i in range(n):
            k = parsed[i]["normalized_subject"]
            if not k:
                continue
            by_subject.setdefault(k, []).append(i)
        for indices in by_subject.values():
            if len(indices) < 2:
                continue
            for a in range(len(indices)):
                pa = set(parsed[indices[a]]["participants"])
                for b in range(a + 1, len(indices)):
                    pb = parsed[indices[b]]["participants"]
                    if any(x in pa for x in pb):
                        union(indices[a], indices[b])

        # 3. build clusters
        groups: dict[int, list[int]] = {}
        for i in range(n):
            r = find(i)
            groups.setdefault(r, []).append(i)

        out = []
        for indices in groups.values():
            indices.sort(key=lambda i: parsed[i]["received_at"] or "")
            participants = sorted({
                p for i in indices for p in parsed[i]["participants"] if p
            })
            subj_idx = next(
                (i for i in indices if parsed[i]["normalized_subject"]),
                indices[0],
            )
            normalized_subject = parsed[subj_idx]["normalized_subject"] or ""
            tid = thread_id_for(normalized_subject, participants)
            sentiment_evolution = [
                parsed[i]["sentiment"] for i in indices if parsed[i]["sentiment"]
            ]
            out.append({
                "id": tid,
                "normalizedSubject": normalized_subject,
                "emailIds": [parsed[i]["id"] for i in indices],
                "participants": participants,
                "messageCount": len(indices),
                "firstMessageAt": parsed[indices[0]]["received_at"],
                "lastMessageAt": parsed[indices[-1]]["received_at"],
                "sentiment_evolution": sentiment_evolution,
            })

        out.sort(key=lambda t: t["lastMessageAt"] or "", reverse=True)
        return out
