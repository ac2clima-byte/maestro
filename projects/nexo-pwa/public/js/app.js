
// ── Colleghi config ────────────────────────────────────────────
const COLLEGHI = [
  { id: "iris",     name: "IRIS",     icon: "📧", domain: "Email in entrata",            status: "live",  desc: "Classifica, raggruppa, segnala. Hub email dell'azienda.", actions: ["Classificazione email con Haiku","Thread + follow-up + sentiment","Sender profiles + casi simili","RuleEngine con 4 regole attive","Dev Requests in-app + STT vocale"] },
  { id: "echo",     name: "ECHO",     icon: "📢", domain: "Comunicazioni in uscita",      status: "live",  desc: "Invio WhatsApp via Waha + Telegram + email. Storico su echo_messages. v0.1.", actions: ["sendWhatsApp(to, testo) — via Waha","sendTelegram (v0.2)","sendEmail (v0.2)","sendPush (v0.2)"] },
  { id: "ares",     name: "ARES",     icon: "🔧", domain: "Operativo / Interventi",      status: "live",  desc: "Apertura interventi (DRY-RUN default) e lettura interventi aperti da COSMINA bacheca_cards. v0.1.", actions: ["interventiAperti(filtri) — lettura reale","apriIntervento(input) — DRY-RUN di default","assegnaTecnico (v0.2)","chiudiIntervento + generaRTI (v0.2)","notificaTecnico via push (v0.2)"] },
  { id: "chronos",  name: "CHRONOS",  icon: "📅", domain: "Pianificatore / Calendario",  status: "live",  desc: "Slot tecnici, agende giornaliere e scadenze manutenzione da COSMINA. v0.1.", actions: ["slotDisponibili(criteri) — lettura reale da bacheca_cards","agendaGiornaliera(tecnico, data) — lettura reale","scadenzeProssime(finestra) — lettura reale cosmina_impianti","pianificaCampagna (v0.2)","prenotaSlot (v0.2 — scrittura DRY-RUN)"] },
  { id: "memo",     name: "MEMO",     icon: "🧠", domain: "Memoria / Storico cliente",   status: "live",  desc: "Dossier unico per cliente / condominio / impianto. v0.1: NEXUS risponde alle query 'dimmi tutto su X' con mini-dossier da iris_emails.", actions: ["dossierCliente(clienteId)","storicoImpianto(targa)","matchAnagrafica per dedup","ultimiContatti(clienteId, N)","cercaPerContesto(testo libero)"] },
  { id: "charta",   name: "CHARTA",   icon: "💰", domain: "Amministrativo / Fatturazione", status: "live", desc: "Parsing incassi da email + report mensile da iris_emails. v0.1.", actions: ["estraiIncassiDaEmail(body) — regex importi + causali","reportMensile(yyyymm) — aggregazione iris_emails","scadenzeFatture (v0.2 — richiede Fatture-in-Cloud)","generaSollecito (v0.2 via CALLIOPE)","parseFatturaFornitore (v0.2)"] },
  { id: "emporion", name: "EMPORION", icon: "📦", domain: "Magazzino / Ricambi",         status: "live",  desc: "Disponibilità articoli + articoli sotto scorta da COSMINA. v0.1.", actions: ["disponibilita(codice|descrizione) — lettura reale magazzino + giacenze","articoliSottoScorta() — lettura reale con soglia scorta_minima","dovSiTrova (v0.2)","ordinaFornitore (v0.2)","ocrDDT (v0.2)"] },
  { id: "dikea",    name: "DIKEA",    icon: "⚖️", domain: "Compliance / Normative",      status: "live",  desc: "Scadenze CURIT/REE + impianti senza targa da COSMINA. v0.1.", actions: ["scadenzeCURIT(finestra) — lettura reale cosmina_impianti(_cit)","impiantiSenzaTarga — lettura reale","validaDiCo (v0.2)","generaDiCo (v0.2)","rispostaPEC (v0.2)"] },
  { id: "delphi",   name: "DELPHI",   icon: "📊", domain: "Analisi / BI",                status: "live",  desc: "KPI aggregati + costo AI da iris_emails/lavagna/COSMINA. v0.1.", actions: ["kpiDashboard(scope) — aggregazione multi-sorgente","costoAI(finestra) — lettura cosmina_config/ai_usage o stima","marginePerIntervento (v0.2 — serve CHARTA)","topCondomini (v0.2)","anomalie (v0.2)"] },
  { id: "pharo",    name: "PHARO",    icon: "👁️", domain: "Monitoring / Alert",          status: "live",  desc: "Health check Firestore + problemi aperti. v0.1.", actions: ["statoSuite() — punteggio 0-100 da Firestore + Lavagna + email","emailSenzaRisposta() — query followup.needsAttention","controlloHeartbeat (v0.2)","budgetAnthropic (v0.2)","impiantiOrfani (v0.2)"] },
  { id: "calliope", name: "CALLIOPE", icon: "✍️", domain: "Content / Comunicazione uscita", status: "soon", desc: "Bozze risposte via Claude Sonnet, DRY-RUN default. Solo da NEXUS Chat. v0.1.", actions: ["bozzaRisposta(emailId, tono) — Claude Sonnet 4.6, salva in calliope_bozze","comunicazioneCondominio (v0.2)","preventivoFormale (v0.2)","sollecitoPagamento (v0.2)","trascriviRiunione (v0.2)"] },
];
const BY_ID = new Map(COLLEGHI.map(c => [c.id, c]));

// ── Firebase config ────────────────────────────────────────────
// Primary app (Firestore reads NEXO): progetto nexo-hub-15f2d
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBqm4XYaSlq2yUFdpcsL0wtSOpn48cOHoo",
  authDomain: "nexo-hub-15f2d.firebaseapp.com",
  projectId: "nexo-hub-15f2d",
  storageBucket: "nexo-hub-15f2d.firebasestorage.app",
  messagingSenderId: "272099489624",
  appId: "1:272099489624:web:10d17611b19031757d172d",
};
// Auth app: progetto garbymobile-f89ac (SSO unificato ACG Suite)
const ACG_AUTH_CONFIG = {
  apiKey: "AIzaSyDUoIbTYwnVAfX-ka9NiTpa08k7isNmD_k",
  authDomain: "garbymobile-f89ac.firebaseapp.com",
  projectId: "garbymobile-f89ac",
  storageBucket: "garbymobile-f89ac.firebasestorage.app",
  messagingSenderId: "447585714",
  appId: "1:447585714:web:cosmina",
};
const ACG_LANDING_URL = "https://acgsuite.web.app/";
const MOCK_MODE = true;

let _firestoreCache = null;
async function getFirestore() {
  if (_firestoreCache) return _firestoreCache;
  const appMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
  const fsMod  = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  const db  = fsMod.getFirestore(app);
  _firestoreCache = { db, fsMod };
  return _firestoreCache;
}

// ── Auth ACG (garbymobile-f89ac) ───────────────────────────────
let _authCache = null;
async function getAcgAuth() {
  if (_authCache) return _authCache;
  const appMod  = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
  const authMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
  // Named app per non collidere col primary (nexo-hub)
  let app;
  try {
    app = appMod.getApp("acg-auth");
  } catch {
    app = appMod.initializeApp(ACG_AUTH_CONFIG, "acg-auth");
  }
  const auth = authMod.getAuth(app);
  _authCache = { app, auth, authMod };
  return _authCache;
}

let CURRENT_USER = null;

async function getAuthIdToken() {
  const { auth } = await getAcgAuth();
  const u = auth.currentUser;
  if (!u) return null;
  try { return await u.getIdToken(); } catch { return null; }
}

// ── DOM helpers ────────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function fmtRel(iso) {
  if (!iso) return "—";
  try {
    const d = iso.toDate ? iso.toDate() : new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1)   return "ora";
    if (min < 60)  return `${min}m fa`;
    if (min < 60*24) return `${Math.floor(min/60)}h fa`;
    return `${Math.floor(min/(60*24))}g fa`;
  } catch { return "—"; }
}

// ── Sidebar nav ────────────────────────────────────────────────
function renderSidebarNav() {
  const navEl = $("#collegiNav");
  navEl.innerHTML = COLLEGHI.map(c => `
    <button type="button" class="sidebar-link" data-route="collega:${c.id}" aria-label="${escapeHtml(c.name)}">
      <span class="icon">${c.icon}</span>
      <span class="name">${escapeHtml(c.name)}</span>
      <span class="status-dot ${c.status === "live" ? "live" : c.status === "soon" ? "soon" : ""}" title="${c.status === "live" ? "Attivo v0.1" : c.status === "soon" ? "Solo via NEXUS Chat" : "In costruzione"}"></span>
    </button>
  `).join("");

  // Event delegation sulla sidebar: cattura click anche se l'evento nasce
  // da uno <span> figlio (icon/name/status-dot). Robusto a future modifiche.
  const sidebarEl = $("#sidebar");
  if (sidebarEl && !sidebarEl._navWired) {
    sidebarEl._navWired = true;
    sidebarEl.addEventListener("click", (ev) => {
      const link = ev.target.closest(".sidebar-link");
      if (!link || !sidebarEl.contains(link)) return;
      const route = link.dataset.route;
      if (!route) return;
      ev.preventDefault();
      ev.stopPropagation();
      navigate(route);
    });

    // Tastiera: frecce su/giù per spostare focus, Enter per aprire
    sidebarEl.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "Home" && ev.key !== "End") return;
      const links = Array.from(sidebarEl.querySelectorAll(".sidebar-link"));
      if (!links.length) return;
      const current = document.activeElement;
      let idx = links.indexOf(current);
      if (idx < 0) idx = 0;
      let next;
      if (ev.key === "ArrowDown") next = Math.min(idx + 1, links.length - 1);
      else if (ev.key === "ArrowUp") next = Math.max(idx - 1, 0);
      else if (ev.key === "Home") next = 0;
      else next = links.length - 1;
      ev.preventDefault();
      links[next].focus();
    });
  }
}

// ── Router ─────────────────────────────────────────────────────
let CURRENT_ROUTE = "home";

function setActiveLink(route) {
  $$(".sidebar-link").forEach(b => b.classList.toggle("active", b.dataset.route === route));
}

function navigate(route, opts = { push: true }) {
  CURRENT_ROUTE = route;
  if (opts.push) history.replaceState(null, "", "#" + route);
  setActiveLink(route);
  if (window.innerWidth <= 760) $("#sidebar").classList.add("collapsed");

  if (route === "home") {
    setFullBleed(false);
    setTopbarTitle("Home");
    renderHome();
    return;
  }
  if (route.startsWith("collega:")) {
    const id = route.slice("collega:".length);
    const c = BY_ID.get(id);
    if (!c) { renderHome(); return; }
    setTopbarTitle(c.name);
    if (id === "iris") {
      // Iframe IRIS
      setFullBleed(true);
      const frame = $("#irisFrame");
      if (!frame.src.endsWith("/iris/") && !frame.src.includes("/iris/index.html")) {
        frame.src = "/iris/";
      }
      return;
    }
    setFullBleed(false);
    if (id === "pharo") {
      renderPharoPage(c);
      return;
    }
    if (id === "ares") {
      renderAresPage(c);
      return;
    }
    if (id === "chronos") {
      renderChronosPage(c);
      return;
    }
    renderCollegaWip(c);
    return;
  }
  // unknown
  navigate("home", { push: true });
}

function setFullBleed(on) {
  $("#content").classList.toggle("fullbleed", !!on);
}
function setTopbarTitle(t) {
  const el = $("#topbarTitle");
  if (el) el.textContent = t;
}

window.addEventListener("hashchange", () => {
  const r = location.hash.replace(/^#/, "") || "home";
  navigate(r, { push: false });
});

// ── Home page ──────────────────────────────────────────────────
function renderHome() {
  const page = $("#page");
  page.innerHTML = `
    <div class="page-head">
      <div class="page-title">Buongiorno, Alberto</div>
      <div class="page-sub">Il pannello di NEXO. Cosa è successo nelle ultime ore.</div>
    </div>
    <div class="dash-grid">
      <div class="widget" id="wDigest">
        <div class="widget-head">
          <div class="widget-title">📋 Digest email (IRIS)</div>
          <div class="widget-icon"><span class="spinner"></span></div>
        </div>
        <div class="widget-body" id="digestBody"><div class="widget-empty">Caricamento…</div></div>
      </div>

      <div class="widget" id="wLavagna">
        <div class="widget-head">
          <div class="widget-title">🗒️ Lavagna · ultimi 10 messaggi</div>
          <div class="widget-icon"><span class="spinner"></span></div>
        </div>
        <div class="widget-body" id="lavBody"><div class="widget-empty">Caricamento…</div></div>
      </div>

      <div class="widget" id="wAlerts">
        <div class="widget-head">
          <div class="widget-title">👁️ Alert (PHARO)</div>
          <div class="widget-icon"><span class="spinner"></span></div>
        </div>
        <div class="widget-body" id="alertsBody"><div class="widget-empty">Caricamento…</div></div>
      </div>

      <div class="widget" id="wInterventi">
        <div class="widget-head">
          <div class="widget-title">🔧 Interventi aperti (ARES)</div>
          <div class="widget-icon">—</div>
        </div>
        <div class="widget-body">
          <div class="placeholder-block">
            ARES non è ancora attivo. Quando sarà materializzato vedrai qui
            gli interventi del giorno con tecnico assegnato e priorità.
          </div>
        </div>
      </div>
    </div>
  `;
  loadDigestWidget();
  loadLavagnaWidget();
  loadAlertsWidget();
}

let _digestShowArchived = false;

async function loadDigestWidget() {
  const body = $("#digestBody");
  const head = $("#wDigest .widget-icon");
  try {
    const { db, fsMod } = await getFirestore();
    const q = fsMod.query(
      fsMod.collection(db, "iris_emails"),
      fsMod.orderBy("raw.received_time", "desc"),
      fsMod.limit(80),
    );
    const snap = await fsMod.getDocs(q);
    const emails = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      const raw = d.raw || {}, cls = d.classification || {}, fu = d.followup || {};
      emails.push({
        id: doc.id,
        subject: raw.subject || "(senza oggetto)",
        sender: raw.sender_name || raw.sender || "—",
        senderEmail: raw.sender || "",
        category: cls.category || "ALTRO",
        sentiment: cls.sentiment || "neutro",
        score: typeof d.score === "number" ? d.score : 0,
        received: raw.received_time || "",
        needsAttention: !!fu.needsAttention,
        archived: d.status === "archived",
        cartella: d.cartella || null,
      });
    });
    head.textContent = "📧";
    if (!emails.length) { body.innerHTML = `<div class="widget-empty">Nessuna email indicizzata.</div>`; return; }

    const visibleEmails = emails.filter(e => _digestShowArchived || !e.archived);
    const today = visibleEmails.filter(e => isToday(e.received)).length;
    const urgent = visibleEmails.filter(e => e.category === "GUASTO_URGENTE" || e.category === "PEC_UFFICIALE").length;
    const attn = visibleEmails.filter(e => e.needsAttention).length;
    const archivedCount = emails.filter(e => e.archived).length;

    const top = [...visibleEmails]
      .map(e => ({ e, s: scoreOf(e) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);

    body.innerHTML = `
      <div class="digest-summary">
        Oggi <span class="num">${today}</span> ricevute ·
        <span class="num urgent">${urgent}</span> urgenti ·
        <span class="num attn">${attn}</span> senza risposta &gt;48h
        ${archivedCount ? `· <label class="digest-toggle"><input type="checkbox" id="digestToggleArchived" ${_digestShowArchived ? "checked" : ""}> mostra ${archivedCount} archiviate</label>` : ""}
      </div>
      ${top.map((x, i) => {
        const e = x.e;
        const archivedBadge = e.archived ? `<span class="digest-badge-archived" title="Archiviata in ${escapeHtml(e.cartella || "?")}">📁 ${escapeHtml(e.cartella || "archiviata")}</span>` : "";
        return `
          <div class="digest-row-wrap ${e.archived ? "" : "swipeable"}" data-email-id="${escapeHtml(e.id)}">
            <div class="digest-row-action-bg" aria-hidden="true">
              <span class="icon">📁</span><span>Archivia</span>
            </div>
            <div class="digest-top-row ${e.archived ? "is-archived" : ""}" data-email-id="${escapeHtml(e.id)}">
              <div class="digest-top-rank">#${i+1}</div>
              <div class="digest-top-text">
                <div class="digest-top-sender">${escapeHtml(e.sender)} ${archivedBadge}</div>
                <div class="digest-top-summary">${escapeHtml(e.subject)}</div>
              </div>
              ${!e.archived ? `<button class="digest-archive-btn" data-email-id="${escapeHtml(e.id)}" title="Archivia in cartella mittente">📁</button>` : ""}
            </div>
          </div>
        `;
      }).join("")}
      <div class="stat-row">
        <div class="stat"><strong>${visibleEmails.length}</strong><span>visibili</span></div>
        <div class="stat urgent"><strong>${urgent}</strong><span>urgenti</span></div>
        <div class="stat attn"><strong>${attn}</strong><span>in attesa</span></div>
      </div>
    `;

    // Wire archive buttons
    $$(".digest-archive-btn", body).forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.emailId;
        if (!id) return;
        await archiveEmailFromDigest(id, btn);
      });
    });
    // Wire swipe-to-archive
    $$(".digest-row-wrap.swipeable", body).forEach(wrap => attachSwipeToArchive(wrap));
    // Wire toggle archiviate
    const toggle = $("#digestToggleArchived", body);
    if (toggle) toggle.addEventListener("change", () => {
      _digestShowArchived = toggle.checked;
      loadDigestWidget();
    });
  } catch (err) {
    head.textContent = "⚠️";
    body.innerHTML = `<div class="widget-error">Errore: ${escapeHtml(err.message || err)}</div>`;
  }
}

