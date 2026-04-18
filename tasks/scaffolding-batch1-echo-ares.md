Leggi il file context/nexo-architettura.md per il contesto completo dei Colleghi NEXO.

Crea lo scaffolding per ECHO e ARES.

Per ciascuno crea:
projects/{nome}/
├── README.md (nome, dominio, collections Firestore, stato: da costruire)
├── package.json (nexo-{nome}, type: module, deps: firebase-admin, dotenv, devDeps: typescript, vitest, tsx)
├── tsconfig.json (strict, ESM, ES2022, NodeNext)
├── .env.example
├── src/types/index.ts (tipi del dominio, copiati da context/nexo-architettura.md)
├── src/actions/index.ts (stub con throw "Not implemented")
├── src/listeners/index.ts (listener Lavagna per messaggi destinati a questo Collega)
├── src/index.ts (init Firebase nexo-hub-15f2d + export db)
└── tests/actions.test.ts (placeholder)

ECHO (projects/echo/):
- Collega Comunicazione: WA, Telegram, email, push, voce TTS/STT
- Tipi: EchoMessage (channel, to, body, priority, status), EchoPreferences, DigestConfig
- Azioni: sendMessage, sendWhatsApp, sendTelegram, sendEmail, sendPushNotification, speak, transcribe, generaDigest, onWhatsAppIncoming, onTelegramIncoming
- .env: WAHA_API_URL, TELEGRAM_BOT_TOKEN, EWS_URL, FIREBASE_PROJECT_ID=nexo-hub-15f2d
- Ascolta Lavagna: notifica, alert, digest_pronto, bozza_approvata, agenda_giornaliera

ARES (projects/ares/):
- Collega Operativo: interventi tecnici, assegnazione, chiusura, RTI
- Tipi: Intervento (tipo, stato, urgenza, tecnico, materiali), Tecnico, PropostaAssegnazione
- Azioni: apriIntervento, assegnaTecnico, proponiAssegnazioni, chiudiIntervento, generaRTI, notificaTecnico, briefingTecnico, interventiAperti, cercaStoricoInterventi
- .env: COSMINA_PROJECT_ID=acg-clima-service, FIREBASE_PROJECT_ID=nexo-hub-15f2d
- Ascolta Lavagna: richiesta_intervento, guasto_urgente, slot_proposto, disponibilita_risposta

Aggiungi DRY_RUN=false a entrambi i .env.example.
Committa con "feat(nexo): scaffolding ECHO + ARES"
