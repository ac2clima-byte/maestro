Verifica cosa possiamo installare su Hetzner (178.104.88.86) per LLM locale.

1. Connettiti via SSH:
   ssh root@178.104.88.86

2. Risorse disponibili:
   free -h
   nproc
   lscpu | head -15
   df -h /
   nvidia-smi 2>/dev/null || echo "NO GPU"

3. Verifica se Ollama è già installato:
   which ollama 2>/dev/null || echo "NON INSTALLATO"
   ollama list 2>/dev/null

4. Verifica Docker (per Waha):
   docker ps

5. Quanto spazio disco libero c'è?

6. Stampa tutto a console.

NON installare nulla — solo diagnostica.
Committa con "check: risorse Hetzner per Ollama"
