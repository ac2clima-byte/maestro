// sw.js — Service Worker PWA per Web Share Target (Android).
// Intercetta POST /share-target, estrae testo/file, li passa alla pagina
// tramite una redirect con sessionStorage pre-popolato via IndexedDB.
//
// Non fa caching (app interamente online, già gestita da Firebase Hosting).

const SHARE_CACHE_NAME = "nexo-share-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Web Share Target ─────────────────────────────────────────
// Android condivide a questo endpoint. Gestiamo:
//  - title + text + url (form-urlencoded o multipart)
//  - files (audio/image/pdf/text)
// Salviamo il payload in Cache Storage (file) + IndexedDB (meta) e redirect
// alla home con ?sharedAt=<timestamp>. La pagina legge da CacheStorage/IDB.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Share Target POST
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(event.request));
    return;
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const title = formData.get("title") || "";
    const text  = formData.get("text")  || "";
    const urlField = formData.get("url")  || "";
    const file  = formData.get("media");

    const sharedAt = Date.now();
    const meta = {
      sharedAt,
      title: String(title).slice(0, 500),
      text:  String(text).slice(0, 5000),
      url:   String(urlField).slice(0, 1000),
      hasFile: !!(file && file.size),
      fileName: file ? file.name : null,
      fileType: file ? file.type : null,
      fileSize: file ? file.size : 0,
    };

    // Salva meta in IndexedDB
    await idbPut("shares", String(sharedAt), meta);

    // Salva file in Cache Storage (chiave = /nexo-shared-file/<sharedAt>)
    if (file && file.size) {
      const cache = await caches.open(SHARE_CACHE_NAME);
      const fakeUrl = `/nexo-shared-file/${sharedAt}`;
      const resp = new Response(file, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${file.name || "file"}"`,
        },
      });
      await cache.put(fakeUrl, resp);
    }

    // Redirect alla home con sharedAt nel query string
    return Response.redirect(`/?sharedAt=${sharedAt}`, 303);
  } catch (e) {
    return new Response(`Share failed: ${e.message || e}`, { status: 500 });
  }
}

// ─── Mini IDB helpers ─────────────────────────────────────────
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nexo-shares", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("shares")) db.createObjectStore("shares");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(store, key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
