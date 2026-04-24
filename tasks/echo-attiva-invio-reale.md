ECHO è ancora in DRY_RUN. Attivalo per Alberto.

1. In Firestore nexo-hub-15f2d, aggiorna (o crea) cosmina_config/echo_config:
   - dry_run: false

2. Poi testa: da NEXUS Chat scrivi "manda whatsapp a Alberto: NEXO è attivo"
3. Verifica che il messaggio arrivi realmente su WhatsApp
4. Screenshot + analisi
5. Dopo il test rimetti dry_run: true

6. Anche la risposta deve essere in linguaggio naturale:
   SBAGLIATO: "📤 Simulato: WA a **Alberto Contardi** (+393***3101) [personale] — test _Fonte: cosmina_contatti_interni · DRY_RUN attivo_"
   CORRETTO: "Messaggio inviato ad Alberto Contardi su WhatsApp."
   Se dry-run: "Non ho mandato il messaggio perché il dry-run è attivo. Vuoi che lo attivi?"

7. Committa con "feat(echo): invio WA reale attivato"
