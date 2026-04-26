NEXUS non è ancora operativa al 100%. Fai una verifica completa e fixa TUTTO.

## 1. Verifica stato attuale

Apri https://nexo-hub-15f2d.web.app con Playwright.
Testa OGNI funzionalità e documenta cosa funziona e cosa no:

a. Login: funziona?
b. Dashboard home: si carica? mostra dati?
c. Sidebar: click funziona? toggle nasconde/mostra?
d. NEXUS Chat: si apre? risponde?
e. Chat fullscreen: funziona?
f. Voce TTS: funziona? Voce femminile Elsa?
g. Microfono continuo: funziona?
h. Cancella chat: funziona?
i. Swipe email IRIS: funziona?
j. Pagine Colleghi: si aprono tutte?
k. CHRONOS badge campagne: si vedono?
l. PHARO dashboard RTI: si carica?

Per OGNI test: screenshot + risultato (OK/KO/parziale)

## 2. Testa NEXUS Chat con 15 domande

Scrivi ogni domanda, aspetta risposta, screenshot:

1. "ciao"
2. "quante email ho?"
3. "email urgenti"
4. "stato della suite"
5. "interventi aperti"
6. "come va la campagna walkby?"
7. "dimmi tutto su Kristal"
8. "manda whatsapp a Alberto: test"
9. "fatture scadute"
10. "scadenze CURIT"
11. "report mensile"
12. "bozze pendenti"
13. "analizza l'ultima mail di Torriglia"
14. "cosa manca in magazzino?"
15. "scrivi risposta a Moraschi"

Per OGNI risposta verifica:
- Ha risposto? (non errore 500)
- Ha risposto in linguaggio naturale? (no emoji, no bold, no bullet)
- Ha dato dati reali? (non placeholder)
- Il routing al Collega giusto?

## 3. Fixa TUTTO quello che non funziona

Per ogni cosa rotta trovata al punto 1 e 2:
- Identifica il problema nel codice
- Fixa
- Ritesta

## 4. Deploy tutto

firebase deploy --only functions --project nexo-hub-15f2d
firebase deploy --only hosting --project nexo-hub-15f2d

## 5. Ritesta tutto dopo il deploy

Ripeti i 15 test del punto 2 dopo il deploy.
Screenshot + report finale.

## 6. Report

Crea results/nexus-audit-completo.html con:
- Tabella: funzionalità | stato prima | stato dopo fix
- 15 test chat: domanda | risposta | linguaggio naturale? | dati reali?
- Screenshot before/after per ogni fix

Committa con "fix(nexus): audit completo e fix di tutte le funzionalità"
