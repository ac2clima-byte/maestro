# MAESTRO

Ponte di comunicazione tra Claude Chat e Claude Code via GitHub.

## Come funziona

1. Claude Chat pusha task in `tasks/`
2. MAESTRO fa polling, trova il task, lancia Claude Code
3. Claude Code esegue, MAESTRO pusha il risultato in `results/`
4. Claude Chat legge il risultato

## Setup

```bash
git clone https://github.com/ac2clima-byte/maestro.git
cd maestro
node maestro.mjs
```

## Struttura

```
tasks/     ← task da eseguire (scritti da Claude Chat)
results/   ← risultati (scritti da MAESTRO/Claude Code)
maestro.mjs ← il polling daemon
```
