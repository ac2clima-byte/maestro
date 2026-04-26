Tre bug nel preventivo da fixare.

## Bug 1: IVA default per aziende deve essere reverse charge

In handlers/preventivo.js, quando viene creato il preventivo pending:
- Se l'intestatario ha P.IVA (campo piva non vuoto) → imposta iva_aliquota=0, iva_regime="reverse_charge", iva_nota="Operazione soggetta a reverse charge ex art. 17 c.6 DPR 633/72"
- Se NON ha P.IVA (privato/condominio) → IVA 22% default
- Alberto può sempre cambiare dopo con "iva 22%" o "iva 10%"

Nel riepilogo dopo le voci, mostra: "Imponibile 200,00 €, IVA 0% (reverse charge), totale 200,00 €" di default per aziende.

## Bug 2: Link non cliccabili nella chat NEXUS

Nella PWA (js/app.js o dove vengono renderizzati i messaggi nella chat):
- Trova la funzione che renderizza il testo dei messaggi
- Aggiungi autolink: trasforma URL (https://...) in tag <a href="URL" target="_blank">URL</a>
- Regex: /(https?:\/\/[^\s<>"']+)/g → '<a href="$1" target="_blank" style="color:#006eb7;word-break:break-all;">$1</a>'
- Testa che i link al PDF e a DOC diventino cliccabili

## Bug 3: Template PDF — destinatario e oggetto errati

In handlers/preventivo.js, nella funzione buildGraphDataPreventivo (o dove costruisce i dati per GRAPH):

DESTINATARIO nel PDF deve essere l'indirizzo dell'AZIENDA intestataria, NON del condominio:
```
Spett.le 3i efficientamento energetico S.r.l. Società Benefit
Via Ludovico Ariosto 33
Milano
P.IVA 02486680065
```
NON:
```
3i efficientamento energetico S.r.l. Società Benefit
CONDOMINIO DE AMICIS
VIA DE AMICIS, 12, TORTONA
```

Il condominio va nell'OGGETTO come luogo dell'intervento, non nel destinatario.

OGGETTO nel PDF deve descrivere il lavoro, non ripetere "Preventivo per":
- Usa la prima voce come descrizione: "Offerta per sopralluogo - Condominio De Amicis, Via De Amicis 12, Tortona"
- Se ci sono più voci: "Offerta per verifica impianto e manutenzione - Condominio De Amicis"
- Pattern: "Offerta per [descrizione voci] - [nome condominio], [indirizzo]"

## Test

Con nexusTestInternal:
1. "prepara preventivo per De Amicis intestato a 3i" → deve già mostrare reverse charge nel riepilogo
2. "sopralluogo 200" → IVA 0% reverse charge di default
3. "mettilo su doc" → PDF con destinatario Via Ariosto 33 Milano, oggetto "Offerta per sopralluogo - Condominio De Amicis"
4. Verifica che i link nella risposta chat siano cliccabili (se testato con Playwright: verifica tag <a>)

Deploy functions + hosting.
Email report.
Committa con "fix(preventivo): IVA default RC per aziende + link cliccabili + template PDF corretto"
