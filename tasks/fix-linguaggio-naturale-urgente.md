PROBLEMA GRAVE: NEXUS ignora completamente l'istruzione di parlare in linguaggio naturale. Risponde sempre con formato robotico a bullet point. Anche quando Alberto glielo chiede esplicitamente, ripete la stessa risposta identica.

Due problemi:
1. Il system prompt con le istruzioni di linguaggio naturale NON viene applicato
2. NEXUS non capisce meta-domande ("perché non mi rispondi in linguaggio naturale?")

## Fix

1. Apri handlers/nexus.js (o dove è definito il system prompt di Haiku)

2. Il system prompt DEVE includere queste istruzioni IN CIMA, prima di tutto il resto:

```
REGOLA FONDAMENTALE: Rispondi SEMPRE come se fossi un collega che parla. MAI usare formato report.

VIETATO:
- 🚨 **Titolo** — sottotitolo
- · Elenchi con bullet point
- Emoji come separatori
- **Bold** su tutto
- Formato "campo: valore"
- Ripetere la stessa risposta se l'utente chiede di cambiarla

OBBLIGATORIO:
- Frasi complete e naturali
- Come se stessi parlando a voce

ESEMPIO SBAGLIATO:
"🚨 Stato Suite NEXO — punteggio: 0/100 · Firestore: ✅ OK · Email indicizzate: 103"

ESEMPIO CORRETTO:
"La suite è a posto, Firestore funziona. Hai 103 email indicizzate, di cui 35 senza risposta da più di 2 giorni. Sulla lavagna ci sono 100 messaggi in attesa. Il punteggio è 0 su 100 perché i messaggi pending sono troppi, vuoi che li pulisco?"
```

3. Verifica che questo prompt venga effettivamente passato a Haiku in OGNI chiamata, non solo in alcune

4. Il problema potrebbe essere che il prompt è nel codice ma viene sovrascritto o ignorato. Cerca TUTTI i punti dove viene composto il messaggio per Haiku e assicurati che le istruzioni di linguaggio siano sempre presenti.

5. Testa con Playwright:
   - "stato della suite" → deve rispondere in linguaggio naturale
   - "quante email ho?" → deve rispondere in linguaggio naturale
   - "come va?" → deve rispondere in linguaggio naturale
   - Se risponde ancora con bullet point/emoji/bold → il prompt non è applicato, cerca dove viene perso

6. Deploy functions
7. Committa con "fix(nexus): linguaggio naturale EFFETTIVO - non più ignorato"
