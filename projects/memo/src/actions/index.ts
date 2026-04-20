/**
 * MEMO — azioni v0.1.
 *
 * Implementato:
 *   · dossierCliente(clienteId | nome)     — aggregatore CRM + impianti + interventi
 *   · dossierCondominio(condominioId)      — alias: clientiTipo=condominio
 *   · storicoImpianto(targa)               — impianto + interventi
 *   · matchAnagrafica(input)               — fuzzy search su crm_clienti + impianti
 *   · cercaPerContesto(testo)              — ricerca testuale su iris_emails
 *                                            + dossier cached
 *   · ultimiContatti(clienteId, n)         — timeline cross-fonte
 *
 * Stub (not implemented — v0.2):
 *   · cercaDocumenti, nuovoCliente, collegaEntita, consumiMedi,
 *     rischioChurn.
 */
import type {
  ConsumiMediResult,
  DocumentoDisco,
  DossierCliente,
  ImpiantoSnapshot,
  MatchAnagraficaResult,
  NuovoClienteInput,
  Relazione,
  RicercaDocumentiQuery,
  RischioChurnResult,
  RisultatoRicercaDocumenti,
  StoricoImpianto,
  TimelineEntry,
  TipoCliente,
} from "../types/index.js";
import {
  COLLECTIONS,
  COSMINA_COLLECTIONS,
  DOSSIER_CACHE_TTL_MS,
  cosminaDb,
  db,
} from "../index.js";

// ─── Helpers ────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function snapshotToImpianto(
  id: string,
  data: Record<string, unknown>,
): ImpiantoSnapshot {
  return {
    targa: String(data.targa ?? id),
    indirizzo: data.indirizzo as string | undefined,
    comune: data.comune as string | undefined,
    tipo: data.tipo as string | undefined,
    marca: data.marca as string | undefined,
    modello: data.modello as string | undefined,
    ultimaManutenzione: normalizeDate(data.ultima_manutenzione),
    prossimaScadenza: normalizeDate(data.prossima_scadenza),
    responsabile: data.responsabile as string | undefined,
  };
}

function normalizeDate(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  // Firestore Timestamp shim
  if (typeof v === "object" && v !== null) {
    const t = v as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof t.toDate === "function") return t.toDate().toISOString();
    const secs = t._seconds ?? t.seconds;
    if (typeof secs === "number") return new Date(secs * 1000).toISOString();
  }
  return undefined;
}

/** Normalizza stringa per confronti: lowercase + remove accenti + spazi singoli. */
function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distanza di Levenshtein normalizzata 0-1 (1 = uguale, 0 = completamente diverso). */
function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  // Levenshtein semplice
  const m = x.length,
    n = y.length;
  const d: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const dist = d[m][n];
  return 1 - dist / Math.max(m, n);
}

// ─── Dossier ────────────────────────────────────────────────────

/**
 * Aggrega il dossier completo di un cliente.
 *
 * `ref` può essere:
 *   - un doc id di `crm_clienti`
 *   - un nome cliente (risolto via matchAnagrafica prima)
 */