const IRIS_ARCHIVE_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/irisArchiveEmail";
const IRIS_DELETE_URL  = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/irisDeleteEmail";

// Wrapper riusabili (Promise<{ok, ...}>) usati da swipe/digest e
// (in futuro) da componenti PWA. La pagina /iris/index.html ha le sue
// versioni inline perché esegue in iframe con auth separato.
async function archiveEmail(emailId) {
  const token = await getAuthIdToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(IRIS_ARCHIVE_URL, {
    method: "POST", headers, body: JSON.stringify({ emailId }),
  });
  if (!resp.ok) throw new Error(`${resp.status}: ${(await resp.text()).slice(0, 150)}`);
  return resp.json();
}

async function deleteEmail(emailId) {
  const token = await getAuthIdToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(IRIS_DELETE_URL, {
    method: "POST", headers, body: JSON.stringify({ emailId }),
  });
  if (!resp.ok) throw new Error(`${resp.status}: ${(await resp.text()).slice(0, 150)}`);
  return resp.json();
}

// ── Swipe-to-archive (touch + mouse) ──────────────────────────
const SWIPE_THRESHOLD = 100; // px per triggerare l'azione
const SWIPE_MAX = 280;       // max translateX

function attachSwipeToArchive(wrap) {
  if (wrap._swipeWired) return;
  wrap._swipeWired = true;
  const row = wrap.querySelector(".digest-top-row");
  if (!row) return;

  let startX = 0, startY = 0, currentX = 0, tracking = false, decided = false, isSwipe = false;

  const onStart = (clientX, clientY) => {
    startX = clientX; startY = clientY; currentX = 0;
    tracking = true; decided = false; isSwipe = false;
    wrap.classList.add("swiping");
  };
  const onMove = (clientX, clientY, ev) => {
    if (!tracking) return;
    const dx = clientX - startX;
    const dy = clientY - startY;
    if (!decided) {
      // Decidi direzione dopo 8px di movimento
      if (Math.abs(dx) + Math.abs(dy) < 8) return;
      decided = true;
      isSwipe = Math.abs(dx) > Math.abs(dy);
      if (!isSwipe) { tracking = false; wrap.classList.remove("swiping"); return; }
    }
    if (!isSwipe) return;
    // Solo swipe a destra (dx positivo)
    currentX = Math.max(0, Math.min(SWIPE_MAX, dx));
    row.style.transform = `translateX(${currentX}px)`;
    if (currentX > SWIPE_THRESHOLD) wrap.classList.add("swipe-active");
    else wrap.classList.remove("swipe-active");
    // Blocca scroll verticale durante swipe horizontal confermato
    if (ev.cancelable && isSwipe) ev.preventDefault();
  };
  const onEnd = async () => {
    if (!tracking) return;
    tracking = false;
    wrap.classList.remove("swiping");
    const triggered = currentX > SWIPE_THRESHOLD;
    if (triggered) {
      // Slide fino in fondo + archivia
      row.style.transform = `translateX(${SWIPE_MAX}px)`;
      wrap.classList.add("removing");
      // Trigger collapse
      requestAnimationFrame(() => wrap.classList.add("gone"));
      const emailId = wrap.dataset.emailId;
      try {
        await archiveEmailFromSwipe(emailId);
      } catch (e) {
        console.warn("[swipe] archive failed:", e);
        // Ripristina visivamente
        wrap.classList.remove("removing", "gone", "swipe-active");
        row.style.transform = "";
      }
    } else {
      // Snap back
      row.style.transform = "";
      wrap.classList.remove("swipe-active");
    }
    currentX = 0;
  };

  // Touch events
  row.addEventListener("touchstart", (ev) => {
    const t = ev.touches[0]; if (!t) return;
    onStart(t.clientX, t.clientY);
  }, { passive: true });
  row.addEventListener("touchmove", (ev) => {
    const t = ev.touches[0]; if (!t) return;
    onMove(t.clientX, t.clientY, ev);
  }, { passive: false });
  row.addEventListener("touchend", onEnd, { passive: true });
  row.addEventListener("touchcancel", onEnd, { passive: true });

  // Mouse events (desktop)
  row.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    onStart(ev.clientX, ev.clientY);
    const mm = (e) => onMove(e.clientX, e.clientY, e);
    const mu = () => {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
      onEnd();
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  });
}

async function archiveEmailFromSwipe(emailId) {
  if (!emailId) return;
  const token = await getAuthIdToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(IRIS_ARCHIVE_URL, {
    method: "POST", headers,
    body: JSON.stringify({ emailId }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`${resp.status}: ${errText.slice(0, 150)}`);
  }
  const data = await resp.json();
  const toast = document.createElement("div");
  toast.className = "nexo-toast";
  toast.textContent = `Archiviata in "${data.folder}" ✓`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
  // Refresh digest dopo l'animazione
  setTimeout(() => loadDigestWidget(), 400);
}

async function archiveEmailFromDigest(emailId, btn) {
  if (!emailId) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "…";
  try {
    const token = await getAuthIdToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const resp = await fetch(IRIS_ARCHIVE_URL, {
      method: "POST", headers,
      body: JSON.stringify({ emailId }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`${resp.status}: ${errText.slice(0, 150)}`);
    }
    const data = await resp.json();
    btn.textContent = "✓";
    // Toast minimale
    const toast = document.createElement("div");
    toast.className = "nexo-toast";
    toast.textContent = `Archiviata in cartella "${data.folder}" ✅`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
    // Refresh widget
    setTimeout(() => loadDigestWidget(), 400);
  } catch (e) {
    console.error("[archive] failed:", e);
    btn.textContent = original;
    btn.disabled = false;
    alert(`Archiviazione fallita: ${e.message || e}`);
  }
}

function isToday(iso) {
  if (!iso) return false;
  try {
    const d = new Date(iso); if (Number.isNaN(d.getTime())) return false;
    const n = new Date();
    return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
  } catch { return false; }
}
function scoreOf(e) {
  let s = e.score || 0;
  if (e.category === "GUASTO_URGENTE") s += 50;
  else if (e.category === "PEC_UFFICIALE") s += 30;
  if (e.needsAttention) s += 10;
  return s;
}

async function loadLavagnaWidget() {
  const body = $("#lavBody");
  const head = $("#wLavagna .widget-icon");
  try {
    const { db, fsMod } = await getFirestore();
    const q = fsMod.query(
      fsMod.collection(db, "nexo_lavagna"),
      fsMod.orderBy("createdAt", "desc"),
      fsMod.limit(10),
    );
    const snap = await fsMod.getDocs(q);
    const rows = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      rows.push({
        id: doc.id,
        from: d.from || "?",
        to: d.to || "?",
        type: d.type || "msg",
        status: d.status || "pending",
        priority: d.priority || "normal",
        createdAt: d.createdAt || null,
      });
    });
    head.textContent = "🗒️";
    if (!rows.length) {
      body.innerHTML = `<div class="widget-empty">Lavagna vuota — nessun Collega ha ancora pubblicato.</div>`;
      return;
    }
    body.innerHTML = rows.map(r => `
      <div class="lav-row">
        <div class="lav-arrow"><strong>${escapeHtml(r.from)}</strong> → <strong>${escapeHtml(r.to)}</strong></div>
        <div class="lav-type">
          ${escapeHtml(r.type)}
          <span class="pill ${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
          ${r.priority !== "normal" ? `<span class="pill priority-${escapeHtml(r.priority)}">${escapeHtml(r.priority)}</span>` : ""}
        </div>
        <div class="lav-meta">${escapeHtml(fmtRel(r.createdAt))}</div>
      </div>
    `).join("");
  } catch (err) {
    head.textContent = "⚠️";
    body.innerHTML = `<div class="widget-error">Errore: ${escapeHtml(err.message || err)}</div>`;
  }
}

async function loadAlertsWidget() {
  const body = $("#alertsBody");
  const head = $("#wAlerts .widget-icon");
  try {
    const { db, fsMod } = await getFirestore();
    // PHARO non è attivo: mostriamo le notifiche ECHO pending come stand-in
    // (queste vengono generate dal RuleEngine di IRIS).
    const q = fsMod.query(
      fsMod.collection(db, "echo_notifications"),
      fsMod.orderBy("createdAt", "desc"),
      fsMod.limit(8),
    );
    const snap = await fsMod.getDocs(q);
    const rows = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      rows.push({
        channel: d.channel || "wa",
        text: d.text || "",
        status: d.status || "pending",
        createdAt: d.createdAt || null,
      });
    });
    head.textContent = "🔔";
    if (!rows.length) {
      body.innerHTML = `
        <div class="widget-empty">
          Nessun alert. PHARO non è ancora attivo; mostriamo le notifiche
          generate dalle regole IRIS quando ce ne saranno.
        </div>`;
      return;
    }
    body.innerHTML = rows.map(r => `
      <div class="lav-row">
        <div class="lav-arrow">${escapeHtml(r.channel.toUpperCase())}</div>
        <div class="lav-type">${escapeHtml(r.text)}<span class="pill ${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></div>
        <div class="lav-meta">${escapeHtml(fmtRel(r.createdAt))}</div>
      </div>
    `).join("");
  } catch (err) {
    head.textContent = "⚠️";
    body.innerHTML = `<div class="widget-error">Errore: ${escapeHtml(err.message || err)}</div>`;
  }
}

// ── Collega page (semplice + bottone NEXUS) ─────────────────────
// Ogni Collega è operativo v0.1 via NEXUS Chat. La pagina è solo
// informativa con un bottone grande per aprire la chat.

function renderCollegaWip(c) {
  const isSoon = c.status === "soon";
  const badgeClass = isSoon ? "soon" : "live";
  const badgeText = isSoon ? "⏳ Solo via NEXUS Chat" : "✅ Operativo v0.1";
  const samplePrompt = EXAMPLE_PROMPT[c.id] || "";
  const prompt = `Parla con ${c.name} via NEXUS`;

  $("#page").innerHTML = `
    <div class="collega-page">
      <div class="collega-header">
        <div class="icon">${c.icon}</div>
        <div class="titles">
          <h2>${escapeHtml(c.name)}</h2>
          <div class="domain">${escapeHtml(c.domain)}</div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
      </div>

      <div class="collega-card">
        <h3>Cosa fa</h3>
        <p style="color:var(--text-muted);line-height:1.6;margin:0 0 14px;">${escapeHtml(c.desc)}</p>
        <h3 style="margin-top:18px;">Azioni disponibili</h3>
        <ul style="margin:0 0 4px 18px;color:var(--text-muted);line-height:1.7;">
          ${c.actions.map(a => `<li>${escapeHtml(a)}</li>`).join("")}
        </ul>
      </div>

      <button class="nexus-big-btn" id="openNexusBtn">
        💬 Parla con ${escapeHtml(c.name)} via NEXUS
      </button>
      ${samplePrompt ? `
        <div style="text-align:center;margin-top:10px;color:var(--text-muted);font-size:0.88rem;">
          Esempio: <em>"${escapeHtml(samplePrompt)}"</em>
        </div>
      ` : ""}
    </div>
  `;

  $("#openNexusBtn").addEventListener("click", () => {
    nexusOpen();
    if (samplePrompt) {
      const input = $("#nexusInput");
      if (input) { input.value = samplePrompt; input.focus(); }
    }
  });
}

// ── PHARO dashboard ────────────────────────────────────────────
const PHARO_RTI_DASHBOARD_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/pharoRtiDashboard";
const PHARO_RESOLVE_ALERT_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/pharoResolveAlert";

// Regole post business-rules (esclude non fatturabili + già fatturati, segmentate per tipo)
const PHARO_RULES_DEFAULT = [
  { id: "A1_G", nome: "GRTIDF pronti fatturazione (valore EUR)", condizione: "rtidf.tipo='generico' AND stato='inviato' AND fatturabile!=false", severita: "critical", canale: "echo_whatsapp", tipo: "generico", attiva: true },
  { id: "A2_G", nome: "GRTIDF senza costo_intervento", condizione: "rtidf.tipo='generico' AND stato NOT IN (bozza,fatturato) AND !costo_intervento AND fatturabile!=false", severita: "critical", canale: "echo_email", tipo: "generico", attiva: true },
  { id: "A3_G", nome: "GRTI 'definito' senza GRTIDF (fatturabili)", condizione: "rti.tipo='generico' AND stato='definito' AND !rtidf AND fatturabile!=false", severita: "critical", canale: "lavagna", tipo: "generico", attiva: true },
  { id: "A1_C", nome: "Bozze CRTI vecchie >30g (backlog tecnico)", condizione: "rti.tipo='contabilizzazione' AND stato='bozza' AND data_intervento<NOW-30d", severita: "critical", canale: "echo_whatsapp", tipo: "contabilizzazione", attiva: true },
  { id: "A2_C", nome: "CRTI 'definito' senza CRTIDF (fatturabili)", condizione: "rti.tipo='contabilizzazione' AND stato='definito' AND !rtidf AND fatturabile!=false", severita: "warning", canale: "lavagna", tipo: "contabilizzazione", attiva: true },
  { id: "A4", nome: "Ticket aperto >30g senza RTI", condizione: "ticket.stato IN (aperto,pianificato,in_attesa,da_chiudere) AND data_apertura<NOW-30d AND !rti_inviato", severita: "critical", canale: "echo_whatsapp", tipo: "tutti", attiva: true },
];

// ── CHRONOS dashboard — design badge quadrati ──────────────────
const CHRONOS_CAMPAGNE_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/chronosCampagneDashboard";
const CHRONOS_AGENDA_URL   = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/chronosAgendaDashboard";
const CHRONOS_SCADENZE_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/chronosScadenzeDashboard";

