COSMINA ha già una sezione "In Arrivo" che riceve i messaggi WhatsApp aziendali via Waha. NEXUS deve intercettare questi messaggi, analizzarli e proporre azioni.

## 1. MEMO — Trova la struttura WA Inbox in COSMINA

Cerca in Firestore garbymobile-f89ac dove sono i messaggi WA in arrivo:

python3 -c "
import firebase_admin, json
from firebase_admin import firestore
app = firebase_admin.initialize_app(options={'projectId': 'garbymobile-f89ac'})
db = firestore.client(app)

# Cerca collection WA inbox
for c in db.collections():
    if any(k in c.id.lower() for k in ['whatsapp', 'wa_', 'inbox', 'messaggi', 'in_arrivo', 'cosmina_inbox']):
        print(f'TROVATA: {c.id}')
        docs = c.limit(3).get()
        for d in docs:
            print(json.dumps(d.to_dict(), default=str, indent=2)[:1000])
            print('---')
"

Mappa:
- Nome collection
- Schema messaggio (mittente, testo, data, allegati, stato, letto/non letto)
- Come viene processato oggi (chi lo legge, che azioni fanno)
- Quanti messaggi ci sono

Salva in context/memo-wa-inbox-cosmina.md

## 2. NEXUS — Intercetta e analizza i messaggi WA

Crea handler in handlers/echo.js (o nuovo file handlers/echo-wa-inbox.js):

handleWaInbox():
- Leggi gli ultimi messaggi WA non letti/non gestiti da COSMINA
- Per ogni messaggio, analizza con Haiku:
  - Chi è il mittente? (cerca nella rubrica COSMINA)
  - Cosa chiede? (intent: guasto, informazione, appuntamento, preventivo, lamentela, ecc.)
  - Urgenza? (bassa, media, alta)
  - Azione suggerita?
- Ritorna la lista analizzata

Aggiungi al routing NEXUS:
- "messaggi WA in arrivo" → mostra lista messaggi con analisi
- "analizza ultimo WA" → analizza l'ultimo messaggio ricevuto

## 3. Notifica push per nuovi WA

Cloud Function trigger: quando arriva un nuovo messaggio nella collection WA inbox di COSMINA:
- onDocumentCreated sulla collection dei messaggi WA
- Analizza il messaggio con Haiku (intent + urgenza)
- Se urgente → push notification ad Alberto: "WA urgente da [nome]: [riassunto]. Vuoi che [azione suggerita]?"
- Se normale → aggrega e mostra nel digest o nella dashboard

## 4. Dashboard WA nella PWA

Nella pagina ECHO della PWA, aggiungi sezione "WhatsApp in arrivo":
- Lista messaggi non gestiti con: mittente, anteprima, data, urgenza (badge colorato)
- Per ogni messaggio: bottone "Analizza" → NEXUS propone azione
- Bottone "Gestisci" → apre NEXUS Chat con contesto del messaggio

## 5. Flusso completo

Esempio:
1. Cliente manda WA al numero ACG: "Buongiorno, la caldaia del Condominio Kristal non parte"
2. Waha riceve → COSMINA salva in collection inbox
3. Cloud Function trigger → Haiku analizza: intent=GUASTO_URGENTE, condominio=Kristal
4. Push notification ad Alberto: "🔴 Guasto caldaia Kristal. Apro intervento e mando tecnico?"
5. Alberto tocca → NEXUS Chat si apre → "Sì, manda Malvicino"
6. ARES apre intervento → CHRONOS trova slot → ECHO manda WA al tecnico + conferma al cliente

## 6. Deploy + test
## 7. Committa con "feat(echo): intercetta WA inbox COSMINA + analisi intent"
