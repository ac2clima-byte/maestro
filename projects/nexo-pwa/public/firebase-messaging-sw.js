// firebase-messaging-sw.js — Service Worker FCM per ricevere notifiche in background.
// Deve stare nella root del dominio (/firebase-messaging-sw.js) per Firebase.

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBqm4XYaSlq2yUFdpcsL0wtSOpn48cOHoo",
  authDomain: "nexo-hub-15f2d.firebaseapp.com",
  projectId: "nexo-hub-15f2d",
  storageBucket: "nexo-hub-15f2d.firebasestorage.app",
  messagingSenderId: "272099489624",
  appId: "1:272099489624:web:10d17611b19031757d172d",
});

const messaging = firebase.messaging();

// Notifica in background: FCM chiama automaticamente showNotification se
// il payload ha `notification:{...}`. Qui gestiamo anche i payload data-only.
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || "NEXO";
  const body = n.body || d.body || "Hai una nuova notifica.";
  const link = d.link || "/";
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || "nexo-default",
    data: { link, ...d },
  });
});

// Click sulla notifica → apri PWA sul link (default: home con NEXUS chat)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/#home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) {
          c.postMessage({ type: "nexo_notification_click", link, data: event.notification.data });
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
