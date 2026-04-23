// NEXO — Content script per WhatsApp Web
// Aggiunge un pulsante 🧠 accanto a ogni messaggio. Click → estrae testo →
// manda un messaggio al service worker che apre la PWA NEXO.
//
// WA Web cambia spesso i selectors. Strategia:
//  1. cerca ogni nodo che abbia data-testid="msg-container" OPPURE
//     role="row" con dentro una bubble in/out.
//  2. per ogni messaggio, cerca il contenitore del testo (span con
//     copyable-text OPPURE .selectable-text).
//  3. clona il bottone e lo infila subito accanto alla bubble (floating,
//     visibile su hover).

(() => {
  if (window._nexoWaInit) return;
  window._nexoWaInit = true;

  const DEBUG = false;
  const log = (...a) => DEBUG && console.log("[NEXO WA]", ...a);

  const BTN_CLASS = "nexo-send-btn";
  const MARK_ATTR = "data-nexo-wired";

  // Estrae testo di un messaggio. Prova più approcci.
  function extractMessageText(bubbleRoot) {
    if (!bubbleRoot) return "";
    // 1. Cerca span con copyable-text (testo puro di un msg)
    const copyable = bubbleRoot.querySelector("span.selectable-text.copyable-text, span[class*='selectable-text']");
    if (copyable && copyable.innerText) return copyable.innerText.trim();
    // 2. Cerca data-pre-plain-text (contiene meta, preferiamo innerText pulito)
    const pre = bubbleRoot.querySelector("[data-pre-plain-text]");
    if (pre && pre.innerText) return pre.innerText.trim();
    // 3. Fallback: innerText del bubble root (può contenere ora e nome — ok)
    return (bubbleRoot.innerText || "").trim().slice(0, 3000);
  }

  // Estrae anche sender + ora se disponibili (per dare contesto)
  function extractMessageContext(bubbleRoot) {
    if (!bubbleRoot) return "";
    const pre = bubbleRoot.querySelector("[data-pre-plain-text]");
    const preMeta = pre ? pre.getAttribute("data-pre-plain-text") : "";
    return preMeta || "";
  }

  function makeButton(bubbleRoot) {
    const btn = document.createElement("button");
    btn.className = BTN_CLASS;
    btn.type = "button";
    btn.title = "Manda a NEXO";
    btn.setAttribute("aria-label", "Manda a NEXO");
    btn.textContent = "🧠";
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const text = extractMessageText(bubbleRoot);
      const meta = extractMessageContext(bubbleRoot);
      const payload = (meta ? `${meta}\n` : "") + text;
      if (!payload.trim()) { btn.textContent = "∅"; setTimeout(() => btn.textContent = "🧠", 1200); return; }
      try {
        chrome.runtime.sendMessage({ type: "nexo_send", text: payload, source: "whatsapp" }, (resp) => {
          // feedback veloce
          btn.textContent = "✓";
          setTimeout(() => btn.textContent = "🧠", 1400);
        });
      } catch (e) {
        console.warn("[NEXO WA] sendMessage failed", e);
      }
    });
    return btn;
  }

  // Aggancia un bottone su ogni messaggio non ancora processato
  function scan(root) {
    root = root || document;
    // WA usa div[role="row"] per ogni riga messaggio, con dentro bubble in/out
    const rows = root.querySelectorAll ? root.querySelectorAll('div[role="row"]') : [];
    for (const row of rows) {
      if (row.hasAttribute(MARK_ATTR)) continue;
      // Trova la bubble effettiva (skip se è solo data header)
      const bubble = row.querySelector('div.message-in, div.message-out, div[class*="message-in"], div[class*="message-out"]')
                   || row.querySelector("div[data-id]")
                   || row;
      if (!bubble) continue;
      // Skip "system messages" (info chat, stickers puri)
      const hasText = bubble.querySelector('span[class*="selectable-text"], [data-pre-plain-text]');
      if (!hasText) continue;

      row.setAttribute(MARK_ATTR, "1");
      const btn = makeButton(bubble);
      // Aggiungi al bubble (posizione calcolata da CSS)
      bubble.style.position = bubble.style.position || "relative";
      bubble.appendChild(btn);
    }
  }

  function boot() {
    scan(document);
    const observer = new MutationObserver((mutations) => {
      // Throttle: accumula in rAF
      if (boot._pending) return;
      boot._pending = true;
      requestAnimationFrame(() => {
        boot._pending = false;
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) scan(node);
          }
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    log("observer armato");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
