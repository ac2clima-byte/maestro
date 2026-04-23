#!/usr/bin/env bash
# start-iris-poller.sh — Avvia iris_local_poller.sh in background (nohup).
#
# Uso:
#   bash start-iris-poller.sh       # avvia il loop
#   bash start-iris-poller.sh stop  # ferma il loop

set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_DIR/logs"
DAEMON_PID="$LOG_DIR/iris_poller_daemon.pid"
LOG_FILE="$LOG_DIR/iris_poller.log"
POLLER="$REPO_DIR/scripts/iris_local_poller.sh"

mkdir -p "$LOG_DIR"

case "${1:-start}" in
  start)
    if [[ -f "$DAEMON_PID" ]] && kill -0 "$(cat "$DAEMON_PID")" 2>/dev/null; then
      echo "IRIS poller già in esecuzione (pid=$(cat "$DAEMON_PID"))"
      exit 0
    fi
    nohup bash "$POLLER" loop >> "$LOG_FILE" 2>&1 &
    echo $! > "$DAEMON_PID"
    disown
    echo "IRIS poller avviato in background (pid=$(cat "$DAEMON_PID"))"
    echo "Log: $LOG_FILE"
    ;;
  stop)
    if [[ ! -f "$DAEMON_PID" ]]; then
      echo "Nessun daemon pid file, niente da fermare."
      exit 0
    fi
    pid=$(cat "$DAEMON_PID")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      echo "IRIS poller fermato (pid=$pid)"
    else
      echo "Processo $pid già terminato"
    fi
    rm -f "$DAEMON_PID"
    ;;
  status)
    if [[ -f "$DAEMON_PID" ]] && kill -0 "$(cat "$DAEMON_PID")" 2>/dev/null; then
      echo "IRIS poller attivo (pid=$(cat "$DAEMON_PID"))"
      echo "Ultime righe log:"
      tail -n 10 "$LOG_FILE" 2>/dev/null
    else
      echo "IRIS poller NON attivo"
    fi
    ;;
  *)
    echo "Uso: $0 {start|stop|status}"
    exit 1
    ;;
esac