function renderChronosPage(c) {
  $("#page").innerHTML = `
    <div class="collega-page">
      <div class="collega-header">
        <div class="icon">${c.icon}</div>
        <div class="titles">
          <h2>${escapeHtml(c.name)} — Pianificatore</h2>
          <div class="domain">Campagne · agenda tecnici · scadenze manutenzione</div>
          <span class="badge live">✅ Attivo v0.5</span>
        </div>
        <button class="btn-small" id="chronosRefresh" style="margin-left:auto;">↻ Aggiorna</button>
      </div>

      <div class="chronos-section-title">📋 Campagne attive</div>
      <div id="chronosBanner" style="margin-bottom:10px;"></div>
      <div id="chronosCampagne" class="chronos-grid">
        <div class="widget-empty" style="grid-column:1/-1;">Caricamento campagne…</div>
      </div>

      <div class="chronos-section-title">⚙️ Operativo</div>
      <div id="chronosOperativo" class="chronos-grid">
        <div class="widget-empty" style="grid-column:1/-1;">Caricamento operativo…</div>
      </div>

      <div class="pharo-section" id="chronosDetailSection" style="display:none;">
        <h3>
          <span id="chronosDetailTitle">Dettaglio</span>
          <button class="btn-small" id="chronosCloseDetail">✕ Chiudi</button>
        </h3>
        <div id="chronosDetail"></div>
      </div>

      <button class="nexus-big-btn" id="chronosOpenNexus">
        💬 Chiedi a NEXUS: "come va la campagna [nome]?"
      </button>
    </div>
  `;

  $("#chronosRefresh").addEventListener("click", loadChronos);
  $("#chronosCloseDetail").addEventListener("click", () => {
    $("#chronosDetailSection").style.display = "none";
  });
  $("#chronosOpenNexus").addEventListener("click", () => {
    nexusOpen();
    const input = $("#nexusInput");
    if (input) { input.value = "come va la campagna Letture WalkBy?"; input.focus(); }
  });

  loadChronos();
}

function loadChronos() {
  loadChronosCampagne();
  loadChronosOperativo();
}

// Classi di soglia per bordo + colore %: ok >80, mid 50-80, low <50, zero 0
function chronosPercClass(perc, totale) {
  if (!totale) return "zero";
  if (perc === 0) return "zero";
  if (perc > 80) return "ok";
  if (perc >= 50) return "mid";
  return "low";
}

async function loadChronosCampagne() {
  const container = $("#chronosCampagne");
  const banner = $("#chronosBanner");
  container.innerHTML = `<div class="widget-empty" style="grid-column:1/-1;">Caricamento campagne da COSMINA…</div>`;
  banner.innerHTML = "";
  try {
    const idToken = await getAuthIdToken();
    const headers = idToken ? { "Authorization": "Bearer " + idToken } : {};
    const resp = await fetch(CHRONOS_CAMPAGNE_URL, { headers });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${t.slice(0, 150)}`);
    }
    const data = await resp.json();
    const campagne = data.campagne || [];
    if (!campagne.length) {
      container.innerHTML = `<div class="widget-empty" style="grid-column:1/-1;">Nessuna campagna attiva.</div>`;
      return;
    }
    container.innerHTML = campagne.map(renderCampagnaBadge).join("");
    container.querySelectorAll("[data-camp-nome]").forEach(el => {
      el.addEventListener("click", () => showChronosDetail(el.dataset.campNome));
    });
  } catch (err) {
    container.innerHTML = `<div class="widget-error" style="grid-column:1/-1;">Errore: ${escapeHtml(err.message || err)}</div>`;
  }
}

// ── Badge minimale: 3 righe (titolo, perc+frac, bar) ───────────
function renderMiniBadge({ nome, cls, perc, frac, segments, attrs = "" }) {
  const segs = (segments || [])
    .map(s => `<div class="seg ${s.kind}" style="width:${s.width}%"></div>`)
    .join("");
  return `
    <div class="chronos-badge ${cls}"${attrs}>
      <div class="chronos-badge-head" title="${nome}">${nome}</div>
      <div class="chronos-badge-line">
        <span class="chronos-badge-perc ${cls}">${perc}</span>
        <span class="chronos-badge-frac">${frac}</span>
      </div>
      <div class="chronos-badge-bar">${segs}</div>
    </div>
  `;
}

function renderCampagnaBadge(c) {
  const stats = c.stats || {};
  const tot = stats.totale || 0;
  const comp = stats.completati || 0;
  const prog = stats.programmati || 0;
  const scad = stats.scaduti || 0;
  const daProg = stats.da_programmare || 0;
  const perc = c.completamento_pct ?? (tot > 0 ? Math.round((comp / tot) * 100) : 0);
  const cls = chronosPercClass(perc, tot);
  const nome = escapeHtml(c.nome || c.campagna?.nome || "?");

  return renderMiniBadge({
    nome, cls,
    perc: `${perc}%`,
    frac: `${comp}/${tot}`,
    segments: tot > 0 ? [
      { kind: "done",   width: (comp / tot) * 100 },
      { kind: "prog",   width: (prog / tot) * 100 },
      { kind: "daprog", width: (daProg / tot) * 100 },
      { kind: "scad",   width: (scad / tot) * 100 },
    ] : [],
    attrs: ` data-camp-nome="${nome}"`,
  });
}

async function loadChronosOperativo() {
  const container = $("#chronosOperativo");
  container.innerHTML = `<div class="widget-empty" style="grid-column:1/-1;">Caricamento operativo…</div>`;

  try {
    const idToken = await getAuthIdToken();
    const headers = idToken ? { "Authorization": "Bearer " + idToken } : {};
    const [agendaResp, scadenzeResp] = await Promise.all([
      fetch(CHRONOS_AGENDA_URL, { headers }),
      fetch(CHRONOS_SCADENZE_URL, { headers }),
    ]);
    const agenda = agendaResp.ok ? await agendaResp.json() : { error: `HTTP ${agendaResp.status}` };
    const scad   = scadenzeResp.ok ? await scadenzeResp.json() : { error: `HTTP ${scadenzeResp.status}` };

    container.innerHTML = [
      renderAgendaOggiBadge(agenda),
      renderAgendaSettimanaBadge(agenda),
      renderAgendaScadutiBadge(agenda),
      renderScadenzeBadge(scad),
      renderCoperturaScadenzeBadge(scad),
      renderSlotLiberiBadge(agenda),
    ].join("");
  } catch (err) {
    container.innerHTML = `<div class="widget-error" style="grid-column:1/-1;">Errore: ${escapeHtml(err.message || err)}</div>`;
  }
}

function renderAgendaOggiBadge(agenda) {
  if (agenda?.error) return errorBadge("Agenda oggi", agenda.error);
  const t = agenda.totale || {};
  const oggi = t.oggi || 0;
  const totAttivi = Math.max((t.totale || 0) - (t.completati || 0), 1);
  return renderMiniBadge({
    nome: "Agenda oggi",
    cls: oggi > 0 ? "info" : "zero",
    perc: oggi,
    frac: "interventi",
    segments: oggi > 0 ? [{ kind: "prog", width: Math.min((oggi / totAttivi) * 100, 100) }] : [],
  });
}

function renderAgendaSettimanaBadge(agenda) {
  if (agenda?.error) return errorBadge("Settimana", agenda.error);
  const t = agenda.totale || {};
  const sett = t.settimana || 0;
  const totAttivi = Math.max((t.totale || 0) - (t.completati || 0), 1);
  return renderMiniBadge({
    nome: "Settimana (7gg)",
    cls: sett > 0 ? "info" : "zero",
    perc: sett,
    frac: "prossimi 7gg",
    segments: sett > 0 ? [{ kind: "prog", width: Math.min((sett / totAttivi) * 100, 100) }] : [],
  });
}

function renderAgendaScadutiBadge(agenda) {
  if (agenda?.error) return errorBadge("Scaduti", agenda.error);
  const t = agenda.totale || {};
  const n = t.scaduti || 0;
  const totAttivi = Math.max((t.totale || 0) - (t.completati || 0), 1);
  return renderMiniBadge({
    nome: "Interventi scaduti",
    cls: n === 0 ? "ok" : n > 20 ? "low" : "mid",
    perc: n,
    frac: "data superata",
    segments: n > 0 ? [{ kind: "scad", width: Math.min((n / totAttivi) * 100, 100) }] : [],
  });
}

function renderScadenzeBadge(scad) {
  if (scad?.error) return errorBadge("Scadenze impianti", scad.error);
  const t = scad.totale || {};
  const scaduti = t.scaduti || 0;
  const prossime = (t.g30 || 0) + (t.g60 || 0);
  const n = scaduti + prossime;
  const tot = Math.max(t.con_scadenza || 1, 1);
  return renderMiniBadge({
    nome: "Scadenze impianti",
    cls: scaduti > 0 ? "low" : prossime > 0 ? "mid" : "ok",
    perc: n,
    frac: "entro 60gg",
    segments: [
      { kind: "scad", width: (scaduti / tot) * 100 },
      { kind: "daprog", width: (prossime / tot) * 100 },
    ],
  });
}

function renderCoperturaScadenzeBadge(scad) {
  if (scad?.error) return errorBadge("Copertura", scad.error);
  const t = scad.totale || {};
  const perc = t.copertura_pct || 0;
  return renderMiniBadge({
    nome: "Copertura dati",
    cls: perc > 80 ? "ok" : perc >= 50 ? "mid" : "low",
    perc: `${perc}%`,
    frac: `${t.con_scadenza || 0}/${t.impianti_totali || 0}`,
    segments: [{ kind: "done", width: perc }],
  });
}

function renderSlotLiberiBadge(agenda) {
  if (agenda?.error) return errorBadge("Slot liberi", agenda.error);
  const tecnici = agenda.tecnici || [];
  const CAPIENZA = 40;
  const assegnati = tecnici.reduce((s, t) => s + (t.oggi || 0) + (t.settimana || 0), 0);
  const totaleSlot = tecnici.filter(t => t.tecnico !== "(NON ASSEGNATO)").length * CAPIENZA;
  const liberi = Math.max(totaleSlot - assegnati, 0);
  const perc = totaleSlot > 0 ? Math.round((liberi / totaleSlot) * 100) : 0;
  return renderMiniBadge({
    nome: "Slot liberi",
    cls: perc > 50 ? "ok" : perc >= 20 ? "mid" : "low",
    perc: liberi,
    frac: `${perc}% libero`,
    segments: totaleSlot > 0 ? [{ kind: "done", width: perc }] : [],
  });
}

function errorBadge(titolo, msg) {
  return renderMiniBadge({
    nome: titolo,
    cls: "low",
    perc: "⚠️",
    frac: String(msg).slice(0, 20),
    segments: [],
  });
}

async function showChronosDetail(nome) {
  const section = $("#chronosDetailSection");
  const title = $("#chronosDetailTitle");
  const content = $("#chronosDetail");
  section.style.display = "";
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  title.textContent = `Dettaglio: ${nome}`;
  content.innerHTML = `<div class="widget-empty">Caricamento…</div>`;

  try {
    const idToken = await getAuthIdToken();
    const headers = idToken ? { "Authorization": "Bearer " + idToken } : {};
    const resp = await fetch(`${CHRONOS_CAMPAGNE_URL}?nome=${encodeURIComponent(nome)}`, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const stats = data.stats || {};
    const perTecnico = data.perTecnico || {};

    const rowsTecnici = Object.entries(perTecnico)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `<tr><td>${escapeHtml(t)}</td><td style="text-align:right;">${n}</td></tr>`)
      .join("");

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">
        <div class="pharo-kpi"><div class="label">Totale</div><div class="value">${stats.totale || 0}</div></div>
        <div class="pharo-kpi ok"><div class="label">Completati</div><div class="value">${stats.completati || 0}</div></div>
        <div class="pharo-kpi"><div class="label">Programmati</div><div class="value">${stats.programmati || 0}</div></div>
        <div class="pharo-kpi ${stats.scaduti > 0 ? "err" : ""}"><div class="label">Scaduti</div><div class="value">${stats.scaduti || 0}</div></div>
        <div class="pharo-kpi ${stats.da_programmare > 0 ? "warn" : ""}"><div class="label">Da Programmare</div><div class="value">${stats.da_programmare || 0}</div></div>
        <div class="pharo-kpi"><div class="label">Orario Ridotto</div><div class="value">${stats.orario_ridotto || 0}</div></div>
        <div class="pharo-kpi"><div class="label">Non Fatti</div><div class="value">${stats.non_fatti || 0}</div></div>
        <div class="pharo-kpi"><div class="label">Da Non Fare</div><div class="value">${stats.da_non_fare || 0}</div></div>
      </div>
      <h4 style="margin-top:20px;">Distribuzione per tecnico</h4>
      <table class="pharo-table">
        <thead><tr><th>Tecnico</th><th style="text-align:right;">Interventi</th></tr></thead>
        <tbody>${rowsTecnici || '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">Nessun tecnico assegnato</td></tr>'}</tbody>
      </table>
      <div style="color:var(--text-muted);font-size:0.82rem;margin-top:10px;">
        Avanzamento: <strong>${data.completamento_pct || 0}%</strong>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="widget-error">Errore: ${escapeHtml(err.message || err)}</div>`;
  }
}

// ── ARES dashboard ─────────────────────────────────────────────
function renderAresPage(c) {
  $("#page").innerHTML = `
    <div class="collega-page">
      <div class="collega-header">
        <div class="icon">${c.icon}</div>
        <div class="titles">
          <h2>${escapeHtml(c.name)} — Interventi</h2>
          <div class="domain">Operativo · apertura interventi DRY-RUN + listener Lavagna</div>
          <span class="badge live">✅ Attivo v0.2</span>
        </div>
      </div>

      <div class="pharo-section">
        <h3>
          📋 Ultimi interventi ARES (audit nexo-hub)
          <button class="btn-small" id="aresRefresh">↻ Aggiorna</button>
        </h3>
        <div id="aresBanner" style="margin-bottom:10px;"></div>
        <div class="pharo-table-wrap">
          <table class="pharo-table">
            <thead>
              <tr>
                <th>ID</th><th>Condominio</th><th>Tipo</th><th>Urgenza</th><th>Stato</th><th>Source</th><th>DRY</th><th>Creato</th>
              </tr>
            </thead>
            <tbody id="aresTable"><tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Caricamento…</td></tr></tbody>
          </table>
        </div>
      </div>

      <button class="nexus-big-btn" id="aresOpenNexus">
        💬 Apri nuovo intervento via NEXUS
      </button>
      <div style="text-align:center;margin-top:10px;color:var(--text-muted);font-size:0.88rem;">
        Esempio: <em>"apri intervento riparazione caldaia al Condominio Kristal urgente"</em>
      </div>
    </div>
  `;

  $("#aresOpenNexus").addEventListener("click", () => {
    nexusOpen();
    const input = $("#nexusInput");
    if (input) { input.value = "apri intervento "; input.focus(); }
  });
  $("#aresRefresh").addEventListener("click", loadAresInterventi);
  loadAresInterventi();
}

async function loadAresInterventi() {
  const tbody = $("#aresTable");
  const banner = $("#aresBanner");
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Caricamento…</td></tr>`;
  try {
    const { db, fsMod } = await getFirestore();
    const q = fsMod.query(
      fsMod.collection(db, "ares_interventi"),
      fsMod.orderBy("createdAt", "desc"),
      fsMod.limit(50),
    );
    const snap = await fsMod.getDocs(q);
    const rows = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      rows.push({
        id: d.id || doc.id,
        condominio: d.condominio || "?",
        tipo: d.tipo || "?",
        urgenza: d.urgenza || "media",
        stato: d.stato || "?",
        source: d.source || "?",
        dryRun: !!d._dryRun,
        createdAt: d.createdAt,
      });
    });
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Nessun intervento ARES ancora creato. Usa NEXUS per aprirne uno.</td></tr>`;
      if (banner) banner.innerHTML = "";
      return;
    }
    if (banner) {
      const dryCount = rows.filter(r => r.dryRun).length;
      banner.innerHTML = `<div style="color:var(--text-muted);font-size:0.88rem;">${rows.length} interventi totali · ${dryCount} simulati (DRY-RUN) · ${rows.length - dryCount} scritti su COSMINA</div>`;
    }
    tbody.innerHTML = rows.map(r => {
      const urgClass = r.urgenza === "critica" ? "critical" : r.urgenza === "alta" ? "warning" : "";
      return `
      <tr>
        <td><code>${escapeHtml(String(r.id).slice(0, 18))}</code></td>
        <td>${escapeHtml(String(r.condominio).slice(0, 50))}</td>
        <td>${escapeHtml(r.tipo)}</td>
        <td>${urgClass ? `<span class="pharo-alert-badge ${urgClass}">${escapeHtml(r.urgenza)}</span>` : escapeHtml(r.urgenza)}</td>
        <td><span class="pill">${escapeHtml(r.stato)}</span></td>
        <td style="color:var(--text-muted);font-size:0.82rem;">${escapeHtml(r.source)}</td>
        <td>${r.dryRun ? '<span style="color:#d97706;">SIM</span>' : '<span style="color:#059669;">✓</span>'}</td>
        <td style="color:var(--text-muted);font-size:0.82rem;">${escapeHtml(fmtRel(r.createdAt))}</td>
      </tr>
    `;}).join("");
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:#dc2626;text-align:center;">Errore: ${escapeHtml(err.message || err)}</td></tr>`;
  }
}

