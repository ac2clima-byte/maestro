import type { Email } from "../types/email.js";
import type { EmailClassification, SentimentLevel } from "../types/classification.js";

export interface EmailWithClassification {
  email: Email;
  classification?: EmailClassification | null;
}

export interface ThreadCluster {
  id: string;
  normalizedSubject: string;
  emailIds: string[];
  participants: string[];
  messageCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  sentiment_evolution: SentimentLevel[];
}

const REPLY_PREFIX_RE =
  /^(\s*(?:re|r|fw|fwd|i|inoltra|inoltro|tr|rif|aw|antw|sv|vs)\s*[:：]\s*)+/i;

const TAG_PREFIX_RE = /^(\s*\[[^\]]{1,40}\]\s*)+/;

const WHITESPACE_RE = /\s+/g;

export function normalizeSubject(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw);
  // Strip "[EXT] [SPAM]" style tags first.
  s = s.replace(TAG_PREFIX_RE, "");
  // Strip "Re: R: Fw: Fwd: I: Inoltra: Tr: Rif: AW: Antw: SV: VS:" repeatedly.
  let prev: string;
  do {
    prev = s;
    s = s.replace(REPLY_PREFIX_RE, "");
  } while (s !== prev);
  s = s.replace(WHITESPACE_RE, " ").trim().toLowerCase();
  return s;
}

function normalizeAddress(addr: string | null | undefined): string {
  return (addr || "").trim().toLowerCase();
}

function participantsKey(participants: string[]): string {
  return [...participants].map(normalizeAddress).filter(Boolean).sort().join("|");
}

export function clusterKey(
  normalizedSubject: string,
  participants: string[],
): string {
  return `${normalizedSubject}::${participantsKey(participants)}`;
}

function safeId(input: string): string {
  // Firestore doc id: alphanumerics + ._- only, max 1500 bytes. Cap to 150.
  const safe = input.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
  return safe.slice(0, 150) || "thread";
}

export function threadIdFor(
  normalizedSubject: string,
  participants: string[],
): string {
  // Stable hash-free id (fits Firestore doc id constraints, deterministic).
  const raw = `${normalizedSubject}__${participantsKey(participants)}`;
  return safeId(raw) || "thread_unknown";
}

interface ParsedEmail {
  id: string;
  normalizedSubject: string;
  participants: string[];
  receivedAt: string | null;
  inReplyTo: string;
  references: string[];
  sentiment: SentimentLevel | null;
}

function parse(item: EmailWithClassification): ParsedEmail {
  const e = item.email;
  const participants: string[] = [];
  if (e.sender) participants.push(normalizeAddress(e.sender));
  if (e.to_recipients) {
    for (const r of e.to_recipients) {
      const n = normalizeAddress(r);
      if (n) participants.push(n);
    }
  }
  return {
    id: e.message_id,
    normalizedSubject: normalizeSubject(e.subject),
    participants: Array.from(new Set(participants)),
    receivedAt: e.received_time ?? null,
    inReplyTo: normalizeAddress(e.in_reply_to ?? ""),
    references: (e.references ?? []).map(normalizeAddress).filter(Boolean),
    sentiment: item.classification?.sentiment ?? null,
  };
}

export class ThreadDetector {
  /**
   * Group emails into conversation threads.
   *
   * Strategy:
   *   1. Header-based: if `inReplyTo` or any `references` matches another email's
   *      message_id, those emails join the same cluster (union-find).
   *   2. Subject + participants: emails sharing a normalized subject AND an
   *      overlapping participant pair (sender ↔ recipient bidirectional) join
   *      the same cluster.
   *
   * Sender/recipient is bidirectional: A→B and B→A end up in the same cluster
   * because the participant set is symmetric.
   */
  detect(items: EmailWithClassification[]): ThreadCluster[] {
    if (!items.length) return [];

    const parsed = items.map(parse);

    // --- union-find ---
    const parent = new Map<number, number>();
    for (let i = 0; i < parsed.length; i++) parent.set(i, i);
    const find = (i: number): number => {
      let cur = i;
      while (parent.get(cur)! !== cur) cur = parent.get(cur)!;
      let p = i;
      while (parent.get(p)! !== cur) {
        const next = parent.get(p)!;
        parent.set(p, cur);
        p = next;
      }
      return cur;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    // --- 1. Header-based linking ---
    const idToIdx = new Map<string, number>();
    for (let i = 0; i < parsed.length; i++) {
      const id = normalizeAddress(parsed[i].id);
      if (id) idToIdx.set(id, i);
    }
    for (let i = 0; i < parsed.length; i++) {
      const refs = [parsed[i].inReplyTo, ...parsed[i].references].filter(Boolean);
      for (const r of refs) {
        const j = idToIdx.get(r);
        if (j !== undefined && j !== i) union(i, j);
      }
    }

    // --- 2. Subject + participants linking ---
    // Bucket by normalized subject, then within each bucket merge any pair
    // that shares ≥ 1 participant.
    const bySubject = new Map<string, number[]>();
    for (let i = 0; i < parsed.length; i++) {
      const k = parsed[i].normalizedSubject;
      if (!k) continue;
      if (!bySubject.has(k)) bySubject.set(k, []);
      bySubject.get(k)!.push(i);
    }
    for (const indices of bySubject.values()) {
      if (indices.length < 2) continue;
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) {
          const pa = new Set(parsed[indices[a]].participants);
          const pb = parsed[indices[b]].participants;
          if (pb.some((x) => pa.has(x))) union(indices[a], indices[b]);
        }
      }
    }

    // --- 3. Build clusters ---
    const groups = new Map<number, number[]>();
    for (let i = 0; i < parsed.length; i++) {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(i);
    }

    const out: ThreadCluster[] = [];
    for (const indices of groups.values()) {
      // Sort emails chronologically (oldest first).
      indices.sort((a, b) => {
        const ta = parsed[a].receivedAt ?? "";
        const tb = parsed[b].receivedAt ?? "";
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });
      const participants = Array.from(
        new Set(indices.flatMap((i) => parsed[i].participants).filter(Boolean)),
      ).sort();
      const subjectCandidate =
        parsed[indices.find((i) => parsed[i].normalizedSubject) ?? indices[0]]
          .normalizedSubject || "";
      const id = threadIdFor(subjectCandidate, participants);
      const sentimentEvolution = indices
        .map((i) => parsed[i].sentiment)
        .filter((s): s is SentimentLevel => Boolean(s));
      const firstAt = parsed[indices[0]].receivedAt;
      const lastAt = parsed[indices[indices.length - 1]].receivedAt;
      out.push({
        id,
        normalizedSubject: subjectCandidate,
        emailIds: indices.map((i) => parsed[i].id),
        participants,
        messageCount: indices.length,
        firstMessageAt: firstAt,
        lastMessageAt: lastAt,
        sentiment_evolution: sentimentEvolution,
      });
    }

    // Sort threads by most recent activity desc.
    out.sort((a, b) => {
      const ta = a.lastMessageAt ?? "";
      const tb = b.lastMessageAt ?? "";
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    return out;
  }
}
