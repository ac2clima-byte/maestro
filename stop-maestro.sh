#!/bin/bash
# MAESTRO — Stop completo

echo "🛑 Fermo MAESTRO..."

# Ferma il processo node
pkill -f "node maestro.mjs" 2>/dev/null
echo "✓ MAESTRO polling fermato"

# Ferma il poller dev requests
pkill -f "dev_request_poller.mjs" 2>/dev/null
echo "✓ Poller dev requests fermato"

# Uccidi sessione tmux
tmux kill-session -t claude-code 2>/dev/null
echo "✓ Claude Code fermato"

echo "Tutto spento."
