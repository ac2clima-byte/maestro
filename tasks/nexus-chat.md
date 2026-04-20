Crea NEXUS — l'interfaccia chat di NEXO nella PWA unificata.

CONTESTO:
NEXUS è la chat dove Alberto parla in linguaggio naturale e NEXO esegue. NEXUS interpreta la richiesta, decide quale Collega deve gestirla, scrive sulla Lavagna, aspetta la risposta, e la mostra in chat. Non è un Collega — è la porta d'ingresso verso tutti i Colleghi.

COSA FARE:

1. Aggiungi alla PWA unificata (projects/nexo-pwa/ o dove si trova la PWA attuale) una sezione NEXUS Chat:
   - Icona chat fissa in basso a destra (floating action button, stile WhatsApp/Intercom)
   - Cliccando si apre un pannello chat che occupa metà schermo (o schermo intero su mobile)
   - Campo di input testo in basso + bottone invio + bottone microfono 🎤
   - Area messaggi con bolle: a destra (Alberto), a sinistra (NEXUS)
   - NEXUS risponde con: testo + badge del Collega che ha gestito la richiesta
   - Storico chat salvato in Firestore collection nexus_chat

2. Crea projects/nexo-core/nexus/ con:

   projects/nexo-core/nexus/types.ts:
   ```typescript
   export interface NexusMessage {
     id: string;
     sessionId: string;
     role: "user" | "assistant";
     content: string;
     collegaCoinvolto?: string;    // quale Collega ha gestito
     lavagnaMessageId?: string;    // ref al messaggio sulla Lavagna
     azione?: string;              // cosa ha fatto il Collega
     timestamp: string;
   }

   export interface NexusSession {
     id: string;
     userId: string;
     messaggi: NexusMessage[];
     stato: "attiva" | "chiusa";
     inizioAt: string;
     ultimoMessaggioAt: string;
   }

   export interface NexusIntent {
     collega: string;          // a chi mandare
     azione: string;           // cosa fare
     parametri: object;        // dati estratti dalla richiesta
     confidenza: number;       // 0-1
     rispostaUtente: string;   // cosa dire ad Alberto
   }
   ```

   projects/nexo-core/nexus/NexusRouter.ts:
   ```typescript
   // Usa Claude Haiku per interpretare il messaggio dell'utente
   // System prompt: "Sei NEXUS, l'interfaccia di NEXO per ACG Clima Service.
   //   L'utente ti fa richieste in linguaggio naturale. Tu devi:
   //   1. Capire cosa vuole
   //   2. Decidere quale Collega deve gestirla
   //   3. Formulare la richiesta per il Collega
   //   
   //   Colleghi disponibili:
   //   - IRIS: email (classificazione, ricerca, regole)
   //   - ECHO: comunicazione (manda WA, email, notifiche)
   //   - ARES: interventi (apri, assegna, chiudi)
   //   - CHRONOS: calendario (slot, scadenze, agende)
   //   - MEMO: memoria (dossier cliente, storico impianto)
   //   - CHARTA: amministrazione (fatture, incassi, DDT)
   //   - EMPORION: magazzino (giacenze, ordini, ricambi)
   //   - DIKEA: compliance (CURIT, F-Gas, DiCo, PEC)
   //   - DELPHI: analisi (KPI, margini, report)
   //   - PHARO: monitoring (alert, heartbeat, stato)
   //   - CALLIOPE: content (bozze, risposte, preventivi)
   //   
   //   Se la richiesta coinvolge più Colleghi, elenca i passi.
   //   Se non capisci, chiedi chiarimento.
   //   Rispondi SOLO in JSON."
   ```

3. Il flusso end-to-end nella PWA:
   a. Alberto scrive "Apri intervento urgente caldaia Condominio Kristal, manda Malvicino"
   b. La PWA chiama Claude Haiku (API) direttamente dal frontend con il prompt NEXUS
   c. Haiku ritorna JSON: { collega: "ares", azione: "apriIntervento", parametri: {...} }
   d. La PWA mostra subito: "Capito. Passo la richiesta ad ARES..."
   e. La PWA scrive sulla Lavagna con to: "ares"
   f. La PWA ascolta la Lavagna per la risposta (onSnapshot)
   g. Quando ARES risponde (completed): mostra il risultato nella chat
   h. Se nessuna risposta entro 30 secondi: "ARES non ha risposto. Vuoi che riprovi?"

4. Implementa anche i comandi vocali:
   - Il bottone microfono usa Web Speech API (già implementata nella PWA)
   - La trascrizione va nel campo input
   - L'utente può parlare e NEXUS capisce

5. Per v0.1 (ora): i Colleghi non sono ancora implementati, quindi NEXUS:
   - Interpreta la richiesta (questo funziona subito con Haiku)
   - Scrive sulla Lavagna (questo funziona)
   - Mostra "Richiesta inviata a [COLLEGA]. Il Collega non è ancora attivo — quando sarà implementato, gestirà questa richiesta automaticamente."
   - Per IRIS: può rispondere davvero (IRIS è operativa) — cerca nelle email, mostra risultati

6. Esempi di conversazione da supportare:
   - "Quante email urgenti ho?" → IRIS → risposta con dati reali
   - "Apri intervento caldaia Via Roma 12" → ARES → Lavagna (placeholder per ora)
   - "Quando è libero Malvicino?" → CHRONOS → Lavagna (placeholder)
   - "Dimmi tutto sul Condominio La Bussola" → MEMO → Lavagna (placeholder)
   - "Fatture scadute?" → CHARTA → Lavagna (placeholder)
   - "Manda un WA a Alberto con gli incassi di oggi" → ECHO → Lavagna (placeholder)
   - "Stato della Suite?" → PHARO → Lavagna (placeholder)

7. Design:
   - Bottone FAB: cerchio azzurro #00d4ff con icona chat, in basso a destra
   - Pannello: sfondo bianco, ombra, bordi arrotondati
   - Bolle utente: sfondo azzurro chiaro, testo scuro, a destra
   - Bolle NEXUS: sfondo grigio chiaro, testo scuro, a sinistra
   - Badge Collega sulla bolla: piccolo chip colorato con nome Collega
   - Animazione typing quando NEXUS sta pensando
   - Mobile: pannello a schermo intero

8. La API key Anthropic per Haiku va chiamata dal frontend — usa la stessa config Firebase già nella PWA. Se non vuoi esporre la key nel frontend, crea una Cloud Function proxy.

9. Aggiungi a Firestore rules: nexus_chat (read/write: true per ora)

10. Rideploya la PWA
11. Apri nel browser
12. Committa con "feat(nexo): NEXUS chat - interfaccia conversazionale"

Collections Firestore: nexus_chat, nexus_sessions
