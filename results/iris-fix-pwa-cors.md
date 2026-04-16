# Risultato: iris-fix-pwa-cors
> Eseguito: 2026-04-16T18:49:55.445Z
> Completato: sì

## Output

```
807 +// TODO: compilare con i valori reali del progetto nexo-hub-15f2d.
      808 +const FIREBASE_CONFIG = {
      809 +  apiKey: "REPLACE_ME",
      810 +  authDomain: "nexo-hub-15f2d.firebaseapp.com",
      811 +  projectId: "nexo-hub-15f2d",
      812 +  storageBucket: "nexo-hub-15f2d.appspot.com",
      813 +  messagingSenderId: "REPLACE_ME",
      814 +  appId: "REPLACE_ME",
      815 +};
      816 +
      817 +function isFirebaseConfigured() {
      818 +  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "REPLACE_ME";
      819 +}
      820 +
      821  // --- Auth flow ---
      822  async function bootAuth() {
      823    if (MOCK_MODE) {
      824      showApp("alberto@acgclima.it");
      825 +    $("#logoutBtn").addEventListener("click", showLogin);
      826 +    $("#loginForm").addEventListener("submit", (e) => {
      827 +      e.preventDefault();
      828 +      showApp("alberto@acgclima.it");
      829 +    });
      830      return;
      831    }
      832
      813 -  let fb;
      833 +  if (!isFirebaseConfigured()) {
      834 +    // No credentials yet — keep the login usable, hint on submit.
      835 +    $("#loginForm").addEventListener("submit", (e) => {
      836 +      e.preventDefault();
      837 +      $("#loginError").textContent = "Firebase non configurato. Apri con ?mock=1 per la demo.";
      838 +    });
      839 +    return;
      840 +  }
      841 +
      842 +  // Load Firebase modules from the official CDN. These URLs are CORS-enabled
      843 +  // and work from file:// loads. We import dynamically so offline file:// use
      844 +  // (where fetch is blocked) can still show the login view.
      845 +  let firebaseApp, firebaseAuth;
      846    try {
      815 -    fb = await import("./firebase-config.js");
      847 +    firebaseApp = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
      848 +    firebaseAuth = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      849    } catch (err) {
      817 -    // Firebase module not reachable (e.g. file:// load, offline, no config).
      818 -    // Keep the login view usable; surface the hint only on submit attempt.
      850      $("#loginForm").addEventListener("submit", (e) => {
      851        e.preventDefault();
      821 -      $("#loginError").textContent = "Firebase non configurato. Apri con ?mock=1 per la demo.";
      852 +      $("#loginError").textContent = "Firebase SDK non raggiungibile. Controlla la connessione.";
      853      });
      854      return;
      855    }
      856
      826 -  const { initFirebase, signInWithEmailAndPassword, signOut, onAuthStateChanged } = fb;
      827 -  const { auth } = initFirebase();
      857 +  const app = firebaseApp.initializeApp(FIREBASE_CONFIG);
      858 +  const auth = firebaseAuth.getAuth(app);
      859
      829 -  onAuthStateChanged(auth, (user) => {
      860 +  firebaseAuth.onAuthStateChanged(auth, (user) => {
      861      if (user) showApp(user.email);
      862      else showLogin();
      863    });
     ...
      866      e.preventDefault();
      867      $("#loginError").textContent = "";
      868      try {
      838 -      await signInWithEmailAndPassword(auth, $("#email").value, $("#password").value);
      869 +      await firebaseAuth.signInWithEmailAndPassword(auth, $("#email").value, $("#password").value);
      870      } catch (err) {
      871        $("#loginError").textContent = "Credenziali non valide.";
      872      }
      873    });
      874
      844 -  $("#logoutBtn").addEventListener("click", () => signOut(auth));
      875 +  $("#logoutBtn").addEventListener("click", () => firebaseAuth.signOut(auth));
      876  }
      877
      847 -// In mock mode, hook logout to just show login again.
      848 -if (MOCK_MODE) {
      849 -  document.addEventListener("DOMContentLoaded", () => {
      850 -    $("#logoutBtn").addEventListener("click", showLogin);
      851 -    $("#loginForm").addEventListener("submit", (e) => {
      852 -      e.preventDefault();
      853 -      showApp("alberto@acgclima.it");
      854 -    });
      855 -  });
      856 -}
      857 -
      878  bootAuth();
      879  </script>
      880  </body>
  ⎿  PostToolUse:Edit says: Hookify import error: No module named 'hookify'

● Ora elimino il file esterno (non più usato) e apro nel browser.

● Bash(rm /home/albertocontardi/maestro-bridge/projects/iris/pwa/firebase-config.js && cp /home/albertocontardi/maestro-bridge/projects/iris/pwa/index.html /mnt/c/User…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  exit: 0
  ⎿  Shell cwd was reset to /home/albertocontardi/maestro-bridge
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Verifico che la pagina funzioni localmente via Playwright (simulando file://) prima di committare.

● Bash(cat > /home/albertocontardi/verify_iris.js <<'EOF'
      const { chromium } = require('playwright');…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  {
       "loginVisible": true,
       "appHidden": true,
     … +3 lines (ctrl+o to expand)
  ⎿  Shell cwd was reset to /home/albertocontardi/maestro-bridge
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Zero errori, login mostrata, mock carica 10 email. Committo.

● Bash(git add -A projects/iris/pwa/ && git status --short projects/iris/pwa/ && git commit -m "$(cat <<'EOF'
      fix(iris): inline firebase config to avoid CORS on file:/…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  D  projects/iris/pwa/firebase-config.js
     M  projects/iris/pwa/index.html
     [main 1ee89a1] fix(iris): inline firebase config to avoid CORS on file://
     … +2 lines (ctrl+o to expand)
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Commit 1ee89a1. Fix applicato:

  - Config Firebase inline (FIREBASE_CONFIG dentro <script>, niente import "./firebase-config.js")
  - firebase-config.js eliminato (non più serve)
  - Firebase SDK caricato dinamicamente dai CDN gstatic.com (CORS-enabled, OK da file://)
  - Fallback graceful: se apiKey === "REPLACE_ME", skippa l'import SDK e mostra l'hint solo on-submit
  - Verificato: Playwright da file:// → 0 errori console, login visibile, ?mock=1 carica 10 email
  - Browser aperto: C:\Users\Public\iris-pwa\index.html
  ⎿  Stop says: Hookify import error: No module named 'hookify'

✻ Baked for 1m 13s

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚡SuperCycle | Opus 4.7 (1M context) | ctx:12% | $5.20
  ⚪ monitor: stale (5753min fa)
  ⏵⏵ auto mode on (shift+tab to cycle)
```