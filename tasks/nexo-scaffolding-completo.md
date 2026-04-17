# NEXO — Setup completo di tutti i Colleghi

Leggi prima il file context/nexo-architettura.md per il contesto.

## Istruzioni generali

Per OGNI Collega crea questa struttura:
```
projects/{nome}/
├── README.md
├── package.json          # nexo-{nome}, type: module
├── tsconfig.json         # strict, ESM, ES2022, NodeNext
├── .env.example
├── src/
│   ├── types/index.ts    # Tipi del dominio
│   ├── actions/index.ts  # Tutte le azioni (stub con throw "Not implemented")
│   ├── listeners/index.ts # Listener sulla Lavagna (quali messaggi ascolta)
│   └── index.ts          # Entry point: init Firebase, registra listener, espone azioni
├── tests/
│   └── actions.test.ts
└── prompts/              # Solo se usa LLM
    └── system.md
```

Ogni `package.json`:
```json
{
  "name": "nexo-{nome}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "firebase-admin": "^13.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0",
    "tsx": "^4.0.0"
  }
}
```

Ogni `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

Ogni `src/index.ts`:
```typescript
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "dotenv";

config();

const app = initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d",
});

const db = getFirestore(app);

export { db };

// TODO: registra listener sulla Lavagna
// TODO: esponi azioni come API o Cloud Functions
```

Ogni `src/listeners/index.ts`:
```typescript
import { db } from "../index.js";

// Ascolta messaggi sulla Lavagna destinati a questo Collega
export async function startListening(collegaName: string) {
  db.collection("nexo_lavagna")
    .where("to", "==", collegaName)
    .where("status", "==", "pending")
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const msg = change.doc.data();
          console.log(`[${collegaName.toUpperCase()}] Nuovo messaggio: ${msg.type} da ${msg.from}`);
          // TODO: routing per tipo messaggio → azione corrispondente
        }
      });
    });
}
```

---

## 1. projects/echo/ — Collega Comunicazione

### README.md
```markdown
# ECHO — Collega Comunicazione

Gestisce TUTTA la comunicazione in uscita di NEXO su qualsiasi canale.

## Dominio
Comunicazione multi-canale: WhatsApp, Telegram, email, notifiche push, voce (TTS/STT).

## Principio
ECHO non decide cosa comunicare — gli altri Colleghi gli dicono cosa mandare, a chi, e su quale canale. ECHO si occupa solo della consegna.

## Canali supportati
- WhatsApp (via Waha API, già operativo per COSMINA Inbox)
- Telegram (Bot API)
- Email (Exchange EWS / SMTP)
- Notifiche push (Firebase Cloud Messaging)
- Voce TTS (edge-tts, voce Diego)
- Voce STT (faster-whisper per trascrizione)

## Collections Firestore
- echo_messages: storico messaggi inviati
- echo_channels: configurazione canali
- echo_preferences: preferenze utente per canale
- echo_templates: template messaggi per tipo

## Stato
Da costruire. Codice voce già disponibile in /mnt/c/HERMES/src/
```

### src/types/index.ts
```typescript
export type Channel = "whatsapp" | "telegram" | "email" | "push" | "voice" | "sms";
export type MessageStatus = "pending" | "queued" | "sent" | "delivered" | "failed" | "read";
export type MessagePriority = "low" | "normal" | "high" | "critical";

export interface EchoMessage {
  id: string;
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
  bodyHtml?: string;
  priority: MessagePriority;
  attachments?: Array<{ name: string; url: string; mimeType: string }>;
  status: MessageStatus;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  sourceMessageId?: string;
  sourceLavagnaId?: string;
  richiedente: string;
  createdAt: string;
  updatedAt: string;
}

export interface EchoPreferences {
  userId: string;
  defaultChannel: Channel;
  whatsappNumber?: string;
  telegramChatId?: string;
  email?: string;
  pushToken?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  urgentBypassQuietHours: boolean;
  digestOrari?: string[];
  lingua: string;
}

export interface EchoTemplate {
  id: string;
  nome: string;
  canale: Channel;
  tipo: string;
  corpo: string;
  variabili: string[];
}

export interface DigestConfig {
  userId: string;
  orario: string;
  canale: Channel;
  tipo: "mattutino" | "pranzo" | "serale";
  attivo: boolean;
}

export interface VoiceSession {
  id: string;
  userId: string;
  stato: "idle" | "listening" | "processing" | "speaking";
  ultimoInput?: string;
  ultimoOutput?: string;
  inizioAt: string;
}
```

### src/actions/index.ts
```typescript
import type { EchoMessage, Channel, DigestConfig } from "../types/index.js";

// === INVIO MESSAGGI ===

export async function sendMessage(message: Omit<EchoMessage, "id" | "status" | "createdAt" | "updatedAt">): Promise<EchoMessage> {
  // Routing per canale → chiama il metodo specifico
  // Rispetta quiet hours (tranne per priority critical)
  // Retry automatico su fallimento (max 3 tentativi)
  // Salva in echo_messages
  throw new Error("Not implemented");
}

export async function sendWhatsApp(to: string, body: string, attachments?: string[]): Promise<void> {
  // Waha API: POST /api/sendText o /api/sendFile
  // Supporta: testo, immagini, PDF, audio
  // Gestisce numeri italiani (+39)
  throw new Error("Not implemented");
}

export async function sendTelegram(chatId: string, body: string, parseMode?: "HTML" | "Markdown"): Promise<void> {
  // Telegram Bot API: sendMessage
  // Supporta formattazione HTML/Markdown
  throw new Error("Not implemented");
}

export async function sendEmail(to: string, subject: string, body: string, bodyHtml?: string, attachments?: string[]): Promise<void> {
  // Exchange EWS via exchangelib o SMTP
  // Supporta allegati, HTML, CC/BCC
  throw new Error("Not implemented");
}

export async function sendPushNotification(userId: string, title: string, body: string, data?: object): Promise<void> {
  // Firebase Cloud Messaging
  // Supporta azioni cliccabili (deep link alla PWA)
  throw new Error("Not implemented");
}

// === VOCE ===

export async function speak(text: string, voice?: string): Promise<string> {
  // edge-tts: genera audio da testo
  // Voice default: it-IT-DiegoNeural (come HERMES)
  // Ritorna path del file audio generato
  // Ref: /mnt/c/HERMES/src/tts/
  throw new Error("Not implemented");
}

export async function transcribe(audioPath: string, language?: string): Promise<string> {
  // faster-whisper: trascrizione audio → testo
  // Language default: it
  // Supporta: WAV, MP3, OGG, WebM
  // Ref: /mnt/c/HERMES/src/stt/
  throw new Error("Not implemented");
}

export async function startVoiceSession(userId: string): Promise<string> {
  // Avvia sessione vocale interattiva
  // Ritorna sessionId
  throw new Error("Not implemented");
}

export async function processVoiceCommand(sessionId: string, audioPath: string): Promise<{ text: string; intent: string; response: string }> {
  // Trascrivi → interpreta intent → rispondi vocalmente
  // Intent: "leggi email", "stato intervento", "chiama tecnico", ecc.
  throw new Error("Not implemented");
}

// === DIGEST ===

export async function generaDigest(userId: string, tipo: "mattutino" | "pranzo" | "serale"): Promise<string> {
  // Legge dati da IRIS (email), ARES (interventi), PHARO (alert)
  // Genera riassunto personalizzato per orario
  // Mattina: panoramica notturna, urgenze, agenda del giorno
  // Pranzo: aggiornamento mattinata, nuove richieste
  // Sera: riepilogo giornata, cose pendenti
  throw new Error("Not implemented");
}

export async function inviaDigest(userId: string, digest: string, canale: Channel): Promise<void> {
  // Invia il digest sul canale preferito
  // Se canale == "voice": parla il digest con TTS
  throw new Error("Not implemented");
}

export async function configuraDigest(config: DigestConfig): Promise<void> {
  // Salva configurazione digest in Firestore
  throw new Error("Not implemented");
}

// === BROADCAST ===

export async function broadcast(messaggio: string, destinatari: string[], canale: Channel): Promise<{ inviati: number; falliti: number }> {
  // Invia lo stesso messaggio a più destinatari
  // Utile per comunicazioni ai tecnici, alert di gruppo
  throw new Error("Not implemented");
}

// === TEMPLATE ===

export async function inviaConTemplate(templateId: string, variabili: Record<string, string>, to: string, canale: Channel): Promise<void> {
  // Carica template, sostituisci variabili, invia
  throw new Error("Not implemented");
}

// === STORICO ===

export async function storicoMessaggi(filtri: { userId?: string; canale?: Channel; da?: string; a?: string }): Promise<EchoMessage[]> {
  // Query storico messaggi con filtri
  throw new Error("Not implemented");
}
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
WAHA_API_URL=
WAHA_API_KEY=
WAHA_DEFAULT_SESSION=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID_ALBERTO=
EWS_URL=https://remote.gruppobadano.it/ews/exchange.asmx
EWS_USERNAME=
EWS_PASSWORD=
EDGE_TTS_VOICE=it-IT-DiegoNeural
WHISPER_MODEL=base
FCM_SERVER_KEY=
DIGEST_ORARIO_MATTINA=07:30
DIGEST_ORARIO_PRANZO=13:00
DIGEST_ORARIO_SERA=18:00
```

### Messaggi Lavagna ascoltati
- `notifica` da qualsiasi → invia messaggio
- `alert` da PHARO → notifica urgente
- `digest_pronto` da IRIS → invia digest
- `bozza_approvata` da CALLIOPE → invia email/messaggio
- `agenda_giornaliera` da CHRONOS → parla a voce o manda WA

---

## 2. projects/ares/ — Collega Operativo

### README.md
```markdown
# ARES — Collega Operativo

Gestisce il ciclo di vita degli interventi tecnici: apertura, assegnazione, esecuzione, chiusura, documentazione.

## Dominio
Interventi tecnici su impianti HVAC: guasti, manutenzioni, installazioni, sopralluoghi.

## App toccate
COSMINA, PWA Tecnici, CosminaMobile, Guazzotti TEC

## Tecnici
- Andrea Malvicino (zona Voghera/Stradella, specialista Vaillant)
- Lorenzo Dellafiore (zona Tortona/Alessandria)
- Victor (zona Alessandria)
- Marco (zona Voghera)
- David (zona mobile)

## Collections Firestore
- ares_interventi: interventi aperti e chiusi
- ares_assegnazioni: assegnazioni tecnici
- ares_materiali_usati: materiali consumati per intervento
- ares_rapportini: RTI generati

## Stato
Da costruire. Già riceve dalla Lavagna (IRIS manda RICHIESTA_INTERVENTO e GUASTO_URGENTE).
```

### src/types/index.ts
```typescript
export type InterventoTipo = "guasto" | "manutenzione_ordinaria" | "manutenzione_straordinaria" | "installazione" | "sopralluogo" | "preventivo" | "collaudo" | "pronto_intervento";
export type InterventoStato = "aperto" | "assegnato" | "in_corso" | "sospeso" | "completato" | "annullato" | "da_fatturare";
export type Urgenza = "bassa" | "media" | "alta" | "critica";

