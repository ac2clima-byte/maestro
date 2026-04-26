# Analisi Dev Request `zYNnGZA2qKiHgEo5ZrsV`

> Richiesta originale (Alberto, 2026-04-26 17:45 Europe/Rome):
> *"quando arriva una mail e la vedo su outlook perchè non appare subito su iris?"*

---

## 1. Diagnosi — cosa succede oggi

IRIS legge le email da Outlook (Exchange on-prem `remote.gruppobadano.it`) tramite un poller esterno. **Per come è progettato oggi**, c'è un ritardo strutturale (5-10 minuti nel caso ideale) + un problema operativo concreto: il **poller è fermo da più di 24 ore**.

### Architettura attuale

Le Cloud Functions di IRIS (su `nexo-hub-15f2d` europe-west1) **non possono raggiungere Exchange on-prem**: il server `remote.gruppobadano.it` è dietro firewall e non risponde a IP pubblici GCP. Per questo il poller non gira come Cloud Function ma come **script locale**:

```
Outlook server (gruppobadano.it)
   ↓ EWS HTTPS (su rete locale o VPN)
WSL del PC di Alberto: scripts/iris_local_poller.sh (loop ogni 5 min)
   ↓ chiama
projects/iris/scripts/pipeline.py
   ├─ legge ultime N email via exchangelib
   ├─ classifica ognuna con Claude Haiku
   └─ scrive su Firestore nexo-hub-15f2d/iris_emails
              ↓
   PWA IRIS legge iris_emails (read pubblica) e mostra le card
```

Quindi il ciclo "email arriva su Outlook → la vedi in IRIS" passa da:
1. **Latenza poller**: il loop dorme 300 secondi (5 min) tra cicli (`POLL_INTERVAL=300` in `iris_local_poller.sh:29`).
2. **Tempo classificazione Haiku**: ~1-3s per email.
3. **Scrittura Firestore + render PWA**: ~1s.

Best case: una mail arrivata appena dopo il fetch può aspettare fino a **5 minuti** prima di apparire in IRIS. Vista da Alberto su Outlook (che fa push istantaneo tramite Exchange ActiveSync), sembra che IRIS sia "lento".

### Problema operativo attuale (più grave del design)

L'**ultimo run del poller è del 25/04 alle 23:43**, oltre 24h fa. Nei log:

```
logs/iris_poller.err (ultimo errore):
  exchangelib.errors.TransportError: HTTPSConnectionPool(...remote.gruppobadano.it...
  Failed to resolve 'remote.gruppobadano.it'
  [Errno -3] Temporary failure in name resolution
```

Il DNS di `remote.gruppobadano.it` non era risolvibile dal contesto WSL di Alberto. Il loop ha catturato l'errore e poi è terminato (non ha ripreso). Verificato anche con `ps aux | grep -E "iris_local_poller|pipeline.py"`: **nessun processo attivo**.

Questo spiega perché la PWA mostra **100 email indicizzate** ferme da giorni: il poller ha smesso di pollare.

### Sommario delle cause del ritardo "non appare subito"

| Causa | Impatto | Tipo |
|---|---|---|
| Cloud Function non può parlare con Exchange on-prem | Architettura, non risolvibile senza VPN/proxy | **Strutturale** |
| Poller locale attualmente fermo (DNS fail il 25/04, daemon non riavviato) | Email recenti completamente assenti da IRIS | **Operativo (acuto)** |
| Loop fa polling ogni 5 min (`POLL_INTERVAL=300`) | Latenza media 2.5 min, peggio caso 5 min | **Configurazione** |
| Classificazione Haiku ~1-3s per email | Latenza minore, accettabile | **Performance** |
| Outlook fa push istantaneo (ActiveSync), IRIS no | Esperienza percepita asimmetrica | **Architettura** |

---

