/**
 * MEMO — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "memo"` e `status == "pending"`.
 * Tipi gestiti:
 *   · richiesta_dossier      → dossierCliente → risponde con status:"completed"
 *                               e payload.dossier
 *   · nuovo_cliente_rilevato → matchAnagrafica. Se score basso, emette
 *                               `alert_nuovo_cliente` verso ECHO.
 *
 * Il listener usa onSnapshot con filtro a due livelli per consumare solo
 * i messaggi destinati a MEMO. Ogni messaggio viene marcato `picked_up`
 * al primo snapshot, poi `completed` / `failed` alla fine del lavoro.
 */
import type { DocumentReference } from "firebase-admin/firestore";

import { COLLECTIONS, db } from "../index.js";
import {
  dossierCliente,
  matchAnagrafica,
} from "../actions/index.js";

export const MEMO_INBOUND_TYPES = [
  "richiesta_dossier",
  "nuovo_cliente_rilevato",
] as const;

export type MemoInboundType = (typeof MEMO_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "memo";
  type: MemoInboundType | string;
  payload: Record<string, unknown>;
  priority: "low" | "normal" | "high" | "critical";
  sourceEmailId?: string;
  parentMessageId?: string;
}

/** Avvia il listener. Ritorna un unsubscribe idempotente. */
export function startLavagnaListener(opts: { verbose?: boolean } = {}): () => void {
  const log = opts.verbose ? console.log : () => {};

  const unsub = db()
    .collection(COLLECTIONS.lavagna)
    .where("to", "==", "memo")
    .where("status", "==", "pending")
    .onSnapshot(
      async (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== "added") continue;
          const ref = change.doc.ref as DocumentReference;
          const data = change.doc.data() as Record<string, unknown>;
          const incoming: LavagnaIncoming = {
            id: change.doc.id,
            from: String(data.from ?? "?"),
            to: "memo",
            type: String(data.type ?? ""),
            payload: (data.payload as Record<string, unknown>) ?? {},
            priority: (data.priority as LavagnaIncoming["priority"]) ?? "normal",
            sourceEmailId: data.sourceEmailId as string | undefined,
            parentMessageId: data.parentMessageId as string | undefined,
          };
          log(`[memo.listener] picked ${incoming.id} type=${incoming.type}`);

          // Atomic pick-up: provo a passare da pending → picked_up.
          // Se un altro worker è più veloce, skippo.
          try {
            await db().runTransaction(async (tx) => {
              const cur = await tx.get(ref);
              if (!cur.exists) throw new Error("vanished");
              if (cur.data()!.status !== "pending") throw new Error("already_taken");
              tx.update(ref, { status: "picked_up", pickedUpAt: new Date().toISOString() });
            });
          } catch {
            continue;
          }

          try {
            const ok = await dispatch(incoming);
            if (ok === false) {
              await ref.update({
                status: "failed",
                failedAt: new Date().toISOString(),
                failureReason: "handler_returned_false",
              });
            }
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            await ref.update({
              status: "failed",
              failedAt: new Date().toISOString(),
              failureReason: reason.slice(0, 500),
            });
          }
        }
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("[memo.listener] snapshot error:", err);
      },
    );

  return () => {
    try {
      unsub();
    } catch {
      /* noop */
    }
  };
}

/**
 * Dispatch singolo messaggio. Ritorna true se gestito, false altrimenti.
 * In caso di gestione, marca il messaggio come completed con il risultato.
 */
export async function dispatch(msg: LavagnaIncoming): Promise<boolean> {
  const ref = db().collection(COLLECTIONS.lavagna).doc(msg.id);

  if (msg.type === "richiesta_dossier") {
    const clienteRef = String(
      (msg.payload.clienteId as string) ||
        (msg.payload.nome as string) ||
        (msg.payload.ref as string) ||
        "",
    ).trim();
    if (!clienteRef) {
      await ref.update({
        status: "failed",
        failedAt: new Date().toISOString(),
        failureReason: "payload.clienteId mancante",
      });
      return false;
    }
    const dossier = await dossierCliente(clienteRef);
    await ref.update({
      status: "completed",
      completedAt: new Date().toISOString(),
      result: { dossier },
    });
    return true;
  }

  if (msg.type === "nuovo_cliente_rilevato") {
    const nome = String((msg.payload.nome as string) || "").trim();
    if (!nome) {
      await ref.update({
        status: "failed",
        failedAt: new Date().toISOString(),
        failureReason: "payload.nome mancante",
      });
      return false;
    }
    const match = await matchAnagrafica({ nome });
    const needsCreation = match.candidati.length === 0 || match.candidati[0].score < 0.7;
    await ref.update({
      status: "completed",
      completedAt: new Date().toISOString(),
      result: {
        match,
        needsCreation,
      },
    });
    return true;
  }

  // Tipo sconosciuto: non gestito, torna false (il listener lo marca failed).
  return false;
}