export async function dossierCliente(
  ref: string,
  opts: { force?: boolean; maxInterventi?: number } = {},
): Promise<DossierCliente> {
  const maxInterventi = opts.maxInterventi ?? 10;
  const cacheKey = `dossier_${ref.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150)}`;

  // 1. Cache check
  if (!opts.force) {
    const cached = await db().collection(COLLECTIONS.dossier).doc(cacheKey).get();
    if (cached.exists) {
      const cd = cached.data() as DossierCliente & { _cachedAt?: string };
      if (cd._cachedAt) {
        const age = Date.now() - Date.parse(cd._cachedAt);
        if (age < DOSSIER_CACHE_TTL_MS) return cd;
      }
    }
  }

  const cdb = cosminaDb();

  // 2. Risolvi clienteId (doc esatto o fuzzy)
  let clienteDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  const byIdSnap = await cdb.collection(COSMINA_COLLECTIONS.clienti).doc(ref).get();
  if (byIdSnap.exists) {
    clienteDoc = byIdSnap;
  } else {
    // Fuzzy: cerca per nome
    const match = await matchAnagrafica({ nome: ref }, { maxCandidati: 1 });
    if (match.candidati.length > 0) {
      const best = match.candidati[0];
      const byName = await cdb
        .collection(COSMINA_COLLECTIONS.clienti)
        .doc(best.clienteId)
        .get();
      if (byName.exists) clienteDoc = byName;
    }
  }
  if (!clienteDoc) {
    throw new Error(`MEMO: cliente "${ref}" non trovato in crm_clienti`);
  }

  const cd = (clienteDoc.data() ?? {}) as Record<string, unknown>;
  const clienteId = clienteDoc.id;
  const nome =
    (cd.nome as string) ||
    (cd.ragione_sociale as string) ||
    (cd.denominazione as string) ||
    clienteId;
  const tipo = (cd.tipo as TipoCliente) || "privato";

  // 3. Impianti — due strategie: cliente_id diretto o match per condominio
  const impiantiSnap = await cdb
    .collection(COSMINA_COLLECTIONS.impianti)
    .where("cliente_id", "==", clienteId)
    .limit(50)
    .get();
  const impianti: ImpiantoSnapshot[] = [];
  impiantiSnap.forEach((d) => impianti.push(snapshotToImpianto(d.id, d.data() ?? {})));

  // Se nessun impianto trovato per cliente_id, fallback: match per `condominio` nome
  if (impianti.length === 0 && tipo === "condominio") {
    const byCondo = await cdb
      .collection(COSMINA_COLLECTIONS.impianti)
      .where("condominio", "==", nome)
      .limit(50)
      .get();
    byCondo.forEach((d) => impianti.push(snapshotToImpianto(d.id, d.data() ?? {})));
  }

  // 4. Interventi — per ognuno degli impianti trovati prendo gli ultimi N
  const interventiTimeline: TimelineEntry[] = [];
  const impiantiIds = impiantiSnap.docs.map((d) => d.id);
  if (impiantiIds.length > 0) {
    // Firestore `in` supporta max 10 valori — spezzo in chunk
    const chunks: string[][] = [];
    for (let i = 0; i < impiantiIds.length; i += 10)
      chunks.push(impiantiIds.slice(i, i + 10));
    for (const chunk of chunks) {
      const intSnap = await cdb
        .collection(COSMINA_COLLECTIONS.interventi)
        .where("impianto_id", "in", chunk)
        .limit(maxInterventi)
        .get();
      intSnap.forEach((d) => {
        const data = (d.data() ?? {}) as Record<string, unknown>;
        const at =
          normalizeDate(data.data_pianificata) ||
          normalizeDate(data.created_at) ||
          nowIso();
        interventiTimeline.push({
          at,
          tipo: "intervento",
          titolo: `${data.tipo_intervento || "Intervento"} — ${data.stato || "?"}`,
          ref: { collezione: COSMINA_COLLECTIONS.interventi, id: d.id },
          meta: {
            tecnico: data.tecnico,
            impiantoId: data.impianto_id,
            note: data.note,
          },
        });
      });
    }
    interventiTimeline.sort((a, b) => (b.at < a.at ? -1 : 1));
    interventiTimeline.splice(maxInterventi);
  }

  // 5. Email IRIS correlate (anche se su progetto NEXO, utili per ultimi contatti)
  const emailTimeline: TimelineEntry[] = [];
  try {
    const emailsSnap = await db()
      .collection("iris_emails")
      .orderBy("raw.received_time", "desc")
      .limit(200)
      .get();
    const q = norm(nome);
    emailsSnap.forEach((d) => {
      const dd = (d.data() ?? {}) as Record<string, unknown>;
      const raw = (dd.raw ?? {}) as Record<string, unknown>;
      const cls = (dd.classification ?? {}) as Record<string, unknown>;
      const ent = (cls.entities ?? {}) as Record<string, unknown>;
      const hay = norm(
        [raw.subject, raw.sender_name, cls.summary, ent.cliente, ent.condominio, ent.indirizzo]
          .filter(Boolean)
          .join(" "),
      );
      if (hay && hay.includes(q)) {
        emailTimeline.push({
          at: String(raw.received_time ?? "") || nowIso(),
          tipo: "email_in",
          titolo: `${raw.sender_name ?? raw.sender ?? "?"} — ${raw.subject ?? ""}`,
          ref: { collezione: "iris_emails", id: d.id },
          meta: { category: cls.category, sentiment: cls.sentiment },
        });
      }
    });
    emailTimeline.splice(20);
  } catch (e) {
    // non-fatal: se iris_emails non è leggibile, vado avanti senza email
  }

  // 6. Compose dossier
  const dossier: DossierCliente = {
    clienteId,
    tipo,
    nome,
    contatti: {
      email: cd.email ? [String(cd.email)] : undefined,
      telefono: cd.telefono ? [String(cd.telefono)] : undefined,
      pec: (cd.pec as string) || undefined,
      indirizzi: cd.indirizzo ? [String(cd.indirizzo)] : undefined,
    },
    fiscale: {
      piva: (cd.piva as string) || undefined,
      cf: (cd.cf as string) || undefined,
    },
    amministratore: cd.amministratore_id
      ? {
          nome: cd.amministratore as string | undefined,
          email: cd.amministratore_email as string | undefined,
        }
      : undefined,
    impianti,
    timeline: [...emailTimeline, ...interventiTimeline]
      .sort((a, b) => (b.at < a.at ? -1 : 1))
      .slice(0, 20),
    generatoIl: nowIso(),
    fonti: [
      `cosmina:crm_clienti/${clienteId}`,
      `cosmina:cosmina_impianti (${impianti.length})`,
      `cosmina:cosmina_interventi_pianificati (${interventiTimeline.length})`,
      `nexo:iris_emails (${emailTimeline.length})`,
    ],
  };

  // 7. Cache write (fire-and-forget, non blocca il ritorno)
  db()
    .collection(COLLECTIONS.dossier)
    .doc(cacheKey)
    .set({ ...dossier, _cachedAt: nowIso() })
    .catch(() => {
      /* silent */
    });

  return dossier;
}