export interface Intervento {
  id: string;
  tipo: InterventoTipo;
  stato: InterventoStato;
  urgenza: Urgenza;
  clienteId?: string;
  clienteNome?: string;
  condominioId?: string;
  condominioNome?: string;
  impiantoId?: string;
  impiantoDescrizione?: string;
  indirizzo: string;
  citta?: string;
  zona?: string;
  descrizioneProblema: string;
  diagnosiTecnico?: string;
  esito?: string;
  tecnicoAssegnato?: string;
  tecnicoNome?: string;
  dataAssegnazione?: string;
  dataPianificata?: string;
  oraInizio?: string;
  oraFine?: string;
  dataChiusura?: string;
  oreLavorate?: number;
  oreViaggio?: number;
  materialiUsati: MaterialeUsato[];
  costoMateriali?: number;
  costoManodopera?: number;
  costoTotale?: number;
  note?: string;
  foto?: string[];
  rtiGenerato?: boolean;
  rtiUrl?: string;
  fatturaEmessa?: boolean;
  sourceEmailId?: string;
  sourceLavagnaId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialeUsato {
  codiceArticolo: string;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  prelevato: string;  // "magazzino_centrale" | "furgone_malvicino" | ecc.
}

export interface Tecnico {
  uid: string;
  nome: string;
  cognome: string;
  zona: string[];
  competenze: string[];  // "vaillant", "baxi", "climatizzazione", "centrali_termiche"
  telefono: string;
  email?: string;
  attivo: boolean;
  maxInterventiGiorno: number;
  costoOrario: number;
}

export interface AssegnazioneCriteri {
  zona: string;
  competenzeRichieste?: string[];
  urgenza: Urgenza;
  dataPreferita?: string;
  escludiTecnici?: string[];
}

export interface PropostaAssegnazione {
  tecnicoUid: string;
  tecnicoNome: string;
  slot: string;
  distanzaKm?: number;
  caricoGiornaliero: number;
  punteggio: number;  // 0-100, più alto = migliore match
  motivazione: string;
}
```

### src/actions/index.ts
```typescript
import type { Intervento, InterventoTipo, Urgenza, MaterialeUsato, AssegnazioneCriteri, PropostaAssegnazione, Tecnico } from "../types/index.js";

// === CICLO DI VITA INTERVENTO ===

export async function apriIntervento(params: {
  tipo: InterventoTipo;
  urgenza: Urgenza;
  descrizioneProblema: string;
  indirizzo: string;
  clienteId?: string;
  condominioId?: string;
  impiantoId?: string;
  sourceEmailId?: string;
}): Promise<Intervento> {
  // Crea intervento in Firestore
  // Se urgenza critica → scrive sulla Lavagna per ECHO (notifica immediata)
  // Chiede a MEMO il dossier cliente per contesto
  throw new Error("Not implemented");
}

export async function assegnaTecnico(interventoId: string, tecnicoUid?: string): Promise<PropostaAssegnazione> {
  // Se tecnicoUid fornito: assegna direttamente
  // Altrimenti: proponi il migliore basandosi su:
  //   - zona dell'intervento vs zona del tecnico
  //   - competenze richieste (marca impianto)
  //   - carico di lavoro giornaliero
  //   - distanza stimata
  // Chiede a CHRONOS gli slot disponibili
  throw new Error("Not implemented");
}

export async function proponiAssegnazioni(interventoId: string, criteri?: AssegnazioneCriteri): Promise<PropostaAssegnazione[]> {
  // Ritorna le top 3 proposte di assegnazione con punteggio
  // Chiede a CHRONOS: slot disponibili per ogni tecnico
  // Chiede a EMPORION: se il materiale probabile è disponibile sul furgone del tecnico
  throw new Error("Not implemented");
}

export async function iniziaIntervento(interventoId: string): Promise<void> {
  // Segna come "in_corso", registra ora inizio
  throw new Error("Not implemented");
}

export async function sospendiIntervento(interventoId: string, motivo: string): Promise<void> {
  // Segna come "sospeso" (es: manca ricambio, cliente assente)
  // Se motivo è ricambio mancante → scrive a EMPORION
  throw new Error("Not implemented");
}

export async function chiudiIntervento(interventoId: string, params: {
  esito: string;
  diagnosiTecnico?: string;
  oreLavorate: number;
  oreViaggio?: number;
  materialiUsati?: MaterialeUsato[];
  foto?: string[];
  note?: string;
}): Promise<void> {
  // Chiude intervento
  // Calcola costi (manodopera + materiali)
  // Aggiorna giacenze magazzino via Lavagna → EMPORION
  // Se tipo richiede DiCo → scrive a DIKEA
  // Scrive a ECHO per notifica Alberto
  throw new Error("Not implemented");
}

export async function annullaIntervento(interventoId: string, motivo: string): Promise<void> {
  // Annulla intervento, libera slot in CHRONOS
  throw new Error("Not implemented");
}

// === RTI E DOCUMENTAZIONE ===

export async function generaRTI(interventoId: string): Promise<string> {
  // Genera Rapporto Tecnico Intervento via GRAPH API
  // Include: dati cliente, impianto, lavoro svolto, materiali, foto
  // Ritorna URL del PDF
  throw new Error("Not implemented");
}

export async function generaPreventivo(params: {
  clienteId: string;
  descrizione: string;
  righe: Array<{ descrizione: string; quantita: number; prezzoUnitario: number }>;
  note?: string;
}): Promise<string> {
  // Genera preventivo via GRAPH API
  // Ritorna URL del PDF
  throw new Error("Not implemented");
}

// === QUERY ===

export async function interventiAperti(filtri?: { tecnico?: string; zona?: string; urgenza?: Urgenza }): Promise<Intervento[]> {
  // Lista interventi aperti con filtri
  throw new Error("Not implemented");
}

export async function cercaStoricoInterventi(params: { impiantoId?: string; clienteId?: string; condominioId?: string }): Promise<Intervento[]> {
  // Storico interventi per diagnosi
  throw new Error("Not implemented");
}

export async function statisticheInterventi(periodo: { da: string; a: string }): Promise<{
  totali: number;
  completati: number;
  annullati: number;
  tempoMedioChiusura: number;
  perTecnico: Record<string, number>;
  perTipo: Record<string, number>;
  perZona: Record<string, number>;
}> {
  throw new Error("Not implemented");
}

// === NOTIFICHE TECNICO ===

export async function notificaTecnico(tecnicoUid: string, messaggio: string, tipo?: "info" | "urgente"): Promise<void> {
  // Push su cosmina_notifiche + opzionale WA via ECHO
  throw new Error("Not implemented");
}

export async function briefingTecnico(tecnicoUid: string, data: string): Promise<object> {
  // Prepara briefing giornaliero: lista interventi, indirizzi, materiali necessari
  // Passa a ECHO per invio WA/voce
  throw new Error("Not implemented");
}

// === TECNICI ===

export async function listaTecnici(attivi?: boolean): Promise<Tecnico[]> {
  throw new Error("Not implemented");
}

export async function caricoTecnico(tecnicoUid: string, data: string): Promise<{ interventi: number; ore: number; maxRaggiunto: boolean }> {
  throw new Error("Not implemented");
}
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
COSMINA_PROJECT_ID=acg-clima-service
GUAZZOTTI_PROJECT_ID=guazzotti-energia
GRAPH_API_URL=
COSTO_ORARIO_DEFAULT=35
MAX_INTERVENTI_GIORNO_DEFAULT=5
```

### Messaggi Lavagna ascoltati
- `richiesta_intervento` da IRIS
- `guasto_urgente` da IRIS (priority: critical)
- `slot_proposto` da CHRONOS (risposta a richiesta slot)
- `disponibilita_risposta` da EMPORION (ricambio disponibile?)

### Messaggi Lavagna emessi
- `richiesta_slot` → CHRONOS
- `richiesta_disponibilita_ricambio` → EMPORION
- `richiesta_dossier` → MEMO
- `richiesta_dico` → DIKEA
- `intervento_completato` → ECHO (notifica)
- `notifica` → ECHO
- `materiali_consumati` → EMPORION (aggiorna giacenze)

---

## 3. projects/chronos/ — Collega Pianificatore

### README.md
```markdown
# CHRONOS — Collega Pianificatore

Unico responsabile del "quando". Gestisce agende tecnici, scadenze, campagne stagionali.

## Dominio
Tempo e disponibilità. Non apre interventi (lo fa ARES), ma sa quando farli.

## Collections Firestore
- chronos_agende: slot giornalieri per tecnico
- chronos_scadenze: tutte le scadenze (manutenzione, contratti, normative)
- chronos_campagne: campagne stagionali (accensione/spegnimento)
- chronos_festivi: giorni festivi e ferie tecnici

## Stato
Da costruire. Tier 1.
```

### src/types/index.ts
```typescript
export interface Slot {
  id: string;
  tecnicoUid: string;
  data: string;
  oraInizio: string;
  oraFine: string;
  tipo: "disponibile" | "intervento" | "viaggio" | "pausa" | "ferie" | "malattia";
  interventoId?: string;
  note?: string;
}

export interface AgendaGiornaliera {
  tecnicoUid: string;
  tecnicoNome: string;
  data: string;
  slot: Slot[];
  oreDisponibili: number;
  oreOccupate: number;
  interventiPianificati: number;
  primoSlotLibero?: string;
}

export interface Scadenza {
  id: string;
  tipo: "manutenzione_ordinaria" | "manutenzione_straordinaria" | "contratto" | "curit_ree" | "fgas" | "garanzia" | "campagna" | "revisione";
  riferimentoId: string;
  riferimentoTipo: "impianto" | "cliente" | "condominio" | "contratto";
  descrizione: string;
  dataScadenza: string;
  giorniAnticipo: number;
  notificato: boolean;
  completato: boolean;
  assegnatoA?: string;
  ricorrenza?: "mensile" | "trimestrale" | "semestrale" | "annuale";
  ultimoCompletamento?: string;
}

export interface Campagna {
  id: string;
  nome: string;
  tipo: "accensione" | "spegnimento" | "manutenzione_estiva" | "manutenzione_invernale";
  anno: number;
  comuni: string[];
  dataInizio: string;
  dataFine: string;
  impiantiTotali: number;
  impiantiPianificati: number;
  impiantiCompletati: number;
  stato: "pianificazione" | "in_corso" | "completata";
  tecnici: string[];
}

export interface Festivita {
  data: string;
  descrizione: string;
  tipo: "festivo_nazionale" | "ferie" | "malattia" | "permesso";
  tecnicoUid?: string;  // null = vale per tutti
}

export interface ConflittoAgenda {
  tipo: "sovrapposizione" | "sovraccarico" | "zona_lontana" | "competenza_mancante";
  tecnicoUid: string;
  data: string;
  descrizione: string;
  suggerimento: string;
}
```

### src/actions/index.ts
```typescript
import type { Slot, AgendaGiornaliera, Scadenza, Campagna, ConflittoAgenda } from "../types/index.js";

// === AGENDA ===

export async function slotDisponibili(params: {
  tecnicoUid?: string;
  zona?: string;
  competenzeRichieste?: string[];
  giorniAvanti?: number;
  durataMinima?: number;
}): Promise<Array<{ tecnicoUid: string; tecnicoNome: string; slots: Slot[] }>> {
  // Cerca slot liberi per uno o tutti i tecnici
  // Filtra per zona, competenze, durata minima
  // Esclude festivi e ferie
  throw new Error("Not implemented");
}

export async function agendaGiornaliera(tecnicoUid: string, data: string): Promise<AgendaGiornaliera> {
  // Agenda completa del giorno: interventi, viaggi, pause
  // Include indirizzi e orari per briefing
  throw new Error("Not implemented");
}

export async function agendaSettimanale(tecnicoUid: string, settimana: string): Promise<AgendaGiornaliera[]> {
  // Vista settimanale
  throw new Error("Not implemented");
}

export async function prenotaSlot(tecnicoUid: string, data: string, oraInizio: string, oraFine: string, interventoId: string): Promise<Slot> {
  // Prenota slot per intervento
  // Controlla conflitti prima di prenotare
  throw new Error("Not implemented");
}

export async function liberaSlot(slotId: string): Promise<void> {
  // Libera slot (intervento annullato/riprogrammato)
  throw new Error("Not implemented");
}

// === SCADENZE ===

export async function scadenzeProssime(params: {
  zona?: string;
  finestraGiorni: number;
  tipo?: string;
  soloNonNotificate?: boolean;
}): Promise<Scadenza[]> {
  // Scadenze in arrivo entro N giorni
  throw new Error("Not implemented");
}

export async function creaScadenza(scadenza: Omit<Scadenza, "id" | "notificato" | "completato">): Promise<Scadenza> {
  throw new Error("Not implemented");
}

export async function completaScadenza(scadenzaId: string): Promise<void> {
  // Segna come completata, se ricorrente crea la prossima
  throw new Error("Not implemented");
}

export async function scadenzeScadute(): Promise<Scadenza[]> {
  // Scadenze passate e non completate (alert)
  throw new Error("Not implemented");
}

// === CAMPAGNE ===

export async function pianificaCampagna(params: {
  nome: string;
  tipo: "accensione" | "spegnimento";
  anno: number;
  comuni: string[];
  dataInizio: string;
  dataFine: string;
}): Promise<Campagna> {
  // Crea campagna, calcola impianti coinvolti
  // Propone distribuzione tecnici per zona
  throw new Error("Not implemented");
}

export async function avanzamentoCampagna(campagnaId: string): Promise<{
  completamento: number;
  rimanenti: number;
  stimaFine: string;
  perTecnico: Record<string, { fatti: number; rimanenti: number }>;
}> {
  throw new Error("Not implemented");
}

// === CONFLITTI E OTTIMIZZAZIONE ===

export async function trovaConflitti(data: string, tecnicoUid?: string): Promise<ConflittoAgenda[]> {
  // Trova sovrapposizioni, sovraccarichi, zone lontane
  throw new Error("Not implemented");
}

export async function riprogramma(interventoId: string, nuovaData: string, nuovoSlot: string, motivo: string): Promise<void> {
  // Sposta intervento, libera vecchio slot, prenota nuovo
  // Notifica tecnico via ECHO
  throw new Error("Not implemented");
}

export async function ottimizzaGiornata(tecnicoUid: string, data: string): Promise<{
  ordineConsigliato: string[];
  kmTotaliStimati: number;
  tempoViaggio: number;
}> {
  // Ordine ottimale degli interventi per minimizzare km
  throw new Error("Not implemented");
}

// === FERIE E FESTIVI ===

export async function registraFerie(tecnicoUid: string, da: string, a: string, motivo?: string): Promise<void> {
  throw new Error("Not implemented");
}

export async function registraMalattia(tecnicoUid: string, da: string, a?: string): Promise<void> {
  throw new Error("Not implemented");
}

// === INTEGRAZIONE CALENDARIO ===

export async function sincronizzaGoogleCalendar(tecnicoUid: string): Promise<void> {
  // Sync bidirezionale con Google Calendar del tecnico
  throw new Error("Not implemented");
}
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
COSMINA_PROJECT_ID=acg-clima-service
GOOGLE_CALENDAR_CREDENTIALS=
ORE_LAVORATIVE_GIORNO=8
ORA_INIZIO_DEFAULT=08:00
ORA_FINE_DEFAULT=17:00
PAUSA_PRANZO_INIZIO=12:30
PAUSA_PRANZO_FINE=13:30
```

### Messaggi Lavagna ascoltati
- `richiesta_slot` da ARES
- `scadenza_normativa` da DIKEA
- `richiesta_riprogrammazione` da ARES

### Messaggi Lavagna emessi
- `slot_proposto` → ARES
- `scadenza_imminente` → ECHO (notifica)
- `conflitto_agenda` → ARES
- `agenda_giornaliera` → ECHO (briefing tecnico)

---

## 4. projects/memo/ — Collega Memoria

### README.md
```markdown
# MEMO — Collega Memoria

Il "chi è costui" di ogni Collega. Dossier unificato per cliente, condominio, impianto.

## Dominio
Aggregazione dati da tutte le fonti: COSMINA, DOC, READER, dischi di rete, Guazzotti TEC.
MEMO non modifica i dati — li legge, li aggrega, li restituisce.

## Collections Firestore
- memo_dossier: dossier completi (cache)
- memo_cache: cache query costose
- memo_relazioni: grafo relazioni (cliente → condominio → impianto)

## Stato
Da costruire. Tier 1.
```

### src/types/index.ts
```typescript
export type TipoCliente = "privato" | "condominio" | "azienda" | "ente_pubblico";

export interface DossierCliente {
  clienteId: string;
  nome: string;
  tipo: TipoCliente;
  contatti: {
    email?: string[];
    telefono?: string[];
    pec?: string;
    indirizzo?: string;
    citta?: string;
    cap?: string;
    codiceFiscale?: string;
    partitaIva?: string;
  };
  amministratore?: {
    nome: string;
    studio: string;
    email: string;
    telefono: string;
  };
  impianti: ImpiantoSintesi[];
  interventiRecenti: InterventoSintesi[];
  fattureRecenti: FatturaSintesi[];
  emailRecenti: EmailSintesi[];
  esposizione: { fatturato: number; incassato: number; esposizione: number; mediaGiorniPagamento: number };
  documentiSuDisco: DocumentoDisco[];
  contratti: ContrattoSintesi[];
  note: string[];
  sentiment: string;  // sentiment medio dalle email
  ultimoContatto: string;
  rischioChurn: "basso" | "medio" | "alto";
  createdAt: string;
  updatedAt: string;
}

export interface ImpiantoSintesi {
  id: string;
  tipo: string;
  marca: string;
  modello: string;
  targa?: string;
  indirizzo: string;
  annoInstallazione?: number;
  stato: "attivo" | "dismesso" | "in_garanzia";
  ultimaManutenzione?: string;
  prossimaManutenzione?: string;
}

export interface InterventoSintesi {
  id: string;
  data: string;
  tipo: string;
  tecnico: string;
  esito: string;
  costo?: number;
}

export interface FatturaSintesi {
  numero: string;
  data: string;
  importo: number;
  stato: string;
}

export interface EmailSintesi {
  id: string;
  data: string;
  oggetto: string;
  categoria: string;
  sentiment: string;
}

export interface DocumentoDisco {
  percorso: string;
  nome: string;
  tipo: "contratto" | "fattura" | "preventivo" | "scheda_tecnica" | "foto" | "certificazione" | "altro";
  dataModifica: string;
  dimensione: number;
}

export interface ContrattoSintesi {
  id: string;
  tipo: string;
  dataInizio: string;
  dataFine: string;
  importoAnnuo: number;
  stato: "attivo" | "scaduto" | "disdetto";
}

export interface StoricoImpianto {
  impiantoId: string;
  targa?: string;
  marca: string;
  modello: string;
  potenza?: string;
  combustibile?: string;
  annoInstallazione?: number;
  indirizzo: string;
  clienteId: string;
  clienteNome: string;
  interventi: Array<{ data: string; tipo: string; tecnico: string; note: string; materiali: string[] }>;
  ricambiSostituiti: Array<{ data: string; codice: string; descrizione: string; fornitore?: string }>;
  consumi?: Array<{ anno: number; consumo: number; unita: string }>;
  certificazioni: Array<{ tipo: string; numero: string; data: string; scadenza: string }>;
  ultimaManutenzione?: string;
  prossimaManutenzione?: string;
  conformitaCURIT?: { stato: string; ultimoControllo: string; prossimo: string };
}

export interface Relazione {
  daId: string;
  daTipo: "cliente" | "condominio" | "impianto" | "tecnico";
  aId: string;
  aTipo: "cliente" | "condominio" | "impianto" | "tecnico";
  relazione: string;  // "proprietario_di", "installato_in", "gestito_da", "manutentore_di"
}
```

### src/actions/index.ts
```typescript
import type { DossierCliente, StoricoImpianto, DocumentoDisco, Relazione } from "../types/index.js";

// === DOSSIER ===

export async function dossierCliente(clienteId: string, forceRefresh?: boolean): Promise<DossierCliente> {
  // Aggrega da COSMINA (crm_clienti, cosmina_impianti, cosmina_interventi_pianificati)
  // + Guazzotti TEC (rti, commesse)
  // + dischi N/I (documenti)
  // + IRIS (email recenti e sentiment)
  // + CHARTA (esposizione)
  // Cache in Firestore (TTL 1 ora, force refresh disponibile)
  throw new Error("Not implemented");
}

export async function dossierCondominio(condominioId: string): Promise<DossierCliente> {
  // Come dossierCliente ma per condominio
  // Include: tutti gli impianti, storico interventi, amministratore, contratto
  throw new Error("Not implemented");
}

// === STORICO IMPIANTO ===

export async function storicoImpianto(idOrTarga: string): Promise<StoricoImpianto> {
  // Tutto sullo specifico impianto: interventi, ricambi, consumi, certificazioni
  throw new Error("Not implemented");
}

export async function impiantiCliente(clienteId: string): Promise<ImpiantoSintesi[]> {
  throw new Error("Not implemented");
}

// === RICERCA DOCUMENTI ===

export async function cercaDocumenti(params: {
  clienteNome?: string;
  clienteId?: string;
  tipo?: string;
  pattern?: string;
  disco?: "N" | "I" | "L" | "M";
}): Promise<DocumentoDisco[]> {
  // Cerca nei dischi di rete
  // Pattern: regex o glob per nome file
  throw new Error("Not implemented");
}

export async function leggiDocumento(percorso: string): Promise<{ contenuto: string; metadata: object }> {
  // Leggi contenuto documento (PDF → testo, Excel → JSON, ecc.)
  throw new Error("Not implemented");
}

// === TIMELINE ===

export async function ultimiContatti(clienteId: string, n: number): Promise<Array<{
  tipo: "email" | "intervento" | "fattura" | "telefonata" | "nota";
  data: string;
  descrizione: string;
  dettagli?: object;
}>> {
  // Timeline unificata cross-source
  throw new Error("Not implemented");
}

// === ANAGRAFICA ===

export async function matchAnagrafica(nome: string): Promise<Array<{ 
  source: string; 
  id: string; 
  nome: string; 
  tipo: string;
  matchScore: number 
}>> {
  // Cerca nome in COSMINA CRM, crm_clienti, condominium
  // Fuzzy matching per gestire errori di battitura
  throw new Error("Not implemented");
}

export async function nuovoCliente(dati: Partial<DossierCliente>): Promise<string> {
  // Crea nuovo cliente in crm_clienti
  // Controlla duplicati prima di creare
  throw new Error("Not implemented");
}

export async function collegaEntita(relazione: Relazione): Promise<void> {
  // Crea relazione nel grafo (cliente → condominio, impianto → condominio, ecc.)
  throw new Error("Not implemented");
}

// === CONSUMI ===

export async function consumiMedi(condominioId: string, anni?: number): Promise<Array<{ anno: number; consumo: number; costo: number }>> {
  // Da READER: consumi storici per ripartizione UNI 10200
  throw new Error("Not implemented");
}

// === CHURN DETECTION ===

export async function rischioChurn(clienteId: string): Promise<{ rischio: "basso" | "medio" | "alto"; motivi: string[] }> {
  // Analizza: tempo dall'ultimo contatto, sentiment email, scadenza contratto, solleciti ricevuti
  throw new Error("Not implemented");
}

// === RICERCA SEMANTICA ===

export async function cercaPerContesto(query: string): Promise<Array<{ tipo: string; id: string; nome: string; rilevanza: number; snippet: string }>> {
  // Ricerca semantica cross-source: "caldaia che perde al terzo piano"
  // → trova impianti, interventi, email correlate
  throw new Error("Not implemented");
}
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
COSMINA_PROJECT_ID=acg-clima-service
GUAZZOTTI_PROJECT_ID=guazzotti-energia
DISCO_N_PATH=/mnt/n
DISCO_I_PATH=/mnt/i
DISCO_L_PATH=/mnt/l
DISCO_M_PATH=/mnt/m
DOSSIER_CACHE_TTL_MINUTES=60
```

### Messaggi Lavagna ascoltati
- `richiesta_dossier` da qualsiasi Collega
- `nuovo_cliente_rilevato` da IRIS

### Messaggi Lavagna emessi
- `dossier_pronto` → richiedente
- `alert_churn` → ECHO (notifica)
- `nuovo_cliente_creato` → IRIS, ARES

---

## 5. projects/charta/ — Collega Amministrativo

### README.md
```markdown
# CHARTA — Collega Amministrativo

Gestisce il flusso documentale e finanziario: fatture, DDT, incassi, pagamenti, esposizioni.

## Dominio
Soldi in entrata e in uscita. Tutto ciò che è documento contabile.

## Collections Firestore
- charta_fatture: fatture emesse e ricevute
- charta_pagamenti: pagamenti e incassi registrati
- charta_scadenze: scadenze pagamenti
- charta_ddt: DDT ricevuti e inviati
- charta_riconciliazioni: match DDT ↔ fattura ↔ ordine

## Stato
Da costruire. Tier 2.
```

### src/types/index.ts
```typescript
export type DocumentoTipo = "fattura_emessa" | "fattura_ricevuta" | "ddt_ricevuto" | "ddt_emesso" | "nota_credito" | "nota_debito" | "ricevuta" | "ordine";
export type StatoPagamento = "da_pagare" | "pagato_parziale" | "pagato" | "scaduto" | "contestato" | "in_sollecito";
export type MetodoPagamento = "bonifico" | "contanti" | "assegno" | "rid" | "carta" | "compensazione" | "altro";

export interface Fattura {
  id: string;
  tipo: DocumentoTipo;
  numero: string;
  data: string;
  scadenza: string;
  clienteId?: string;
  clienteNome?: string;
  fornitore?: string;
  fornitorePartitaIva?: string;
  righe: RigaFattura[];
  imponibile: number;
  iva: number;
  totale: number;
  stato: StatoPagamento;
  pagatoIl?: string;
  importoPagato?: number;
  metodoPagamento?: MetodoPagamento;
  ddtCollegati?: string[];
  ordineCollegato?: string;
  note?: string;
  sourceEmailId?: string;
  pdfUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RigaFattura {
  descrizione: string;
  codiceArticolo?: string;
  quantita: number;
  prezzoUnitario: number;
  totaleRiga: number;
  aliquotaIva: number;
  sconto?: number;
}

export interface Incasso {
  id: string;
  clienteId: string;
  clienteNome: string;
  importo: number;
  data: string;
  riferimento: string;
  metodo: MetodoPagamento;
  fattureCollegate?: string[];
  note?: string;
  registratoDa: string;
  sourceEmailId?: string;
  createdAt: string;
}

export interface EsposizioneCliente {
  clienteId: string;
  nome: string;
  totaleFatturato12Mesi: number;
  totaleIncassato12Mesi: number;
  esposizione: number;
  fattureScadute: Fattura[];
  mediaGiorniPagamento: number;
  rischioCredito: "basso" | "medio" | "alto";
  suggerimento: string;
}

export interface DDT {
  id: string;
  numero: string;
  data: string;
  fornitore: string;
  righe: Array<{ codice: string; descrizione: string; quantita: number; prezzoUnitario?: number }>;
  fatturaCollegata?: string;
  ordineCollegato?: string;
  stato: "ricevuto" | "verificato" | "contestato";
  differenze?: string[];
}

export interface ReportMensile {
  mese: string;
  emesso: number;
  incassato: number;
  daIncassare: number;
  scaduto: number;
  fattureEmesse: number;
  fattureRicevute: number;
  ddtRicevuti: number;
  margine: number;
  confrontoMesePrecedente: { emesso: number; incassato: number };
  confrontoAnnoPrec: { emesso: number; incassato: number };
}
```

### src/actions/index.ts
```typescript
import type { Fattura, Incasso, EsposizioneCliente, DDT, ReportMensile } from "../types/index.js";

// === FATTURE ===

export async function registraFattura(fattura: Omit<Fattura, "id" | "stato" | "createdAt" | "updatedAt">): Promise<Fattura> {
  // Registra fattura manualmente o da parsing
  throw new Error("Not implemented");
}

export async function parseFatturaFornitore(pdfPath: string): Promise<Partial<Fattura>> {
  // OCR + estrazione dati da PDF fattura
  // Riconosce: numero, data, importo, righe, fornitore
  // Fornitori noti: Cambielli, Clerici, Italia Automazioni, Duotermica
  throw new Error("Not implemented");
}

export async function scadenzeFatture(finestraGiorni: number): Promise<Fattura[]> {
  // Fatture in scadenza entro N giorni
  throw new Error("Not implemented");
}

export async function fattureScadute(): Promise<Fattura[]> {
  // Fatture già scadute e non pagate
  throw new Error("Not implemented");
}

// === INCASSI ===

export async function registraIncasso(incasso: Omit<Incasso, "id" | "createdAt">): Promise<Incasso> {
  throw new Error("Not implemented");
}

export async function estraiIncassiDaEmail(emailBody: string): Promise<Incasso[]> {
  // Parsing testo email (es: "Incassi ACG" da Malvicino)
  // Estrae: cliente, importo, riferimento
  throw new Error("Not implemented");
}

export async function estraiIncassiDaExcel(excelPath: string): Promise<Incasso[]> {
  // Parsing allegato Excel con tabella incassi
  // Colonne attese: cliente, importo, data, riferimento
  throw new Error("Not implemented");
}

// === DDT ===

export async function registraDDT(ddt: Omit<DDT, "id" | "stato">): Promise<DDT> {
  throw new Error("Not implemented");
}

export async function parseDDT(pdfPath: string): Promise<Partial<DDT>> {
  // OCR DDT fornitore
  throw new Error("Not implemented");
}

export async function controllaDDTvsFattura(ddtId: string, fatturaId: string): Promise<{
  match: boolean;
  differenze: Array<{ campo: string; ddt: string; fattura: string }>;
}> {
  // Confronta DDT con fattura: quantità, prezzi, articoli
  throw new Error("Not implemented");
}

export async function ddtSenzaFattura(): Promise<DDT[]> {
  // DDT ricevuti che non hanno ancora fattura collegata
  throw new Error("Not implemented");
}

// === ESPOSIZIONE ===

export async function esposizioneCliente(clienteId: string): Promise<EsposizioneCliente> {
  // Calcola esposizione completa
  throw new Error("Not implemented");
}

export async function clientiAltaEsposizione(soglia: number): Promise<EsposizioneCliente[]> {
  // Clienti con esposizione sopra soglia
  throw new Error("Not implemented");
}

// === REPORT ===

export async function reportMensile(mese: string): Promise<ReportMensile> {
  // Report completo del mese con confronti
  throw new Error("Not implemented");
}

export async function reportAnnuale(anno: number): Promise<{
  mesi: ReportMensile[];
  totali: { fatturato: number; incassato: number; margine: number };
  andamento: string;
}> {
  throw new Error("Not implemented");
}

// === SOLLECITI ===

export async function generaSollecito(fatturaId: string, tono: "cortese" | "formale" | "deciso"): Promise<void> {
  // Scrive su Lavagna → CALLIOPE per generare il testo
  // → ECHO per inviare
  throw new Error("Not implemented");
}

export async function sollecitiBatch(giorniOltre: number): Promise<void> {
  // Sollecita tutte le fatture scadute da più di N giorni
  throw new Error("Not implemented");
}

// === RICONCILIAZIONE ===

export async function riconciliaAutomatica(): Promise<{
  riconciliati: number;
  daVerificare: number;
  dettagli: Array<{ ddt: string; fattura: string; stato: string }>;
}> {
  // Match automatico DDT ↔ fattura per numero/fornitore/data
  throw new Error("Not implemented");
}
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
COSMINA_PROJECT_ID=acg-clima-service
GUAZZOTTI_PROJECT_ID=guazzotti-energia
FATTURE_IN_CLOUD_API_KEY=
FATTURE_IN_CLOUD_API_URL=
SOGLIA_ESPOSIZIONE_ALERT=5000
GIORNI_SOLLECITO_DEFAULT=30
```

### Messaggi Lavagna ascoltati
- `fattura_ricevuta` da IRIS
- `incassi_ricevuti` da IRIS
- `offerta_fornitore` da IRIS
- `richiesta_esposizione` da ARES o MEMO

### Messaggi Lavagna emessi
- `scadenza_fattura` → ECHO (notifica)
- `richiesta_sollecito` → CALLIOPE (genera testo)
- `richiesta_pec_diffida` → DIKEA
- `report_finanziario` → DELPHI (dati per analisi)
- `incassi_registrati` → ECHO (notifica Alberto)
- `anomalia_importo` → PHARO

---

## 6. projects/emporion/ — Collega Magazzino

### README.md
```markdown
# EMPORION — Collega Magazzino

Gestisce articoli, giacenze, furgoni tecnici, ordini fornitori, listini.

## Dominio
Sa se un ricambio c'è, dov'è, quanto costa, e a chi ordinarlo.

## Collections Firestore
- emporion_giacenze: giacenze per posizione
- emporion_ordini: ordini a fornitori
- emporion_movimenti: storico movimentazioni
- emporion_listini: listini fornitori

## Fornitori principali
Cambielli, Clerici, Italia Automazioni, Duotermica, Vaillant Service

## Stato
Da costruire. Tier 2.
```

### src/types/index.ts
```typescript
export type Posizione = "centrale" | "furgone_malvicino" | "furgone_dellafiore" | "furgone_victor" | "furgone_marco" | "furgone_david" | "cantiere";

export interface Articolo {
  codice: string;
  codiceFabbricante?: string;
  descrizione: string;
  marca?: string;
  modello?: string;
  categoria: string;
  sottoCategoria?: string;
  unitaMisura: string;
  prezzoAcquisto?: number;
  prezzoVendita?: number;
  prezzoListino?: number;
  fornitorePreferito?: string;
  fornitori: Array<{ fornitore: string; codice: string; prezzo: number; tempoConsegna?: number }>;
  scortaMinima: number;
  scortaMassima?: number;
  compatibilita?: string[];  // modelli impianto compatibili
  obsoleto: boolean;
  sostitutoCodice?: string;
}

export interface Giacenza {
  id: string;
  articoloCodice: string;
  articoloDescrizione: string;
  posizione: Posizione;
  quantita: number;
  lottoId?: string;
  dataCarico: string;
  ultimoMovimento: string;
}

export interface Movimento {
  id: string;
  articoloCodice: string;
  tipo: "carico" | "scarico" | "trasferimento" | "reso" | "rettifica";
  quantita: number;
  da?: Posizione;
  a?: Posizione;
  motivo: string;
  interventoId?: string;
  ddtRiferimento?: string;
  tecnicoUid?: string;
  data: string;
  registratoDa: string;
}

export interface OrdineFornitore {
  id: string;
  fornitore: string;
  righe: Array<{
    codice: string;
    codiceFabbricante?: string;
    descrizione: string;
    quantita: number;
    prezzoUnitario: number;
    totaleRiga: number;
  }>;
  totale: number;
  stato: "bozza" | "approvato" | "inviato" | "confermato" | "in_consegna" | "ricevuto" | "parziale";
  dataOrdine?: string;
  dataConsegnaPrevista?: string;
  dataConsegnaEffettiva?: string;
  ddtRicevuto?: string;
  note?: string;
  urgente: boolean;
  createdAt: string;
}

export interface InventarioFurgone {
  tecnicoUid: string;
  tecnicoNome: string;
  posizione: Posizione;
  articoli: Array<{ codice: string; descrizione: string; quantita: number; scortaMinima: number; sottoScorta: boolean }>;
  ultimoControllo: string;
  articoliSottoScorta: number;
}
```

### src/actions/index.ts
```typescript
import type { Articolo, Giacenza, Movimento, OrdineFornitore, InventarioFurgone, Posizione } from "../types/index.js";

// === GIACENZE ===

export async function disponibilita(codiceODescrizione: string): Promise<Giacenza[]> {
  // Cerca per codice esatto o descrizione fuzzy
  // Ritorna tutte le posizioni dove è presente
  throw new Error("Not implemented");
}

export async function dovSiTrova(codiceArticolo: string): Promise<Array<{ posizione: Posizione; quantita: number }>> {
  throw new Error("Not implemented");
}

export async function giacenzaTotale(codiceArticolo: string): Promise<number> {
  throw new Error("Not implemented");
}

export async function articoliSottoScorta(posizione?: Posizione): Promise<Array<{ articolo: Articolo; giacenza: number; scortaMinima: number; mancante: number }>> {
  // Articoli sotto scorta minima
  throw new Error("Not implemented");
}

// === MOVIMENTI ===

export async function carico(codiceArticolo: string, quantita: number, posizione: Posizione, ddtRiferimento?: string): Promise<Movimento> {
  throw new Error("Not implemented");
}

export async function scarico(codiceArticolo: string, quantita: number, posizione: Posizione, interventoId?: string, tecnicoUid?: string): Promise<Movimento> {
  // Scarica per intervento, aggiorna giacenza
  throw new Error("Not implemented");
}

export async function trasferisci(codiceArticolo: string, da: Posizione, a: Posizione, quantita: number, tecnicoUid?: string): Promise<Movimento> {
  throw new Error("Not implemented");
}

export async function storicoMovimenti(codiceArticolo: string, periodo?: { da: string; a: string }): Promise<Movimento[]> {
  throw new Error("Not implemented");
}

// === ORDINI ===

export async function creaOrdine(fornitore: string, righe: Array<{ codice: string; quantita: number }>): Promise<OrdineFornitore> {
  // Crea bozza ordine con prezzi da listino
  throw new Error("Not implemented");
}

export async function ordiniInCorso(): Promise<OrdineFornitore[]> {
  throw new Error("Not implemented");
}

export async function ricevutoOrdine(ordineId: string, ddtNumero: string, righeRicevute?: Array<{ codice: string; quantitaRicevuta: number }>): Promise<void> {
  // Segna ordine come ricevuto, esegui carico automatico
  // Se quantità diversa da ordinata → segnala differenza
  throw new Error("Not implemented");
}

export async function suggerisciRiordino(): Promise<Array<{ articolo: Articolo; quantitaSuggerita: number; fornitore: string; prezzoStimato: number }>> {
  // Analizza consumi ultimi 3 mesi, suggerisce riordino per articoli sotto scorta
  throw new Error("Not implemented");
}

// === LISTINI ===

export async function listiniComparati(codiceArticolo: string): Promise<Array<{ fornitore: string; prezzo: number; tempoConsegna?: number; ultimoAggiornamento: string }>> {
  // Confronta prezzi tra fornitori
  throw new Error("Not implemented");
}

export async function aggiornaPrezzoListino(fornitore: string, codice: string, nuovoPrezzo: number): Promise<void> {
  throw new Error("Not implemented");
}

// === OCR DDT ===

export async function ocrDDT(pdfPath: string): Promise<Array<{ codice: string; descrizione: string; quantita: number; prezzoUnitario?: number }>> {
  // OCR DDT fornitore → estrai righe
  // Riconosce layout: Cambielli, Clerici, Duotermica
  throw new Error("Not implemented");
}

export async function caricaDaDDT(pdfPath: string, posizione: Posizione): Promise<{ articoliCaricati: number; nuoviArticoli: number; errori: string[] }> {
  // OCR → carico automatico → segnala articoli non in anagrafica
  throw new Error("Not implemented");
}

// === FURGONI ===

export async function inventarioFurgone(tecnicoUid: string): Promise<InventarioFurgone> {
  throw new Error("Not implemented");
}

export async function rifornisciFurgone(tecnicoUid: string): Promise<Array<{ codice: string; descrizione: string; quantitaDaAggiungere: number }>> {
  // Suggerisce cosa caricare sul furgone basandosi su interventi pianificati domani
  throw new Error("Not implemented");
}

// === COMPATIBILITÀ ===

export async function articoliCompatibili(impiantoModello: string): Promise<Articolo[]> {
  // Quali ricambi sono compatibili con questo modello di impianto
  throw new Error("Not implemented");
}
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
COSMINA_PROJECT_ID=acg-clima-service
MAGAZZINO_PRO_URL=
MAGAZZINO_PRO_DB=
SCORTA_MINIMA_DEFAULT=2
```

### Messaggi Lavagna ascoltati
- `richiesta_disponibilita_ricambio` da ARES
- `materiali_consumati` da ARES (aggiorna giacenze post-intervento)
- `ddt_ricevuto` da IRIS/CHARTA

### Messaggi Lavagna emessi
- `disponibilita_risposta` → ARES
- `scorta_minima_alert` → ECHO (notifica)
- `ordine_confermato` → CHARTA (debito)
- `articolo_non_trovato` → ARES

---

## 7. projects/dikea/ — Collega Compliance

### README.md
```markdown
# DIKEA — Collega Compliance

Il guardiano delle normative. CURIT, F-Gas, DiCo, DM 37/2008, PEC.

## Dominio
Normative e scadenze legali relative agli impianti termici.

## Normative gestite
- CURIT (Catasto Unico Regionale Impianti Termici) — Piemonte
- F-Gas (Reg. EU 517/2014) — gas fluorurati
- DM 37/2008 — DiCo (Dichiarazione di Conformità)
- DPR 74/2013 — manutenzione impianti termici
- UNI 10200 — ripartizione spese riscaldamento condominiale

## Collections Firestore
- dikea_scadenze: scadenze normative per impianto
- dikea_dico: DiCo generate
- dikea_pec: PEC gestite
- dikea_certificazioni: certificazioni F-Gas, libretti

## Stato
Da costruire. Tier 3.
```

### src/types/index.ts
```typescript
export type NormaTipo = "curit_ree" | "curit_bollino" | "fgas_registro" | "fgas_certificazione" | "dico" | "dm37" | "uni10200" | "dpr74" | "libretto_impianto" | "cpi";

export interface ScadenzaNormativa {
  id: string;
  tipo: NormaTipo;
  impiantoId: string;
  impiantoDescrizione?: string;
  clienteId?: string;
  clienteNome?: string;
  indirizzo?: string;
  descrizione: string;
  dataScadenza: string;
  stato: "valida" | "in_scadenza" | "scaduta" | "non_applicabile" | "in_rinnovo";
  documentiCollegati?: string[];
  giorniAnticipo: number;
  notificato: boolean;
  completato: boolean;
  note?: string;
}

export interface DiCo {
  id: string;
  interventoId: string;
  impiantoId: string;
  impiantoDescrizione: string;
  clienteId?: string;
  clienteNome?: string;
  tipo: "nuova_installazione" | "manutenzione_straordinaria" | "trasformazione" | "ampliamento";
  stato: "bozza" | "validata" | "firmata" | "inviata" | "registrata" | "rifiutata";
  campiCompilati: Record<string, string>;
  campiObbligatori: string[];
  campiMancanti: string[];
  erroriValidazione: string[];
  pdfUrl?: string;
  protocollo?: string;
  dataCreazione: string;
  dataInvio?: string;
  dataRegistrazione?: string;
}

export interface PEC {
  id: string;
  mittente: string;
  destinatario?: string;
  oggetto: string;
  corpo?: string;
  dataRicezione: string;
  tipo: "diffida" | "comunicazione_ufficiale" | "richiesta_ente" | "risposta" | "ricorso" | "notifica";
  stato: "da_gestire" | "in_lavorazione" | "risposto" | "archiviato" | "scaduto";
  scadenzaRisposta?: string;
  giorniRimanenti?: number;
  sourceEmailId?: string;
  rispostaId?: string;
  priorita: "normale" | "urgente" | "scadenza_legale";
  note?: string;
}

export interface CertificazioneFGas {
  impiantoId: string;
  tipoGas: string;
  quantitaKg: number;
  tecnicoCertificato: string;
  numeroCertificazione: string;
  dataControllo: string;
  prossimoControllo: string;
  registratoBancaDati: boolean;
}

export interface LibrettoImpianto {
  impiantoId: string;
  numero: string;
  stato: "attivo" | "sospeso" | "cessato";
  ultimoAggiornamento: string;
  allegati: string[];
}
```

### src/actions/index.ts
```typescript
import type { ScadenzaNormativa, DiCo, PEC, CertificazioneFGas } from "../types/index.js";

// === CURIT ===

export async function scadenzeCURIT(finestraGiorni: number): Promise<ScadenzaNormativa[]> {
  // Impianti con REE/bollino in scadenza
  throw new Error("Not implemented");
}

export async function verificaStatoCURIT(impiantoId: string): Promise<{
  registrato: boolean;
  targa?: string;
  ultimoControllo?: string;
  prossimoControllo?: string;
  stato: string;
}> {
  // Query al portale CURIT (via worker Python)
  throw new Error("Not implemented");
}

export async function impiantiSenzaTarga(zona?: string): Promise<Array<{ id: string; indirizzo: string; tipo: string; clienteNome: string }>> {
  throw new Error("Not implemented");
}

export async function impiantiNonRegistrati(): Promise<Array<{ id: string; indirizzo: string; motivo: string }>> {
  // Impianti che dovrebbero essere su CURIT ma non lo sono
  throw new Error("Not implemented");
}

// === DICO ===

export async function generaDiCo(interventoId: string, tipo: DiCo["tipo"]): Promise<DiCo> {
  // Compila DiCo dai dati dell'intervento
  // Usa compilatore.js + GRAPH per generare PDF
  throw new Error("Not implemented");
}

export async function validaDiCo(dicoId: string): Promise<{ valida: boolean; errori: string[]; warnings: string[] }> {
  // Controllo campi obbligatori DM 37/2008
  // Verifica coerenza dati (impianto, tecnico, materiali)
  throw new Error("Not implemented");
}

export async function inviaDiCo(dicoId: string): Promise<{ protocollo: string; dataInvio: string }> {
  // Invio alla CCIAA competente
  throw new Error("Not implemented");
}

export async function dicoMancanti(periodo: { da: string; a: string }): Promise<Array<{ interventoId: string; tipo: string; data: string; motivo: string }>> {
  // Interventi che richiedono DiCo ma non ce l'hanno
  throw new Error("Not implemented");
}

// === F-GAS ===

export async function checkFGas(impiantoId: string): Promise<{
  applicabile: boolean;
  certificazioneValida: boolean;
  prossimaCertificazione?: string;
  tipoGas?: string;
  quantitaKg?: number;
  registratoBancaDati: boolean;
}> {
  throw new Error("Not implemented");
}

export async function scadenzeFGas(finestraGiorni: number): Promise<CertificazioneFGas[]> {
  throw new Error("Not implemented");
}

export async function registraControlloBancaDati(impiantoId: string, dati: Partial<CertificazioneFGas>): Promise<void> {
  throw new Error("Not implemented");
}

// === PEC ===

export async function gestisciPEC(pecId: string): Promise<{
  analisi: string;
  scadenzaRisposta?: string;
  azioniSuggerite: string[];
  urgenza: string;
}> {
  // Analizza PEC, determina scadenze legali, suggerisci azioni
  throw new Error("Not implemented");
}

export async function bozzaRispostaPEC(pecId: string, tono: "formale" | "conciliante" | "deciso"): Promise<void> {
  // Scrive su Lavagna → CALLIOPE per generare il testo
  throw new Error("Not implemented");
}

export async function pecInScadenza(giorniRimanenti: number): Promise<PEC[]> {
  // PEC con scadenza risposta imminente
  throw new Error("Not implemented");
}

// === AUDIT ===

export async function auditAccessi(finestra: { da: string; a: string }): Promise<Array<{
  utente: string;
  azione: string;
  risorsa: string;
  timestamp: string;
}>> {
  // Da audit_log di COSMINA
  throw new Error("Not implemented");
}

export async function verificaConformitaGDPR(): Promise<{
  consensiValidi: number;
  consensiMancanti: number;
  datiSenzaBase: string[];
  suggerimenti: string[];
}> {
  // Verifica stato GDPR della Suite
  throw new Error("Not implemented");
}

// === REPORTISTICA NORMATIVA ===

export async function reportConformita(zona?: string): Promise<{
  impiantiConformi: number;
  impiantiNonConformi: number;
  scadenzeProssime: number;
  dicoMancanti: number;
  fgasInScadenza: number;
  rischiMulta: Array<{ impianto: string; motivo: string; rischio: string }>;
}> {
  throw new Error("Not implemented");
}
```

### prompts/system.md
```markdown
Sei DIKEA, la Collega Compliance di NEXO per ACG Clima Service.

Il tuo compito è garantire la conformità normativa degli impianti termici gestiti dall'azienda.

Normative di riferimento:
- DPR 74/2013: controllo e manutenzione impianti termici
- DM 37/2008: DiCo (Dichiarazione di Conformità) per installazione/modifica impianti
- Reg. UE 517/2014 (F-Gas): controllo gas fluorurati
- UNI 10200: ripartizione spese riscaldamento condominiale
- CURIT Piemonte: Catasto Unico Regionale Impianti Termici

Quando analizzi una PEC:
- Identifica scadenze legali di risposta
- Classifica per urgenza
- Suggerisci azioni con riferimenti normativi precisi
- Non inventare articoli di legge — cita solo quelli che conosci con certezza
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
COSMINA_PROJECT_ID=acg-clima-service
CURIT_USERNAME=
CURIT_PASSWORD=
CURIT_WORKER_URL=
DICO_COMPILER_URL=
FGAS_BANCA_DATI_URL=
ANTHROPIC_API_KEY=
```

---

## 8. projects/delphi/ — Collega Analisi

### README.md
```markdown
# DELPHI — Collega Analisi

L'oracolo dei numeri. KPI, margini, trend, proiezioni, dashboard.

## Dominio
Analisi dati cross-source. Non genera azioni operative — risponde a domande.

## Principio
DELPHI è read-only su tutti i dati degli altri Colleghi. Non modifica nulla.

## Collections Firestore
- delphi_reports: report generati
- delphi_cache: cache query costose
- delphi_kpi: KPI calcolati periodicamente

## Stato
Da costruire. Tier 3.
```

### src/types/index.ts
```typescript
export type MetricaTipo = "fatturato" | "incassi" | "margine" | "interventi" | "produttivita" | "costo_ai" | "soddisfazione" | "tempi_risposta";
export type PeriodoTipo = "giorno" | "settimana" | "mese" | "trimestre" | "anno";

export interface KPI {
  nome: string;
  valore: number;
  unita: string;
  trend: "su" | "giu" | "stabile";
  variazione: number;
  periodoCorrente: string;
  periodoPrecedente: string;
  target?: number;
  raggiunto: boolean;
}

export interface Report {
  id: string;
  tipo: string;
  titolo: string;
  periodo: { da: string; a: string };
  sezioni: Array<{ titolo: string; contenuto: string; dati?: object; grafico?: object }>;
  generatoIl: string;
  formato: "json" | "html" | "pdf";
  url?: string;
}

export interface Anomalia {
  id: string;
  metrica: MetricaTipo;
  valore: number;
  valoreAtteso: number;
  deviazione: number;
  descrizione: string;
  rilevatoIl: string;
  gravita: "info" | "warning" | "critical";
  suggerimento: string;
}

export interface Trend {
  metrica: MetricaTipo;
  periodo: PeriodoTipo;
  dati: Array<{ label: string; valore: number }>;
  mediaMoving: number;
  proiezione?: number;
  stagionalita?: string;
}

export interface Confronto {
  metrica: MetricaTipo;
  periodoA: { label: string; valore: number };
  periodoB: { label: string; valore: number };
  differenza: number;
  differenzaPercentuale: number;
  analisi: string;
}
```

### src/actions/index.ts
```typescript
import type { KPI, Report, Anomalia, Trend, Confronto } from "../types/index.js";

// === KPI ===

export async function kpiDashboard(periodo?: string): Promise<KPI[]> {
  // KPI principali: fatturato, margine, interventi, tempi, soddisfazione
  throw new Error("Not implemented");
}

export async function marginePerIntervento(da: string, a: string): Promise<{
  interventiTotali: number;
  ricaviTotali: number;
  costiMateriali: number;
  costiManodopera: number;
  margine: number;
  marginePct: number;
  perTipo: Record<string, { ricavi: number; costi: number; margine: number }>;
}> {
  throw new Error("Not implemented");
}

// === CLASSIFICHE ===

export async function topCondomini(anno: number, criterio: "fatturato" | "interventi" | "margine" | "problemi"): Promise<Array<{ nome: string; valore: number; trend: string }>> {
  throw new Error("Not implemented");
}

export async function topClienti(anno: number, criterio: "fatturato" | "margine" | "interventi"): Promise<Array<{ nome: string; valore: number }>> {
  throw new Error("Not implemented");
}

export async function topTecnici(mese: string, criterio: "interventi" | "ore" | "margine" | "soddisfazione"): Promise<Array<{ nome: string; valore: number }>> {
  throw new Error("Not implemented");
}

// === PRODUTTIVITÀ ===

export async function produttivitaTecnico(tecnicoUid: string, periodo: { da: string; a: string }): Promise<{
  oreFatturabili: number;
  oreLavorate: number;
  oreViaggio: number;
  rapportoProduttivita: number;
  interventiChiusi: number;
  interventiSospesi: number;
  mediaOrarioIntervento: number;
  materialiConsumati: number;
}> {
  throw new Error("Not implemented");
}

export async function produttivitaTeam(mese: string): Promise<Array<{
  tecnico: string;
  oreFatturabili: number;
  interventi: number;
  rapporto: number;
  confrontoMedia: number;
}>> {
  throw new Error("Not implemented");
}

// === TREND E PROIEZIONI ===

export async function trend(metrica: MetricaTipo, periodo: PeriodoTipo, durata: number): Promise<Trend> {
  // Trend storico con media mobile e proiezione
  throw new Error("Not implemented");
}

export async function previsioneIncassi(mesiAvanti: number): Promise<Array<{ mese: string; previsto: number; minimo: number; massimo: number }>> {
  // Proiezione basata su storico + stagionalità
  throw new Error("Not implemented");
}

export async function previsioneCaricoLavoro(mesiAvanti: number): Promise<Array<{ mese: string; interventiPrevisti: number; baseStorica: string }>> {
  // Previsione carico basata su stagionalità
  throw new Error("Not implemented");
}

// === CONFRONTI ===

export async function confrontoAnnoSuAnno(metrica: MetricaTipo, anno1: number, anno2: number): Promise<Confronto[]> {
  // Confronto mese per mese tra due anni
  throw new Error("Not implemented");
}

export async function confrontoMeseSuMese(metrica: MetricaTipo, mese1: string, mese2: string): Promise<Confronto> {
  throw new Error("Not implemented");
}

// === ANOMALIE ===

export async function anomalie(metrica?: MetricaTipo, soglia?: number): Promise<Anomalia[]> {
  // Rileva anomalie: deviazione significativa dalla media/trend
  throw new Error("Not implemented");
}

// === COSTI AI ===

export async function costoAI(da: string, a: string): Promise<{
  totale: number;
  perServizio: Record<string, { tokens: number; costo: number }>;
  perGiorno: Array<{ data: string; costo: number }>;
  proiezioneMese: number;
  budget: number;
  rapporto: number;
}> {
  throw new Error("Not implemented");
}

// === REPORT ===

export async function reportMensile(mese: string): Promise<Report> {
  // Report completo del mese: fatturato, interventi, margini, produttività, anomalie
  throw new Error("Not implemented");
}

export async function reportAnnuale(anno: number): Promise<Report> {
  throw new Error("Not implemented");
}

export async function dashboardHTML(preset: "direzione" | "tecnico" | "amministrativo"): Promise<string> {
  // Genera dashboard HTML interattiva con grafici
  throw new Error("Not implemented");
}

// === DOMANDE LIBERE ===

export async function chiedi(domanda: string): Promise<{ risposta: string; datiUsati: string[]; confidenza: string }> {
  // Interpreta domanda in linguaggio naturale, query i dati, rispondi
  // Es: "come siamo andati a ottobre rispetto all'anno scorso?"
  // Es: "qual è il condominio più problematico?"
  // Es: "quanto ci costa Haiku al mese?"
  throw new Error("Not implemented");
}
```

### prompts/system.md
```markdown
Sei DELPHI, il Collega Analisi di NEXO per ACG Clima Service.

Il tuo compito è analizzare i dati dell'azienda e rispondere a domande in modo chiaro, preciso e azionabile.

Regole:
- Rispondi sempre con numeri concreti, non generici
- Quando fai confronti, indica sempre la percentuale di variazione
- Segnala le anomalie proattivamente
- Se un dato è incompleto o inaffidabile, dillo chiaramente
- I grafici vanno generati in HTML con Chart.js
- Non inventare dati — se non li hai, dì "dato non disponibile"
- Stagionalità HVAC: picco interventi ottobre-novembre (accensione) e giugno (climatizzazione)
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
COSMINA_PROJECT_ID=acg-clima-service
GUAZZOTTI_PROJECT_ID=guazzotti-energia
DIOGENE_API_URL=
DIOGENE_DB_URL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5
BUDGET_MENSILE_AI=50
```

---

## 9. projects/pharo/ — Collega Monitoring

### README.md
```markdown
# PHARO — Collega Monitoring

Il faro che illumina i problemi. Sorveglianza proattiva su tutta la Suite.

## Dominio
Monitora, controlla, avvisa. Non risolve — segnala.

## Filosofia
PHARO gira come cron job (ogni 5 minuti) e controlla tutto: heartbeat servizi, scadenze dimenticate, budget, anomalie. Quando trova qualcosa, scrive sulla Lavagna per ECHO che notifica Alberto.

## Collections Firestore
- pharo_alerts: alert attivi e risolti
- pharo_heartbeat: stato servizi
- pharo_checks: risultati controlli periodici
- pharo_regole: regole di monitoring configurabili

## Stato
Da costruire. Tier 2.
```

### src/types/index.ts
```typescript
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStato = "attivo" | "acknowledged" | "risolto" | "silenced";

export interface Alert {
  id: string;
  tipo: string;
  severita: AlertSeverity;
  stato: AlertStato;
  titolo: string;
  descrizione: string;
  fonte: string;
  metrica?: string;
  valoreAttuale?: number;
  soglia?: number;
  rilevatoIl: string;
  acknowledgedIl?: string;
  risoltoIl?: string;
  risoltoDa?: string;
  notificato: boolean;
  silenziatoFino?: string;
  ricorrenze: number;
  ultimaRicorrenza: string;
}

export interface Heartbeat {
  servizio: string;
  tipo: "cloud_function" | "worker_python" | "cron" | "api" | "database" | "hosting";
  ultimoPing: string;
  stato: "ok" | "warning" | "down" | "unknown";
  tempoRisposta?: number;
  dettagli?: string;
  url?: string;
}

export interface HealthCheck {
  id: string;
  timestamp: string;
  servizi: Heartbeat[];
  alertAttivi: number;
  alertCritici: number;
  statoGenerale: "ok" | "degraded" | "critical";
  punteggioSalute: number;  // 0-100
  riepilogo: string;
}

export interface RegolaMonitoring {
  id: string;
  nome: string;
  attiva: boolean;
  tipo: "heartbeat" | "soglia" | "scadenza" | "pattern" | "assenza";
  condizione: string;
  soglia?: number;
  finestraTempo?: number;
  severita: AlertSeverity;
  canaleNotifica: string;
  cooldownMinuti: number;
}
```

### src/actions/index.ts
```typescript
import type { Alert, Heartbeat, HealthCheck, RegolaMonitoring } from "../types/index.js";

// === HEARTBEAT ===

export async function controlloHeartbeat(): Promise<Heartbeat[]> {
  // Pinga tutti i servizi della Suite:
  // - Cloud Functions (cosminaApi, graphApi, ecc.)
  // - Worker Python (CURIT, mail classifier)
  // - Database Firestore (read test)
  // - Hosting (HTTP 200 check)
  // - HERMES (se attivo)
  // - MAESTRO (controlla tmux session)
  throw new Error("Not implemented");
}

export async function verificaServizio(servizio: string): Promise<Heartbeat> {
  throw new Error("Not implemented");
}

// === BUDGET E COSTI ===

export async function budgetAnthropic(mese: string): Promise<{
  speso: number;
  budget: number;
  percentuale: number;
  proiezioneFineMese: number;
  alert: boolean;
  dettaglio: Record<string, number>;
}> {
  throw new Error("Not implemented");
}

export async function costiInfrastruttura(): Promise<{
  firebase: number;
  railway: number;
  hetzner: number;
  anthropic: number;
  totale: number;
  confrontoMesePrecedente: number;
}> {
  throw new Error("Not implemented");
}

// === SCADENZE DIMENTICATE ===

export async function impiantiOrfani(): Promise<Array<{ id: string; indirizzo: string; clienteNome: string; scadenzaPassata: string; giorniScaduta: number }>> {
  // Impianti con manutenzione scaduta e nessun intervento pianificato
  throw new Error("Not implemented");
}

export async function emailSenzaRisposta(giorniMinimo?: number): Promise<Array<{ emailId: string; mittente: string; oggetto: string; giorniSenzaRisposta: number; urgenza: string }>> {
  // Da IRIS follow-up detection
  throw new Error("Not implemented");
}

export async function interventiiBloccati(): Promise<Array<{ id: string; stato: string; bloccatoDa: string; giorniBloccato: number }>> {
  // Interventi in stato "sospeso" o "assegnato" da troppo tempo
  throw new Error("Not implemented");
}

export async function fattureNonInviate(): Promise<Array<{ interventoId: string; dataChiusura: string; giorniSenzaFattura: number }>> {
  // Interventi chiusi senza fattura emessa
  throw new Error("Not implemented");
}

// === PATTERN SOSPETTI ===

export async function clientiSilenziosi(mesiInattivita: number): Promise<Array<{ clienteId: string; nome: string; ultimoContatto: string; fatturatoAnnuo: number; rischioChurn: string }>> {
  throw new Error("Not implemented");
}

export async function accessiAnomalos(finestra: { da: string; a: string }): Promise<Array<{ utente: string; azione: string; orario: string; anomalia: string }>> {
  // Accessi fuori orario, da IP sconosciuti, ecc.
  throw new Error("Not implemented");
}

export async function duplicatiDatabase(): Promise<Array<{ collection: string; id1: string; id2: string; similarita: number; campiDuplicati: string[] }>> {
  // Trova duplicati in crm_clienti, cosmina_impianti, ecc.
  throw new Error("Not implemented");
}

// === HEALTH CHECK ===

export async function statoSuite(): Promise<HealthCheck> {
  // Health check completo: heartbeat + alert + punteggio
  throw new Error("Not implemented");
}

export async function reportSalute(periodo: "oggi" | "settimana" | "mese"): Promise<{
  uptime: number;
  incidenti: number;
  alertTotali: number;
  alertRisolti: number;
  tempoMedioRisoluzione: number;
  serviziPiuProblematici: string[];
}> {
  throw new Error("Not implemented");
}

// === GESTIONE ALERT ===

export async function alertAttivi(severita?: AlertSeverity): Promise<Alert[]> {
  throw new Error("Not implemented");
}

export async function acknowledgeAlert(alertId: string): Promise<void> {
  throw new Error("Not implemented");
}

export async function risolviAlert(alertId: string, nota?: string): Promise<void> {
  throw new Error("Not implemented");
}

export async function silenziaAlert(alertId: string, durataminuti: number): Promise<void> {
  throw new Error("Not implemented");
}

// === REGOLE ===

export async function listaRegole(): Promise<RegolaMonitoring[]> {
  throw new Error("Not implemented");
}

export async function creaRegola(regola: Omit<RegolaMonitoring, "id">): Promise<RegolaMonitoring> {
  throw new Error("Not implemented");
}

export async function attivaDisattivaRegola(regolaId: string, attiva: boolean): Promise<void> {
  throw new Error("Not implemented");
}

// === CRON (eseguito ogni 5 minuti) ===

export async function eseguiControlliPeriodici(): Promise<{
  controlliFatti: number;
  alertGenerati: number;
  alertRisoltiAuto: number;
}> {
  // Esegue tutte le regole attive
  // Se trova problemi → crea alert → scrive su Lavagna per ECHO
  throw new Error("Not implemented");
}
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
COSMINA_PROJECT_ID=acg-clima-service
GUAZZOTTI_PROJECT_ID=guazzotti-energia
ANTHROPIC_BUDGET_MONTHLY=50
HEARTBEAT_INTERVAL_SECONDS=300
CHECK_INTERVAL_SECONDS=300
ALERT_COOLDOWN_MINUTES=60
FIREBASE_MONTHLY_BUDGET=25
RAILWAY_MONTHLY_BUDGET=10
HETZNER_MONTHLY_BUDGET=15
```

---

## 10. projects/calliope/ — Collega Content

### README.md
```markdown
# CALLIOPE — Collega Content

Il ghostwriter del gruppo. Scrive tutto ciò che esce dall'azienda.

## Dominio
Output scritto: risposte email, comunicazioni, preventivi, solleciti, newsletter, PEC.

## Principio
CALLIOPE non invia mai nulla direttamente. Produce bozze che Alberto approva. Dopo approvazione, passa a ECHO per l'invio.

## Collections Firestore
- calliope_bozze: bozze generate
- calliope_template: template per tipo di comunicazione
- calliope_stile: preferenze di stile per tipo/destinatario

## Stato
Da costruire. Tier 3.
```

### src/types/index.ts
```typescript
export type BozzaTipo = "risposta_email" | "comunicazione_condominio" | "preventivo" | "sollecito_pagamento" | "pec_risposta" | "newsletter_tecnici" | "offerta_commerciale" | "lettera_accompagnamento" | "verbale_riunione" | "comunicazione_interna";
export type BozzaStato = "bozza" | "in_revisione" | "approvata" | "rifiutata" | "inviata" | "scaduta";
export type Tono = "formale" | "cordiale" | "professionale" | "urgente" | "empatico" | "deciso" | "conciliante";

export interface Bozza {
  id: string;
  tipo: BozzaTipo;
  destinatario: { nome: string; email?: string; ruolo?: string };
  oggetto: string;
  corpo: string;
  corpoHtml?: string;
  tono: Tono;
  stato: BozzaStato;
  versione: number;
  versioniPrecedenti?: Array<{ corpo: string; feedback: string; timestamp: string }>;
  richiedente: string;
  richiestoIl: string;
  approvatoIl?: string;
  approvatoDa?: string;
  inviatoIl?: string;
  feedbackAlberto?: string;
  sourceEmailId?: string;
  sourceLavagnaId?: string;
  contesto: Record<string, unknown>;
  allegatiSuggeriti?: string[];
  canaleInvio?: string;
}

export interface Template {
  id: string;
  nome: string;
  tipo: BozzaTipo;
  corpo: string;
  variabili: Array<{ nome: string; descrizione: string; obbligatorio: boolean }>;
  tono: Tono;
  lingua: string;
  usato: number;
  ultimoUso?: string;
}

export interface StileDestinatario {
  destinatarioPattern: string;  // regex o nome
  tonoPreferito: Tono;
  appellativi: string;  // "Gentile Amm.", "Caro", "Egregio"
  chiusure: string;     // "Cordiali saluti", "A disposizione"
  note: string;         // "preferisce email brevi", "vuole sempre i numeri"
}
```

### src/actions/index.ts
```typescript
import type { Bozza, BozzaTipo, Tono, Template } from "../types/index.js";

// === GENERAZIONE BOZZE ===

export async function bozzaRisposta(params: {
  emailId: string;
  tono?: Tono;
  istruzioniExtra?: string;
  includiContesto?: boolean;
}): Promise<Bozza> {
  // Legge email originale da IRIS
  // Chiede contesto a MEMO (dossier cliente)
  // Chiede stato interventi a ARES (se pertinente)
  // Genera risposta con Claude Sonnet (qualità > velocità)
  // Adatta tono allo storico del mittente
  throw new Error("Not implemented");
}

export async function comunicazioneCondominio(params: {
  condominioId: string;
  motivo: string;
  dati: object;
  tono?: Tono;
}): Promise<Bozza> {
  // Comunicazione formale al condominio
  // Include: intestazione, riferimenti contratto, dati specifici
  throw new Error("Not implemented");
}

export async function preventivoFormale(params: {
  clienteId?: string;
  impiantoId?: string;
  descrizione: string;
  righe: Array<{ descrizione: string; quantita: number; prezzoUnitario: number }>;
  note?: string;
  validitaGiorni?: number;
}): Promise<Bozza> {
  // Genera preventivo da template aziendale
  // Calcola totali, IVA, sconti
  // Include condizioni standard
  throw new Error("Not implemented");
}

export async function sollecitoPagamento(params: {
  clienteId: string;
  fattureScadute: string[];
  tono: "cortese" | "formale" | "deciso" | "ultimo_avviso";
  livelloSollecito: number;  // 1 = primo, 2 = secondo, 3 = ultimo
}): Promise<Bozza> {
  // Genera sollecito con escalation di tono
  // Primo: cortese promemoria
  // Secondo: formale con riferimenti fattura
  // Terzo: ultimo avviso con messa in mora
  throw new Error("Not implemented");
}

export async function rispostaPEC(params: {
  pecId: string;
  tono: Tono;
  puntiChiave?: string[];
  riferimentiNormativi?: string[];
}): Promise<Bozza> {
  // Risposta PEC formale
  // Chiede analisi a DIKEA per riferimenti legali
  throw new Error("Not implemented");
}

export async function offertaCommerciale(params: {
  clienteId?: string;
  tipoLavoro: string;
  descrizione: string;
  importoStimato?: number;
}): Promise<Bozza> {
  throw new Error("Not implemented");
}

// === NEWSLETTER E COMUNICAZIONI DI MASSA ===

export async function newsletterTecnici(mese: string): Promise<Bozza> {
  // Riepilogo mensile per il team tecnico
  // Include: interventi fatti, problemi ricorrenti, nuovi prodotti, formazione
  throw new Error("Not implemented");
}

export async function comunicazioneMassiva(params: {
  destinatariIds: string[];
  motivo: string;
  template?: string;
  personalizzazione: boolean;
}): Promise<Bozza[]> {
  // Genera comunicazione personalizzata per ogni destinatario
  throw new Error("Not implemented");
}

// === TRASCRIZIONE ===

export async function trascriviAudio(audioPath: string): Promise<string> {
  // Whisper: audio → testo
  // Pulisce il testo: rimuove filler, formatta paragrafi
  throw new Error("Not implemented");
}

export async function verbaleRiunione(audioPath: string, partecipanti?: string[]): Promise<Bozza> {
  // Trascrive + struttura: partecipanti, argomenti, decisioni, azioni
  throw new Error("Not implemented");
}

// === REVISIONE ===

export async function revisiona(bozzaId: string, feedback: string): Promise<Bozza> {
  // Alberto dà feedback → CALLIOPE rivede la bozza
  // Salva versione precedente per storico
  throw new Error("Not implemented");
}

export async function approva(bozzaId: string): Promise<void> {
  // Segna come approvata → scrive su Lavagna per ECHO (invio)
  throw new Error("Not implemented");
}

export async function rifiuta(bozzaId: string, motivo: string): Promise<void> {
  throw new Error("Not implemented");
}

// === TEMPLATE ===

export async function listaTemplate(tipo?: BozzaTipo): Promise<Template[]> {
  throw new Error("Not implemented");
}

export async function creaTemplate(template: Omit<Template, "id" | "usato">): Promise<Template> {
  throw new Error("Not implemented");
}

export async function generaDaTemplate(templateId: string, variabili: Record<string, string>): Promise<Bozza> {
  throw new Error("Not implemented");
}

// === STILE ===

export async function imparaStile(emailId: string, bozzaApprovata: string): Promise<void> {
  // Analizza la bozza approvata da Alberto per imparare il suo stile
  // Salva pattern: lunghezza, tono, formule ricorrenti
  throw new Error("Not implemented");
}
```

### prompts/system.md
```markdown
Sei CALLIOPE, la Collega Content di NEXO per ACG Clima Service S.R.L. e Guazzotti Energia S.R.L.

Il tuo compito è scrivere comunicazioni professionali, precise e appropriate.

## Stile aziendale
- Intestazione: "ACG Clima Service S.R.L." o "Guazzotti Energia S.R.L." a seconda del contesto
- Firma: "ACG Clima Service S.R.L. — Assistenza Impianti Termici"
- Tono default: professionale ma cordiale
- Lunghezza: conciso, mai più di una pagina per email standard
- Italiano corretto, evita tecnicismi non necessari con clienti non tecnici
- Con amministratori: tono più formale, riferimenti contrattuali
- Con tecnici: tono diretto, tecnico, specifico

## Regole
- Non inventare dati — usa solo i dati di contesto forniti
- Se mancano informazioni per completare la bozza, segnala cosa manca
- Per preventivi: usa il formato aziendale standard con righe, totali, condizioni
- Per PEC: linguaggio giuridico appropriato, riferimenti normativi precisi
- Per solleciti: escalation chiara (1° cortese → 2° formale → 3° messa in mora)
- Mai inviare direttamente — produci solo bozze

## Formato output
Rispondi SEMPRE con un JSON valido:
{
  "oggetto": "...",
  "corpo": "...",
  "tono": "...",
  "allegatiSuggeriti": ["..."],
  "note": "..."
}
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
WHISPER_MODEL=base
GRAPH_API_URL=
```

---

## 11. projects/nexo-orchestrator/ — Orchestratore

### README.md
```markdown
# NEXO Orchestratore

Coordina i flussi multi-Collega. Router, sequencer, escalation handler.

## Ruolo
- Routing: smista messaggi con `to: "orchestrator"` al Collega giusto
- Sequencing: esegue workflow multi-step (IRIS → ARES → CHRONOS → ECHO)
- Escalation: se un messaggio resta pending troppo a lungo, notifica Alberto
- Monitoring: tiene traccia di tutti i flussi attivi

## Quando serve
- Messaggio con destinatario ambiguo
- Flussi che richiedono coordinamento sequenziale
- Conflitti tra Colleghi
- Timeout su messaggi pending

## Quando NON serve
- Messaggi diretti tra Colleghi (IRIS → ARES): passano senza orchestrazione
- Azioni singole dentro un Collega

## Collections Firestore
- nexo_orchestrator_log: log di tutti i flussi
- nexo_workflows: definizioni workflow
- nexo_escalation_rules: regole escalation

## Stato
Da costruire. v0.1 = semplice router basato su regole.
```

### src/types/index.ts
```typescript
export interface Workflow {
  id: string;
  nome: string;
  descrizione: string;
  trigger: {
    tipo: string;          // tipo messaggio sulla Lavagna
    from?: string;         // opzionale: solo da questo Collega
    condizione?: string;   // condizione aggiuntiva (es: "payload.urgenza == 'critica'")
  };
  steps: WorkflowStep[];
  stato: "attivo" | "disattivato";
  ultimaEsecuzione?: string;
  esecuzioniTotali: number;
}

export interface WorkflowStep {
  ordine: number;
  nome: string;
  collega: string;        // nome del Collega che esegue
  azione: string;         // nome dell'azione da invocare
  inputMapping: Record<string, string>;  // come mappare i dati dal trigger/step precedente
  condizione?: string;    // condizione per eseguire (skip se false)
  timeoutMinuti: number;
  onFail: "skip" | "retry" | "abort" | "escalate";
  maxRetries?: number;
}

export interface FlowInstance {
  id: string;
  workflowId?: string;
  workflowNome?: string;
  triggerMessageId: string;
  triggerType: string;
  steps: FlowStepInstance[];
  stato: "in_corso" | "completato" | "fallito" | "escalated" | "timeout";
  inizioAt: string;
  fineAt?: string;
  errore?: string;
  escalatedTo?: string;
}

export interface FlowStepInstance {
  ordine: number;
  nome: string;
  collega: string;
  azione: string;
  stato: "pending" | "in_corso" | "completato" | "fallito" | "skipped";
  inizioAt?: string;
  fineAt?: string;
  input?: object;
  output?: object;
  errore?: string;
  lavagnaMessageId?: string;
  tentativi: number;
}

export interface EscalationRule {
  id: string;
  nome: string;
  condizione: string;
  tempoMinuti: number;     // dopo quanto tempo scatta
  azione: "notifica_alberto" | "notifica_team" | "riprova" | "annulla";
  canale: string;
  messaggio: string;
  attiva: boolean;
}

export interface RoutingRule {
  id: string;
  pattern: {
    type?: string;           // tipo messaggio
    fromCollega?: string;    // mittente
    payloadMatch?: Record<string, unknown>;  // match su payload
  };
  destinazione: string;      // nome Collega destinatario
  priorita: number;          // ordine di valutazione (più basso = prima)
  attiva: boolean;
  descrizione: string;
}
```

### src/actions/index.ts
```typescript
import type { FlowInstance, Workflow, RoutingRule, EscalationRule } from "../types/index.js";

// === ROUTING ===

export async function route(lavagnaMessageId: string): Promise<void> {
  // Legge il messaggio dalla Lavagna
  // Se to == "orchestrator": applica regole di routing per trovare il destinatario
  //   1. Cerca match in RoutingRules (per tipo messaggio, mittente, payload)
  //   2. Se match trovato: riscrive il messaggio con to corretto
  //   3. Se nessun match: usa LLM per decidere (Claude Haiku)
  //   4. Se LLM non sa: escalation a ECHO → Alberto
  // Se match con un workflow: avvia il workflow
  throw new Error("Not implemented");
}

export async function routingIntelligente(messageType: string, payload: object): Promise<string> {
  // Usa Claude Haiku per decidere il destinatario in casi ambigui
  // Prompt: "Dato questo messaggio di tipo X con payload Y, quale Collega dovrebbe gestirlo?"
  throw new Error("Not implemented");
}

// === WORKFLOW ===

export async function avviaWorkflow(workflowId: string, triggerData: object, triggerMessageId: string): Promise<FlowInstance> {
  // Crea istanza del workflow
  // Esegue il primo step
  // Registra in nexo_orchestrator_log
  throw new Error("Not implemented");
}

export async function avantiStep(flowId: string, risultatoStepPrecedente: object): Promise<void> {
  // Chiamato quando uno step viene completato
  // Avanza al prossimo step (se esiste e la condizione è soddisfatta)
  // Se ultimo step: chiude il flow come completato
  throw new Error("Not implemented");
}

export async function eseguiStep(flowId: string, stepOrdine: number): Promise<void> {
  // Scrive messaggio sulla Lavagna per il Collega dello step
  // Attende completamento (listener su Lavagna)
  throw new Error("Not implemented");
}

// === ESCALATION ===

export async function checkPending(): Promise<void> {
  // Trova messaggi sulla Lavagna con status "pending" da più di N minuti
  // Applica regole di escalation
  // Notifica Alberto via ECHO
  throw new Error("Not implemented");
}

export async function checkFlowTimeout(): Promise<void> {
  // Trova flow instances in_corso da troppo tempo
  // Applica timeout: riprova step o escala
  throw new Error("Not implemented");
}

export async function escalate(flowId: string, motivo: string): Promise<void> {
  // Escala a ECHO → Alberto
  // Include: cosa stava succedendo, dove si è bloccato, suggerimento
  throw new Error("Not implemented");
}

// === QUERY ===

export async function flowAttivi(): Promise<FlowInstance[]> {
  throw new Error("Not implemented");
}

export async function flowStorico(filtri: { da?: string; a?: string; stato?: string; workflow?: string }): Promise<FlowInstance[]> {
  throw new Error("Not implemented");
}

export async function statisticheFlow(periodo: { da: string; a: string }): Promise<{
  totali: number;
  completati: number;
  falliti: number;
  escalated: number;
  tempoMedioCompletamento: number;
  perWorkflow: Record<string, { eseguiti: number; successo: number }>;
}> {
  throw new Error("Not implemented");
}

// === GESTIONE REGOLE ===

export async function listaRoutingRules(): Promise<RoutingRule[]> {
  throw new Error("Not implemented");
}

export async function creaRoutingRule(rule: Omit<RoutingRule, "id">): Promise<RoutingRule> {
  throw new Error("Not implemented");
}

export async function listaEscalationRules(): Promise<EscalationRule[]> {
  throw new Error("Not implemented");
}

export async function creaEscalationRule(rule: Omit<EscalationRule, "id">): Promise<EscalationRule> {
  throw new Error("Not implemented");
}

// === WORKFLOW DEFINITION ===

export async function listaWorkflows(): Promise<Workflow[]> {
  throw new Error("Not implemented");
}

export async function creaWorkflow(workflow: Omit<Workflow, "id" | "ultimaEsecuzione" | "esecuzioniTotali">): Promise<Workflow> {
  throw new Error("Not implemented");
}
```

### Workflow predefiniti da creare:

```typescript
// workflow-guasto-urgente.json
{
  nome: "Guasto Urgente End-to-End",
  trigger: { tipo: "guasto_urgente", from: "iris" },
  steps: [
    { ordine: 1, nome: "Dossier cliente", collega: "memo", azione: "dossierCliente", timeoutMinuti: 2, onFail: "skip" },
    { ordine: 2, nome: "Apri intervento", collega: "ares", azione: "apriIntervento", timeoutMinuti: 5, onFail: "escalate" },
    { ordine: 3, nome: "Trova slot", collega: "chronos", azione: "slotDisponibili", timeoutMinuti: 2, onFail: "escalate" },
    { ordine: 4, nome: "Assegna tecnico", collega: "ares", azione: "assegnaTecnico", timeoutMinuti: 5, onFail: "escalate" },
    { ordine: 5, nome: "Notifica Alberto", collega: "echo", azione: "sendWhatsApp", timeoutMinuti: 1, onFail: "skip" },
    { ordine: 6, nome: "Notifica tecnico", collega: "echo", azione: "sendWhatsApp", timeoutMinuti: 1, onFail: "skip" }
  ]
}

// workflow-incassi.json
{
  nome: "Incassi da Email",
  trigger: { tipo: "incassi_ricevuti", from: "iris" },
  steps: [
    { ordine: 1, nome: "Registra incassi", collega: "charta", azione: "estraiIncassiDaEmail", timeoutMinuti: 5, onFail: "escalate" },
    { ordine: 2, nome: "Notifica Alberto", collega: "echo", azione: "sendWhatsApp", timeoutMinuti: 1, onFail: "skip" }
  ]
}

// workflow-fattura-fornitore.json
{
  nome: "Fattura Fornitore",
  trigger: { tipo: "fattura_ricevuta", from: "iris" },
  steps: [
    { ordine: 1, nome: "Parsa fattura", collega: "charta", azione: "parseFatturaFornitore", timeoutMinuti: 5, onFail: "escalate" },
    { ordine: 2, nome: "Confronta DDT", collega: "charta", azione: "controllaDDTvsFattura", timeoutMinuti: 5, onFail: "skip" },
    { ordine: 3, nome: "Registra", collega: "charta", azione: "registraFattura", timeoutMinuti: 5, onFail: "escalate" }
  ]
}

// workflow-pec.json
{
  nome: "PEC Ricevuta",
  trigger: { tipo: "pec_ricevuta", from: "iris" },
  steps: [
    { ordine: 1, nome: "Analisi PEC", collega: "dikea", azione: "gestisciPEC", timeoutMinuti: 5, onFail: "escalate" },
    { ordine: 2, nome: "Bozza risposta", collega: "calliope", azione: "rispostaPEC", timeoutMinuti: 10, onFail: "skip" },
    { ordine: 3, nome: "Notifica Alberto", collega: "echo", azione: "sendWhatsApp", timeoutMinuti: 1, onFail: "skip" }
  ]
}
```

### .env.example
```
FIREBASE_PROJECT_ID=nexo-hub-15f2d
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5
PENDING_TIMEOUT_MINUTES=30
FLOW_TIMEOUT_MINUTES=60
ESCALATION_CHANNEL=whatsapp
ESCALATION_TO=alberto
CHECK_INTERVAL_SECONDS=60
```

---

## 12. Aggiornamento Lavagna — projects/nexo-core/lavagna/

### Aggiorna types.ts con i nomi definitivi e i tipi completi:

```typescript
export type CollegaNome = 
  | "iris" 
  | "echo" 
  | "ares" 
  | "chronos" 
  | "memo" 
  | "charta" 
  | "emporion" 
  | "dikea" 
  | "delphi" 
  | "pharo" 
  | "calliope" 
  | "orchestrator";

export type MessageType =
  // IRIS → altri
  | "richiesta_intervento"
  | "guasto_urgente"
  | "fattura_ricevuta"
  | "incassi_ricevuti"
  | "pec_ricevuta"
  | "offerta_fornitore"
  | "email_classificata"
  | "nuovo_cliente_rilevato"
  // ARES → altri
  | "richiesta_slot"
  | "richiesta_disponibilita_ricambio"
  | "intervento_completato"
  | "intervento_sospeso"
  | "richiesta_dico"
  | "materiali_consumati"
  | "richiesta_dossier_pre_intervento"
  // CHRONOS → altri
  | "slot_proposto"
  | "scadenza_imminente"
  | "conflitto_agenda"
  | "agenda_giornaliera"
  | "campagna_avviata"
  // MEMO → altri
  | "dossier_pronto"
  | "alert_churn"
  | "nuovo_cliente_creato"
  // CHARTA → altri
  | "scadenza_fattura"
  | "incassi_registrati"
  | "richiesta_sollecito"
  | "richiesta_pec_diffida"
  | "report_finanziario"
  | "anomalia_importo"
  // EMPORION → altri
  | "disponibilita_risposta"
  | "scorta_minima_alert"
  | "ordine_confermato"
  | "articolo_non_trovato"
  // DIKEA → altri
  | "scadenza_normativa"
  | "dico_generata"
  | "bozza_pec"
  | "alert_conformita"
  // DELPHI → altri
  | "report_pronto"
  | "anomalia_rilevata"
  | "kpi_update"
  // PHARO → altri
  | "alert"
  | "heartbeat_down"
  | "budget_alert"
  | "salute_suite"
  // CALLIOPE → altri
  | "bozza_pronta"
  | "bozza_approvata"
  | "bozza_rifiutata"
  // Orchestratore
  | "escalation"
  | "workflow_step"
  | "workflow_completato"
  | "workflow_fallito"
  // Generici
  | "notifica"
  | "richiesta_dossier"
  | "richiesta_analisi"
  | "task_completato";

export interface LavagnaMessage {
  id: string;
  from: CollegaNome;
  to: CollegaNome;
  type: MessageType;
  payload: Record<string, unknown>;
  status: "pending" | "picked_up" | "completed" | "failed";
  priority: "low" | "normal" | "high" | "critical";
  sourceEmailId?: string;
  parentMessageId?: string;
  workflowInstanceId?: string;
  workflowStepOrdine?: number;
  pickedUpBy?: string;
  pickedUpAt?: string;
  completedAt?: string;
  failedReason?: string;
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  ttlMinutes?: number;
}
```

---

## Comandi finali

Dopo aver creato tutto:

1. Aggiungi al .gitignore globale: `*.env`, `node_modules/`, `dist/`, `__pycache__/`
2. Committa con: "feat(nexo): scaffolding completo 11 Colleghi + Orchestratore + Lavagna aggiornata"
3. Pusha su origin main
4. Stampa struttura: `find projects/ -type f -name "*.ts" -o -name "*.md" -o -name "*.json" | sort`
5. Apri nel browser: cmd.exe /c start "https://github.com/ac2clima-byte/maestro"

---

## 13. Specifiche trasversali per tutti i Colleghi

### 13.1 Modelli LLM per Collega

Ogni Collega che usa un LLM deve specificare il modello nel .env.
Principio: **Haiku per decidere, Sonnet per scrivere, niente per contare.**

| Collega | Modello | Motivo |
|---|---|---|
| IRIS | Haiku | Classificazione email, estrazione entità — velocità |
| ECHO | Haiku | Interpretazione comandi vocali — velocità |
| ARES | Haiku | Match tecnico, routing intervento — velocità |
| CHRONOS | Nessuno | Pura logica temporale, query Firestore |
| MEMO | Nessuno | Aggregazione dati, query cross-progetto |
| CHARTA | Haiku / Sonnet | Haiku per parsing standard, Sonnet per layout sconosciuti |
| EMPORION | Nessuno | Pura logica inventario, query Firestore |
| DIKEA | Sonnet | Analisi PEC, riferimenti normativi — precisione critica |
| DELPHI | Sonnet | Analisi complesse, risposte a domande libere — qualità |
| PHARO | Nessuno | Cron + soglie + regole, niente LLM |
| CALLIOPE | Sonnet | Generazione testo, bozze, preventivi — qualità del testo |
| Orchestratore | Haiku | Routing ambiguo — velocità, basso costo |

Ogni Collega con LLM deve avere nel .env:
```
LLM_MODEL=claude-haiku-4-5          # o claude-sonnet-4-20250514
LLM_MAX_TOKENS=1024
LLM_BUDGET_GIORNALIERO_EUR=2.00     # budget massimo giornaliero
LLM_FALLBACK_MODEL=claude-haiku-4-5 # fallback se il modello primario fallisce
```

### 13.2 Motore di regole automatiche IRIS

Aggiungere a IRIS (projects/iris/) un motore di regole configurabile.

#### src/types/rules.ts
```typescript
export interface IrisRule {
  id: string;
  nome: string;
  descrizione: string;
  attiva: boolean;
  priorita: number;  // più basso = valutata prima
  
