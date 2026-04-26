Fix dettatura vocale in NEXUS come da analisi dev-analysis-fVsMsV2she6QI4kS0Czb.md.

1. Il bottone 🎤 NON deve essere nascosto se il browser non supporta. Deve essere sempre visibile.
2. Se il browser non supporta Web Speech API: al click mostra messaggio "Usa Chrome o Edge per la dettatura vocale"
3. Se supporta ma il permesso microfono è negato: mostra "Permetti l'accesso al microfono nelle impostazioni del browser"
4. Aggiungi feedback visivo chiaro:
   - Microfono attivo: bottone rosso pulsante
   - In ascolto: testo "Ti ascolto..."
   - Errore: messaggio chiaro
5. Testa su Chrome desktop e Chrome Android con Playwright (se possibile)

Deploy hosting.
Email report.
Committa con "fix(nexus): dettatura vocale con feedback chiaro"