function renderPharoPage(c) {
  $("#page").innerHTML = `
    <div class="collega-page">
      <div class="collega-header">
        <div class="icon">${c.icon}</div>
        <div class="titles">
          <h2>${escapeHtml(c.name)} — Dashboard Alert RTI</h2>
          <div class="domain">Monitoring real-time Guazzotti TEC</div>
          <span class="badge live">✅ Attivo v0.2</span>
        </div>
      </div>

      <div id="pharoBanner"></div>

      <div class="pharo-grid" id="pharoKpi">
        <div class="pharo-kpi"><div class="label">💰 Fatturazione bloccata</div><div class="value">—</div><div class="sub">Caricamento…</div></div>
        <div class="pharo-kpi"><div class="label">GRTI senza GRTIDF</div><div class="value">—</div><div class="sub">Caricamento…</div></div>
        <div class="pharo-kpi"><div class="label">Bozze CRTI &gt;30g</div><div class="value">—</div><div class="sub">Caricamento…</div></div>
        <div class="pharo-kpi"><div class="label">Ticket &gt;30g senza RTI</div><div class="value">—</div><div class="sub">Caricamento…</div></div>
      </div>

      <div class="pharo-section" id="pharoAlertsSection">
        <h3>
          🚨 Alert attivi
          <button class="btn-small" id="pharoRefreshAlerts">↻ Aggiorna</button>
        </h3>
        <div id="pharoAlertsBody"><div class="widget-empty">Caricamento alert…</div></div>
      </div>

      <div class="pharo-section">
        <h3>📋 Monitoring RTI (Guazzotti TEC)</h3>
        <div id="pharoRtiSummary" style="margin-bottom:12px;color:var(--text-muted);font-size:0.9rem;">Caricamento…</div>
        <div class="pharo-table-wrap">
          <table class="pharo-table">
            <thead>
              <tr>
                <th>Numero RTI</th>
                <th>Data</th>
                <th>Stato</th>
                <th>Tipo</th>
                <th>Fatt.</th>
                <th>Tecnico</th>
                <th>Cliente</th>
                <th>RTIDF</th>
              </tr>
            </thead>
            <tbody id="pharoRtiTable"><tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Caricamento…</td></tr></tbody>
          </table>
        </div>
      </div>

      <div class="pharo-section">
        <h3>
          ⚙️ Regole monitoring
          <button class="btn-small" id="pharoAddRule">+ Aggiungi regola</button>
        </h3>
        <div id="pharoRulesBody"></div>
      </div>

      <div class="pharo-section">
        <h3>📊 Statistiche</h3>
        <div style="margin-bottom:24px;">
          <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:8px;">RTI per mese (ultimi 12)</div>
          <div class="pharo-chart" id="pharoChart"></div>
          <div style="height:24px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:8px;">Tempo medio RTI → RTIDF</div>
            <div id="pharoTempoMedio" style="font-size:1.4rem;font-weight:700;color:var(--text);">—</div>
          </div>
          <div>
            <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:8px;">Top 5 tecnici per RTI</div>
            <div class="pharo-tecnici" id="pharoTecnici"><div class="widget-empty">Caricamento…</div></div>
          </div>
        </div>
      </div>
    </div>
  `;

  $("#pharoRefreshAlerts").addEventListener("click", loadPharoAlerts);
  $("#pharoAddRule").addEventListener("click", () => {
    alert("Funzione in arrivo: editor regole custom con persistence in pharo_rules.");
  });

  renderPharoRules();
  loadPharoAlerts();
  loadPharoRtiDashboard();
}

