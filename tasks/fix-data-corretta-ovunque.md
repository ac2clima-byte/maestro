PROBLEMA: Claude Code, NEXUS e tutti i Colleghi sbagliano la data. Pensano sia domenica 26 quando è lunedì 27 aprile 2026.

Il problema è il timezone: il server Cloud Functions e Claude Code usano UTC, non Europe/Rome.

## Fix

### 1. System prompt NEXUS — aggiungi data corretta

In handlers/nexus.js, nel system prompt di Haiku, aggiungi IN CIMA:

```
Oggi è ${new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Rome' })}. 
Ora: ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}.
```

Così Haiku sa sempre che giorno è.

### 2. Tutti gli handler — usa Europe/Rome

In handlers/shared.js, crea una funzione:
```javascript
function oraItalia() {
  return new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
}
function oggiItalia() {
  // Ritorna YYYY-MM-DD nel fuso orario italiano
  const d = new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }); // en-CA = YYYY-MM-DD
}
function giornoSettimanaItalia() {
  return new Date().toLocaleDateString('it-IT', { weekday: 'long', timeZone: 'Europe/Rome' });
}
```

Esporta e usa queste funzioni in TUTTI gli handler che lavorano con date:
- ares.js: parseRangeDataInterventi deve calcolare "oggi", "domani", "venerdì" con timezone Italia
- chronos.js: agenda, scadenze
- iris.js: email di oggi, senza risposta da 48h
- preventivo.js: data preventivo
- pharo.js: bozze vecchie >30gg

### 3. CLAUDE.md — aggiungi timezone

Aggiungi in CLAUDE.md:
```
## Timezone
Il timezone di riferimento è Europe/Rome (CET/CEST). 
Tutte le date e ore devono essere in questo timezone.
Oggi è lunedì 27 aprile 2026.
```

### 4. Testa

Con nexusTestInternal:
- "che giorno è oggi?" → deve dire "lunedì 27 aprile 2026"
- "che ore sono?" → deve dire l'ora italiana corretta
- "interventi di Marco oggi" → deve cercare per lunedì 27, non domenica 26

Deploy functions + hosting.
Email report.
Committa con "fix: timezone Europe/Rome ovunque"