export async function dossierCondominio(
  condominioId: string,
  opts: { force?: boolean } = {},
): Promise<DossierCliente> {
  // Stessa logica di dossierCliente — crm_clienti contiene condomini con
  // tipo="condominio". Il doc id può essere il nome del condominio.
  return dossierCliente(condominioId, opts);
}

// ─── Storico impianto ──────────────────────────────────────────

export async function storicoImpianto(
  targa: string,
  opts: { limit?: number } = {},
): Promise<StoricoImpianto> {
  const limit = opts.limit ?? 50;
  const cdb = cosminaDb();

  // 1. Impianto — cerca per targa (può essere doc id o campo targa)
  let impiantoDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  const direct = await cdb.collection(COSMINA_COLLECTIONS.impianti).doc(targa).get();
  if (direct.exists) {
    impiantoDoc = direct;
  } else {
    const byTarga = await cdb
      .collection(COSMINA_COLLECTIONS.impianti)
      .where("targa", "==", targa)
      .limit(1)
      .get();
    if (!byTarga.empty) impiantoDoc = byTarga.docs[0];
  }
  if (!impiantoDoc) {
    throw new Error(`MEMO: impianto "${targa}" non trovato`);
  }

  const impianto = snapshotToImpianto(impiantoDoc.id, impiantoDoc.data() ?? {});

  // 2. Interventi collegati
  const intSnap = await cdb
    .collection(COSMINA_COLLECTIONS.interventi)
    .where("impianto_id", "==", impiantoDoc.id)
    .limit(limit)
    .get();
  const eventi: StoricoImpianto["eventi"] = [];
  intSnap.forEach((d) => {
    const data = (d.data() ?? {}) as Record<string, unknown>;
    const at =
      normalizeDate(data.data_pianificata) ||
      normalizeDate(data.created_at) ||
      nowIso();
    const tipoRaw = String(data.tipo_intervento ?? "manutenzione").toLowerCase();
    const tipo = (["manutenzione", "riparazione", "installazione", "sostituzione", "anomalia"].includes(tipoRaw)
      ? tipoRaw
      : "manutenzione") as StoricoImpianto["eventi"][number]["tipo"];
    eventi.push({
      at,
      tipo,
      descrizione: String(data.note ?? `Intervento ${data.stato ?? ""}`),
      tecnico: data.tecnico as string | undefined,
    });
  });
  eventi.sort((a, b) => (b.at < a.at ? -1 : 1));

  return { targa: impianto.targa, impianto, eventi };
}

// ─── Match anagrafica ──────────────────────────────────────────

export interface MatchAnagraficaInput {
  nome?: string;
  email?: string;
  piva?: string;
  cf?: string;
  telefono?: string;
  indirizzo?: string;
}

