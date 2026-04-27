# Check Hetzner — hostname e risorse

**Data:** 2026-04-27
**IP:** 178.104.88.86
**Hostname:** `waha-cosmina`

## Output diagnostica

```
=== HOSTNAME ===
waha-cosmina

=== OS ===
Linux waha-cosmina 6.8.0-106-generic #106-Ubuntu SMP PREEMPT_DYNAMIC
Ubuntu 24.04.3 LTS (Noble Numbat)

=== DOCKER ===
CONTAINER ID   IMAGE                    COMMAND   CREATED       STATUS       PORTS                                         NAMES
b3a5f3b60e03   devlikeapro/waha:noweb   /tini ... 4 weeks ago   Up 4 weeks   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp   waha

=== DISCO ===
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        38G  7.6G   29G  22% /
/dev/sda15      253M  146K  252M   1% /boot/efi
overlay          38G  7.6G   29G  22% /var/lib/docker/rootfs/overlayfs/b3a5...

=== RAM ===
               total        used        free      shared  buff/cache   available
Mem:           3.7Gi       804Mi       1.2Gi       4.9Mi       2.0Gi       2.9Gi
Swap:             0B          0B          0B

=== CPU ===
2 vCPU Intel Xeon Processor (Skylake, IBRS, no TSX) @ 2.0GHz
Architecture x86_64, BIOS Vendor QEMU
```

## Risorse — riepilogo

| Risorsa | Valore | Verdetto LLM locale |
|---|---|---|
| **CPU** | 2 vCPU Skylake @ 2.0GHz | ❌ insufficiente |
| **RAM** | 3.7 GiB (2.9 GiB available, 800MB usati da Waha) | ❌ insufficiente |
| **Swap** | 0 | ⚠️ no buffer |
| **Disco /** | 38 GB, 29 GB liberi | ✅ OK |
| **GPU** | nessuna (VPS QEMU virtuale) | ❌ no accelerazione |
| **Docker** | installato, 1 container (waha) | ✅ pronto |

## Stima feasibility Ollama

**Modelli più piccoli quantizzati**:
- `llama3.2:1b-q4` → ~1.0 GB RAM modello + ~500 MB runtime → **borderline** (Waha lascia ~2.9 GB → OK ma stretto)
- `llama3.2:3b-q4` → ~2.5 GB → **non possibile** sostenibile (rimangono <500 MB liberi → OOM/swap)
- `qwen2.5:0.5b-q4` → ~400 MB → ✅ possibile ma utility limitata
- modelli ≥ 7B → **impossibile**

**Throughput atteso CPU-only Skylake 2 vCPU**:
- 1B Q4: ~5-8 token/sec
- 3B Q4: ~1-2 token/sec
- 7B+: < 1 token/sec (inutilizzabile real-time)

## Conclusione

Questo server è **dimensionato esclusivamente per Waha** (WhatsApp gateway leggero che usa ~800 MB RAM). Non è adatto per ospitare Ollama in produzione:
- modelli utili (≥3B) non entrano in RAM
- modelli piccoli (1B) entrano ma con throughput marginale
- l'esperienza utente sarebbe peggiore di Haiku/Sonnet via API

**Opzioni se si vuole davvero LLM locale**:
1. **Upgrade Hetzner Cloud** a CCX13/CCX23 (16-32 GB RAM, 4-8 vCPU dedicati AMD EPYC) — meglio per inferenza CPU ma sempre lento per >7B.
2. **Server con GPU** su Hetzner (linea AX/EX bare metal, costo elevato) o Lambda Labs / Runpod / Vast.ai a ore.
3. **Restare su Anthropic API** (ricaricare crediti, attivare auto-reload) — ad oggi è la soluzione migliore prezzo/throughput.

Per il caso d'uso NEXO (Haiku per intent parsing, ~$10/giorno a regime attuale), l'API resta più economica e affidabile di un server LLM dedicato.

## File coinvolti

- `~/maestro-bridge/.env` — credenziali HETZNER_HOST/USER/PASSWORD + WAHA_URL/API_KEY
- `~/maestro-bridge/.gitignore` — copre `.env` (commit `723f38c`)
