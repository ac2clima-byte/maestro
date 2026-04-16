#!/bin/bash
# MAESTRO — Stop completo

echo "🛑 Fermo MAESTRO..."

# Ferma il processo node
pkill -f "node maestro.mjs" 2>/dev/null
echo "✓ MAESTRO polling fermato"

# Uccidi sessione tmux
tmux kill-session -t claude-code 2>/dev/null
echo "✓ Claude Code fermato"

echo "Tutto spento."
