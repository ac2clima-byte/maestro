Controlla le risorse del PC per capire quante sessioni Claude Code parallele regge.

1. RAM totale e disponibile:
   free -h

2. CPU:
   nproc
   lscpu | head -15

3. Disco:
   df -h /

4. Sessioni tmux attive:
   tmux list-sessions 2>/dev/null

5. Processi Claude Code attivi:
   ps aux | grep claude | grep -v grep

6. Carico attuale:
   uptime

7. Stampa tutto a console

Non serve commit.
