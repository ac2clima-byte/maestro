Fase 3 di IRIS — Modulo classificatore email.

CONTESTO:
IRIS classifica le email aziendali di ACG Clima Service / Gruppo Badano (aziende HVAC nella zona Alessandria/Voghera/Tortona). Le email riguardano: interventi su caldaie e climatizzatori, condomini, preventivi, fatture fornitori, comunicazioni interne.

TASK:
Crea il modulo classificatore in projects/iris/src/classifier/

1. Crea projects/iris/src/types/classification.ts con i tipi:

   - ClassificationType: enum con le categorie (vedi sotto)
   - SuggestedAction: enum con le azioni possibili (vedi sotto)
   - ConfidenceLevel: "high" | "medium" | "low"
   - ExtractedEntities: { cliente?, condominio?, impianto?, urgenza?, importo?, tecnico?, indirizzo? }
   - EmailClassification: {
       category: ClassificationType,
       summary: string (max 3 righe),
       entities: ExtractedEntities,
       suggestedAction: SuggestedAction,
       confidence: ConfidenceLevel,
       reasoning: string (perché ha scelto questa categoria)
     }

   Categorie di classificazione:
   - RICHIESTA_INTERVENTO (cliente chiede intervento/riparazione)
   - GUASTO_URGENTE (segnalazione guasto urgente)
   - PREVENTIVO (richiesta preventivo)
   - CONFERMA_APPUNTAMENTO (conferma/modifica appuntamento)
   - FATTURA_FORNITORE (fattura o DDT da fornitore)
   - COMUNICAZIONE_INTERNA (email tra colleghi ACG/Guazzotti)
   - PEC_UFFICIALE (PEC, comunicazioni ufficiali/legali)
   - AMMINISTRATORE_CONDOMINIO (email da amministratore)
   - RISPOSTA_CLIENTE (risposta a email nostra precedente)
   - NEWSLETTER_SPAM (newsletter, pubblicità, notifiche sistema)
   - ALTRO (non classificabile)

   Azioni suggerite:
   - RISPONDI (bozza risposta)
   - APRI_INTERVENTO (crea intervento in COSMINA)
   - INOLTRA (inoltra a collega specifico)
   - ARCHIVIA (nessuna azione necessaria)
   - PREPARA_PREVENTIVO (avvia processo preventivo)
   - VERIFICA_PAGAMENTO (controlla stato pagamento)
   - URGENTE_CHIAMA (telefonare subito al mittente)

2. Crea projects/iris/src/classifier/Classifier.ts:
   - Classe Classifier con metodo async classify(email: Email): Promise<EmailClassification>
   - Usa @anthropic-ai/sdk per chiamare Claude Haiku
   - Il system prompt viene caricato da projects/iris/prompts/classifier.md
   - Il prompt user contiene: mittente, oggetto, corpo email
   - La risposta deve essere JSON valido (stessa logica di parsing di MAESTRO Architect)
   - Modello configurabile via env (default: claude-haiku-4-5)
   - Gestione errori: API key mancante, JSON malformato, timeout

3. Crea projects/iris/prompts/classifier.md con il prompt di classificazione:
   - Ruolo: "Sei IRIS, il Collega Email di NEXO per ACG Clima Service"
   - Contesto azienda: HVAC, zona Alessandria/Voghera/Tortona, gestione condomini e privati
   - Istruisci a rispondere SEMPRE in JSON valido
   - Elenca le categorie con descrizione di quando usarle
   - Elenca le azioni con descrizione
   - Istruisci sull'estrazione entità (cerca nomi, indirizzi, importi, modelli impianto)
   - Istruisci sulla confidenza (high: sicuro al 90%+, medium: 60-90%, low: sotto 60%)
   - Prompt in italiano

4. Crea projects/iris/tests/classifier.test.ts con test:
   - Mock dell'SDK Anthropic
   - Test classificazione email di richiesta intervento
   - Test classificazione email di fattura fornitore
   - Test classificazione email urgente
   - Test errore API key mancante
   - Test JSON malformato da API

5. Committa con "feat(iris): email classifier with Haiku"
