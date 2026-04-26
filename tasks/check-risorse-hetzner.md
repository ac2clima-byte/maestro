Controlla le risorse del server Hetzner (178.104.88.86) dove gira Waha.

ssh root@178.104.88.86 "echo '=== RAM ===' && free -h && echo '=== CPU ===' && nproc && lscpu | head -10 && echo '=== DISCO ===' && df -h / && echo '=== CARICO ===' && uptime && echo '=== DOCKER ===' && docker ps 2>/dev/null && echo '=== PROCESSI TOP ===' && ps aux --sort=-%mem | head -10"

Se ssh non funziona senza password, prova con la chiave: ssh -i ~/.ssh/id_rsa root@178.104.88.86

Stampa tutto a console.