  // Condizioni (AND tra loro)
  condizioni: {
    mittenteContiene?: string;
    mittenteEsatto?: string;
    oggettoContiene?: string;
    oggettoRegex?: string;
    categoriaClassificata?: string;
    sentimentMinimo?: string;
    haAllegati?: boolean;
    tipoAllegato?: string;
    orarioRicezione?: { dalle: string; alle: string };
  };
  
  // Azioni da eseguire (in sequenza)
  azioni: RuleAction[];
  
  createdAt: string;
  updatedAt: string;
  ultimaEsecuzione?: string;
  esecuzioniTotali: number;
}

export type RuleAction = 
  | { tipo: "scrivi_lavagna"; destinatario: string; tipoMessaggio: string; payloadExtra?: object }
  | { tipo: "archivia_email" }
  | { tipo: "tagga"; tag: string }
  | { tipo: "notifica_echo"; canale: string; messaggio: string }
  | { tipo: "estrai_dati"; formato: "testo" | "excel" | "tabella" }
  | { tipo: "cambia_categoria"; nuovaCategoria: string }
  | { tipo: "cambia_priorita"; nuovaPriorita: string }
  | { tipo: "rispondi_automatico"; templateId: string }  // solo con approvazione Alberto
  | { tipo: "inoltra"; destinatarioEmail: string };
```

#### src/rules/RuleEngine.ts
```typescript
import type { IrisRule, RuleAction } from "../types/rules.js";
import type { IrisEmailDoc } from "../types/firestore.js";

export class RuleEngine {
  private rules: IrisRule[] = [];