export async function matchAnagrafica(
  input: MatchAnagraficaInput,
  opts: { soglia?: number; maxCandidati?: number } = {},
): Promise<MatchAnagraficaResult> {
  const soglia = opts.soglia ?? 0.55;
  const maxCandidati = opts.maxCandidati ?? 8;
  const cdb = cosminaDb();

  const query = (input.nome || input.email || input.piva || "").trim();
  if (!query) {
    return { query: "", candidati: [] };
  }

  // Fetch clienti (limit prudenziale)
  const snap = await cdb.collection(COSMINA_COLLECTIONS.clienti).limit(500).get();
  const qNorm = norm(query);
  const candidati: MatchAnagraficaResult["candidati"] = [];

  snap.forEach((d) => {
    const data = (d.data() ?? {}) as Record<string, unknown>;
    const nomeDoc =
      (data.nome as string) ||
      (data.ragione_sociale as string) ||
      (data.denominazione as string) ||
      d.id;
    const scoreNome = similarity(qNorm, nomeDoc);

    const scoreEmail = input.email
      ? similarity(String(input.email), String(data.email ?? ""))
      : 0;
    const scorePiva = input.piva
      ? similarity(String(input.piva), String(data.piva ?? ""))
      : 0;

    const score = Math.max(scoreNome, scoreEmail, scorePiva);
    if (score >= soglia) {
      candidati.push({
        clienteId: d.id,
        nome: nomeDoc,
        score,
        match: score > 0.95 ? "exact" : "fuzzy",
        fonte: "cosmina",
      });
    }
  });

  candidati.sort((a, b) => b.score - a.score);
  return { query, candidati: candidati.slice(0, maxCandidati) };
}

// ─── Ultimi contatti ───────────────────────────────────────────

export async function ultimiContatti(
  clienteId: string,
  n = 20,
): Promise<TimelineEntry[]> {
  const dossier = await dossierCliente(clienteId).catch(() => null);
  if (!dossier) return [];
  return dossier.timeline.slice(0, n);
}

// ─── Ricerca documenti (v0.2 — stub con placeholder) ───────────

export async function cercaDocumenti(
  _query: RicercaDocumentiQuery,
): Promise<RisultatoRicercaDocumenti> {
  // v0.2: walker filesystem + indicizzazione
  return { query: String(_query.testo || ""), totale: 0, risultati: [], durataMs: 0 };
}

// ─── Ricerca contestuale ───────────────────────────────────────

export async function cercaPerContesto(
  testo: string,
  opts: { limit?: number } = {},
): Promise<
  Array<{
    tipo: "cliente" | "impianto" | "documento";
    id: string;
    score: number;
    titolo: string;
  }>
> {
  const q = norm(testo);
  if (!q) return [];
  const limit = opts.limit ?? 10;
  const out: Array<{
    tipo: "cliente" | "impianto" | "documento";
    id: string;
    score: number;
    titolo: string;
  }> = [];

  // Search su iris_emails (stesso progetto, sicuro)
  try {
    const emails = await db()
      .collection("iris_emails")
      .orderBy("raw.received_time", "desc")
      .limit(200)
      .get();
    emails.forEach((d) => {
      const data = (d.data() ?? {}) as Record<string, unknown>;
      const raw = (data.raw ?? {}) as Record<string, unknown>;
      const cls = (data.classification ?? {}) as Record<string, unknown>;
      const ent = (cls.entities ?? {}) as Record<string, unknown>;
      const hay = norm(
        [raw.subject, raw.sender_name, cls.summary, ent.cliente, ent.condominio]
          .filter(Boolean)
          .join(" "),
      );
      if (hay.includes(q)) {
        out.push({
          tipo: "documento",
          id: d.id,
          score: 0.7,
          titolo: `📧 ${raw.sender_name ?? "?"} — ${raw.subject ?? ""}`,
        });
      }
    });
  } catch {
    /* iris_emails non accessibile, skip */
  }

  return out.slice(0, limit);
}

// ─── Stub v0.2 ─────────────────────────────────────────────────

export async function nuovoCliente(
  _input: NuovoClienteInput,
  _opts: { skipMatchCheck?: boolean } = {},
): Promise<{ clienteId: string; created: boolean }> {
  throw new Error("Not implemented: nuovoCliente (v0.2 — MEMO v0.1 è read-only)");
}

export async function collegaEntita(
  _da: Relazione["da"],
  _a: Relazione["a"],
  _tipo: Relazione["tipo"],
  _opts: { confidence?: number } = {},
): Promise<Relazione> {
  throw new Error("Not implemented: collegaEntita (v0.2)");
}

export async function consumiMedi(
  _condominioId: string,
  _opts: { anni?: number } = {},
): Promise<ConsumiMediResult> {
  throw new Error("Not implemented: consumiMedi (v0.2 — richiede integrazione READER)");
}

export async function rischioChurn(_clienteId: string): Promise<RischioChurnResult> {
  throw new Error("Not implemented: rischioChurn (v0.2)");
}

// Force references for type-only imports (altrimenti tsc li scarta in emit)
void ({} as DocumentoDisco);
