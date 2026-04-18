PREREQUISITO: esegui dopo scaffolding-batch2.

Leggi context/nexo-architettura.md. Crea lo scaffolding per CHARTA e EMPORION.

CHARTA (projects/charta/):
- Collega Amministrativo: fatture, DDT, incassi, pagamenti, solleciti
- Tipi: Fattura (tipo, righe, importo, stato, scadenza), RigaFattura, Incasso, EsposizioneCliente, DDT, ReportMensile
- Azioni: registraFattura, parseFatturaFornitore, scadenzeFatture, fattureScadute, registraIncasso, estraiIncassiDaEmail, estraiIncassiDaExcel, registraDDT, parseDDT, controllaDDTvsFattura, ddtSenzaFattura, esposizioneCliente, clientiAltaEsposizione, reportMensile, reportAnnuale, generaSollecito, sollecitiBatch, riconciliaAutomatica
- .env: COSMINA_PROJECT_ID, GUAZZOTTI_PROJECT_ID, FATTURE_IN_CLOUD_API_KEY, FIREBASE_PROJECT_ID=nexo-hub-15f2d
- Ascolta Lavagna: fattura_ricevuta, incassi_ricevuti, offerta_fornitore, richiesta_esposizione

EMPORION (projects/emporion/):
- Collega Magazzino: giacenze, furgoni, ordini, listini
- Tipi: Articolo (codice, marca, fornitori, scortaMinima, compatibilita), Giacenza, Movimento, OrdineFornitore, InventarioFurgone
- Posizioni: "centrale", "furgone_malvicino", "furgone_dellafiore", "furgone_victor", "furgone_marco", "furgone_david", "cantiere"
- Azioni: disponibilita, dovSiTrova, articoliSottoScorta, carico, scarico, trasferisci, creaOrdine, ordiniInCorso, ricevutoOrdine, suggerisciRiordino, listiniComparati, ocrDDT, caricaDaDDT, inventarioFurgone, rifornisciFurgone, articoliCompatibili
- .env: COSMINA_PROJECT_ID, MAGAZZINO_PRO_URL, FIREBASE_PROJECT_ID=nexo-hub-15f2d
- Ascolta Lavagna: richiesta_disponibilita_ricambio, materiali_consumati, ddt_ricevuto

DRY_RUN=false in entrambi.
Committa con "feat(nexo): scaffolding CHARTA + EMPORION"