  async loadRules(): Promise<void> {
    // Carica regole da Firestore collection iris_rules
    // Ordina per priorità
    throw new Error("Not implemented");
  }

  async evaluate(email: IrisEmailDoc): Promise<RuleAction[]> {
    // Valuta tutte le regole contro l'email
    // Ritorna le azioni della PRIMA regola che matcha (o tutte se configurato)
    throw new Error("Not implemented");
  }

  async execute(email: IrisEmailDoc, actions: RuleAction[]): Promise<void> {
    // Esegue le azioni in sequenza
    // Per ogni azione: scrivi log, aggiorna contatore
    throw new Error("Not implemented");
  }

  matchCondizioni(email: IrisEmailDoc, condizioni: IrisRule["condizioni"]): boolean {
    // Valuta tutte le condizioni in AND
    throw new Error("Not implemented");
  }
}
```

Regole predefinite da creare:
```json
[
  {
    "nome": "Incassi ACG da Malvicino",
    "condizioni": {
      "mittenteContiene": "malvicino",
      "oggettoContiene": "INCASSI ACG"
    },
    "azioni": [
      { "tipo": "estrai_dati", "formato": "testo" },
      { "tipo": "scrivi_lavagna", "destinatario": "charta", "tipoMessaggio": "incassi_ricevuti" },
      { "tipo": "notifica_echo", "canale": "whatsapp", "messaggio": "Ricevuti incassi ACG da Malvicino" },
      { "tipo": "archivia_email" }
    ]
  },
  {
    "nome": "Newsletter e spam",
    "condizioni": {
      "categoriaClassificata": "NEWSLETTER_SPAM"
    },
    "azioni": [
      { "tipo": "archivia_email" }
    ]
  },
  {
    "nome": "PEC ufficiale",
    "condizioni": {
      "categoriaClassificata": "PEC_UFFICIALE"
    },
    "azioni": [
      { "tipo": "scrivi_lavagna", "destinatario": "dikea", "tipoMessaggio": "pec_ricevuta" },
      { "tipo": "notifica_echo", "canale": "whatsapp", "messaggio": "Ricevuta PEC ufficiale — verifica urgenza" }
    ]
  },
  {
    "nome": "Guasto urgente",
    "condizioni": {
      "categoriaClassificata": "GUASTO_URGENTE"
    },
    "azioni": [
      { "tipo": "scrivi_lavagna", "destinatario": "ares", "tipoMessaggio": "guasto_urgente" },
      { "tipo": "notifica_echo", "canale": "whatsapp", "messaggio": "URGENTE: guasto segnalato via email" },
      { "tipo": "cambia_priorita", "nuovaPriorita": "critical" }
    ]
  }
]
```

Collection Firestore: `iris_rules`

### 13.3 ECHO — Ricezione messaggi in entrata

ECHO non solo invia ma anche riceve risposte su WhatsApp e Telegram. Il loop bidirezionale.

Aggiungere a projects/echo/src/actions/index.ts:

```typescript
// === RICEZIONE ===

export async function onWhatsAppIncoming(from: string, body: string, mediaUrl?: string): Promise<void> {
  // Webhook Waha: messaggio WA in arrivo
  // 1. Identifica il mittente (numero → cliente tramite MEMO)
  // 2. Classifica l'intent (risposta a messaggio nostro? nuova richiesta?)
  // 3. Se è risposta a un messaggio ECHO: collega al messaggio originale
  // 4. Se è nuova richiesta: scrivi su Lavagna → IRIS o Orchestratore
  // 5. Salva in echo_messages come tipo "inbound"
  throw new Error("Not implemented");
}

export async function onTelegramIncoming(chatId: string, body: string): Promise<void> {
  // Bot Telegram: messaggio in arrivo
  // Stessa logica di WhatsApp
  throw new Error("Not implemented");
}

export async function onVoiceIncoming(audioPath: string, from: string): Promise<void> {
  // Messaggio vocale ricevuto
  // 1. Trascrivi con Whisper
  // 2. Processa come testo
  throw new Error("Not implemented");
}
```

Aggiungere tipo:
```typescript
export type MessageDirection = "outbound" | "inbound";

// Aggiungere a EchoMessage:
// direction: MessageDirection;
// inReplyTo?: string;  // id messaggio originale se è una risposta
```

### 13.4 PWA unificata NEXO

Una PWA unica accessibile da `nexo-hub-15f2d.web.app` con navigazione a tab/sezioni per Collega.

Struttura:
```
/                    → Dashboard NEXO (digest, alert attivi, stato Colleghi)
/iris                → Dashboard IRIS (email, thread, classificazioni)
/ares                → Dashboard ARES (interventi aperti, assegnazioni)
/chronos             → Calendario (agende tecnici, scadenze)
/charta              → Dashboard CHARTA (fatture, incassi, scadenze)
/emporion            → Magazzino (giacenze, ordini)
/pharo               → Monitoring (heartbeat, alert)
/delphi              → Analytics (KPI, grafici, report)
/settings            → Impostazioni (regole IRIS, preferenze ECHO, ecc.)
```

Per v0.1: IRIS è l'unica tab funzionante. Le altre mostrano "Collega in costruzione" con il README.

Ogni tab è un file HTML separato dentro `projects/nexo-pwa/` oppure sezioni della stessa SPA.

### 13.5 Autenticazione cross-progetto Firebase

I Colleghi accedono a più progetti Firebase:
- `nexo-hub-15f2d` — NEXO (Lavagna, collections proprie)
- `acg-clima-service` — COSMINA, GRAPH, PWA Tecnici
- `guazzotti-energia` — Guazzotti TEC

Ogni Collega inizializza più app Firebase:

```typescript
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Progetto NEXO (default)
const nexoApp = initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d",
}, "nexo");

