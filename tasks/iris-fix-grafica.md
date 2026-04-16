La grafica della PWA (projects/iris/pwa/index.html) è pesante e illeggibile. Rifalla completamente con questi criteri:

DESIGN:
- Sfondo: bianco #ffffff (non scuro)
- Testo: nero/grigio scuro, font system-ui, dimensioni leggibili (16px base)
- Cards email: sfondo bianco, bordo grigio chiaro, ombra leggera, padding generoso
- Niente effetti glow, niente animazioni pesanti, niente gradienti
- Layout pulito, minimal, tanto spazio bianco
- Mobile-first: deve essere perfetta su telefono

STRUTTURA CARD EMAIL:
- In alto a sinistra: mittente (bold) + data (grigio, piccolo)
- Sotto: oggetto (bold, una riga)
- Sotto: riassunto IRIS (grigio, max 3 righe)
- In basso: badge categoria (piccolo, colorato ma discreto) + badge confidenza + bottoni "Leggi" e "Correggi"
- Le entità estratte come chips piccole sotto il riassunto

COLORI BADGE CATEGORIA:
- Richiesta intervento: blu
- Guasto urgente: rosso
- Preventivo: verde
- Fattura/offerta fornitore: arancione
- Comunicazione interna: grigio
- PEC: viola
- Newsletter/spam: grigio chiaro
- Altro: grigio

HEADER:
- Semplice: "IRIS" a sinistra, stats minime a destra (totale email, urgenti)
- Filtri sotto: dropdown categoria + barra cerca

Ispirazione: Gmail, Linear, Notion — interfacce pulite e professionali.

Rideploya su Firebase Hosting e apri nel browser.
Committa con "fix(iris): redesign PWA leggibile e minimal"
