# MEMO — WA Inbox COSMINA

Collezione investigata: **`cosmina_inbox`** (progetto Firebase `garbymobile-f89ac`).

## Collection principale

### `cosmina_inbox`
Unificata per tutti i messaggi inbound (e outbound manuali) su canali diversi.
È **la fonte primaria** da cui NEXUS deve leggere per "messaggi WA in arrivo".

#### Schema (campi osservati)

| Campo | Tipo | Note |
|---|---|---|
| `fonte` | string | `"whatsapp"` / `"telefono"` / `"email"` — **filtro principale per WA** |
| `direzione` | string | `"entrata"` (inbound) / `"uscita"` (outbound) |
| `stato` | string | `"aperto"` / `"chiuso"` / `"in_lavorazione"` |
| `categoria` | string | `"segnalazione"` / `"comunicazione"` / `"guasto"` / `"informazione"` / `"preventivo"` |
| `urgente` | bool | flag manuale o auto |
| `archived` | bool | messaggi archiviati (nasconderli nella dashboard) |
| `from_name` | string | nome contatto (se rubrica) o numero raw |
| `from_number` | string | numero WA o telefono |
| `chat_id` | string | es. `"393387179918@c.us"` (formato WA) o `"@lid"` |
| `message_id` | string | id univoco (serve per dedupe) |
| `body` | string | testo messaggio |
| `body_html` | string | solo se `fonte=email` |
| `subject` | string | solo email |
| `sintesi_ai` | string | eventuale riassunto generato da un chatbot esistente |
| `cliente_id` | string | FK verso `crm_clienti` (es. `"T077"`) |
| `in_riferimenti_crm` | bool | cliente riconosciuto e agganciato |
| `mittente_sconosciuto` | bool | mittente non in rubrica |
| `media_type` / `media_url` | string | allegati |
| `wa_timestamp` | timestamp | ora invio (WA) |
| `created_at` / `updated_at` | timestamp | lavorazione interna |
| `operatore_inserimento` | string | chi ha preso in carico (es. `"SARA"`, `"Claude"`) |
| `preso_in_carico_da` | string | assegnatario |
| `template_id` | string | se è risposta da template |

#### Query tipiche

```js
// Messaggi WA non ancora gestiti, in ordine cronologico
db.collection("cosmina_inbox")
  .where("fonte", "==", "whatsapp")
  .where("direzione", "==", "entrata")
  .where("stato", "==", "aperto")
  .orderBy("created_at", "desc")
  .limit(50);

// Solo messaggi urgenti
.where("urgente", "==", true)
```

## Collection accessorie

### `whatsapp_messages_log`
Log grezzo di tutti i messaggi WA (inbound + outbound), con payload Waha completo.
Contiene molto rumore (presence, typing, ack). **Non usare direttamente** per
la UX NEXUS — usa `cosmina_inbox` che è già filtrata.

### `cosmina_wa_pending`
Richieste WA parzialmente parsate che aspettano dati mancanti (es. "Rimettere
6-21 per Bergamini" con `mancanti: ["tecnici"]`). Usata da chatbot esistente
per chiedere completamenti. Non duplicare.

### `whatsapp_routing_rules`, `whatsapp_config`, `whatsapp_stats`
Configurazione e metriche Waha. Non rilevanti per NEXUS inbox.

### `acg_chat_messages`, `acg_chatbot_sessions`, `cosmina_chat_messages`
Sono canali di chat interni (chatbot Darwin, notifiche trigger) — **non** WA
esterno. Ignorali per questo workflow.

## Come viene processato oggi

Da `cosmina_inbox` emerge che:
- Ci sono già **categorie** popolate a mano o da un chatbot (`SARA`, `Claude`).
- Molti doc hanno `sintesi_ai` già generata.
- C'è dedupe esplicito (`message_id`).
- Operatori umani chiudono i messaggi (`stato: "chiuso"`, `preso_in_carico_da`).

## Approccio NEXUS v0.1

Per evitare conflitti con il flow esistente:
1. **Non sovrascrivere** `categoria` / `sintesi_ai` se già popolate → usa un
   campo separato `nexo_analysis` (o doc separato `nexo_inbox_analysis/{msgId}`).
2. **Trigger onCreate**: al create di un doc `cosmina_inbox` con
   `fonte == "whatsapp"` e `direzione == "entrata"`, se `nexo_analysis` manca,
   chiama Haiku per intent+urgenza e salva.
3. **Push urgenza**: se Haiku ritorna `urgenza: "critica"|"alta"` e
   `archived: false` → push notification ad Alberto.
4. **Dashboard**: NEXUS chat comando "messaggi WA in arrivo" lista gli ultimi 20
   con `sintesi_ai` (se c'è) o `nexo_analysis.riepilogo`.

## Limiti noti

- `cosmina_inbox` è nel progetto `garbymobile-f89ac` — le functions NEXO devono
  usare `getCosminaDb()` (già implementato in `handlers/shared.js`).
- Per scrivere su `cosmina_inbox` (mark come "analizzato NEXO"), servono
  **Admin SDK credentials** su quel progetto → già disponibili perché Admin
  SDK eredita le credenziali del service account di Cloud Functions e
  `garbymobile-f89ac` è raggiungibile (vedi handlers esistenti come
  `handleMemoDossier` che legge `crm_clienti`, `cosmina_impianti`).
- Il trigger `onDocumentCreated` deve essere **sul progetto garbymobile-f89ac**
  → NON possiamo fare un trigger Firestore sul progetto secondario da una
  function deployata su `nexo-hub-15f2d`. Soluzione: polling schedulato ogni
  5 min che processa i nuovi doc. Alternativa: deploy di una function trigger
  direttamente sul progetto `garbymobile-f89ac` (fuori scope v0.1).
