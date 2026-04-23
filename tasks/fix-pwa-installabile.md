La PWA NEXO non è installabile su telefono. Mancano manifest.json e Service Worker.

## 1. Crea projects/nexo-pwa/public/manifest.json

```json
{
  "name": "NEXO — Colleghi AI",
  "short_name": "NEXO",
  "description": "Piattaforma AI per ACG Clima Service",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f172a",
  "theme_color": "#00d4ff",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [{ "name": "media", "accept": ["image/*", "audio/*", "application/pdf"] }]
    }
  }
}
```

## 2. Crea le icone

Genera le icone con un canvas o SVG:
- projects/nexo-pwa/public/icons/icon-192.png (192x192, sfondo #0f172a, testo "N" bianco o icona 🧠)
- projects/nexo-pwa/public/icons/icon-512.png (512x512)
- projects/nexo-pwa/public/icons/icon-512-maskable.png (512x512, con padding per maskable)

Puoi generarle con Python (Pillow) o con un semplice SVG convertito.

## 3. Crea Service Worker

projects/nexo-pwa/public/sw.js:
```javascript
const CACHE_NAME = 'nexo-v2';
const PRECACHE = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
```

## 4. Aggiungi al HTML

In index.html nel <head>:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#00d4ff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

Nel <script> alla fine:
```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

## 5. Deploy hosting
## 6. Testa: apri su Chrome Android → deve apparire banner "Aggiungi a schermata Home"
## 7. Committa con "fix(pwa): manifest + SW + icone — PWA installabile"
