// sw.js — Service Worker PWA NEXO.
// Compiti:
//  1. Web Share Target: intercetta POST /share (multipart o x-www-form-urlencoded),
//     salva payload in IDB+CacheStorage, redirect a / con ?sharedAt=<ts>
//  2. Precache minimo (shell app) per PWA installabile
//  3. Fetch handler: cache-first per le risorse statiche, network-only per API
//
// NON gestisce FCM background (quello resta in firebase-messaging-sw.js,
// che è registrato separatamente con scope diverso quando FCM sarà attivo).

const CACHE_NAME = "nexo-shell-v3";
const SHARE_CACHE_NAME = "nexo-share-v1";
const PRECACHE = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(PRECACHE.map(url => cache.add(url).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== SHARE_CACHE_NAME)
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── Web Share Target + network handler ───────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Share Target POST (manifest share_target.action = /share)
  if (event.request.method === "POST" &&
      (url.pathname === "/share" || url.pathname === "/share-target")) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // Solo stessa origine — non intercettiamo API esterne (Firebase/Cloud Functions)
  if (url.origin !== self.location.origin) return;

  // Solo GET per cache
  if (event.request.method !== "GET") return;

  // Non cachare chiamate API Firestore/Functions (pattern /api/, /__/, /nexo-shared-file/)
  if (url.pathname.startsWith("/__/") ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/nexo-shared-file/")) return;

  // Cache-first con fallback network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Refresh in background
        fetch(event.request).then(resp => {
          if (resp.ok && resp.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, resp.clone())).catch(() => {});
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(resp => {
        if (resp.ok && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone)).catch(() => {});
        }
        return resp;
      });
    })
  );
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

    await idbPut("shares", String(sharedAt), meta);

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