async function loadPharoAlerts() {
  const body = $("#pharoAlertsBody");
  body.innerHTML = `<div class="widget-empty">Caricamento alert…</div>`;
  try {
    const { db, fsMod } = await getFirestore();
    const q = fsMod.query(
      fsMod.collection(db, "pharo_alerts"),
      fsMod.orderBy("createdAt", "desc"),
      fsMod.limit(20),
    );
    const snap = await fsMod.getDocs(q);
    const active = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      if (d.status === "active" || !d.status) {
        active.push({ id: doc.id, ...d });
      }
    });
    if (!active.length) {
      body.innerHTML = `<div class="widget-empty">✅ Nessun alert attivo al momento.</div>`;
      return;
    }
    body.innerHTML = active.map(a => {
      const sev = a.severita || "info";
      return `
        <div class="pharo-alert-row ${escapeHtml(sev)}">
          <span class="pharo-alert-badge ${escapeHtml(sev)}">${escapeHtml(sev)}</span>
          <div class="pharo-alert-body">
            <div class="pharo-alert-title">${escapeHtml(a.titolo || "(senza titolo)")}</div>
            <div class="pharo-alert-desc">${escapeHtml(a.descrizione || "")}</div>
            <div class="pharo-alert-meta">
              Rilevato ${escapeHtml(fmtRel(a.createdAt))}
              ${a.count && a.count > 1 ? ` · ricorso ${a.count} volte` : ""}
              ${a.tipo ? ` · tipo: ${escapeHtml(a.tipo)}` : ""}
            </div>
          </div>
          <button class="pharo-alert-resolve" data-id="${escapeHtml(a.id)}">✓ Risolvi</button>
        </div>
      `;
    }).join("");

    body.querySelectorAll(".pharo-alert-resolve").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = "...";
        try {
          const idToken = await getAuthIdToken();
          const headers = { "Content-Type": "application/json" };
          if (idToken) headers["Authorization"] = "Bearer " + idToken;
          const resp = await fetch(PHARO_RESOLVE_ALERT_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({ alertId: id, resolvedBy: (CURRENT_USER && CURRENT_USER.email) || "alberto" }),
          });
          if (!resp.ok) throw new Error("HTTP " + resp.status);
          loadPharoAlerts();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "✓ Risolvi";
          alert("Errore: " + err.message);
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="widget-error">Errore caricamento alert: ${escapeHtml(err.message || err)}</div>`;
  }
}

async function loadPharoRtiDashboard() {
  const banner = $("#pharoBanner");
  try {
    const idToken = await getAuthIdToken();
    const headers = idToken ? { "Authorization": "Bearer " + idToken } : {};
    const resp = await fetch(PHARO_RTI_DASHBOARD_URL, { headers });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    renderPharoKpi(data);
    renderPharoRtiTable(data);
    renderPharoStats(data);
    if (data.errors && data.errors.length) {
      banner.innerHTML = `
        <div class="pharo-banner-err">
          ⚠️ Lettura parziale: errori su collection ${data.errors.map(e => escapeHtml(e.collection)).join(", ")}.
          Potrebbero mancare permessi cross-project sul SA Cloud Functions.
        </div>
      `;
    }
  } catch (err) {
    banner.innerHTML = `
      <div class="pharo-banner-err">
        ❌ Dashboard non raggiungibile (${escapeHtml(err.message || err)}). Verifica deploy functions.
      </div>
    `;
  }
}

function renderPharoKpi(data) {
  const el = $("#pharoKpi");
  const m = data.alerts_metrics || {};
  const rtiGen = data.rti_gen || {};
  const rtiCon = data.rti_con || {};
  const rtidfGen = data.rtidf_gen || {};
  const rtidfCon = data.rtidf_con || {};
  const tickets = data.tickets || {};

  const valEur = (m.grtidf_pronti_fattura && m.grtidf_pronti_fattura.valore_eur) || 0;
  const countPronti = (m.grtidf_pronti_fattura && m.grtidf_pronti_fattura.count) || 0;

  el.innerHTML = `
    <div class="pharo-kpi ${valEur > 0 ? "err" : "ok"}">
      <div class="label">💰 Fatturazione bloccata</div>
      <div class="value">${valEur.toLocaleString("it-IT", {minimumFractionDigits: 2, maximumFractionDigits: 2})} €</div>
      <div class="sub">${countPronti} GRTIDF inviati fatturabili</div>
    </div>
    <div class="pharo-kpi ${(m.grti_definito_senza_grtidf || 0) > 0 ? "warn" : "ok"}">
      <div class="label">GRTI → GRTIDF (fatturabili)</div>
      <div class="value">${m.grti_definito_senza_grtidf || 0}</div>
      <div class="sub">Generici definiti senza RTIDF (esclusi non fatt.)</div>
    </div>
    <div class="pharo-kpi ${(m.crti_bozza_30g || 0) > 0 ? "err" : "ok"}">
      <div class="label">Bozze CRTI &gt;30g</div>
      <div class="value">${m.crti_bozza_30g || 0}</div>
      <div class="sub">Backlog contabilizzazioni</div>
    </div>
    <div class="pharo-kpi ${(m.tickets_aperti_30g_no_rti || 0) > 0 ? "err" : "ok"}">
      <div class="label">Ticket &gt;30g senza RTI</div>
      <div class="value">${m.tickets_aperti_30g_no_rti || 0}</div>
      <div class="sub">di ${tickets.aperti || 0} aperti totali</div>
    </div>
    <div class="pharo-kpi">
      <div class="label">GRTI totali</div>
      <div class="value">${rtiGen.total || 0}</div>
      <div class="sub">${rtiGen.non_fatturabili || 0} non fatt · ${rtiGen.rtidf_fatturato || 0} fatturati</div>
    </div>
    <div class="pharo-kpi">
      <div class="label">CRTI totali</div>
      <div class="value">${rtiCon.total || 0}</div>
      <div class="sub">${rtiCon.bozza || 0} bozze · ${rtiCon.non_fatturabili || 0} non fatt</div>
    </div>
    <div class="pharo-kpi">
      <div class="label">GRTIDF totali</div>
      <div class="value">${rtidfGen.total || 0}</div>
      <div class="sub">${rtidfGen.inviato || 0} inviati · ${rtidfGen.fatturato || 0} fatturati (esclusi)</div>
    </div>
    <div class="pharo-kpi">
      <div class="label">CRTIDF totali</div>
      <div class="value">${rtidfCon.total || 0}</div>
      <div class="sub">${rtidfCon.inviato || 0} inviati · ripartizione millesimi</div>
    </div>
  `;
}

function renderPharoRtiTable(data) {
  const summary = $("#pharoRtiSummary");
  const tbody = $("#pharoRtiTable");
  const rows = data.tabella_rti || [];
  const rti = data.rti || {};
  const rtiGen = data.rti_gen || {};
  const rtiCon = data.rti_con || {};
  summary.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
      <div><strong>🔵 Generico:</strong> ${rtiGen.total || 0} GRTI (${rtiGen.bozza || 0} bozze, ${rtiGen.definito || 0} definiti, ${rtiGen.rtidf_fatturato || 0} fatturati esclusi, ${rtiGen.non_fatturabili || 0} non fatturabili esclusi)</div>
      <div><strong>🟠 Contabilizzazione:</strong> ${rtiCon.total || 0} CRTI (${rtiCon.bozza || 0} bozze, ${rtiCon.definito || 0} definiti, ${rtiCon.non_fatturabili || 0} non fatturabili esclusi)</div>
    </div>
    <div style="font-size:0.82rem;color:var(--text-dim);">Regole business applicate: fatturabile=false e stati fatturato esclusi dagli alert.</div>
  `;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Nessun RTI letto.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr${r.fatturabile === false ? ' style="opacity:0.5;"' : ''}>
      <td><strong>${escapeHtml(r.numero_rti || r.id)}</strong></td>
      <td>${escapeHtml(r.data || "-")}</td>
      <td><span class="pill ${escapeHtml(r.stato)}">${escapeHtml(r.stato || "-")}</span></td>
      <td>${escapeHtml(r.tipo || "-")}</td>
      <td>${r.fatturabile === false ? '<span style="color:#dc2626;">no</span>' : '<span style="color:#059669;">sì</span>'}</td>
      <td>${escapeHtml(r.tecnico || "-")}</td>
      <td>${escapeHtml(r.cliente || "-")}</td>
      <td>${r.ha_rtidf ? '<span class="check-yes">✓</span>' : '<span class="check-no">—</span>'}</td>
    </tr>
  `).join("");
}

function renderPharoStats(data) {
  const chart = $("#pharoChart");
  const tecnici = $("#pharoTecnici");
  const tempoEl = $("#pharoTempoMedio");

  // Chart RTI per mese
  const perMese = data.stats?.rti_per_mese || {};
  const entries = Object.entries(perMese).sort().slice(-12);
  if (!entries.length) {
    chart.innerHTML = `<div class="widget-empty">Nessun dato mese.</div>`;
  } else {
    const max = Math.max(...entries.map(e => e[1]));
    chart.innerHTML = entries.map(([mese, count]) => {
      const h = max > 0 ? Math.round((count / max) * 140) : 0;
      const shortMese = mese.slice(5) + "/" + mese.slice(2, 4);
      return `
        <div class="pharo-bar" style="height:${h}px;" title="${escapeHtml(mese)}: ${count} RTI">
          <div class="bar-value">${count}</div>
          <div class="bar-label">${escapeHtml(shortMese)}</div>
        </div>
      `;
    }).join("");
  }

  // Top tecnici
  const top = data.stats?.top_tecnici || [];
  if (!top.length) {
    tecnici.innerHTML = `<div class="widget-empty">Nessun tecnico rilevato.</div>`;
  } else {
    tecnici.innerHTML = top.map((t, i) => `
      <div class="pharo-tecnico-row">
        <div class="pharo-tecnico-rank">${i + 1}</div>
        <div class="pharo-tecnico-name">${escapeHtml(t.nome)}</div>
        <div class="pharo-tecnico-count">${t.count} RTI</div>
      </div>
    `).join("");
  }

  // Tempo medio
  const t = data.stats?.tempo_medio_rti_rtidf_giorni;
  tempoEl.textContent = (t === null || t === undefined) ? "Non calcolabile (timestamp_duplicazione mancante)" : `${t} giorni`;
}

function renderPharoRules() {
  const body = $("#pharoRulesBody");
  body.innerHTML = PHARO_RULES_DEFAULT.map(r => `
    <div class="pharo-rule-row" data-id="${escapeHtml(r.id)}">
      <div class="pharo-rule-info">
        <div class="pharo-rule-name">${escapeHtml(r.nome)}</div>
        <div class="pharo-rule-cond"><code>${escapeHtml(r.condizione)}</code></div>
        <div class="pharo-rule-meta">
          <span class="pharo-alert-badge ${escapeHtml(r.severita)}">${escapeHtml(r.severita)}</span>
          <span style="color:var(--text-muted);font-size:0.78rem;">canale: ${escapeHtml(r.canale)}</span>
        </div>
      </div>
      <div class="pharo-toggle ${r.attiva ? "on" : ""}" data-id="${escapeHtml(r.id)}"></div>
    </div>
  `).join("");
  body.querySelectorAll(".pharo-toggle").forEach(t => {
    t.addEventListener("click", () => t.classList.toggle("on"));
  });
}

const EXAMPLE_PROMPT = {
  ares: "interventi aperti oggi",
  chronos: "cosa fa Marco nei prossimi 14 giorni?",
  memo: "dimmi tutto sul Condominio La Bussola",
  charta: "report mensile",
  echo: "manda whatsapp a Alberto: test",
  emporion: "c'è il pezzo codice 00001?",
  dikea: "scadenze CURIT",
  delphi: "come siamo andati questo mese?",
  pharo: "stato della suite, tutto ok?",
  calliope: "scrivi una bozza cordiale a ",
};

// ── NEXUS Chat ─────────────────────────────────────────────────
const NEXUS_API_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusRouter";
const NEXUS_COLLEGHI_ATTIVI = new Set(["iris"]);
const NEXUS_SESSION_KEY = "nexo.nexus.sessionId";
const NEXUS_COLLEGA_MAX_WAIT_MS = 30000;
const NEXUS_EXAMPLES = [
  "Quante email urgenti ho?",
  "Apri intervento caldaia Via Roma 12, manda Malvicino",
  "Fatture scadute?",
  "Stato della Suite",
  "Dimmi tutto sul Condominio La Bussola",
];

function nexusGetOrCreateSessionId() {
  try {
    let sid = localStorage.getItem(NEXUS_SESSION_KEY);
    if (!sid) {
      sid = "nx_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(NEXUS_SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return "nx_ephemeral_" + Date.now();
  }
}
let NEXUS_SESSION_ID = nexusGetOrCreateSessionId();
let NEXUS_MESSAGES = [];
let NEXUS_PENDING = false;
let NEXUS_UNSUBSCRIBE = null;
const NEXUS_LAVAGNA_WATCH = new Map(); // lavagnaId → unsubscribe

function nexusOpen() {
  $("#nexusPanel").classList.add("open");
  $("#nexusFab").classList.add("hidden-when-open");
  // body.nexus-chat-open: usato dal CSS per nascondere il bottone bug globale
  // su mobile (ridurre confusione: Alberto vedeva 2 bottoni 🐛 ravvicinati e
  // tappava quello sbagliato).
  document.body.classList.add("nexus-chat-open");
  // focus input
  setTimeout(() => $("#nexusInput")?.focus(), 100);
  nexusEnsureSubscribed();
}
function nexusClose() {
  $("#nexusPanel").classList.remove("open");
  $("#nexusPanel").classList.remove("fullscreen");  // esce anche dal fullscreen
  $("#nexusFab").classList.remove("hidden-when-open");
  document.body.classList.remove("nexus-chat-open");
  nexusUpdateFullscreenBtn();
  // Stop TTS quando chiudi il pannello
  if (nexusTts.supported) nexusTtsStop();
}

function nexusFullscreenToggle() {
  const panel = $("#nexusPanel");
  if (!panel) return;
  panel.classList.toggle("fullscreen");
  nexusUpdateFullscreenBtn();
}

function nexusUpdateFullscreenBtn() {
  const btn = $("#nexusFullscreenBtn");
  if (!btn) return;
  const isFs = $("#nexusPanel")?.classList.contains("fullscreen");
  btn.textContent = isFs ? "⛷" : "⛶";
  btn.setAttribute("aria-label", isFs ? "Comprimi" : "Espandi a tutto schermo");
  btn.setAttribute("title", isFs ? "Comprimi" : "Espandi a tutto schermo");
}

// Cancella la chat corrente: crea nuova sessione, svuota messaggi visibili.
// La vecchia sessione resta in Firestore (storico), non viene più caricata.
function nexusClear() {
  if (!confirm("Cancellare la conversazione?\n\nI messaggi resteranno nello storico, ma non saranno più visibili. Verrà iniziata una nuova conversazione.")) return;
  try {
    // Stop TTS corrente
    if (nexusTts.supported) {
      nexusTtsStop();
      _lastAutoSpokenId = null;
    }
    // Unsubscribe listener vecchia sessione
    if (NEXUS_UNSUBSCRIBE) {
      try { NEXUS_UNSUBSCRIBE(); } catch {}
      NEXUS_UNSUBSCRIBE = null;
    }
    // Unsubscribe watch lavagna
    for (const [, unsub] of NEXUS_LAVAGNA_WATCH) {
      try { unsub(); } catch {}
    }
    NEXUS_LAVAGNA_WATCH.clear();

    // Nuovo sessionId
    NEXUS_SESSION_ID = "nx_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try { localStorage.setItem(NEXUS_SESSION_KEY, NEXUS_SESSION_ID); } catch {}

    // Svuota messaggi in memoria e ri-renderizza (mostrerà il welcome)
    NEXUS_MESSAGES = [];
    nexusRenderMessages();

    // Sottoscrivi alla nuova sessione
    nexusEnsureSubscribed();
  } catch (e) {
    console.error("[nexus] clear failed:", e);
  }
}

async function nexusEnsureSubscribed() {
  if (NEXUS_UNSUBSCRIBE) return;
  try {
    const { db, fsMod } = await getFirestore();
    const q = fsMod.query(
      fsMod.collection(db, "nexus_chat"),
      fsMod.where("sessionId", "==", NEXUS_SESSION_ID),
      fsMod.orderBy("timestamp", "asc"),
      fsMod.limit(200),
    );
    NEXUS_UNSUBSCRIBE = fsMod.onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach(doc => {
        const d = doc.data();
        msgs.push({
          id: doc.id,
          role: d.role,
          content: d.content,
          collegaCoinvolto: d.collegaCoinvolto,
          lavagnaMessageId: d.lavagnaMessageId,
          azione: d.azione,
          stato: d.stato,
          source: d.source || null,
          timestamp: d.timestamp && d.timestamp.toDate ? d.timestamp.toDate() : null,
        });
      });
      NEXUS_MESSAGES = msgs;
      nexusRenderMessages();
      // hook per ogni lavagna message che stiamo aspettando
      for (const m of msgs) {
        if (m.role === "assistant"
            && m.lavagnaMessageId
            && m.stato === "in_attesa_collega"
            && !NEXUS_LAVAGNA_WATCH.has(m.lavagnaMessageId)) {
          nexusWatchLavagna(m.lavagnaMessageId, m.id);
        }
      }
    }, (err) => {
      console.warn("[nexus] snapshot error:", err.message || err);
    });
  } catch (err) {
    console.warn("[nexus] subscribe failed:", err.message || err);
  }
}

async function nexusWatchLavagna(lavagnaId, nexusMessageId) {
  try {
    const { db, fsMod } = await getFirestore();
    const ref = fsMod.doc(db, "nexo_lavagna", lavagnaId);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      nexusShowTimeout(nexusMessageId);
      const unsub = NEXUS_LAVAGNA_WATCH.get(lavagnaId);
      if (unsub) { try { unsub(); } catch {} }
      NEXUS_LAVAGNA_WATCH.delete(lavagnaId);
    }, NEXUS_COLLEGA_MAX_WAIT_MS);
    const unsub = fsMod.onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.status === "completed" || d.status === "failed") {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        nexusShowLavagnaResult(nexusMessageId, d);
        try { unsub(); } catch {}
        NEXUS_LAVAGNA_WATCH.delete(lavagnaId);
      }
    });
    NEXUS_LAVAGNA_WATCH.set(lavagnaId, unsub);
  } catch (err) {
    console.warn("[nexus] watch lavagna failed:", err.message || err);
  }
}

function nexusShowLavagnaResult(nexusMessageId, lavDoc) {
  // Append non-persistent "risposta dal collega" bubble (locale).
  const text = lavDoc.status === "completed"
    ? ("✅ " + (lavDoc.result?.summary || lavDoc.result?.message || "Il Collega ha completato la richiesta."))
    : ("⚠️ " + (lavDoc.failureReason || "Il Collega ha segnalato un errore."));
  NEXUS_MESSAGES.push({
    id: "lv_" + nexusMessageId,
    role: "assistant",
    content: text,
    collegaCoinvolto: lavDoc.to,
    stato: lavDoc.status === "completed" ? "completata" : "errore",
    timestamp: new Date(),
    _local: true,
  });
  nexusRenderMessages();
}

function nexusShowTimeout(nexusMessageId) {
  NEXUS_MESSAGES.push({
    id: "to_" + nexusMessageId,
    role: "assistant",
    content: "Non ho ricevuto risposta entro 30 secondi. Vuoi che riprovi o che cambi richiesta?",
    stato: "timeout",
    timestamp: new Date(),
    _local: true,
  });
  nexusRenderMessages();
}

// ── NEXUS bug-from-chat: ultimi 10 msg → nexo_dev_requests ────────
const NEXUS_BUG_COOLDOWN_MS = 30_000;
let _nexusBugLastSentAt = 0;
let _nexusBugBusy = false;

function nexusBugCollectConversation() {
  return NEXUS_MESSAGES
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10)
    .map(m => ({
      role: m.role,
      content: String(m.content),
      collega: m.collegaCoinvolto || null,
      stato: m.stato || null,
      timestamp: (m.timestamp && m.timestamp.toDate) ? m.timestamp.toDate().toISOString()
        : (m.timestamp instanceof Date ? m.timestamp.toISOString() : null),
    }));
}

function nexusBugOpen() {
  const modal = document.getElementById("nexusBugModal");
  const note  = document.getElementById("nexusBugNote");
  const err   = document.getElementById("nexusBugError");
  if (!modal) return;
  if (err)  err.textContent = "";
  if (note) note.value = "";
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => note && note.focus(), 50);
}

function nexusBugClose() {
  const modal = document.getElementById("nexusBugModal");
  const note  = document.getElementById("nexusBugNote");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  if (note) note.value = "";
}

function nexusBugAppendConfirmation() {
  NEXUS_MESSAGES.push({
    id: "bugok_" + Date.now(),
    role: "assistant",
    content: "Bug segnalato. Claude Code lo analizzerà.",
    stato: "completata",
    timestamp: new Date(),
    _local: true,
  });
  nexusRenderMessages();
}

async function nexusBugSubmit() {
  const note = document.getElementById("nexusBugNote");
  const err  = document.getElementById("nexusBugError");
  const btn  = document.getElementById("nexusBugSubmit");
  if (err) err.textContent = "";
  console.log("[nexus-bug] submit start", {
    sessionId: NEXUS_SESSION_ID,
    msgCount: NEXUS_MESSAGES.length,
    auth: !!CURRENT_USER,
  });
  if (!CURRENT_USER) {
    if (err) err.textContent = "Devi essere autenticato.";
    return;
  }
  const now = Date.now();
  if (now - _nexusBugLastSentAt < NEXUS_BUG_COOLDOWN_MS) {
    const wait = Math.ceil((NEXUS_BUG_COOLDOWN_MS - (now - _nexusBugLastSentAt)) / 1000);
    if (err) err.textContent = `Aspetta ${wait}s prima di inviarne un altro.`;
    return;
  }
  // La conversazione e la nota sono entrambe opzionali: se non c'è nulla
  // la dev-request viene comunque creata con il fallback nel description.
  const conversation = nexusBugCollectConversation();
  const noteText = (note && note.value || "").trim().slice(0, 2000);

  if (btn) { btn.disabled = true; btn.textContent = "Invio…"; }
  console.log("[nexus-bug] submit", { sessionId: NEXUS_SESSION_ID, msgCount: NEXUS_MESSAGES.length, convoLen: conversation.length, hasNote: !!noteText });
  try {
    const { db, fsMod } = await getFirestore();
    const me = (CURRENT_USER && CURRENT_USER.email) || null;
    const payload = {
      type: "bug_from_chat",
      source: "nexus_chat_bug_btn",
      note: noteText || null,
      description: noteText || "(nessuna nota — vedi conversazione)",
      conversation,
      sessionId: NEXUS_SESSION_ID || null,
      userId: me,
      status: "pending",
      createdAt: fsMod.serverTimestamp(),
    };
    await fsMod.addDoc(fsMod.collection(db, "nexo_dev_requests"), payload);
    _nexusBugLastSentAt = Date.now();
    nexusBugClose();
    nexusBugAppendConfirmation();
    // Cooldown visivo sul bottone in header
    const headerBtn = document.getElementById("nexusBugBtn");
    if (headerBtn) {
      headerBtn.classList.add("is-busy");
      _nexusBugBusy = true;
      setTimeout(() => { headerBtn.classList.remove("is-busy"); _nexusBugBusy = false; }, NEXUS_BUG_COOLDOWN_MS);
    }
  } catch (e) {
    console.error("[nexus-bug] submit failed:", e);
    if (err) err.textContent = "Errore: " + (e && e.message || e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Invia"; }
  }
}

// Helper per attaccare un handler tap-friendly che funziona su mobile
// (touchend + click) senza doppi-fire. iOS Safari a volte ingoia il click
// successivo a uno scroll → con anche touchend abbiamo doppia copertura.
// Il flag _nexusTouchFired evita di processare due volte lo stesso tap.
function _attachTapHandler(el, handler) {
  let touched = false;
  let touchTimer = null;
  el.addEventListener("touchend", (ev) => {
    if (touched) return;
    touched = true;
    if (touchTimer) clearTimeout(touchTimer);
    touchTimer = setTimeout(() => { touched = false; }, 600);
    ev.preventDefault();
    ev.stopPropagation();
    handler(ev);
  }, { passive: false });
  el.addEventListener("click", (ev) => {
    if (touched) { ev.preventDefault(); return; } // già gestito da touchend
    ev.preventDefault();
    ev.stopPropagation();
    handler(ev);
  });
}

function nexusBugWire() {
  const btn    = document.getElementById("nexusBugBtn");
  const modal  = document.getElementById("nexusBugModal");
  const submit = document.getElementById("nexusBugSubmit");
  const cancel = document.getElementById("nexusBugCancel");
  if (!btn || !modal || !submit) {
    console.warn("[nexus-bug] wiring saltato: btn/modal/submit assenti", { btn: !!btn, modal: !!modal, submit: !!submit });
    return;
  }
  if (btn._nexusBugWired) return;
  btn._nexusBugWired = true;

  _attachTapHandler(btn, (ev) => {
    console.log("[nexus-bug] tap/click su bottone bug — apro modal", { type: ev?.type, ts: Date.now() });
    if (_nexusBugBusy) {
      console.log("[nexus-bug] cooldown attivo, ignoro tap");
      return;
    }
    nexusBugOpen();
  });

  if (cancel) _attachTapHandler(cancel, () => nexusBugClose());
  modal.addEventListener("click", (ev) => { if (ev.target === modal) nexusBugClose(); });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal.getAttribute("aria-hidden") === "false") nexusBugClose();
  });
  _attachTapHandler(submit, () => {
    console.log("[nexus-bug] tap/click su submit");
    nexusBugSubmit().catch(e => {
      console.error("[nexus-bug] submit error:", e && (e.message || e));
      const errEl = document.getElementById("nexusBugError");
      if (errEl) errEl.textContent = "Errore: " + (e && e.message || e);
    });
  });

  // Diagnostic: log unhandled rejections solo se collegate al flusso bug
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = String(ev?.reason?.message || ev?.reason || "");
    if (/firestore|nexus.*bug|permission/i.test(reason)) {
      console.error("[nexus-bug] unhandled rejection:", reason.slice(0, 250));
    }
  });
}

// Wiring globale al load del DOM, indipendente da init() / auth.
// Il bottone è statico in index.html quindi può essere wirato subito; il
// check su CURRENT_USER avviene al submit, non al click.
function nexusBugWireWhenReady() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", nexusBugWire, { once: true });
  } else {
    nexusBugWire();
  }
}
nexusBugWireWhenReady();

// ── NEXUS TTS — edge-tts voce Diego (come HERMES) ────────────
// Usa la Cloud Function /nexusTts che genera audio MP3 via Microsoft Edge
// Read Aloud (pacchetto msedge-tts server-side). Molto più naturale del
// Web Speech API nativo del browser.
const NEXUS_TTS_KEY = "nexo.nexus.tts.enabled";
const NEXUS_TTS_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTts";
const NEXUS_TTS_VOICE = "it-IT-ElsaNeural";
const NEXUS_TTS_RATE = "+10%";

const nexusTts = {
  supported: typeof Audio !== "undefined", // usiamo HTMLAudioElement
  enabled: false,
  speakingBubbleId: null,
  currentAudio: null,
  abortCtrl: null,
  cache: new Map(), // in-memory: key=md5ish → objectURL (evita re-fetch rapidi)
};

function nexusTtsInit() {
  if (!nexusTts.supported) return;
  try { nexusTts.enabled = localStorage.getItem(NEXUS_TTS_KEY) === "1"; } catch {}
  nexusTtsUpdateToggle();
}

function nexusTtsUpdateToggle() {
  const btn = $("#nexusTtsToggle");
  if (!btn) return;
  if (!nexusTts.supported) { btn.hidden = true; return; }
  btn.hidden = false;
  btn.textContent = nexusTts.enabled ? "🔊" : "🔇";
  btn.setAttribute("aria-label", nexusTts.enabled ? "Disattiva lettura vocale" : "Attiva lettura vocale");
  btn.classList.toggle("active", nexusTts.enabled);
}

function nexusTtsToggle() {
  if (!nexusTts.supported) return;
  nexusTts.enabled = !nexusTts.enabled;
  try { localStorage.setItem(NEXUS_TTS_KEY, nexusTts.enabled ? "1" : "0"); } catch {}
  nexusTtsUpdateToggle();
  if (!nexusTts.enabled) {
    nexusTtsStop();
  }
}

function nexusTtsStop() {
  // Ferma audio in riproduzione + abort fetch pendenti
  if (nexusTts.currentAudio) {
    try { nexusTts.currentAudio.pause(); } catch {}
    try { nexusTts.currentAudio.src = ""; } catch {}
    nexusTts.currentAudio = null;
  }
  if (nexusTts.abortCtrl) {
    try { nexusTts.abortCtrl.abort(); } catch {}
    nexusTts.abortCtrl = null;
  }
  nexusTts.speakingBubbleId = null;
  nexusTtsUpdateStopBtn();
  nexusRenderMessages();
}

function nexusTtsUpdateStopBtn() {
  const btn = $("#nexusStopTtsBtn");
  if (!btn) return;
  const playing = !!nexusTts.speakingBubbleId;
  btn.hidden = !playing;
}

// Pulisce il testo per la lettura: rimuove markdown, emoji superflue
function nexusTtsCleanText(s) {
  return String(s || "")
    .replace(/```[\s\S]*?```/g, "")             // blocchi code
    .replace(/`([^`]+)`/g, "$1")                 // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1")           // bold
    .replace(/\*([^*]+)\*/g, "$1")               // italic
    .replace(/_([^_]+)_/g, "$1")                 // italic _
    .replace(/#{1,6}\s+/g, "")                   // heading
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")     // link [text](url)
    .replace(/[•·]/g, ".")                        // bullets
    .replace(/[\p{Extended_Pictographic}]/gu, "") // emoji
    .replace(/\s+/g, " ")
    .trim();
}

async function nexusTtsSpeak(text, bubbleId) {
  if (!nexusTts.supported) return;
  const clean = nexusTtsCleanText(text);
  if (!clean) return;

  // Ferma audio corrente
  nexusTtsStop();

  nexusTts.speakingBubbleId = bubbleId || null;
  nexusTtsUpdateStopBtn();
  nexusRenderMessages();

  try {
    // Check cache in-memory
    const cacheKey = clean.slice(0, 200);
    let audioUrl = nexusTts.cache.get(cacheKey);

    if (!audioUrl) {
      const token = await getAuthIdToken();
      if (!token) { console.warn("[TTS] no auth token"); return; }

      nexusTts.abortCtrl = new AbortController();
      const resp = await fetch(NEXUS_TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ text: clean.slice(0, 2000), voice: NEXUS_TTS_VOICE, rate: NEXUS_TTS_RATE }),
        signal: nexusTts.abortCtrl.signal,
      });
      nexusTts.abortCtrl = null;
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        console.warn(`[TTS] HTTP ${resp.status}:`, errText.slice(0, 150));
        nexusTts.speakingBubbleId = null;
        nexusRenderMessages();
        return;
      }
      const blob = await resp.blob();
      audioUrl = URL.createObjectURL(blob);
      // Cache soft (max 20 entries)
      if (nexusTts.cache.size >= 20) {
        const firstKey = nexusTts.cache.keys().next().value;
        const firstUrl = nexusTts.cache.get(firstKey);
        try { URL.revokeObjectURL(firstUrl); } catch {}
        nexusTts.cache.delete(firstKey);
      }
      nexusTts.cache.set(cacheKey, audioUrl);
    }

    // Se l'utente ha cambiato bubble/fermato mentre scaricavamo: esci
    if (nexusTts.speakingBubbleId !== bubbleId) return;

    const audio = new Audio(audioUrl);
    audio.volume = 1.0;
    nexusTts.currentAudio = audio;
    audio.addEventListener("ended", () => {
      if (nexusTts.currentAudio === audio) {
        nexusTts.currentAudio = null;
        nexusTts.speakingBubbleId = null;
        nexusRenderMessages();
      }
    });
    audio.addEventListener("error", (e) => {
      console.warn("[TTS] audio error:", e);
      nexusTts.currentAudio = null;
      nexusTts.speakingBubbleId = null;
      nexusRenderMessages();
    });
    await audio.play();
  } catch (e) {
    if (e.name !== "AbortError") console.warn("[TTS] speak failed:", e);
    nexusTts.speakingBubbleId = null;
    nexusRenderMessages();
  }
}

