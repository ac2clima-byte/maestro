#!/bin/bash
# Test diversi metodi di invio Enter a tmux per Claude Code

echo "Test 1: send-keys Enter"
tmux send-keys -t claude-code "echo test1" Enter

sleep 2

echo "Test 2: send-keys C-m (Ctrl+M = carriage return)"
tmux send-keys -t claude-code "echo test2" C-m

sleep 2

echo "Test 3: send-keys con Enter letterale"
tmux send-keys -t claude-code "echo test3" "Enter"

sleep 2

echo "Test 4: send-keys con newline esplicito"
tmux send-keys -t claude-code "echo test4
"
