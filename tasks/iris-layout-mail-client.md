Ridisegna completamente la PWA (projects/iris/pwa/index.html) come un VERO client di posta professionale.

LAYOUT:
- Tre colonne su desktop (come Outlook/Gmail desktop):
  - Sinistra (250px): sidebar con filtri categoria, sentiment, watchlist, ricerca
  - Centro (400px): lista email compatta — ogni riga mostra: mittente, oggetto troncato, data, badge categoria, emoji sentiment. Riga selezionata evidenziata.
  - Destra (resto): pannello lettura con email completa, entità estratte, azioni, bottone correggi

- Su mobile (responsive): 
  - Lista email a tutto schermo
  - Tap su email → apre pannello lettura a tutto schermo
  - Swipe o bottone indietro per tornare alla lista

STILE:
- Ispirazione: Outlook Web App / Gmail / Spark
- Sfondo bianco, bordi grigi sottili tra le colonne
- Font system-ui 14px, mittente bold, oggetto normale, data piccola grigia
- Email non lette: sfondo leggermente azzurro
- Badge categoria piccoli e discreti (pallino colorato + testo)
- Sentiment come emoji piccola accanto al mittente
- Niente effetti pesanti, niente animazioni inutili
- Header minimo: "IRIS" + stats + bottone filtri su mobile

PANNELLO LETTURA (colonna destra):
- In alto: mittente, destinatari, data completa, oggetto
- Sotto: corpo email completo (HTML safe o plaintext)
- Sotto il corpo: sezione "Analisi IRIS" con:
  - Riassunto
  - Categoria + sentiment + confidenza
  - Entità estratte come chips
  - Azione suggerita come bottone primario
  - Bottone "Correggi" secondario
- Se ci sono allegati: anteprime inline

FUNZIONALITÀ:
- Click su email nella lista → mostra nel pannello destra
- Filtri nella sidebar funzionanti (filtra la lista)
- Ricerca per mittente/oggetto funzionante
- Statistiche in cima alla sidebar: totale, urgenti, senza risposta

Rideploya su Firebase Hosting e apri nel browser.
Committa con "feat(iris): layout mail client professionale"
