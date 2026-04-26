Crea il sistema FORGE: Claude Code testa NEXUS scrivendo messaggi e leggendo risposte.

## Il problema auth

nexusRouter richiede Firebase Auth token. Claude Code non ha le credenziali per generarlo.

## La soluzione: endpoint di test interno

Crea una Cloud Function: nexusTestInternal (HTTP POST)
- NON richiede auth (o accetta un secret fisso come header X-Forge-Key)
- Accetta: { message: "quante email ho?", forgeKey: "chiave-segreta" }
- Chiama internamente la stessa logica del nexusRouter (classifica con Haiku, chiama handler, ritorna risposta)
- Scrive la domanda e la risposta in nexus_chat con sessionId="forge-test" e ruolo user/assistant
- Ritorna la risposta JSON

In handlers/nexus.js o nuovo file handlers/forge.js:

```javascript
exports.nexusTestInternal = onRequest({ cors: true, region: 'europe-west1' }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only');
  
  const FORGE_KEY = process.env.FORGE_KEY || 'nexo-forge-2026';
  if (req.body.forgeKey !== FORGE_KEY) return res.status(403).send('Invalid forge key');
  
  const message = req.body.message;
  if (!message) return res.status(400).send('message required');
  
  // Usa la stessa logica di nexusRouter ma senza auth check
  // Chiama classifyAndRoute(message) → handler → risposta
  // Scrivi in nexus_chat session "forge-test"
  
  const response = await processNexusMessage(message, 'forge-test');
  
  res.json({
    query: message,
    reply: response.text,
    collega: response.collega,
    natural: !response.text.includes('**') && !response.text.includes('·'),
    timestamp: new Date().toISOString()
  });
});
```

Esporta in index.js.

## Script di test FORGE

Crea scripts/forge-test.sh che Claude Code può eseguire:

```bash
#!/bin/bash
URL="https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTestInternal"
KEY="nexo-forge-2026"

QUERIES=(
  "ciao"
  "quante email ho?"
  "stato della suite"
  "interventi aperti"
  "come va la campagna walkby?"
  "fatture scadute"
  "manda whatsapp a Alberto: test forge"
)

echo "=== FORGE TEST $(date) ==="
PASS=0
FAIL=0

for q in "${QUERIES[@]}"; do
  RESULT=$(curl -s -X POST "$URL" -H "Content-Type: application/json" -d "{\"message\":\"$q\",\"forgeKey\":\"$KEY\"}")
  REPLY=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reply','ERROR')[:100])")
  NATURAL=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('natural',False))")
  
  if [ "$NATURAL" = "True" ] && [ "$REPLY" != "ERROR" ]; then
    echo "PASS | $q"
    echo "  -> $REPLY"
    PASS=$((PASS+1))
  else
    echo "FAIL | $q"
    echo "  -> $REPLY"
    FAIL=$((FAIL+1))
  fi
  echo ""
done

echo "=== RISULTATO: $PASS PASS, $FAIL FAIL su ${#QUERIES[@]} test ==="
```

## Deploy e test

1. Deploy la nuova Cloud Function: firebase deploy --only functions --project nexo-hub-15f2d
2. Esegui: bash scripts/forge-test.sh
3. Stampa i risultati a console
4. I messaggi di test appaiono nella PWA NEXUS sotto sessione "forge-test" — Alberto li vede

5. Committa con "feat(forge): endpoint test interno + script test automatico"
