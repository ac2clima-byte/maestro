Ogni volta che si apre un nuovo terminale Ubuntu/WSL, parte automaticamente MAESTRO e chiude gli altri terminali. Fix.

1. Cerca dove è lo script di autostart:
   grep -r "maestro\|start-maestro\|tmux.*claude" ~/.bashrc ~/.bash_profile ~/.profile /etc/profile.d/ 2>/dev/null

2. Se trovi righe di autostart MAESTRO in qualsiasi file: RIMUOVILE
   - Non deve partire automaticamente
   - Alberto lo avvia manualmente quando serve

3. Controlla anche /etc/wsl.conf — c'è un errore "Invalid key name" che potrebbe causare problemi:
   cat /etc/wsl.conf
   Se c'è una riga malformata, fixala o commentala

4. Controlla start-maestro.sh — se fa tmux kill-server, cambialo in tmux kill-session per non chiudere TUTTO:
   cat ~/maestro-bridge/start-maestro.sh
   Sostituisci "tmux kill-server" con "tmux kill-session -t claude-code 2>/dev/null" se presente

5. Stampa a console cosa hai trovato e fixato

6. Committa con "fix: rimosso autostart MAESTRO da bashrc"
