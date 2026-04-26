Implementa i filtri data e città per gli interventi ARES, come da analisi dev-analysis-Tsa4wB0LG6KfM57LKbuI.

Quando Alberto chiede "Federico aveva venerdì un intervento ad Alessandria?":
- Filtro tecnico: Federico → ✅ già funziona
- Filtro data: "venerdì" → calcola la data del venerdì scorso (2026-04-24) → filtra bacheca_cards per data
- Filtro città: "ad Alessandria" → filtra per indirizzo contenente "Alessandria"

Fix in handlers/ares.js handleAresInterventiAperti:
1. Parsa la data dalla frase: "oggi", "ieri", "domani", "lunedì", "venerdì scorso", "23 aprile", "la settimana scorsa"
2. Parsa la città: "ad Alessandria", "a Voghera", "a Tortona", "a Pavia"
3. Applica i filtri sulla query Firestore o post-query
4. Se nessun intervento matcha tutti i filtri: "Federico non aveva interventi venerdì ad Alessandria"

Testa con nexusTestInternal:
- "interventi di Federico venerdì" → filtra per data
- "interventi di Marco a Voghera" → filtra per città
- "Federico aveva venerdì un intervento ad Alessandria?" → filtra per tutti e 3

Deploy + test + email report.
Committa con "feat(ares): filtri data e città sugli interventi"
