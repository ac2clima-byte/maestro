Configura Ollama su Hetzner NEXO (168.119.164.92) per essere accessibile dall'esterno.

SSH: root@168.119.164.92 password: eN3FgqnCH4wx

1. Ferma Ollama e riconfigura per ascoltare su 0.0.0.0:
   ssh root@168.119.164.92 "systemctl stop ollama"
   ssh root@168.119.164.92 "mkdir -p /etc/systemd/system/ollama.service.d"
   ssh root@168.119.164.92 "echo -e '[Service]\nEnvironment=OLLAMA_HOST=0.0.0.0' > /etc/systemd/system/ollama.service.d/override.conf"
   ssh root@168.119.164.92 "systemctl daemon-reload && systemctl start ollama"

2. Verifica che risponda dall'esterno:
   curl -s http://168.119.164.92:11434/api/generate -d '{"model":"qwen2.5:7b","prompt":"Rispondi in italiano: come ti chiami?","stream":false}'
   
3. Se funziona: stampa la risposta e il tempo di risposta

4. Testa il routing NEXUS: manda una domanda di routing e verifica che Qwen capisca:
   curl -s http://168.119.164.92:11434/api/generate -d '{"model":"qwen2.5:7b","prompt":"Sei un router. Dato il messaggio utente, rispondi SOLO con il nome del collega: iris, ares, chronos, memo, echo, charta, pharo, dikea, delphi, calliope, emporion. Messaggio: interventi di Marco oggi. Rispondi SOLO il nome.","stream":false}'

5. Stampa tutto a console

Email report.
Committa con "feat(nexo): Ollama Qwen2.5:7b su Hetzner NEXO accessibile dall'esterno"
