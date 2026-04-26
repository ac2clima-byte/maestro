Due bug nel preventivo:

## Bug 1: Parser voci non riconosce "200€ + iva"

Alberto scrive: "Verifica impianto di distribuzione riscaldamento 200€ + iva"
NEXUS risponde: "Non ho trovato voci nel formato..."

Il parser deve accettare TUTTI questi formati:
- "sopralluogo 200" (base)
- "sopralluogo 200€" (con simbolo euro)
- "sopralluogo 200 €" (con spazio)
- "sopralluogo 200€ + iva" (con iva esplicita)
- "sopralluogo 200 + iva" (senza simbolo)
- "sopralluogo euro 200" (euro prima del numero)
- "sopralluogo €200" (simbolo prima)
- "Verifica impianto di distribuzione riscaldamento 200€ + iva" (descrizione lunga)

Fix in handlers/preventivo.js nella funzione parseVociPreventivo:
- Regex deve ignorare "€", "euro", "+ iva", "+ IVA", "+iva" 
- Estrarre solo la descrizione e il numero
- L'IVA si calcola sempre al 22% — se l'utente scrive "+ iva" è solo per conferma, non cambia il calcolo

## Bug 2: P.IVA sbagliata (01234567890 invece di 02486680065)

L'azienda 3i efficientamento ha P.IVA 02486680065 (salvata in memo_aziende/piva_02486680065).
NEXUS mostra 01234567890 che è un placeholder generico.

Fix in handlers/preventivo.js nella funzione arricchisciAzienda:
- Verifica che legga da memo_aziende prima di usare fallback
- Se trova il documento cached con P.IVA reale, usalo
- Se non trova, cerca in rete (come fa già)
- MAI usare 01234567890 come fallback

## Bug 3: "mandami il preventivo via mail e mettilo su doc"

Alberto ha aggiunto istruzioni extra ("mandami via mail", "mettilo su doc") ma il parser ha cercato di parsare TUTTO come voci.

Fix: separa le voci dalle istruzioni:
- Le voci sono la parte con numeri/importi
- Le istruzioni sono la parte testuale senza numeri ("mandami via mail", "mettilo su doc")
- Salva le istruzioni nel preventivo pending per lo step successivo

## Test

Con nexusTestInternal:
1. "prepara preventivo per De Amicis intestato a 3i" → deve mostrare P.IVA 02486680065
2. "Verifica impianto di distribuzione riscaldamento 200€ + iva" → deve parsare: Verifica impianto... €200
3. "sopralluogo 200, relazione 150€ + iva, verifica 300 euro" → deve parsare 3 voci

Deploy + test + email report.
Committa con "fix(preventivo): parser robusto + P.IVA reale"
