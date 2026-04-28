CAMBIO CRITICO: Claude Code ora è AUTONOMO. Non deve più aspettare conferma da Claude Chat o da Alberto.

Quando arriva una dev-request (bug_from_chat o generic):
1. ANALIZZA il bug (come prima)
2. IMPLEMENTA il fix subito (NON fermarti all'analisi)
3. DEPLOYA le Cloud Functions
4. TESTA con nexusTestInternal
5. COMMITTA e PUSHA il risultato
6. SCRIVI nella chat NEXUS (se bug_from_chat): "Fix applicato: [cosa è cambiato]. Riprova."
7. MANDA email report

Il flusso diventa:
Alberto segnala bug 🐛 → Claude Code analizza + fixa + deploya + risponde in chat
TUTTO AUTOMATICO. Zero conferme necessarie.

Modifica in CLAUDE.md:
- Rimuovi la regola "SOLO analisi, poi commit e push"
- Sostituisci con: "Analizza, implementa, testa, deploya, committa. Se il fix è rischioso (modifica schema DB, cancella dati), scrivi solo l'analisi e chiedi conferma."
- Per bug semplici (regex mancante, handler sbagliato, typo, UI): fixa subito
- Per bug complessi (architettura, schema, sicurezza): solo analisi

Modifica in maestro.mjs:
- Quando una dev-request ha type=bug_from_chat: manda il task completo (analisi + implementazione), non solo analisi
- Il file task deve dire "Analizza e implementa" non "Solo analisi"

Deploy + test + email report.
Committa con "feat(forge): Claude Code autonomo — analizza e fixa senza conferma"