// Progetto COSMINA (se serve)
const cosminaApp = initializeApp({
  projectId: process.env.COSMINA_PROJECT_ID || "acg-clima-service",
}, "cosmina");

// Progetto Guazzotti (se serve)
const guazzottiApp = initializeApp({
  projectId: process.env.GUAZZOTTI_PROJECT_ID || "guazzotti-energia",
}, "guazzotti");

export const nexoDb = getFirestore(nexoApp);
export const cosminaDb = getFirestore(cosminaApp);
export const guazzottiDb = getFirestore(guazzottiApp);
```

Per l'accesso cross-progetto, le Cloud Functions devono girare con un service account che ha permessi su tutti e tre i progetti. Alternativa: usare le credenziali di default (`firebase login`) in sviluppo.

### 13.6 Rate limiting e budget per Collega

Ogni Collega con LLM ha:

```typescript
// src/utils/budget.ts (condiviso in nexo-core)

export class BudgetGuard {
  private collega: string;
  private budgetGiornaliero: number;

  constructor(collega: string, budgetEur: number) {
    this.collega = collega;
    this.budgetGiornaliero = budgetEur;
  }

  async canSpend(stimaTokens: number): Promise<boolean> {
    // Legge da Firestore nexo_budget/{collega}/{data}
    // Calcola costo stimato
    // Se supera budget giornaliero → ritorna false
    // Scrive alert su Lavagna per PHARO
    throw new Error("Not implemented");
  }