let _lastAutoSpokenId = null;
function nexusTtsMaybeAutoSpeak() {
  if (!nexusTts.enabled || !nexusTts.supported) return;
  if (!NEXUS_MESSAGES.length) return;
  const last = NEXUS_MESSAGES[NEXUS_MESSAGES.length - 1];
  if (!last || last.role !== "assistant" || !last.id || last._local) return;
  if (last.id === _lastAutoSpokenId) return;
  _lastAutoSpokenId = last.id;
  nexusTtsSpeak(last.content, last.id);
}

function nexusRenderMessages() {
  const root = $("#nexusMessages");
  if (!root) return;
  if (!NEXUS_MESSAGES.length && !NEXUS_PENDING) {
    root.innerHTML = `
      <div class="nexus-empty">
        Ciao. Sono NEXUS, la tua interfaccia verso i Colleghi NEXO.<br>
        Scrivimi cosa ti serve e decido io chi deve gestirla.
        <div class="examples">
          ${NEXUS_EXAMPLES.map(e => `<button class="nexus-example" data-nexus-example="${escapeHtml(e)}">${escapeHtml(e)}</button>`).join("")}
        </div>
      </div>
    `;
    $$("[data-nexus-example]", root).forEach(btn => {
      btn.addEventListener("click", () => {
        $("#nexusInput").value = btn.dataset.nexusExample;
        nexusSend();
      });
    });
    return;
  }
  // Costruisci HTML con date badges + consecutive grouping
  const html = [];
  let lastDateKey = null;
  let lastRole = null;
  // Preserva lo scroll-down button come primo child
  const scrollDownEl = $("#nexusScrollDown", root);
  for (let i = 0; i < NEXUS_MESSAGES.length; i++) {
    const m = NEXUS_MESSAGES[i];
    // Date badge
    const dateKey = nexusDateKey(m.timestamp);
    if (dateKey && dateKey !== lastDateKey) {
      html.push(`<div class="nexus-date-badge">${nexusDateLabel(m.timestamp)}</div>`);
      lastDateKey = dateKey;
      lastRole = null; // reset consecutive dopo date badge
    }
    const consecutive = m.role === lastRole;
    html.push(nexusRenderBubble(m, consecutive));
    lastRole = m.role;
  }
  if (NEXUS_PENDING) {
    html.push(`<div class="nexus-typing"><span></span><span></span><span></span></div>`);
  }
  root.innerHTML = html.join("");
  // Re-inject scroll-down
  if (scrollDownEl) root.appendChild(scrollDownEl);
  else {
    const sd = document.createElement("button");
    sd.id = "nexusScrollDown";
    sd.className = "nexus-scroll-down";
    sd.setAttribute("aria-label", "Vai in fondo");
    sd.textContent = "↓";
    sd.addEventListener("click", () => nexusScrollToBottom(true));
    root.appendChild(sd);
  }

  // Header typing state
  const header = $("#nexusHeader");
  const status = $("#nexusStatus");
  if (header && status) {
    if (NEXUS_PENDING) {
      header.classList.add("is-typing");
      status.textContent = "sta scrivendo";
    } else {
      header.classList.remove("is-typing");
      status.textContent = "online";
    }
  }

  // Wire replay-TTS per ogni bolla assistant
  $$(".nexus-bubble-speak", root).forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const bubbleEl = btn.closest(".nexus-bubble");
      const id = bubbleEl?.dataset?.bubbleId;
      const msg = NEXUS_MESSAGES.find(m => m.id === id);
      if (msg) nexusTtsSpeak(msg.content, msg.id);
    });
  });
  // auto-scroll al fondo se siamo già in fondo (o nuovo messaggio user)
  const lastMsg = NEXUS_MESSAGES[NEXUS_MESSAGES.length - 1];
  const nearBottom = (root.scrollHeight - root.scrollTop - root.clientHeight) < 150;
  if (nearBottom || (lastMsg && lastMsg.role === "user")) {
    requestAnimationFrame(() => nexusScrollToBottom(false));
  } else {
    nexusUpdateScrollDownVisibility();
  }
  // Auto-speak ultimo messaggio se TTS attivo
  nexusTtsMaybeAutoSpeak();
}

function nexusScrollToBottom(smooth) {
  const root = $("#nexusMessages");
  if (!root) return;
  if (smooth) root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
  else root.scrollTop = root.scrollHeight;
  setTimeout(nexusUpdateScrollDownVisibility, 200);
}

function nexusUpdateScrollDownVisibility() {
  const root = $("#nexusMessages");
  const btn = $("#nexusScrollDown", root);
  if (!root || !btn) return;
  const fromBottom = root.scrollHeight - root.scrollTop - root.clientHeight;
  btn.classList.toggle("show", fromBottom > 200);
}

function nexusDateKey(ts) {
  if (!ts) return null;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  } catch { return null; }
}

function nexusDateLabel(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    if (sameDay) return "Oggi";
    if (isYesterday) return "Ieri";
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  } catch { return ""; }
}

