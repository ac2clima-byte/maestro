#!/bin/bash
# hetzner-setup.sh — setup one-shot del poller IRIS su Hetzner (178.104.88.86).
#
# Uso:
#   1. Copia questo file + iris_hetzner_poller.py sul server Hetzner in /tmp
#        scp scripts/hetzner-setup.sh root@178.104.88.86:/tmp/
#        scp scripts/iris_hetzner_poller.py root@178.104.88.86:/tmp/
#
#   2. SSH sul server e lancia:
#        ssh root@178.104.88.86
#        bash /tmp/hetzner-setup.sh
#
#   3. Compila /opt/nexo/.env con le credenziali reali (istruzioni stampate alla fine).
#
#   4. Carica il service account Firebase in /opt/nexo/firebase-service-account.json
#      (vedi istruzioni "STEP 4" alla fine dello script)
#
#   5. Test manuale:
#        cd /opt/nexo && /opt/nexo/venv/bin/python3 iris_hetzner_poller.py
#
#   6. Il cron è installato automaticamente e gira ogni 5 minuti.
#      Logs: tail -f /var/log/iris_poller.log

set -euo pipefail

INSTALL_DIR="/opt/nexo"
VENV_DIR="${INSTALL_DIR}/venv"
POLLER_SCRIPT="${INSTALL_DIR}/iris_hetzner_poller.py"
ENV_FILE="${INSTALL_DIR}/.env"
LOG_FILE="/var/log/iris_poller.log"
CRON_USER="${SUDO_USER:-root}"

echo "═══ NEXO / IRIS Hetzner poller setup ═══"
echo "Install dir: ${INSTALL_DIR}"
echo "Log: ${LOG_FILE}"
echo

# ─── STEP 1: Dipendenze sistema ────────────────────────────────
echo "[1/5] Installazione Python3 + pip + venv…"
if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y python3 python3-pip python3-venv cron
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y python3 python3-pip python3-venv cronie
elif command -v yum >/dev/null 2>&1; then
    yum install -y python3 python3-pip cronie
else
    echo "Package manager sconosciuto. Installa Python3, pip, venv, cron manualmente." >&2
    exit 1
fi

# ─── STEP 2: Virtualenv + librerie Python ───────────────────────
echo "[2/5] Creazione venv + librerie Python…"
mkdir -p "${INSTALL_DIR}"
python3 -m venv "${VENV_DIR}"
"${VENV_DIR}/bin/pip" install --upgrade pip

"${VENV_DIR}/bin/pip" install \
    "exchangelib>=5.1" \
    "firebase-admin>=6.5" \
    "anthropic>=0.40" \
    "python-dotenv>=1.0"

# ─── STEP 3: Copia script poller ────────────────────────────────
echo "[3/5] Installazione poller…"
if [ -f "/tmp/iris_hetzner_poller.py" ]; then
    cp /tmp/iris_hetzner_poller.py "${POLLER_SCRIPT}"
    chmod +x "${POLLER_SCRIPT}"
else
    echo "⚠️  /tmp/iris_hetzner_poller.py non trovato. Copialo e poi riesegui."
    exit 1
fi

# ─── STEP 4: .env template ──────────────────────────────────────
echo "[4/5] Creazione template .env…"
if [ ! -f "${ENV_FILE}" ]; then
    cat > "${ENV_FILE}" <<'EOF'
# NEXO / IRIS Hetzner poller — env config
# Compila con le credenziali reali. Mantieni questo file leggibile SOLO dal proprietario.

# ── EWS Exchange (on-prem Gruppo Badano) ──
EWS_URL=https://remote.gruppobadano.it/EWS/Exchange.asmx
EWS_USERNAME=alberto.contardi@acgclimaservice.com
EWS_PASSWORD=CAMBIAMI

# ── Anthropic Claude (per classifier Haiku) ──
ANTHROPIC_API_KEY=sk-ant-CAMBIAMI

# ── Firebase (progetto destinazione email indicizzate) ──
FIREBASE_PROJECT_ID=nexo-hub-15f2d
GOOGLE_APPLICATION_CREDENTIALS=/opt/nexo/firebase-service-account.json

# ── Opzionali ──
EWS_LIMIT_PER_RUN=50
EWS_INITIAL_HOURS=24
EOF
    chmod 600 "${ENV_FILE}"
    echo "   ✓ Creato ${ENV_FILE} (permessi 600). VA COMPILATO MANUALMENTE."
else
    echo "   .env esistente, non sovrascrivo."
fi

# ─── STEP 5: Cron ─────────────────────────────────────────────
echo "[5/5] Installazione crontab (ogni 5 minuti)…"
CRON_CMD="*/5 * * * * cd ${INSTALL_DIR} && ${VENV_DIR}/bin/python3 ${POLLER_SCRIPT} >> ${LOG_FILE} 2>&1"

# Rimuovi eventuale entry esistente per lo stesso script e aggiungi la nuova
(crontab -u "${CRON_USER}" -l 2>/dev/null | grep -v "iris_hetzner_poller.py"; echo "${CRON_CMD}") | crontab -u "${CRON_USER}" -

# Assicura che il log esista con permessi corretti
touch "${LOG_FILE}"
chmod 644 "${LOG_FILE}"

echo
echo "═══════════════════════════════════════════════════════════"
echo "✅ Setup infrastrutturale completato."
echo "═══════════════════════════════════════════════════════════"
echo
echo "📝 PROSSIMI PASSI MANUALI:"
echo
echo "  1. Compila ${ENV_FILE} con credenziali reali:"
echo "     nano ${ENV_FILE}"
echo
echo "  2. Crea service account Firebase e scaricalo su Hetzner:"
echo "     - Vai su https://console.firebase.google.com/project/nexo-hub-15f2d/settings/serviceaccounts/adminsdk"
echo "     - Click 'Generate new private key'"
echo "     - Salva JSON come: ${INSTALL_DIR}/firebase-service-account.json"
echo "     - chmod 600 ${INSTALL_DIR}/firebase-service-account.json"
echo
echo "  3. Test manuale (dovrebbe scrivere in Firestore iris_emails):"
echo "     cd ${INSTALL_DIR}"
echo "     set -a && source .env && set +a"
echo "     ${VENV_DIR}/bin/python3 ${POLLER_SCRIPT}"
echo
echo "  4. Verifica cron installato:"
echo "     crontab -u ${CRON_USER} -l | grep iris"
echo
echo "  5. Monitora log:"
echo "     tail -f ${LOG_FILE}"
echo
echo "  6. (opzionale) Avvio manuale fuori cron:"
echo "     systemctl status cron  # verifica cron attivo"
echo
