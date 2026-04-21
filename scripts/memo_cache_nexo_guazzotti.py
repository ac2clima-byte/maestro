#!/usr/bin/env python3
"""
MEMO — scrive cache schema Guazzotti TEC su nexo-hub-15f2d/memo_dossier/guazzotti_tec_schema.

Serve a rendere lo schema Firestore del progetto Guazzotti leggibile
da tutti i Colleghi (NEXUS, IRIS, ECHO) senza dover riscansionare.

SAFE: write limitata al solo documento memo_dossier/guazzotti_tec_schema.
Contenuto statico e ispezionabile in questo file.
"""
import firebase_admin
from firebase_admin import firestore
from datetime import datetime, timezone

NEXO_PROJECT = "nexo-hub-15f2d"
TARGET_COLL = "memo_dossier"
TARGET_DOC = "guazzotti_tec_schema"

app = firebase_admin.initialize_app(options={"projectId": NEXO_PROJECT}, name="nexo")
db = firestore.client(app)

summary = {
    "source_project": "guazzotti-tec",
    "scanned_at": datetime.now(timezone.utc).isoformat(),
    "scanned_by": "MEMO",
    "root_collections_count": 22,
    "collections": {
        "_counters": {"role": "Contatori numerici RTI per anno", "doc_count": 1, "ids": ["rti_numbers"]},
        "ai_audit_log": {"role": "Log interazioni agente AI interno", "doc_count": 14},
        "catalogoArticoli": {"role": "Catalogo ricambi (singolo doc default)", "doc_count": 1},
        "commesse": {"role": "Ordini/commesse fornitore con parsing AI",
                     "doc_count_est": "bassa",
                     "links": {"rtidf_ids": "rtidf.numero_rtidf[]"}},
        "emailConfig": {"role": "Destinatari e CC email per tipo documento", "doc_count": 1},
        "email_archive": {"role": "Storico email uscenti con contenuto HTML", "doc_count_est": "100+"},
        "email_logs": {"role": "Log tecnico invii email", "doc_count_est": "100+"},
        "gmail_settings": {"role": "Credenziali Gmail IMAP (nuovo)", "doc_count": 1, "sensitive": True},
        "guazzotti_config": {"role": "Credenziali Gmail (legacy duplicato)", "doc_count": 1,
                             "sensitive": True, "deprecated_candidate": True},
        "mpls": {"role": "Multi-Preventivo Lavori Straordinari (offerte)",
                 "doc_count": 7, "id_pattern": "MPLS-YYYY-NNN"},
        "mplsContacts": {"role": "Rubrica destinatari offerte MPLS", "doc_count": 1},
        "notification_settings": {"role": "Config notifiche periodiche ticket aperti", "doc_count": 1},
        "pagamenti_clienti": {"role": "Esposizione creditoria corrente per cliente",
                              "doc_count_est": "100+",
                              "id_pattern": "<CodCliente> 10 cifre"},
        "pagamenti_snapshots": {"role": "Snapshot storico mensile esposizione",
                                "doc_count": 9, "id_pattern": "snapshot_YYYY-MM-DD"},
        "pending_rti": {"role": "Buffer card Trello/Cosmina in attesa di RTI",
                        "doc_count": 84, "all_processed": True,
                        "links": {"rti_id": "rti.id",
                                  "numero_ticket": "tickets.numero_ticket"}},
        "rti": {"role": "Rapporti Tecnici Intervento (bozza/definiti)",
                "doc_count_est": "~500",
                "id_patterns": ["GRTI-YYYY-NNN", "CRTI-YYYY-NNN", "rti_<ts>"],
                "tipi": ["generico", "contabilizzazione"],
                "stati": ["bozza", "definito", "rtidf_presente", "rtidf_inviato", "rtidf_fatturato"],
                "links": {"ticket_collegato": "tickets.id", "commessa": "commesse.numero"},
                "heavy_fields": ["rtiPdfContent (~100KB base64)"]},
        "rtidf": {"role": "RTI Definitivi (snapshot immutabile fatturazione)",
                  "doc_count_est": "~195",
                  "id_patterns": ["GRTIDF-YYYY-NNN", "CRTIDF-YYYY-NNN"],
                  "tipi": ["generico", "contabilizzazione"],
                  "stati": ["bozza", "definito", "definitivo", "inviato", "fatturato"],
                  "note": "Debito semantico: definito vs definitivo convivono",
                  "links": {"rti_origine_id": "rti.id",
                            "numero_ticket_collegato": "tickets.numero_ticket"}},
        "tickets": {"role": "Ticket assistenza (apertura->chiusura)",
                    "doc_count_est": "~500",
                    "tipi": ["generico", "contabilizzazione"],
                    "stati": ["aperto", "pianificato", "in_attesa", "da_chiudere",
                              "chiuso", "chiuso/inviato"],
                    "fonti": ["cosmina_email", "gmail_contabilizzazione", "gmail_generici"],
                    "subcollections": ["attachments"],
                    "links": {"rti_inviato": "rti.numero_rti",
                              "rtiChiusura": "rti.numero_rti"}},
        "todo_tasks": {"role": "Backlog feature interne app", "doc_count": 4},
        "users": {"role": "Utenti applicativi auth custom", "doc_count": 4,
                  "sensitive": True,
                  "warning": "password in chiaro, non usa Firebase Auth"},
        "whatsapp_config": {"role": "Config webhook Meta/Trello/Claude", "doc_count": 1,
                            "note": "Webhook punta a garbymobile-f89ac (cross-project)"},
        "whatsapp_routing_rules": {"role": "Regole routing messaggi WA -> azione",
                                   "doc_count": 2},
    },
    "key_flows": {
        "ticket_chiuso": [
            "tickets (aperto)",
            "pending_rti (opzionale, se da bacheca Trello)",
            "rti (bozza -> definito)",
            "rtidf (duplicato snapshot)",
            "commesse (raggruppa N rtidf_ids, fattura)",
            "email_archive + email_logs (tracking invio)"
        ]
    },
    "warnings": [
        "rtidf.stato: label 'definito' (33) e 'definitivo' (48) coesistono - normalizzare prima di aggregare",
        "Two patterns RTI: GRTI (generico) e CRTI (contabilizzazione) - numero_rti NON unique tra tipi",
        "PDF embeddato in rtiPdfContent (~100KB): attenzione a costi full-scan",
        "gmail_settings vs guazzotti_config: duplicato legacy - verificare lettore prima di deprecare",
        "users: password in chiaro",
        "whatsapp_config webhook su garbymobile-f89ac: integrazione cross-progetto"
    ],
    "context_file": "maestro-bridge/context/memo-guazzotti-tec-map.md",
    "next_scan_recommended": "settimanale o on-demand 'memo aggiornati'",
}

db.collection(TARGET_COLL).document(TARGET_DOC).set(summary)
print(f"OK scritto {TARGET_COLL}/{TARGET_DOC} su {NEXO_PROJECT}")
print(f"   root_collections_count = {summary['root_collections_count']}")
print(f"   warnings = {len(summary['warnings'])}")