function nexusBubbleTime(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// Escape HTML + autolink degli URL: trasforma "https://..." in <a href>
// cliccabili nel pannello chat. Sicuro: l'URL stesso passa per escapeHtml
// (no XSS) prima di essere usato come href + label.
function escapeHtmlAndAutolink(text) {
  if (text == null) return "";
  // 1. Escape HTML una sola volta
  const esc = escapeHtml(String(text));
  // 2. Sostituisci gli URL trovati nella stringa già escapata. La regex
  //    funziona ancora perché ":/." non vengono toccati da escapeHtml.
  //    Pattern URL: http(s):// + qualsiasi non-spazio fino a una punteggiatura
  //    finale comune. Esclude "<>"' che non possono comparire in un href
  //    sicuro perché sono già stati escapati.
  return esc.replace(
    /(https?:\/\/[^\s<>"']+?)(?=[.,;:!?)\]]?(?:\s|$))/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener" style="color:#006eb7;word-break:break-all;text-decoration:underline;">${url}</a>`
  );
}

function nexusRenderBubble(m, consecutive) {
  const isForge = m.source === "forge";
  const meta = [];
  if (isForge) {
    meta.push(`<span class="nexus-badge-col nexus-badge-forge">forge</span>`);
  } else if (m.collegaCoinvolto && m.collegaCoinvolto !== "nessuno" && m.collegaCoinvolto !== "multi" && m.collegaCoinvolto !== "forge") {
    meta.push(`<span class="nexus-badge-col">${escapeHtml(m.collegaCoinvolto.toLowerCase())}</span>`);
  }
  if (m.stato && m.role === "assistant" && m.stato !== "diretta") {
    const label = ({
      in_attesa_collega: "in attesa",
      completata: "completata",
      collega_inattivo: "collega non ancora attivo",
      timeout: "timeout",
      errore: "errore",
    })[m.stato] || m.stato;
    meta.push(`<span class="nexus-badge-stato ${escapeHtml(m.stato)}">${escapeHtml(label)}</span>`);
  }
  const isSpeaking = m.role === "assistant" && nexusTts.speakingBubbleId && m.id === nexusTts.speakingBubbleId;
  const speakBtn = (m.role === "assistant" && nexusTts.supported && m.id && !m._local)
    ? `<button class="nexus-bubble-speak" aria-label="Rileggi ad alta voce" title="Rileggi">🔊</button>`
    : "";
  const waveIndicator = isSpeaking
    ? `<span class="nexus-bubble-wave" aria-hidden="true"><span></span><span></span><span></span><span></span></span>`
    : "";
  const timeHtml = m.timestamp ? `<span class="time">${escapeHtml(nexusBubbleTime(m.timestamp))}</span>` : "";
  const forgeClass = isForge ? "forge" : "";
  const forgePrefix = isForge ? `<span class="nexus-bubble-forge-tag" aria-hidden="true">🔧 FORGE</span> ` : "";
  return `
    <div class="nexus-bubble ${escapeHtml(m.role)} ${forgeClass} ${consecutive ? "consecutive" : ""} ${isSpeaking ? "is-speaking" : ""}" data-bubble-id="${escapeHtml(m.id || "")}">
      ${forgePrefix}${escapeHtmlAndAutolink(m.content)}${timeHtml}
      ${waveIndicator}
      ${(meta.length || speakBtn) ? `<div class="nexus-bubble-meta">${meta.join("")}${speakBtn}</div>` : ""}
    </div>
  `;
}

async function nexusSend() {
  if (NEXUS_PENDING) return;
  const input = $("#nexusInput");
  const text = (input.value || "").trim();
  if (!text) return;
  input.value = "";
  nexusAutoResize();
  NEXUS_PENDING = true;
  nexusRenderMessages();

  // Costruisco history (ultimi 10 dalla lista corrente).
  const history = NEXUS_MESSAGES
    .filter(m => !m._local && (m.role === "user" || m.role === "assistant"))
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content }));

  try {
    const idToken = await getAuthIdToken();
    const headers = { "Content-Type": "application/json" };
    if (idToken) headers["Authorization"] = "Bearer " + idToken;
    const resp = await fetch(NEXUS_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionId: NEXUS_SESSION_ID,
        userMessage: text,
        userId: (CURRENT_USER && CURRENT_USER.email) || "alberto",
        history,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`${resp.status}: ${errText.slice(0, 200)}`);
    }
    // onSnapshot mostrerà i doc appena scritti; non serve merge manuale.
    await resp.json();
  } catch (err) {
    console.error("[nexus] send failed:", err);
    NEXUS_MESSAGES.push({
      id: "err_" + Date.now(),
      role: "assistant",
      content: "Errore di rete con NEXUS. Riprova tra un momento.",
      stato: "errore",
      timestamp: new Date(),
      _local: true,
    });
  } finally {
    NEXUS_PENDING = false;
    nexusRenderMessages();
  }
}

function nexusAutoResize() {
  const el = $("#nexusInput");
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(120, el.scrollHeight) + "px";
}

// ── Upload audio chiamata → trascrizione via Cloud Function ─────
const NEXUS_AUDIO_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTranscribeAudio";
const NEXUS_AUDIO_MAX_MB = 25;

async function nexusUploadAudio(file) {
  if (!file) return;
  if (file.size > NEXUS_AUDIO_MAX_MB * 1024 * 1024) {
    alert(`Audio troppo grande (max ${NEXUS_AUDIO_MAX_MB}MB). Dimensione: ${Math.round(file.size/1024/1024)}MB.`);
    return;
  }
  const token = await getAuthIdToken();
  if (!token) { alert("Sessione scaduta, rifai login."); return; }

  // Mostra messaggio "sto trascrivendo..."
  const localMsgId = "audio_" + Date.now();
  NEXUS_MESSAGES.push({
    id: localMsgId,
    role: "user",
    content: `📞 Upload audio: ${file.name} (${(file.size/1024/1024).toFixed(1)}MB). Attendo trascrizione…`,
    timestamp: new Date(),
    _local: true,
  });
  NEXUS_PENDING = true;
  nexusRenderMessages();

  try {
    const resp = await fetch(NEXUS_AUDIO_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": file.type || "audio/mpeg",
        "X-File-Name": file.name || "audio.mp3",
        "X-Session-Id": NEXUS_SESSION_ID,
      },
      body: file,
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || !data.ok) {
      const errText = data.message || data.error || `HTTP ${resp.status}`;
      NEXUS_MESSAGES.push({
        id: "err_" + Date.now(),
        role: "assistant",
        content: `❌ Trascrizione fallita: ${errText}`,
        stato: "errore",
        timestamp: new Date(),
        _local: true,
      });
    } else {
      NEXUS_MESSAGES.push({
        id: "audio_result_" + Date.now(),
        role: "assistant",
        content: data.formatted || data.text || "Trascrizione ricevuta.",
        collegaCoinvolto: "nexus",
        stato: "completata",
        timestamp: new Date(),
        _local: true,
      });
    }
  } catch (err) {
    console.error("[audio] upload failed:", err);
    NEXUS_MESSAGES.push({
      id: "err_" + Date.now(),
      role: "assistant",
      content: `❌ Errore upload audio: ${err.message || err}`,
      stato: "errore",
      timestamp: new Date(),
      _local: true,
    });
  } finally {
    NEXUS_PENDING = false;
    nexusRenderMessages();
  }
}

// ── Voice input — modalità CONVERSAZIONE CONTINUA (come telefonata) ──
// Flow:
//   - Alberto tocca 🎤 → parte il riconoscimento continuo
//   - Rileva silenzio 1.5s → auto-invia il messaggio
//   - Durante TTS di NEXUS → mic in pausa (non cattura la voce di NEXUS)
//   - TTS finisce → mic riparte automaticamente (loop conversazione)
//   - "stop"/"basta" detto → esce dalla modalità
//   - Tocca 🎤 di nuovo → esce dalla modalità
//
// Indicatori:
//   - Listening: 🔴 pulsante + "ti ascolto..."
//   - Pausa (TTS): 🔵 + "sta parlando..."
//   - Idle (tra turni): 🟢 + "pronto"
const NEXUS_SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const nexusVoice = {
  recognition: null,
  active: false,         // modalità conversazione attiva
  listening: false,      // microfono in ascolto ora
  interimText: "",
  finalText: "",
  silenceTimer: null,
  paused: false,         // true quando NEXUS sta parlando
};
const NEXUS_VOICE_SILENCE_MS = 1500; // 1.5s di silenzio → auto-invio
const NEXUS_VOICE_STOP_WORDS = /\b(stop|basta|zitto|fermati|fine)\b/i;

function nexusVoiceSupported() { return !!NEXUS_SR; }

function nexusSetVoiceStatus(msg, variant = "") {
  const el = $("#nexusVoiceStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "nexus-voice-status" + (variant ? " " + variant : "");
}

function nexusSetMicState(state) {
  // state: "listening" | "speaking" | "idle" | "off"
  const btn = $("#nexusMicBtn");
  if (btn) {
    btn.classList.remove("recording", "speaking", "idle");
    if (state === "listening") btn.classList.add("recording");
    if (state === "speaking") btn.classList.add("speaking");
    if (state === "idle") btn.classList.add("idle");
  }
  if (state === "listening") nexusSetVoiceStatus("🔴 ti ascolto…", "recording");
  else if (state === "speaking") nexusSetVoiceStatus("🔵 sta parlando…", "speaking");
  else if (state === "idle") nexusSetVoiceStatus("🟢 pronto, parla pure", "idle");
  else nexusSetVoiceStatus("");
}

function nexusScheduleAutoSend() {
  if (nexusVoice.silenceTimer) clearTimeout(nexusVoice.silenceTimer);
  nexusVoice.silenceTimer = setTimeout(() => {
    const ta = $("#nexusInput");
    const text = (nexusVoice.finalText + " " + nexusVoice.interimText).trim();
    if (!text || NEXUS_PENDING) return;
    // Check stop words
    if (NEXUS_VOICE_STOP_WORDS.test(text)) {
      nexusVoiceStop();
      return;
    }
    // Invia
    if (ta) ta.value = text;
    nexusVoice.finalText = "";
    nexusVoice.interimText = "";
    // Pausa mic durante invio/TTS
    nexusVoicePause();
    nexusSend();
  }, NEXUS_VOICE_SILENCE_MS);
}

// Pre-flight permesso microfono via getUserMedia: dà feedback chiaro
// (permesso negato / nessun device / errore generico) senza dover
// aspettare l'errore tardivo da SpeechRecognition.
async function nexusPreflightMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { ok: false, reason: "no-mediadevices", msg: "Il browser non espone l'accesso al microfono. Usa Chrome o Edge." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try { stream.getTracks().forEach(t => t.stop()); } catch {}
    try { sessionStorage.setItem("nexo.mic.granted", "1"); } catch {}
    return { ok: true };
  } catch (e) {
    const name = String(e && e.name || "");
    if (/NotAllowed|SecurityError/i.test(name)) {
      return { ok: false, reason: "denied", msg: "Permetti l'accesso al microfono nelle impostazioni del browser." };
    }
    if (/NotFound|Devices/i.test(name) || /audio-capture/i.test(String(e))) {
      return { ok: false, reason: "no-device", msg: "Nessun microfono rilevato sul dispositivo." };
    }
    return { ok: false, reason: "other", msg: "Microfono non disponibile: " + (e.message || name || "errore") };
  }
}

async function nexusVoiceStart() {
  if (!nexusVoiceSupported()) {
    // Importante: nexusSetMicState("off") chiama nexusSetVoiceStatus("")
    // che azzera il msg → fai prima setMicState, POI setVoiceStatus.
    nexusSetMicState("off");
    nexusSetVoiceStatus("Usa Chrome o Edge per la dettatura vocale.", "error");
    return;
  }
  if (nexusVoice.active) return;
  // Pre-flight permesso (skip se già concesso in questa sessione)
  let granted = false;
  try { granted = sessionStorage.getItem("nexo.mic.granted") === "1"; } catch {}
  if (!granted) {
    nexusSetVoiceStatus("Controllo microfono…");
    const pre = await nexusPreflightMic();
    if (!pre.ok) {
      nexusSetMicState("off");
      nexusSetVoiceStatus(pre.msg, "error");
      console.warn("[nexus-voice] preflight failed:", pre.reason);
      return;
    }
  }
  nexusVoice.active = true;
  nexusVoice.finalText = ($("#nexusInput").value || "").trim();
  if (nexusVoice.finalText) nexusVoice.finalText += " ";
  nexusVoice.interimText = "";
  nexusVoiceResume();
}

function nexusVoiceResume() {
  if (!nexusVoice.active || nexusVoice.listening) return;
  nexusVoice.paused = false;
  try {
    const rec = new NEXUS_SR();
    rec.lang = "it-IT";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => {
      nexusVoice.listening = true;
      nexusSetMicState("listening");
    };
    rec.onresult = (ev) => {
      let interim = "", finalChunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalChunk) nexusVoice.finalText = (nexusVoice.finalText + " " + finalChunk).trim() + " ";
      nexusVoice.interimText = interim.trim();
      const ta = $("#nexusInput");
      if (ta) {
        ta.value = (nexusVoice.finalText + nexusVoice.interimText).trim();
        nexusAutoResize();
      }
      nexusScheduleAutoSend();
    };
    rec.onerror = (ev) => {
      const err = ev.error || "unknown";
      if (err === "no-speech" && nexusVoice.active && !nexusVoice.paused) {
        // Non uscire dalla modalità: ri-avvia
        setTimeout(() => { nexusVoice.listening = false; nexusVoiceResume(); }, 300);
        return;
      }
      if (err !== "aborted") {
        const map = {
          "not-allowed": "Permetti l'accesso al microfono nelle impostazioni del browser.",
          "service-not-allowed": "Permetti l'accesso al microfono nelle impostazioni del browser.",
          "audio-capture": "Nessun microfono rilevato sul dispositivo.",
          "network": "Errore di rete: la dettatura richiede connessione.",
          "language-not-supported": "Lingua non supportata.",
        };
        nexusSetVoiceStatus(map[err] || ("Errore microfono: " + err), "error");
        try { sessionStorage.removeItem("nexo.mic.granted"); } catch {}
        nexusVoiceStop();
      }
    };
    rec.onend = () => {
      nexusVoice.listening = false;
      if (nexusVoice.active && !nexusVoice.paused) {
        // Ri-avvia in modalità continua (il browser chiude periodicamente SR)
        setTimeout(() => nexusVoiceResume(), 200);
      }
    };
    nexusVoice.recognition = rec;
    rec.start();
  } catch (e) {
    nexusSetVoiceStatus("Impossibile avviare: " + (e.message || e), "error");
    nexusVoice.active = false;
    nexusSetMicState("off");
  }
}

function nexusVoicePause() {
  // Chiude il mic (per evitare di sentire NEXUS che parla)
  nexusVoice.paused = true;
  nexusSetMicState("speaking");
  if (nexusVoice.silenceTimer) { clearTimeout(nexusVoice.silenceTimer); nexusVoice.silenceTimer = null; }
  const rec = nexusVoice.recognition;
  if (rec) { try { rec.stop(); } catch { try { rec.abort(); } catch {} } }
}

function nexusVoiceStop() {
  nexusVoice.active = false;
  nexusVoice.paused = false;
  nexusVoice.listening = false;
  nexusVoice.finalText = "";
  nexusVoice.interimText = "";
  if (nexusVoice.silenceTimer) { clearTimeout(nexusVoice.silenceTimer); nexusVoice.silenceTimer = null; }
  const rec = nexusVoice.recognition;
  nexusVoice.recognition = null;
  if (rec) { try { rec.abort(); } catch {} }
  nexusSetMicState("off");
}

function nexusToggleVoice() {
  if (nexusVoice.active) nexusVoiceStop();
  else nexusVoiceStart().catch(e => console.warn("[nexus-voice] start failed:", e));
}

// Wire del bottone microfono indipendente da init() / auth.
// Il bottone è SEMPRE visibile: se SR non è supportato, il click mostra
// un messaggio chiaro ("Usa Chrome o Edge..."). Pattern identico a
// nexusBugWireWhenReady (evita classi di bug "wire dipende da init").
function nexusMicWireWhenReady() {
  const wire = () => {
    const mic = document.getElementById("nexusMicBtn");
    if (!mic || mic._nexusMicWired) return;
    mic._nexusMicWired = true;
    mic.hidden = false; // SEMPRE visibile
    if (!nexusVoiceSupported()) {
      mic.classList.add("nexus-btn-disabled");
      mic.title = "Usa Chrome o Edge per la dettatura vocale";
    }
    mic.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      console.log("[nexus-voice] click mic — supported:", nexusVoiceSupported(), "ua:", navigator.userAgent.slice(0, 80));
      nexusToggleVoice();
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
  else wire();
}
nexusMicWireWhenReady();

// Hook: quando TTS finisce di parlare, riattiva mic se modalità continua attiva.
// Aggancio: sovrascrivo il callback di fine TTS in nexusTts (patch runtime).
if (typeof window !== "undefined") {
  // Polling semplice: ogni 400ms controlla se TTS audio finito e riattiva mic
  setInterval(() => {
    if (!nexusVoice.active) return;
    if (nexusVoice.paused) {
      // Se TTS non sta più riproducendo audio e no invio pending → riattiva
      const audioPlaying = nexusTts.currentAudio && !nexusTts.currentAudio.paused && !nexusTts.currentAudio.ended;
      if (!audioPlaying && !NEXUS_PENDING && !nexusVoice.listening) {
        nexusVoice.paused = false;
        nexusSetMicState("idle");
        nexusVoiceResume();
      }
    }
  }, 400);
}

// Mantieni compatibilità con il vecchio nome
function nexusStartVoice() { nexusVoiceStart(); }
function nexusStopVoice()  { nexusVoiceStop();  }

function nexusWire() {
  $("#nexusFab").addEventListener("click", nexusOpen);
  $("#nexusClose").addEventListener("click", nexusClose);
  $("#nexusFullscreenBtn")?.addEventListener("click", nexusFullscreenToggle);
  // Stop TTS: bottone dedicato + tap sull'area messaggi interrompe
  $("#nexusStopTtsBtn")?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (nexusTts.supported) nexusTtsStop();
  });
  $("#nexusMessages")?.addEventListener("click", () => {
    if (nexusTts.supported && nexusTts.speakingBubbleId) nexusTtsStop();
  });
  // Qualsiasi tasto interrompe TTS (ma non interferisce con digitazione nell'input)
  document.addEventListener("keydown", (ev) => {
    if (!nexusTts.supported || !nexusTts.speakingBubbleId) return;
    // Non interrompere se l'utente sta digitando nell'input della chat
    if (ev.target && ev.target.id === "nexusInput") return;
    nexusTtsStop();
  });
  $("#nexusClearBtn")?.addEventListener("click", nexusClear);
  nexusBugWire();
  $("#nexusSendBtn").addEventListener("click", nexusSend);
  // Il bottone mic è wirato in nexusMicWireWhenReady() su DOMContentLoaded
  // (sempre visibile, gestisce browser non supportato con feedback chiaro).
  // Qui non aggiungiamo nulla per evitare doppio listener.
  // TTS toggle
  nexusTtsInit();
  $("#nexusTtsToggle")?.addEventListener("click", nexusTtsToggle);
  // Upload audio chiamate (📎 allegato)
  $("#nexusAudioBtn")?.addEventListener("click", () => $("#nexusAudioFile")?.click());
  // Scroll-to-bottom FAB
  $("#nexusMessages")?.addEventListener("scroll", nexusUpdateScrollDownVisibility);
  $("#nexusScrollDown")?.addEventListener("click", () => nexusScrollToBottom(true));
  $("#nexusAudioFile")?.addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (f) nexusUploadAudio(f).catch(e => console.warn("[audio] upload failed:", e));
    ev.target.value = ""; // reset per consentire re-upload stesso file
  });
  const input = $("#nexusInput");
  input.addEventListener("input", nexusAutoResize);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      nexusSend();
    }
  });
  // ESC: prima esce dal fullscreen (se attivo), poi chiude il pannello
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const panel = $("#nexusPanel");
    if (!panel || !panel.classList.contains("open")) return;
    if (panel.classList.contains("fullscreen")) {
      panel.classList.remove("fullscreen");
      nexusUpdateFullscreenBtn();
    } else {
      nexusClose();
    }
  });
}

// ── Sidebar toggle nascondibile (desktop) ────────────────────
const SIDEBAR_HIDDEN_KEY = "nexo.sidebar.hidden";
function nexoSetSidebarHidden(hidden) {
  const app = document.querySelector(".app");
  if (!app) return;
  app.classList.toggle("sidebar-hidden", !!hidden);
  try { localStorage.setItem(SIDEBAR_HIDDEN_KEY, hidden ? "1" : "0"); } catch {}
}
function nexoToggleSidebar() {
  const app = document.querySelector(".app");
  if (!app) return;
  nexoSetSidebarHidden(!app.classList.contains("sidebar-hidden"));
}

// ── Bootstrap ──────────────────────────────────────────────────
function init() {
  renderSidebarNav();
  $("#menuBtn")?.addEventListener("click", () => {
    $("#sidebar").classList.toggle("collapsed");
  });
  // Desktop: toggle hide/show sidebar
  $("#sidebarHideBtn")?.addEventListener("click", nexoToggleSidebar);
  $("#sidebarShowBtn")?.addEventListener("click", nexoToggleSidebar);
  // Ripristina stato da localStorage (solo desktop)
  if (window.innerWidth > 760) {
    try {
      const wasHidden = localStorage.getItem(SIDEBAR_HIDDEN_KEY) === "1";
      if (wasHidden) nexoSetSidebarHidden(true);
    } catch {}
  }
  if (window.innerWidth > 760) $("#sidebar").classList.remove("collapsed");

  const initialRoute = location.hash.replace(/^#/, "") || "home";
  navigate(initialRoute, { push: false });

  // NEXUS chat
  nexusWire();
  nexusRenderMessages();
  nexusEnsureSubscribed();

  // Segnala bug — toglie hidden al bottone (i listener sono già wirati allo startup)
  const _rbBtn = document.getElementById("reportBugBtn");
  if (_rbBtn) _rbBtn.hidden = false;

  // Service Worker per Web Share Target (Android)
  registerShareTargetSw();

  // Share dall'estensione Chrome / Web Share API / Share Target Android
  // Supporta ?share=<testo> (Chrome ext) e ?sharedAt=<ts> (SW Share Target)
  handleShareIntent();

  // Hash routing: #nexus/bozza/<id> apre chat + prepara messaggio "apri preventivo ID"
  const hashPreventivo = /^#?nexus\/bozza\/(.+)$/.exec(location.hash);
  if (hashPreventivo) {
    const bozzaId = hashPreventivo[1].slice(0, 50);
    setTimeout(() => {
      nexusOpen();
      requestAnimationFrame(() => {
        const input = $("#nexusInput");
        if (input) {
          input.value = `apri preventivo ${bozzaId}`;
          input.focus();
        }
      });
    }, 800);
  }

  // FCM push notifications — DISABILITATO finché la VAPID key non è configurata
  // (attualmente in FCM_VAPID_KEY c'è un placeholder che genera 401 da FCM).
  // Per riattivare: prendere VAPID key reale da Firebase Console →
  // Project settings → Cloud Messaging → Web Push certificates
  // e sostituirla in FCM_VAPID_KEY, poi togliere il commento sotto.
  // setTimeout(() => { setupFcmPush().catch(e => console.warn("[FCM] setup failed:", e)); }, 1500);

  // Logout button
  $("#logoutBtn")?.addEventListener("click", async () => {
    try {
      const { auth, authMod } = await getAcgAuth();
      await authMod.signOut(auth);
      location.reload();
    } catch (e) {
      console.error("Logout failed:", e);
    }
  });
}

// ── Share intent (Chrome ext + Web Share Target Android) ───
// Supporta:
//  - ?share=<testo>&openNexus=1&source=<whatsapp|selection|shortcut>  (Chrome ext)
//  - ?sharedAt=<timestamp>   (Web Share Target — il SW salva payload in IDB/CacheStorage)
function handleShareIntent() {
  try {
    const params = new URLSearchParams(location.search);
    const shareText = params.get("share");
    const openNexus = params.get("openNexus");
    const source = params.get("source") || "";
    const sharedAt = params.get("sharedAt");

    // ── Caso A: share da Chrome extension (testo inline) ──
    if (shareText || openNexus === "1") {
      params.delete("share");
      params.delete("openNexus");
      params.delete("source");
      const qs = params.toString();
      history.replaceState({}, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);

      nexusOpen();
      if (shareText && shareText.trim()) {
        requestAnimationFrame(() => {
          const input = $("#nexusInput");
          if (!input) return;
          const prefix = source === "whatsapp"
            ? "Analizza questo messaggio WhatsApp:\n\n"
            : source === "selection" || source === "shortcut"
              ? "Analizza questo testo:\n\n"
              : "";
          input.value = prefix + String(shareText).slice(0, 3000);
          input.focus();
          nexusAutoResize();
        });
      }
      return;
    }

    // ── Caso B: share da Web Share Target (Android) ──
    if (sharedAt) {
      params.delete("sharedAt");
      const qs = params.toString();
      history.replaceState({}, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
      nexusOpen();
      consumeSharedPayload(sharedAt).catch(e => console.warn("[share] consume failed:", e));
      return;
    }
  } catch (e) {
    console.warn("[share] handleShareIntent failed", e);
  }
}

// Legge il payload dal SW (IDB meta + Cache Storage file) e lo invia a NEXUS
async function consumeSharedPayload(sharedAt) {
  const meta = await idbGet("shares", String(sharedAt));
  if (!meta) {
    console.warn("[share] nessun payload per sharedAt", sharedAt);
    return;
  }

  // Caso 1: testo puro (title + text + url)
  if (!meta.hasFile) {
    const combined = [meta.title, meta.text, meta.url].filter(Boolean).join("\n\n").slice(0, 5000);
    requestAnimationFrame(() => {
      const input = $("#nexusInput");
      if (input && combined) {
        input.value = `📱 Messaggio condiviso:\n\n${combined}\n\nAnalizzo?`;
        input.focus();
        nexusAutoResize();
      }
    });
    return;
  }

  // Caso 2: file (audio/image/pdf/text)
  const fakeUrl = `/nexo-shared-file/${sharedAt}`;
  const cache = await caches.open("nexo-share-v1").catch(() => null);
  const resp = cache ? await cache.match(fakeUrl) : null;
  if (!resp) {
    alert("File condiviso non trovato (cache miss).");
    return;
  }
  const blob = await resp.blob();
  const file = new File([blob], meta.fileName || "condiviso", { type: meta.fileType || blob.type });

  if (/^audio\//.test(file.type)) {
    // Audio → upload a transcribe
    requestAnimationFrame(() => {
      const input = $("#nexusInput");
      if (input) input.value = `Audio ricevuto: ${file.name} (${Math.round(file.size/1024)}KB). Trascrivo...`;
      nexusAutoResize();
    });
    nexusUploadAudio(file).catch(e => console.warn("[share] audio upload:", e));
  } else if (/^image\//.test(file.type)) {
    requestAnimationFrame(() => {
      const input = $("#nexusInput");
      if (input) input.value = `Immagine ricevuta: ${file.name} (${Math.round(file.size/1024)}KB).\n\nCosa vuoi che faccia con quest'immagine?`;
      nexusAutoResize();
    });
  } else if (file.type === "application/pdf") {
    requestAnimationFrame(() => {
      const input = $("#nexusInput");
      if (input) input.value = `PDF ricevuto: ${file.name} (${Math.round(file.size/1024)}KB).\n\nCosa vuoi che faccia con questo PDF?`;
      nexusAutoResize();
    });
  } else {
    // Testo/altro: leggi come testo
    const text = await blob.text().catch(() => "");
    const clipped = text.slice(0, 3000);
    requestAnimationFrame(() => {
      const input = $("#nexusInput");
      if (input) input.value = `File ricevuto: ${file.name}\n\n${clipped}`;
      nexusAutoResize();
    });
  }
}

// Mini IDB helper (legge)
function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nexo-shares", 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(store)) d.createObjectStore(store);
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(store, "readonly");
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    };
    req.onerror = () => reject(req.error);
  });
}