  async registraSpesa(tokens: number, costo: number): Promise<void> {
    // Aggiorna contatore giornaliero in Firestore
    throw new Error("Not implemented");
  }

  async spesoOggi(): Promise<{ tokens: number; costo: number; percentualeBudget: number }> {
    throw new Error("Not implemented");
  }
}
```

Collection Firestore: `nexo_budget`

### 13.7 Logging unificato

Formato log standard per tutti i Colleghi:

```typescript
// src/utils/logger.ts (condiviso in nexo-core)

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  collega: string;
  livello: LogLevel;
  azione: string;
  dettagli?: object;
  durata?: number;
  errore?: string;
  lavagnaMessageId?: string;
}

export class NexoLogger {
  private collega: string;

  constructor(collega: string) {
    this.collega = collega;
  }

  info(azione: string, dettagli?: object): void {
    this.log("info", azione, dettagli);
  }

  warn(azione: string, dettagli?: object): void {
    this.log("warn", azione, dettagli);
  }

  error(azione: string, errore: Error, dettagli?: object): void {
    this.log("error", azione, { ...dettagli, errore: errore.message, stack: errore.stack });
  }

  private log(livello: LogLevel, azione: string, dettagli?: object): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      collega: this.collega,
      livello,
      azione,
      dettagli,
    };
    // Console (per tmux visibility)
    console.log(`[${this.collega.toUpperCase()}] [${livello}] ${azione}`, dettagli || "");
    // Firestore (per PHARO monitoring)
    // TODO: write to nexo_logs collection (batch, non blocking)
  }
}
```

Collection Firestore: `nexo_logs`

### 13.8 Modalità DRY_RUN

Ogni Collega supporta una modalità test che simula le azioni senza eseguirle:

```typescript
// Ogni .env.example include:
// DRY_RUN=false

