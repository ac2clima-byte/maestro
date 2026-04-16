# Risultato: iris-03-classifier
> Eseguito: 2026-04-16T18:30:51.416Z
> Completato: sì

## Output

```
17 +```json
      18 +{
      19 +  "category": "<una delle categorie sotto>",
      20 +  "summary": "<riassunto in max 3 righe>",
      21 +  "entities": {
      22 +    "cliente": "<nome se presente, altrimenti omesso>",
      23 +    "condominio": "<nome condominio se presente>",
      24 +    "impianto": "<marca/modello caldaia o clima se citato>",
      25 +    "urgenza": "<bassa|media|alta|critica>",
      26 +    "importo": "<importo in EUR se presente, es: '1250,00'>",
      27 +    "tecnico": "<nome tecnico se citato>",
      28 +    "indirizzo": "<via e città se presenti>"
      29 +  },
      30 +  "suggestedAction": "<una delle azioni sotto>",
      31 +  "confidence": "<high|medium|low>",
      32 +  "reasoning": "<perché hai scelto questa categoria, 1-2 frasi>"
      33 +}
      34 +```
      35 +
      36 +**Ometti** i campi di `entities` che non riesci a estrarre con ragionevole certezza — non inventare valori.
      37 +
      38 +## Categorie (`category`)
      39 +
      40 +| Categoria                    | Quando usarla                                                                 |
      41 +|------------------------------|-------------------------------------------------------------------------------|
      42 +| `RICHIESTA_INTERVENTO`       | Cliente chiede un intervento/riparazione non urgente (manutenzione, controllo, piccolo guasto). |
      43 +| `GUASTO_URGENTE`             | Segnalazione di guasto grave o bloccante (no riscaldamento in inverno, perdita acqua, fumo, blocco caldaia). |
      44 +| `PREVENTIVO`                 | Richiesta di preventivo per installazione, sostituzione, manutenzione programmata. |
      45 +| `CONFERMA_APPUNTAMENTO`      | Conferma, modifica o disdetta di un appuntamento già concordato.             |
      46 +| `FATTURA_FORNITORE`          | Fattura, DDT o nota di credito ricevuta da un fornitore (Vaillant, Baxi, ecc.). |
      47 +| `COMUNICAZIONE_INTERNA`      | Email fra colleghi di ACG Clima Service / Guazzotti TEC (organizzazione, passaggio di consegne). |
      48 +| `PEC_UFFICIALE`              | PEC, comunicazioni legali, diffide, richieste formali enti pubblici.         |
      49 +| `AMMINISTRATORE_CONDOMINIO`  | Email proveniente da uno studio di amministrazione condomini.                |
      50 +| `RISPOSTA_CLIENTE`           | Risposta di un cliente a una nostra email precedente (thread `Re:`).         |
      51 +| `NEWSLETTER_SPAM`            | Newsletter commerciali, pubblicità, notifiche automatiche di sistema, spam.  |
      52 +| `ALTRO`                      | Nessuna delle precedenti, o categoria ambigua.                               |
      53 +
      54 +Se il mittente è un amministratore di condominio MA l'email chiede un intervento, preferisci `RICHIESTA_INTERVENTO` o `GUASTO_URGENTE` e metti il condominio nelle entità.
         +Usa `AMMINISTRATORE_CONDOMINIO` quando la comunicazione è amministrativa (richiesta documenti, rendiconto, ecc.).
      55 +
      56 +## Azioni suggerite (`suggestedAction`)
      57 +
      58 +| Azione                 | Significato                                                             |
      59 +|------------------------|-------------------------------------------------------------------------|
      60 +| `RISPONDI`             | Preparare una bozza di risposta al mittente.                            |
      61 +| `APRI_INTERVENTO`      | Aprire un nuovo intervento in COSMINA (il CRM interno).                 |
      62 +| `INOLTRA`              | Inoltrare a un collega specifico (menzionare chi nel reasoning).        |
      63 +| `ARCHIVIA`             | Nessuna azione necessaria, archiviare.                                  |
      64 +| `PREPARA_PREVENTIVO`   | Avviare il flusso di preparazione preventivo.                           |
      65 +| `VERIFICA_PAGAMENTO`   | Controllare stato pagamento / scadenza fattura.                         |
      66 +| `URGENTE_CHIAMA`       | Telefonare immediatamente al mittente (usare con `GUASTO_URGENTE`).     |
      67 +
      68 +## Estrazione entità
      69 +
      70 +- **Cliente**: nome persona fisica o ragione sociale ("Sig. Rossi", "Condominio Via Marsala 12"). Se è un condominio, metti il nome anche in `condominio`.
      71 +- **Condominio**: nome/indirizzo del condominio.
      72 +- **Impianto**: marca + modello se citati ("Vaillant ecoTEC plus VMW 246", "Daikin Altherma").
      73 +- **Urgenza**: `bassa` (manutenzione ordinaria), `media` (guasto non bloccante), `alta` (disagio significativo), `critica` (emergenza, rischio sicurezza).
      74 +- **Importo**: solo se esplicitamente citato in €.
      75 +- **Tecnico**: nome tecnico ACG/Guazzotti citato nell'email.
      76 +- **Indirizzo**: via/corso/piazza + città, se presente.
      77 +
      78 +## Livello di confidenza (`confidence`)
      79 +
      80 +- `high`: sei sicuro al 90%+ della categoria. Contenuto chiaro e inequivocabile.
      81 +- `medium`: 60-90%. Ci sono indizi solidi ma qualche ambiguità residua.
      82 +- `low`: sotto 60%. Email corta, vaga, o con segnali contrastanti.
      83 +
      84 +## Regole finali
      85 +
      86 +1. Output **SOLO JSON valido**. Niente prefissi, niente code block, niente commenti.
      87 +2. Se non riesci a determinare una categoria, usa `ALTRO` con `confidence: "low"` e spiega in `reasoning`.
      88 +3. Il `summary` è in italiano, massimo 3 righe, nel tono operativo di un collega che prende nota.
      89 +4. Non inventare entità che non sono nel testo.
  ⎿  PostToolUse:Write says: Hookify import error: No module named 'hookify'

● Ora il Classifier. Il pattern MAESTRO Architect è: estrai JSON da un blob testuale (tollerando code fence, testo pre/post). Rendo l'SDK Anthropic iniettabile per i test.

● Write(projects/iris/src/classifier/Classifier.ts)
  ⎿  PreToolUse:Write says: Hookify import error: No module named 'hookify'
  ⎿  Wrote 267 lines to projects/iris/src/classifier/Classifier.ts
       1 import { readFile } from "node:fs/promises";
       2 import { fileURLToPath } from "node:url";
       3 import { dirname, resolve } from "node:path";
       4
       5 import Anthropic from "@anthropic-ai/sdk";
       6
       7 import type { Email } from "../types/email.js";
       8 import type {
       9   EmailClassification,
      10   ClassificationType,
     … +257 lines (ctrl+o to expand)
  ⎿  PostToolUse:Write says: Hookify import error: No module named 'hookify'

● Ora i test. Mocka AnthropicLike, niente rete.

● Write(projects/iris/tests/classifier.test.ts)
  ⎿  PreToolUse:Write says: Hookify import error: No module named 'hookify'
  ⎿  Wrote 245 lines to projects/iris/tests/classifier.test.ts
       1 import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
       2 import { resolve } from "node:path";
       3 import { fileURLToPath } from "node:url";
       4 import { dirname } from "node:path";
       5
       6 import {
       7   Classifier,
       8   ClassifierConfigError,
       9   ClassifierParseError,
      10   type AnthropicLike,
     … +235 lines (ctrl+o to expand)
  ⎿  PostToolUse:Write says: Hookify import error: No module named 'hookify'

● Bash(cd /home/albertocontardi/maestro-bridge/projects/iris && rm -f src/classifier/.gitkeep && ls src/classifier/ src/types/ prompts/ tests/)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  prompts/:
     classifier.md
     … +10 lines (ctrl+o to expand)
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Bash(cd /home/albertocontardi/maestro-bridge && git add -A projects/iris/ && git status --short projects/iris/ && git commit -m "$(cat <<'EOF'
      feat(iris): email clas…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  M  projects/iris/prompts/classifier.md
     D  projects/iris/src/classifier/.gitkeep
     A  projects/iris/src/classifier/Classifier.ts
     … +8 lines (ctrl+o to expand)
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Commit d6a924f. Modulo classificatore completo:

  - types/classification.ts — ClassificationType (11 cat.), SuggestedAction (7), ConfidenceLevel, ExtractedEntities (7 campi opzionali), EmailClassification. Enum come as const + type
  (ESM/strict-friendly) + array CLASSIFICATION_TYPES/SUGGESTED_ACTIONS per validazione runtime.
  - prompts/classifier.md — prompt IT con contesto ACG/HVAC/Alessandria-Voghera-Tortona, schema JSON esplicito, tabella categorie+azioni, regole entità, livelli confidence, regola "solo
  JSON, niente fences".
  - classifier/Classifier.ts — carica prompt da file (cache), buildUserPrompt con mittente/oggetto/corpo/flag, chiama claude-haiku-4-5 via SDK (iniettabile), parser JSON tollerante a
  code-fence + testo pre/post, valida category/action/confidence, errori dedicati (ClassifierConfigError, ClassifierParseError).
  - 7 test vitest — intervento, fattura fornitore, guasto urgente, API key mancante, API key presente ok, JSON malformato, categoria non valida, bonus fenced ```json.
  ⎿  Stop says: Hookify import error: No module named 'hookify'

✻ Sautéed for 2m 15s

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚡SuperCycle | Opus 4.7 (1M context) | ctx:8% | $2.19
  ⚪ monitor: stale (5734min fa)
  ⏵⏵ auto mode on (shift+tab to cycle)
```