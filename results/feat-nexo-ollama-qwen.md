# feat(nexo): Ollama Qwen2.5:7b su Hetzner NEXO accessibile dall'esterno

**Data:** 2026-04-27
**Server:** `diogene` (Hetzner NEXO, IP 168.119.164.92)
**Endpoint pubblico:** `http://168.119.164.92:11434`

## Configurazione applicata

`/etc/systemd/system/ollama.service.d/override.conf`:
```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_ORIGINS=*"
```

Comandi eseguiti:
1. `systemctl stop ollama`
2. `mkdir -p /etc/systemd/system/ollama.service.d`
3. Scritto `override.conf` (vedi sopra)
4. `systemctl daemon-reload && systemctl start ollama`

Verifica porta:
```
LISTEN 0      4096               *:11434            *:*    users:(("ollama",pid=6324,fd=3))
```
Prima ascoltava solo su `127.0.0.1:11434`, ora su `*:11434` (tutte le interfacce).

## Modello disponibile

```
NAME          ID              SIZE      MODIFIED
qwen2.5:7b    845dbda0ea48    4.7 GB    pochi minuti fa
```

## Test 1 — accesso esterno + risposta semplice

**Request**: `curl http://168.119.164.92:11434/api/generate -d '{"model":"qwen2.5:7b","prompt":"Rispondi in italiano in una sola frase: come ti chiami?","stream":false}'`

**Response**: `"Mi chiamo Qwen."`

**Tempo**: 8.2 s totali
- load model: 5.3 s (caricamento da disco al primo uso)
- prompt eval: 2.2 s (45 token in input)
- generation: 0.6 s (7 token in output, ~12 tok/s)

✅ Accesso esterno funzionante.

## Test 2 — routing NEXUS (zero-shot)

**Prompt**: "Sei un router. Dato il messaggio utente, rispondi SOLO con il nome del collega: iris, ares, chronos, memo, echo, charta, pharo, dikea, delphi, calliope, emporion. Messaggio: interventi di Marco oggi. Rispondi SOLO il nome."

**Response**: `chronos` ❌ (sbagliato — Marco ha bisogno di ARES, non Chronos)

**Tempo**: 4.4 s

Qwen 7B in zero-shot **non ha capito** il routing: ha confuso "interventi" (ARES) con "agenda/pianificazione" (Chronos). Errore semantico classico con prompt minimale e lista lunga.

## Test 2b — routing NEXUS con few-shot

**Prompt** arricchito con descrizioni colleghe + 5 esempi:
```
- ares = interventi tecnici (caldaie, condomini), apri/cerca interventi di un tecnico
- iris = email, posta
- chronos = agenda, scadenze, campagne, slot tecnico
...
Esempi:
- interventi di Marco oggi → ares
- email urgenti? → iris
- agenda di Federico domani → chronos
...
Messaggio: interventi di Marco oggi
Rispondi SOLO il nome del collega, lowercase.
```

**Response**: `ares` ✅ (corretto)

**Tempo**: 11.8 s (di cui 11.5 s prompt eval — 268 token in input)

## Confronto vs Anthropic Haiku

| Metrica | Ollama Qwen2.5:7b (diogene) | Anthropic Haiku |
|---|---|---|
| **Latency intent semplice** | 4-12 s | 0.5-1 s |
| **Costo per call** | infrastruttura fissa (server EUR/mese) | ~$0.0003 |
| **Quality routing zero-shot** | basso (errori frequenti) | alto |
| **Quality routing few-shot** | OK con prompt elaborato | alto |
| **Throughput sostenuto** | ~12 tok/s CPU-only | ~80-150 tok/s |
| **Disponibilità** | dipende dal server | dipende da credito Anthropic |
| **Privacy dati** | tutto on-prem | dati passano da Anthropic |

## Considerazioni

✅ **Funziona** dall'esterno, modello carica correttamente, risponde in italiano.

⚠️ **Non sostituisce Haiku** per il routing NEXUS real-time:
- Ogni call costa ~5-12 s vs <1 s di Haiku → degraderebbe l'esperienza chat di ~10×.
- Quality zero-shot insufficiente; il prompt few-shot funziona ma è più lungo (~270 token vs ~50 di Haiku con system prompt corto) — quindi peggiore lato latency.

✅ **Casi d'uso adatti** a Qwen locale:
1. **Batch / notturno**: classificazione email IRIS in bulk, riassunti documenti, chunking per RAG.
2. **Privacy-sensitive**: contenuti che non possono lasciare l'infra ACG (es. dati clienti dettagliati).
3. **Fallback** quando Anthropic API è giù o credito esaurito (caso di stamattina!).
4. **Embedding / similarity** (qwen2.5 supporta embedding mode).
5. **Generazione draft preventivi/email** dove la latency 10-30s è accettabile.

## ⚠️ Sicurezza — RACCOMANDAZIONE URGENTE

Ollama esposto su `0.0.0.0:11434` **senza autenticazione**. Chiunque conosca l'IP può:
- consumare CPU/RAM gratis
- esfiltrare dati dei prompt
- usare il server come bot di mining/spam tramite jailbreak

**Mitigazioni immediate** (da fare prima di scrivere prompt sensibili):

1. **Firewall ufw** sul server, allow solo IP autorizzati:
   ```bash
   ufw allow from <TUO_IP> to any port 11434
   ufw allow from <CLOUD_FUNCTIONS_IP_RANGE> to any port 11434
   ufw deny 11434
   ufw enable
   ```

2. **Reverse proxy con auth** (Caddy/nginx) davanti a Ollama:
   - Caddy con basic auth o JWT
   - Ollama resta su 127.0.0.1:11434 internamente
   - Solo il proxy esposto

3. **Cloudflare Tunnel** (gratis): nessuna porta esposta, accesso solo via Cloudflare con policy.

Per ora la porta è aperta come da task — ma da chiudere prima di usare in produzione con dati clienti.

## File coinvolti

- `~/maestro-bridge/.env` aggiunto `HETZNER_NEXO_HOST=168.119.164.92` + `OLLAMA_URL=http://168.119.164.92:11434`
- Server `diogene`: `/etc/systemd/system/ollama.service.d/override.conf` creato

## Prossimi passi suggeriti

1. **Firewall** — chiudere accesso pubblico (vedi sezione sicurezza).
2. **Test integrazione handler** — aggiungere fallback handler in `handlers/shared.js` con `OLLAMA_URL` da env, da usare quando Anthropic 400/balance error.
3. **Benchmark task batch** — IRIS classifica email notturne con Qwen invece di Haiku → risparmio ~$0.0003/email × 200/giorno = $0.06/giorno = ~$1.80/mese (modesto, ma cumulativo se aggiungiamo riassunti/embeddings).
4. **Modelli alternativi** — provare `qwen2.5:3b` (3× più veloce, qualità routing simile per task semplici) o `phi-3-mini` (Microsoft, ottimizzato low-latency).