// Ogni azione controlla:
export async function sendWhatsApp(to: string, body: string): Promise<void> {
  if (process.env.DRY_RUN === "true") {
    console.log(`[DRY_RUN] [ECHO] WhatsApp a ${to}: ${body.substring(0, 100)}...`);
    return;
  }
  // esecuzione reale...
}
```

In DRY_RUN:
- I messaggi sulla Lavagna vengono scritti ma con flag `dryRun: true`
- Le notifiche vengono logginate ma non inviate
- Le modifiche su COSMINA/Guazzotti vengono solo stampate
- I costi LLM vengono comunque conteggiati (per test budget)

Aggiungere `DRY_RUN=false` a tutti i .env.example.

---

## 14. Riepilogo collections Firestore

Tutte le collections in `nexo-hub-15f2d`:

### Condivise
- `nexo_lavagna` — bus inter-Colleghi
- `nexo_orchestrator_log` — log flussi orchestratore
- `nexo_workflows` — definizioni workflow
- `nexo_escalation_rules` — regole escalation
- `nexo_budget` — budget giornaliero per Collega
- `nexo_logs` — log unificato tutti i Colleghi
- `nexo_dev_requests` — richieste sviluppo dalla PWA

### IRIS
- `iris_emails` — email classificate
- `iris_threads` — thread raggruppati
- `iris_corrections` — correzioni utente
- `iris_sender_profiles` — profili mittenti
- `iris_rules` — regole automatiche

### ECHO
- `echo_messages` — storico messaggi (in + out)
- `echo_channels` — configurazione canali
- `echo_preferences` — preferenze utente
- `echo_templates` — template messaggi

### ARES
- `ares_interventi` — interventi
- `ares_assegnazioni` — assegnazioni tecnici
- `ares_materiali_usati` — materiali per intervento
- `ares_rapportini` — RTI generati

### CHRONOS
- `chronos_agende` — slot giornalieri
- `chronos_scadenze` — scadenze
- `chronos_campagne` — campagne stagionali
- `chronos_festivi` — festivi e ferie

### MEMO
- `memo_dossier` — dossier clienti (cache)
- `memo_cache` — cache query
- `memo_relazioni` — grafo relazioni

### CHARTA
- `charta_fatture` — fatture
- `charta_pagamenti` — pagamenti e incassi
- `charta_scadenze` — scadenze pagamenti
- `charta_ddt` — DDT
- `charta_riconciliazioni` — match DDT ↔ fattura

### EMPORION
- `emporion_giacenze` — giacenze per posizione
- `emporion_ordini` — ordini fornitori
- `emporion_movimenti` — movimentazioni
- `emporion_listini` — listini fornitori

### DIKEA
- `dikea_scadenze` — scadenze normative
- `dikea_dico` — DiCo generate
- `dikea_pec` — PEC gestite
- `dikea_certificazioni` — certificazioni F-Gas

### DELPHI
- `delphi_reports` — report generati
- `delphi_cache` — cache query
- `delphi_kpi` — KPI periodici

### PHARO
- `pharo_alerts` — alert
- `pharo_heartbeat` — heartbeat servizi
- `pharo_checks` — risultati controlli
- `pharo_regole` — regole monitoring

### CALLIOPE
- `calliope_bozze` — bozze generate
- `calliope_template` — template comunicazioni
- `calliope_stile` — stile per destinatario
