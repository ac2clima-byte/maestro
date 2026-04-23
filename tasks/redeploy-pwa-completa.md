La PWA su nexo-hub-15f2d.web.app mostra solo IRIS, non la dashboard NEXO completa.

1. Verifica quale file viene servito:
   - ls projects/nexo-pwa/public/index.html
   - ls projects/iris/pwa/index.html
   - cat projects/nexo-pwa/firebase.json
   - Quale dei due è deployato su hosting?

2. Deploya la PWA corretta (nexo-pwa, non iris/pwa):
   cd projects/nexo-pwa && firebase deploy --only hosting --project nexo-hub-15f2d

3. Se il firebase.json di nexo-pwa non è configurato correttamente, fixalo:
   {
     "hosting": {
       "public": "public",
       "ignore": ["firebase.json", "**/node_modules/**"],
       "rewrites": [{ "source": "**", "destination": "/index.html" }]
     }
   }

4. Apri nel browser e verifica che si veda la dashboard NEXO con sidebar, non solo IRIS

5. Committa con "fix: redeploy PWA NEXO completa"