## 2. File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/index.js` | 845-960 (`runIrisPoller`), 963-989 (scheduler **disabilitato**), 991-1004 (`irisPollerRun` HTTP trigger manuale) | Cloud Function poller — disattivata. Resta solo l'endpoint HTTP per debug manuale. |
| `scripts/iris_local_poller.sh` | 29 (`POLL_INTERVAL=300`), tutto il loop | Script bash che gira in WSL, ciclo ogni 5 min, scrive log su `logs/iris_poller.log` e errori su `logs/iris_poller.err`. |
| `scripts/start-iris-poller.sh` | tutto | Daemon launcher (nohup + disown). |
| `projects/iris/scripts/pipeline.py` | tutto | Pipeline Python: legge EWS → classifica con Haiku → scrive `iris_emails`. ID doc = `message_id` Exchange (idempotente). |
| `projects/nexo-pwa/public/iris/index.html` | 1735-1758 (`loadEmailsFromFirestore`), `applyFilters` | Frontend: read da Firestore con `orderBy raw.received_time desc limit 100`. Niente subscribe real-time, l'utente deve refreshare. |
| `logs/iris_poller.log` / `logs/iris_poller.err` | — | Log rotati, ultimo entry 25/04. |
| `cosmina_config/iris_config` (Firestore garbymobile-f89ac) | — | Config server EWS, credenziali, abilitazione poller. |

---

## 3. Proposta — cosa cambiare e in che ordine

### 3.1 (URGENTE) Riavviare il poller locale

L'azione più importante è **immediata e a costo zero**: `bash scripts/start-iris-poller.sh`. Senza questo, qualsiasi miglioramento di latenza è inutile perché il poller non è proprio in esecuzione.

Aggiungere:
- **Healthcheck**: ogni ciclo del poller scrive un timestamp su Firestore `nexo_config/iris_poller_heartbeat`. PHARO può alzare un alert se l'ultimo heartbeat è più vecchio di 10 minuti.
- **Auto-restart**: trasformare `start-iris-poller.sh` in un servizio systemd-user con `Restart=always` (su WSL2 funziona via systemd nativo). Se il processo muore per DNS o altro, riparte automaticamente.
- **Notifica push** ad Alberto se il poller è giù da 30+ minuti (FCM via NEXO).

### 3.2 (CORTO TERMINE) Ridurre la latenza polling

Cambiare `POLL_INTERVAL=300` (5 min) → **`60` (1 min)**. Il pipeline.py legge solo le ultime N email per `received_time`, è cheap; il bottleneck reale è EWS che prende 0.5-2s per fetch e Haiku 1-3s a email. Costo Haiku per N email/min: tipicamente 5-10 nuove email/giorno in fascia oraria, irrilevante.

Rischi: se il fetch+classify supera 60s su un picco (10 email nuove tutte insieme), il PID file evita esecuzioni concorrenti (`iris_local_poller.sh:24-25`). Già gestito.

Risultato atteso: latenza media 30s, peggio 60s. Non è "subito" come Outlook ma percepibilmente migliore (oggi 2.5 min medio).

### 3.3 (MEDIO TERMINE) Push da Outlook → trigger fetch

Outlook/Exchange supporta **subscription EWS** (push notification): quando arriva una email nella inbox, Exchange POSTa un callback HTTPS a un endpoint configurato. Il flusso diventerebbe:

```
Email arriva → Exchange POST a Cloud Function nexo-hub-15f2d/onNewEmail
   → Cloud Function chiama il poller locale via webhook (richiede tunnel
     pubblico verso WSL: ngrok / cloudflared / Tailscale Funnel)
   → Pipeline gira immediatamente per quella sola email
```

Latenza ridotta a **2-5 secondi** (push real-time). Ma richiede:
- Configurare subscription EWS (richiede permessi admin Exchange).
- Tunnel pubblico stabile dalla WSL di Alberto verso Internet.
- Endpoint Cloud Function che gestisce il callback.

Effort medio (1-2 giornate), beneficio alto.

### 3.4 (LUNGO TERMINE) Esporre Exchange su rete pubblica o spostare il poller

Due alternative architetturali per eliminare la dipendenza dal PC di Alberto:

A. **VPN o pubblicazione di Exchange**: aprire `remote.gruppobadano.it` a un range IP GCP (Cloud NAT statico). Permetterebbe al poller di tornare in Cloud Function `irisPoller` (oggi commentato in `index.js:976-989`), già scritto. Pro: zero manutenzione. Contro: richiede intervento sysadmin.

B. **Spostare il poller su Hetzner** (esiste già `scripts/iris_hetzner_poller.py` deprecato): server sempre acceso, non dipende dal PC di Alberto. Pro: stabilità. Contro: ancora server "esterno" da mantenere.

### 3.5 PWA: subscribe real-time invece di reload manuale

Oggi `loadEmailsFromFirestore` è chiamata al boot e su click manuale. Sostituire con `onSnapshot()` Firestore: appena il poller scrive una nuova email su `iris_emails`, la PWA la mostra **istantaneamente** senza che l'utente faccia refresh. Cambia `iris/index.html` riga 1738-1758.

Effort piccolo (~15 min). **Già di per sé migliora la UX percepita**: anche se il backend ha 5 min di latenza, almeno quando arriva l'email l'utente non deve premere F5.

### Ordine consigliato

1. **(NOW)** Riavviare `start-iris-poller.sh` + verificare che gira → email recenti riappaiono.
2. **(oggi)** Ridurre `POLL_INTERVAL` a 60s.
3. **(oggi)** Aggiungere `onSnapshot` in PWA per real-time render.
4. **(settimana)** Heartbeat poller + alert PHARO se silente >10 min.
5. **(settimana)** Auto-restart systemd-user.
6. **(quando si può)** Push Exchange subscription (3.3) per latenza <5s.
7. **(eventualmente)** Riportare il poller in Cloud Function quando Exchange è raggiungibile da GCP (3.4).

---

## 4. Rischi e alternative

### Rischi

| Rischio | Mitigazione |
|---|---|
| Riducendo POLL_INTERVAL aumenta carico Haiku/Firestore | Trascurabile: 5-10 nuove email/giorno → cost 1-2$/mese. Rate-limit già presente in pipeline.py |
| Daemon ancora muore per altri motivi (rete, OOM, riavvio PC) | systemd-user con Restart=always + heartbeat |
| Push Exchange: tunnel pubblico WSL può cadere | Health check + fallback al poller polling |
| PC di Alberto spento di notte → email notturne ferme | Spostare poller su server sempre acceso (Hetzner) |
| OnSnapshot PWA: aumenta letture Firestore | Trascurabile (limit 100 doc, document changes piccoli) |

### Alternative considerate

- **Solo riavviare il poller, niente altro**: risolve il sintomo acuto ma il design resta debole. La domanda di Alberto suggerisce che vuole vedere le email "subito", non in 5 min.
- **Push notification FCM su nuova email**: ortogonale, non risolve la latenza nel render PWA. Aggiungibile come decoro ma 3.3+3.5 è la soluzione vera.
- **Web Outlook embed in PWA**: aggira il problema senza risolverlo. La classificazione Haiku andrebbe persa, perdere valore di IRIS. Scartato.

---

## 5. Effort stimato

| Azione | Effort |
|---|---|
| 3.1 Riavvio poller + heartbeat | **S** (~30 min) |
| 3.2 POLL_INTERVAL 60s | **S** (~5 min, una riga) |
| 3.3 Push Exchange subscription | **M** (~1-2 giornate, richiede setup tunnel) |
| 3.4a Esporre Exchange su GCP | **M** intervento sysadmin (~1 giornata cliente) |
| 3.4b Sposta poller su Hetzner | **S-M** (~3 ore: server già esistente) |
| 3.5 PWA onSnapshot | **S** (~15 min) |

Le azioni S messe insieme (3.1+3.2+3.5) si fanno in **un'ora abbondante** e portano la latenza percepita da "ore di silenzio" (oggi, poller down) a "30-60 secondi". È il pacchetto consigliato per primo round.

Le M (3.3 push, 3.4 reset architettura) si fanno se 3.1-3.5 non bastano: oggi sono fix prematuri.
