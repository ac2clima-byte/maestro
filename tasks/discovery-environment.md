Crea un file context/claude-code-environment.md con un inventario completo del tuo ambiente. Includi:

1. **MCP Servers attivi**: elenca tutti gli MCP server configurati e connessi, con i tool che espongono
2. **Skill installate**: elenca tutte le skill in .claude/skills/ e le skill di sistema disponibili
3. **Comandi slash custom**: elenca tutti i comandi / personalizzati disponibili
4. **Tool di sistema**: quali tool hai (Bash, Write, Read, Glob, ecc.)
5. **Browser/Playwright**: versione installata, se Chromium è disponibile
6. **Node.js e npm**: versioni
7. **Git**: versione e configurazione (user, email)
8. **Linguaggi e runtime**: Python, Go, Rust, altri se installati
9. **Package globali npm**: lista con `npm list -g --depth=0`
10. **Pip packages**: lista con `pip list` se Python è disponibile
11. **Hooks configurati**: elenca gli hook attivi
12. **Impostazioni Claude Code**: modello attivo, permission mode, altre config rilevanti

Crea la cartella context/ se non esiste.
Sii esaustivo. Questo file verrà usato come riferimento per i task futuri.
