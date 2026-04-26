# Fix — rimosso autostart MAESTRO da `~/.bashrc`

Data: 2026-04-26

## Problema riportato
Ogni nuovo terminale Ubuntu/WSL avviava MAESTRO automaticamente e
"chiudeva gli altri terminali aperti".

## Causa
In `~/.bashrc` (righe 144-148) c'era un blocco di autostart:

```bash
# Avvio automatico MAESTRO
if [ ! -n "$TMUX" ] && [ -z "$MAESTRO_STARTED" ]; then
  export MAESTRO_STARTED=1
  cd ~/maestro-bridge && git pull origin main 2>/dev/null && ./start-maestro.sh &
fi
```

`start-maestro.sh` esegue `tmux kill-session -t claude-code` per ripartire
pulito. Quando un terminale T1 era già attaccato a `claude-code` e si apriva
un secondo terminale T2, l'autostart di T2 lanciava `start-maestro.sh` che
killava la sessione di T1 → T1 si chiudeva (o tornava al prompt host).

## Fix
Rimosso il blocco da `~/.bashrc`, sostituito con un commento di servizio:

```bash
# MAESTRO si avvia manualmente: cd ~/maestro-bridge && ./start-maestro.sh
# (rimosso autostart 2026-04-26: chiudeva i terminali aperti uccidendo
# la sessione tmux claude-code in uso)
```

Da ora MAESTRO si avvia solo quando Alberto lancia esplicitamente
`./start-maestro.sh` dal repo.

## Altre verifiche fatte
- `~/.bash_profile`: non esiste → ok.
- `~/.profile`: nessun riferimento a maestro/tmux/claude → ok.
- `/etc/profile.d/*.sh`: nessun match → ok.

## /etc/wsl.conf — anomalia
`cat /etc/wsl.conf` restituisce:

```
-e [network]
generateResolvConf = false
```

La prima riga ha un letterale `-e ` davanti a `[network]`: era stato
generato con `echo -e "[network]..."` su una shell che non interpretava
`-e`. WSL legge la riga come chiave invalida → warning all'avvio.

Il file è `root:root 644` e `sudo` richiede password interattiva, quindi
non l'ho corretto in autonomia.

**Cosa deve fare Alberto** (una sola riga):

```bash
sudo sed -i 's/^-e \[network\]$/[network]/' /etc/wsl.conf
```

Oppure, se preferisce, sostituire l'intero file:

```bash
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[network]
generateResolvConf = false
EOF
```

Dopo il fix conviene un `wsl --shutdown` da PowerShell per applicarlo.

## start-maestro.sh — controllo richiesto al punto 4
Il task chiedeva di sostituire eventuali `tmux kill-server` con
`tmux kill-session -t claude-code`. `start-maestro.sh` usa già la forma
corretta (`tmux kill-session -t claude-code 2>/dev/null` alla riga 11) →
nessuna modifica necessaria.
