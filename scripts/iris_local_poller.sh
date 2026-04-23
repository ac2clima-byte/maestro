#!/usr/bin/env bash
# iris_local_poller.sh — Polling IRIS locale ogni 5 minuti.
#
# Perché locale? Le Cloud Functions su GCP non raggiungono
# remote.gruppobadano.it (Exchange on-prem dietro firewall). Lo script gira
# sul PC di Alberto (WSL) che è nella stessa rete o ha VPN.
#
# Protezioni:
#  - PID file per evitare esecuzioni concorrenti (se il run precedente è
#    ancora in corso, skip).
#  - Log rotato: iris_poller.log (verbose) + iris_poller.err (solo errori).
#  - Timeout 4min per ciclo (prima del prossimo trigger).
#
# Uso:
#   bash iris_local_poller.sh         # esegue un ciclo e termina
#   bash iris_local_poller.sh loop    # loop infinito, sleep 300s tra cicli
#
# Per avvio automatico come daemon: `start-iris-poller.sh` (nohup + disown).

set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IRIS_DIR="$REPO_DIR/projects/iris"
LOG_DIR="$REPO_DIR/logs"
PID_FILE="$LOG_DIR/iris_poller.pid"
LOG_FILE="$LOG_DIR/iris_poller.log"
ERR_FILE="$LOG_DIR/iris_poller.err"
POLL_INTERVAL="${IRIS_POLL_INTERVAL:-300}"   # default 5 min
CYCLE_TIMEOUT="${IRIS_CYCLE_TIMEOUT:-240}"    # max 4 min per ciclo
EMAIL_LIMIT="${IRIS_EMAIL_LIMIT:-50}"

mkdir -p "$LOG_DIR"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }
err() { echo "[$(ts)] ERR: $*" | tee -a "$LOG_FILE" "$ERR_FILE" >&2; }

check_running() {
  if [[ -f "$PID_FILE" ]]; then
    local old_pid
    old_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
      log "altro ciclo in corso (pid=$old_pid), skip."
      return 1
    fi
    rm -f "$PID_FILE"
  fi
  echo "$$" > "$PID_FILE"
  return 0
}

cleanup() {
  local exit_code=$?
  rm -f "$PID_FILE"
  exit $exit_code
}
trap cleanup EXIT INT TERM

run_cycle() {
  if ! check_running; then return 0; fi

  log "─── inizio ciclo IRIS (limit=$EMAIL_LIMIT) ───"

  if ! [[ -d "$IRIS_DIR/scripts" ]]; then
    err "dir scripts non trovata: $IRIS_DIR/scripts"
    return 1
  fi

  # Attiva venv Python se presente (comune in WSL)
  if [[ -f "$IRIS_DIR/.venv/bin/activate" ]]; then
    # shellcheck source=/dev/null
    source "$IRIS_DIR/.venv/bin/activate"
  elif [[ -f "$REPO_DIR/.venv/bin/activate" ]]; then
    # shellcheck source=/dev/null
    source "$REPO_DIR/.venv/bin/activate"
  fi

  # Esegui pipeline con timeout
  local cycle_log
  cycle_log=$(mktemp)
  if timeout "$CYCLE_TIMEOUT" python3 "$IRIS_DIR/scripts/pipeline.py" "$EMAIL_LIMIT" >"$cycle_log" 2>&1; then
    local processed
    processed=$(grep -cE "^(Processed|Classified|Indexed)" "$cycle_log" 2>/dev/null || echo 0)
    log "ciclo OK, ${processed} eventi (log: $cycle_log)"
    tail -n 20 "$cycle_log" >> "$LOG_FILE"
  else
    local rc=$?
    err "ciclo FAILED (rc=$rc): ultime righe:"
    tail -n 30 "$cycle_log" | tee -a "$LOG_FILE" "$ERR_FILE"
  fi
  rm -f "$cycle_log"
  log "─── fine ciclo ───"
  rm -f "$PID_FILE"
}

# ── Main ──────────────────────────────────────────────────────
if [[ "${1:-once}" == "loop" ]]; then
  log "╔══ IRIS local poller — loop ogni ${POLL_INTERVAL}s ══╗"
  while true; do
    run_cycle
    sleep "$POLL_INTERVAL"
  done
else
  run_cycle
fi