// Registra il Service Worker principale (sw.js) per Web Share Target
async function registerShareTargetSw() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) { console.warn("[SW] share-target register failed:", e); }
}

// ── FCM Push notifications ─────────────────────────────────────
// VAPID public key del progetto nexo-hub-15f2d (Firebase Console → Cloud Messaging → Web Push certificates)
const FCM_VAPID_KEY = "BLRC0L_2KdpB_xJJAm1YvxZU-y4WMcPFLbNXt-LLR_HoYPUxpzYN_-yCE_LUGElUuiBNWbJxPTLm7iH_SimDpd4";

let _messagingCache = null;
async function getMessaging() {
  if (_messagingCache) return _messagingCache;
  try {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    const msgMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js");
    let app;
    try { app = appMod.getApp(); } catch { app = appMod.initializeApp(FIREBASE_CONFIG); }
    const messaging = msgMod.getMessaging(app);
    _messagingCache = { messaging, msgMod };
    return _messagingCache;
  } catch (e) {
    console.warn("[FCM] messaging load failed:", e);
    return null;
  }
}

async function setupFcmPush() {
  if (!("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window)) {
    console.info("[FCM] browser non supporta push");
    return;
  }
  if (!CURRENT_USER) return;

  // 1. Registra Service Worker FCM (scope root)
  let swReg;
  try {
    swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
  } catch (e) {
    console.warn("[FCM] SW register failed:", e);
    return;
  }

  // 2. Chiedi permesso notifiche (se non già concesso/negato)
  let permission = Notification.permission;
  if (permission === "default") {
    try { permission = await Notification.requestPermission(); } catch (e) { console.warn("[FCM] permission request failed:", e); }
  }
  if (permission !== "granted") {
    console.info("[FCM] permesso notifiche:", permission);
    return;
  }

  // 3. Ottieni FCM token
  const mod = await getMessaging();
  if (!mod) return;
  const { messaging, msgMod } = mod;
  let token;
  try {
    token = await msgMod.getToken(messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: swReg });
  } catch (e) {
    console.warn("[FCM] getToken failed:", e);
    return;
  }
  if (!token) { console.info("[FCM] nessun token ottenuto"); return; }
  console.info("[FCM] token ottenuto:", token.slice(0, 20) + "…");

  // 4. Salva token in Firestore (nexo_config/fcm_tokens con map userId→token)
  try {
    const { db, fsMod } = await getFirestore();
    const userId = CURRENT_USER.email || CURRENT_USER.uid || "alberto";
    const userKey = userId.replace(/[^a-zA-Z0-9._-]/g, "_");
    const tokenDocRef = fsMod.doc(db, "nexo_config", "fcm_tokens");
    await fsMod.setDoc(tokenDocRef, {
      [userKey]: {
        token,
        userAgent: navigator.userAgent.slice(0, 200),
        updatedAt: fsMod.serverTimestamp(),
      },
    }, { merge: true });
    console.info("[FCM] token salvato per", userKey);
  } catch (e) {
    console.warn("[FCM] Firestore write failed (rules?):", e);
  }

  // 5. Listener foreground: mostra notifica in-app se PWA aperta
  try {
    msgMod.onMessage(messaging, (payload) => {
      console.info("[FCM] foreground message:", payload);
      const n = payload.notification || {};
      // Mostra badge nexus se è una notifica workflow
      if (n.title) {
        try {
          new Notification(n.title, { body: n.body || "", icon: "/icon-192.png", data: payload.data || {} });
        } catch {}
      }
    });
  } catch (e) { console.warn("[FCM] onMessage setup failed:", e); }
}

// ── Auth gate flow ─────────────────────────────────────────────
async function bootstrapAuth() {
  const { auth, authMod } = await getAcgAuth();

  // 1. Prova SSO via URL (?authToken=...)
  const urlParams = new URLSearchParams(location.search);
  const ssoToken = urlParams.get("authToken");
  if (ssoToken) {
    // Rimuovi subito token dall'URL (sicurezza)
    const clean = location.pathname + location.hash;
    history.replaceState({}, "", clean);
    try {
      // Mostra spinner nella card login
      const errEl = $("#authError");
      if (errEl) errEl.innerHTML = '<span class="auth-spinner"></span>Accesso SSO in corso…';
      await authMod.signInWithCustomToken(auth, ssoToken);
      // onAuthStateChanged triggererà il resto
    } catch (e) {
      console.warn("SSO failed:", e);
      if ($("#authError")) $("#authError").textContent = "SSO fallito: " + (e.message || "token non valido");
    }
  }

  // 2. Listener stato auth
  authMod.onAuthStateChanged(auth, (user) => {
    if (user) {
      CURRENT_USER = user;
      // Nascondi gate, mostra app
      $("#authGate")?.setAttribute("hidden", "");
      $("#appRoot")?.removeAttribute("hidden");
      const footer = $("#footerUser");
      if (footer) footer.textContent = user.email || user.uid;
      // Init solo una volta
      if (!window._nexoInited) {
        window._nexoInited = true;
        init();
      }
    } else {
      CURRENT_USER = null;
      $("#authGate")?.removeAttribute("hidden");
      $("#appRoot")?.setAttribute("hidden", "");
    }
  });

  // 3. Form login
  const form = $("#authForm");
  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value;
    const btn = $("#authBtn");
    const err = $("#authError");
    if (err) err.textContent = "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spinner"></span>Accesso…'; }
    try {
      await authMod.signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      const msg = (e && e.code) ? e.code.replace("auth/", "").replace(/-/g, " ") : String(e.message || e);
      if (err) err.textContent = "Errore: " + msg;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Accedi"; }
    }
  });
}

bootstrapAuth().catch(e => {
  console.error("bootstrapAuth failed:", e);
  // In caso di errore critico, mostra errore nel gate
  const err = $("#authError");
  if (err) err.textContent = "Errore init: " + (e.message || e);
});

// ── Report bug (bottone globale "Segnala bug") ───────────────
// Scrive in nexo_dev_requests (stessa shape usata da IRIS dev-requests).
// MAESTRO polla la collection ogni ~2 min e materializza tasks/dev-request-{id}.md
// → Claude Code analizza in tasks/dev-analysis-{id}.md.
const REPORT_BUG_COOLDOWN_MS = 30_000;
let _reportBugLastSentAt = 0;

async function submitBugReport(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.length > 4000) return { ok: false, error: "Troppo lungo (max 4000 caratteri)." };
  // Descrizione opzionale: usa un placeholder se vuoto. Le firestore.rules
  // richiedono description.size() > 0, per questo non passiamo "" diretto.
  const description = trimmed || "(nessun dettaglio fornito)";
  try {
    const { db, fsMod } = await getFirestore();
    const me = (CURRENT_USER && CURRENT_USER.email) || null;
    const payload = {
      description,
      status: "pending",
      source: "report_bug_btn",
      userId: me,
      createdAt: fsMod.serverTimestamp(),
      emailRef: null,
    };
    const ref = await fsMod.addDoc(fsMod.collection(db, "nexo_dev_requests"), payload);
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("submitBugReport failed:", err);
    return { ok: false, error: (err && err.message) ? err.message : String(err) };
  }
}

function reportBugShowToast(message) {
  const toast = document.createElement("div");
  toast.className = "nexo-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function reportBugOpen() {
  const modal = document.getElementById("reportBugModal");
  const text = document.getElementById("reportBugText");
  const err = document.getElementById("reportBugError");
  if (!modal) return;
  if (err) err.textContent = "";
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => text && text.focus(), 50);
}

function reportBugClose() {
  const modal = document.getElementById("reportBugModal");
  const text = document.getElementById("reportBugText");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  if (text) text.value = "";
}

function reportBugWire() {
  const btn = document.getElementById("reportBugBtn");
  const cancel = document.getElementById("reportBugCancel");
  const submit = document.getElementById("reportBugSubmit");
  const text = document.getElementById("reportBugText");
  const err = document.getElementById("reportBugError");
  const modal = document.getElementById("reportBugModal");
  if (!btn || !modal || !submit) return;

  // Wire idempotente: i listener vengono attaccati una sola volta allo startup.
  if (btn._reportBugWired) return;
  btn._reportBugWired = true;
  // Il bottone resta hidden finché l'auth non viene completata: init() lo
  // rivelerà con btn.hidden = false dopo onAuthStateChanged(user).

  btn.addEventListener("click", () => {
    if (!CURRENT_USER) return; // safety: nessun submit pre-auth
    reportBugOpen();
  });
  cancel?.addEventListener("click", () => reportBugClose());
  // Click sul backdrop (fuori dalla card) chiude il modal
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) reportBugClose();
  });
  // Esc chiude
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal.getAttribute("aria-hidden") === "false") reportBugClose();
  });

  submit.addEventListener("click", async () => {
    if (!CURRENT_USER) {
      if (err) err.textContent = "Devi essere autenticato per segnalare un bug.";
      return;
    }
    const now = Date.now();
    const since = now - _reportBugLastSentAt;
    if (since < REPORT_BUG_COOLDOWN_MS) {
      const wait = Math.ceil((REPORT_BUG_COOLDOWN_MS - since) / 1000);
      if (err) err.textContent = `Aspetta ${wait}s prima di inviare un'altra segnalazione.`;
      return;
    }
    if (err) err.textContent = "";
    submit.disabled = true;
    submit.textContent = "Invio…";
    try {
      const r = await submitBugReport(text ? text.value : "");
      if (!r.ok) {
        if (err) err.textContent = r.error || "Errore invio.";
        return;
      }
      _reportBugLastSentAt = Date.now();
      reportBugClose();
      reportBugShowToast("Segnalazione inviata. Claude Code la sta analizzando.");
      // Cooldown visivo sul bottone principale per 30s
      btn.disabled = true;
      const original = btn.querySelector(".report-bug-label")?.textContent;
      const labelEl = btn.querySelector(".report-bug-label");
      if (labelEl) labelEl.textContent = "Inviata ✓";
      setTimeout(() => {
        btn.disabled = false;
        if (labelEl && original) labelEl.textContent = original;
      }, REPORT_BUG_COOLDOWN_MS);
    } finally {
      submit.disabled = false;
      submit.textContent = "Invia";
    }
  });
}

// Wire allo startup: i listener sono attivi subito ma il bottone resta
// hidden finché init() (post-auth) non chiama btn.hidden = false.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => reportBugWire());
} else {
  reportBugWire();
}
