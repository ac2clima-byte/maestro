#!/bin/bash
# MAESTRO — Avvio completo
# Uso: ./start-maestro.sh

echo "🚀 Avvio MAESTRO..."

cd ~/maestro-bridge
git pull origin main 2>/dev/null

# Uccidi sessione vecchia se esiste
tmux kill-session -t claude-code 2>/dev/null

# Avvia Claude Code in tmux
tmux new-session -d -s claude-code "cd ~/maestro-bridge && claude --permission-mode auto"

echo "✓ Claude Code avviato in tmux (sessione: claude-code)"
echo "  Per guardare: tmux attach -t claude-code"
echo ""

# Aspetta che Claude Code sia pronto
echo "⏳ Attendo che Claude Code sia pronto..."
sleep 10

# Avvia MAESTRO in background
echo "✓ Avvio MAESTRO polling..."
cd ~/maestro-bridge
node maestro.mjs > logs/maestro.log 2>&1 &
MAESTRO_PID=$!
echo "  MAESTRO PID: $MAESTRO_PID"

# Avvia poller dev requests in background (NEXUS → tasks/dev-request-*.md)
echo "✓ Avvio poller dev requests..."
mkdir -p logs
node scripts/dev_request_poller.mjs > logs/dev-poller.log 2>&1 &
POLLER_PID=$!
echo "  POLLER PID: $POLLER_PID"
echo ""

echo "═══════════════════════════════════════"
echo "  MAESTRO + DEV-POLLER attivi"
echo "  Claude Code: tmux attach -t claude-code"
echo "  Log MAESTRO:  tail -f logs/maestro.log"
echo "  Log POLLER:   tail -f logs/dev-poller.log"
echo "  Ferma tutto:  ./stop-maestro.sh"
echo "═══════════════════════════════════════"

wait $MAESTRO_PID $POLLER_PID
