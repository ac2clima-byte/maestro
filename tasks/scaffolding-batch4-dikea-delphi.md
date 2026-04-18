PREREQUISITO: esegui dopo scaffolding-batch3.

Leggi context/nexo-architettura.md. Crea lo scaffolding per DIKEA e DELPHI.

DIKEA (projects/dikea/):
- Collega Compliance: CURIT, F-Gas, DiCo, PEC, normative
- Tipi: ScadenzaNormativa, DiCo (stato, campiCompilati, erroriValidazione), PEC (tipo, stato, scadenzaRisposta, priorita), CertificazioneFGas, LibrettoImpianto
- Azioni: scadenzeCURIT, verificaStatoCURIT, impiantiSenzaTarga, impiantiNonRegistrati, generaDiCo, validaDiCo, inviaDiCo, dicoMancanti, checkFGas, scadenzeFGas, gestisciPEC, bozzaRispostaPEC, pecInScadenza, auditAccessi, verificaConformitaGDPR, reportConformita
- Prompt system.md: riferimenti normativi DPR 74/2013, DM 37/2008, Reg EU 517/2014, UNI 10200
- LLM_MODEL=claude-sonnet-4-20250514 (precisione critica)
- .env: COSMINA_PROJECT_ID, CURIT_USERNAME, CURIT_PASSWORD, ANTHROPIC_API_KEY, FIREBASE_PROJECT_ID=nexo-hub-15f2d
- Ascolta Lavagna: pec_ricevuta, richiesta_dico, scadenza_normativa

DELPHI (projects/delphi/):
- Collega Analisi: KPI, margini, trend, proiezioni, dashboard
- Tipi: KPI (valore, trend, target), Report, Anomalia, Trend, Confronto
- Azioni: kpiDashboard, marginePerIntervento, topCondomini, topClienti, topTecnici, produttivitaTecnico, produttivitaTeam, trend, previsioneIncassi, previsioneCaricoLavoro, confrontoAnnoSuAnno, anomalie, costoAI, reportMensile, reportAnnuale, dashboardHTML, chiedi (domande in linguaggio naturale)
- Prompt system.md: regole analisi, stagionalità HVAC, format numeri
- LLM_MODEL=claude-sonnet-4-20250514 (analisi complesse)
- .env: COSMINA_PROJECT_ID, GUAZZOTTI_PROJECT_ID, DIOGENE_API_URL, ANTHROPIC_API_KEY, FIREBASE_PROJECT_ID=nexo-hub-15f2d
- Ascolta Lavagna: richiesta_analisi

DRY_RUN=false in entrambi.
Committa con "feat(nexo): scaffolding DIKEA + DELPHI"
