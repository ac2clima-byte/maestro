Verifica hostname e dettagli del server Hetzner via SSH.

ssh root@178.104.88.86 "hostname && cat /etc/hostname && uname -a && cat /etc/os-release | head -5 && echo '=== DOCKER ===' && docker ps && echo '=== DISCO ===' && df -h && echo '=== RAM ===' && free -h && echo '=== CPU ===' && nproc && lscpu | head -10"

Password: eN3FgqnCH4wx

Stampa tutto a console.
Committa con "check: hostname Hetzner"
