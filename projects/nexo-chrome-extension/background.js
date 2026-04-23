// NEXO Chrome Extension — background service worker
// - Registra context menu "Manda a NEXO" (tasto destro su testo selezionato)
// - Registra shortcut Ctrl+Shift+N (dichiarato in manifest commands)
// - Riceve messaggi dal content script e apre la PWA NEXO

const NEXO_URL = "https://nexo-hub-15f2d.web.app";

function buildShareUrl(text, source) {
  const qs = new URLSearchParams();
  qs.set("share", text || "");
  if (source) qs.set("source", source);
  // Apri direttamente la chat NEXUS
  qs.set("openNexus", "1");
  return `${NEXO_URL}?${qs.toString()}`;
}

async function openNexoWithText(text, source) {
  if (!text || !text.trim()) return;
  // Trunca a 3000 char (limite UI ragionevole)
  const payload = text.trim().slice(0, 3000);
  const url = buildShareUrl(payload, source);

  // Se c'è già una tab NEXO aperta, focus + aggiorna URL; altrimenti nuova tab
  try {
    const tabs = await chrome.tabs.query({ url: `${NEXO_URL}/*` });
    if (tabs && tabs.length) {
      const tab = tabs[0];
      await chrome.tabs.update(tab.id, { url, active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }
  } catch (e) { console.warn("[NEXO bg] tabs.query failed", e); }
  chrome.tabs.create({ url });
}

// ─── Context menu ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "nexo-send-selection",
      title: "🧠 Manda a NEXO",
      contexts: ["selection"],
    });
  } catch (e) { console.warn("[NEXO bg] contextMenus.create failed", e); }
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "nexo-send-selection") return;
  const text = String(info.selectionText || "").trim();
  if (!text) return;
  openNexoWithText(text, "selection");
});

// ─── Keyboard shortcut ────────────────────────────────────────
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "send-selection-to-nexo") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    // Chiedi al content (o main world) di estrarre la selezione corrente
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(window.getSelection()?.toString() || ""),
    }).catch(() => null);
    const sel = results && results[0] && results[0].result;
    if (sel && sel.trim()) {
      openNexoWithText(sel, "shortcut");
    } else {
      // Nessuna selezione — apri NEXO a vuoto
      chrome.tabs.create({ url: `${NEXO_URL}?openNexus=1` });
    }
  } catch (e) { console.warn("[NEXO bg] command handler failed", e); }
});

// ─── Messaggi dal content script (click su bottone 🧠 WhatsApp) ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "nexo_send") return;
  openNexoWithText(msg.text || "", msg.source || "whatsapp")
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // async
});

// ─── Click sull'icona dell'estensione (action) ────────────────
chrome.action?.onClicked.addListener(() => {
  chrome.tabs.create({ url: `${NEXO_URL}?openNexus=1` });
});
