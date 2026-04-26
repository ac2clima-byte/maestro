#!/bin/bash
# scripts/forge-test.sh — FORGE smoke test di NEXUS senza auth utente.
#
# Chiama l'endpoint nexusTestInternal con la chiave segreta, esercita una
# batteria di query rappresentative dei Colleghi e valuta:
#   - reply non vuota
#   - linguaggio naturale (no bold/bullet/emoji robotiche)
#   - HTTP 200
#
# Usage:
#   bash scripts/forge-test.sh                # test live in produzione
#   FORGE_KEY=xxx bash scripts/forge-test.sh  # override chiave
#   FORGE_URL=http://localhost:5001/.../nexusTestInternal bash scripts/forge-test.sh
#
# I messaggi appaiono nella PWA NEXUS in sessione "forge-test".

set -u

URL="${FORGE_URL:-https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTestInternal}"
KEY="${FORGE_KEY:-nexo-forge-2026}"
SESSION_ID="${FORGE_SESSION:-forge-test}"

QUERIES=(
  "ciao"
  "quante email ho?"
  "stato della suite"
  "interventi aperti"
  "come va la campagna walkby?"
  "fatture scadute"
  "manda whatsapp a Alberto: test forge"
  "quali sono i tecnici di acg?"
)

echo "=== FORGE TEST $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
echo "URL:     $URL"
echo "Session: $SESSION_ID"
echo ""

PASS=0
FAIL=0
START=$(date +%s)

for q in "${QUERIES[@]}"; do
  # Compose payload via python (gestisce escape JSON correttamente).
  # Env vars davanti a `python3 -c "..."` non sono propagate al comando se
  # poste DOPO lo script string; usiamo `env` per garantirlo.
  PAYLOAD=$(env Q="$q" KEY="$KEY" SID="$SESSION_ID" python3 -c \
    "import json,os; print(json.dumps({'message': os.environ['Q'], 'forgeKey': os.environ['KEY'], 'sessionId': os.environ['SID']}))")

  HTTP_CODE=$(curl -s -o /tmp/forge-resp.json -w "%{http_code}" -X POST "$URL" \
    -H "Content-Type: application/json" \
    --max-time 60 \
    -d "$PAYLOAD" || echo "000")

  if [ "$HTTP_CODE" != "200" ]; then
    echo "FAIL | $q"
    echo "  HTTP $HTTP_CODE"
    BODY=$(cat /tmp/forge-resp.json 2>/dev/null | head -c 200)
    echo "  body: $BODY"
    echo ""
    FAIL=$((FAIL + 1))
    continue
  fi

  # Estrai reply, collega, natural dal JSON
  PARSED=$(python3 -c "
import sys, json
try:
    d = json.load(open('/tmp/forge-resp.json'))
    reply = (d.get('reply') or '').replace('\n', ' ')[:140]
    coll = d.get('collega') or '?'
    natural = d.get('natural', False)
    stato = d.get('stato') or '?'
    took = d.get('tookMs') or '?'
    print(f'{1 if natural else 0}|{coll}|{stato}|{took}|{reply}')
except Exception as e:
    print(f'0|?|err|0|JSON parse error: {e}')
")
  IFS='|' read -r NATURAL COLL STATO TOOK REPLY <<< "$PARSED"

  if [ "$NATURAL" = "1" ] && [ -n "$REPLY" ]; then
    echo "PASS | $q"
    echo "  -> [$COLL · $STATO · ${TOOK}ms] $REPLY"
    PASS=$((PASS + 1))
  else
    echo "FAIL | $q"
    echo "  -> [$COLL · $STATO] $REPLY (natural=$NATURAL)"
    FAIL=$((FAIL + 1))
  fi
  echo ""
done

ELAPSED=$(( $(date +%s) - START ))
echo "=== RISULTATO: $PASS PASS, $FAIL FAIL su ${#QUERIES[@]} test in ${ELAPSED}s ==="
echo "Vedi gli scambi nella PWA: https://nexo-hub-15f2d.web.app/  → sessione \"$SESSION_ID\""

# Exit code: 0 se almeno l'80% pass, 1 altrimenti
TOT=${#QUERIES[@]}
THRESHOLD=$(( TOT * 80 / 100 ))
if [ $PASS -ge $THRESHOLD ]; then exit 0; else exit 1; fi
