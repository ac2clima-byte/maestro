# Regole MAESTRO — visibilità output

Regole **permanenti** valide per TUTTI i task futuri in questo repo. Servono a garantire che il lavoro prodotto da Claude sia immediatamente visibile ad Alberto (che lavora in tmux con il browser Windows affianco), non solo salvato su disco.

## Le cinque regole

### 1. File HTML → browser Windows
Ogni volta che crei o modifichi un file HTML, aprilo subito nel browser di Windows:

```bash
cmd.exe /c start <file.html>
```

Se il path è sotto WSL (`/home/...` o `/mnt/wsl/...`), copia prima il file in una cartella Windows accessibile (es. `/mnt/c/Users/Public/`) e apri da lì, oppure lancia il comando da una working directory su `/mnt/c/...` per evitare l'errore "percorsi UNC non sono supportati" di `cmd.exe`.

### 2. Screenshot → viewer Windows
Ogni screenshot generato (Playwright, `scrot`, ecc.) va aperto nel viewer di Windows:

```bash
cmd.exe /c start <file.png>
```

### 3. Output di test → console
Risultati di test (unit test, E2E, script di verifica), log significativi e report devono essere **stampati a console** (stdout) — non solo scritti in un file. Alberto legge direttamente dal terminale tmux. Se l'output è lungo, stampa almeno un riepilogo (3-10 righe) con l'esito e il path del file completo.

### 4. Documenti .md importanti → viewer Windows
Report, piani, `README`, `TEST_*.md` e simili vanno aperti dopo la creazione:

```bash
cmd.exe /c start <file.md>
```

Eccezione: micro-modifiche a `.md` esistenti, `CHANGELOG`, file di configurazione minore — non serve riaprirli ogni volta.

### 5. Principio generale
**Tutto ciò che produci deve essere VISIBILE ad Alberto, non solo salvato su disco.** Se un artefatto non ha un canale di visibilità ovvio (console, browser, viewer), pensa a come renderlo visibile prima di considerare il task "fatto".

## Note operative

- **Path UNC / cmd.exe**: `cmd.exe` non supporta CWD su `\\wsl.localhost\...`. Soluzioni: (a) `cd /mnt/c && cmd.exe /c start "" "<windows_path>"`, (b) copiare prima in `/mnt/c/Users/Public/` poi aprire.
- **`explorer.exe <path>`**: alternativa che accetta path WSL tramite `wslpath -w`, ma meno stabile per aprire file con app associata.
- **`wslview`**: utile se installato (pacchetto `wslu`), non garantito presente — non contarci.
- **Pattern testato funzionante (vedi storico sessione)**:
  ```bash
  cp <file_wsl> /mnt/c/Users/Public/<name>
  cd /mnt/c && cmd.exe /c start "" "C:\\Users\\Public\\<name>"
  ```
