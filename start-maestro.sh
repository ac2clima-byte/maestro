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
node maestro.mjs &
MAESTRO_PID=$!
echo "  PID: $MAESTRO_PID"
echo ""

echo "═══════════════════════════════════════"
echo "  MAESTRO attivo"
echo "  Claude Code: tmux attach -t claude-code"
echo "  Ferma tutto: ./stop-maestro.sh"
echo "═══════════════════════════════════════"

wait $MAESTRO_PID
