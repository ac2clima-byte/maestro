Simula l'arrivo dell'email di Torriglia per testare il trigger automatico.

1. Crea un NUOVO documento in iris_emails (Firestore nexo-hub-15f2d) che simula una email appena arrivata:

python3 -c "
import firebase_admin
from firebase_admin import firestore
from datetime import datetime

app = firebase_admin.initialize_app(options={'projectId': 'nexo-hub-15f2d'})
db = firestore.client(app)

doc = {
    'sender': 'Davide Torriglia <davide.torriglia@gruppo3i.it>',
    'senderEmail': 'davide.torriglia@gruppo3i.it',
    'senderName': 'Davide Torriglia',
    'subject': 'R: Verifica riscaldamento condominio De Amicis',
    'body': 'Buongiorno Alberto\n\n* 3i efficientamento energetico S.r.l. Società Benefit - P.IVA 02486680065\n\nSaluti\nDavide',
    'threadBody': 'Da: Alberto Contardi - ACG Clima Service Srl\nOggetto: Verifica riscaldamento condominio De Amicis\n\nBuongiorno, come da accordi richiedo la corretta intestazione la ns offerta di verifica.\n\nCordiali saluti, Contardi Alberto',
    'date': datetime.now().isoformat(),
    'receivedAt': firestore.SERVER_TIMESTAMP,
    'category': 'RISPOSTA_CLIENTE',
    'intent': 'preparare_preventivo',
    'dati_estratti': {
        'persone': [{'nome': 'Davide Torriglia', 'azienda': '3i efficientamento energetico'}],
        'aziende': [{'nome': '3i efficientamento energetico S.r.l. Società Benefit', 'piva': '02486680065'}],
        'condomini': ['De Amicis']
    },
    'contesto_thread': 'Alberto ha chiesto intestazione per offerta verifica riscaldamento, Torriglia ha risposto con ragione sociale e P.IVA',
    'prossimo_passo': 'Preparare preventivo verifica riscaldamento intestato a 3i per Condominio De Amicis',
    'processed': False,
    'isTest': True
}

ref = db.collection('iris_emails').add(doc)
print(f'Email test creata: {ref[1].id}')
"

2. Questo dovrebbe triggerare irisRuleEngine (onDocumentCreated) che:
   - Rileva intent "preparare_preventivo"
   - Scrive sulla Lavagna per l'Orchestratore
   - L'Orchestratore avvia il workflow preventivo
   - Il preventivo viene generato
   - Push notification ad Alberto

3. Aspetta 30 secondi, poi verifica:
   - C'è un nuovo messaggio in nexo_lavagna con tipo preparare_preventivo?
   - C'è una nuova bozza in calliope_bozze?
   - C'è un nuovo record in charta_preventivi?

4. Apri NEXUS Chat con Playwright e verifica se c'è un messaggio automatico con il preventivo pronto

5. Screenshot + analisi testuale

6. Committa con "test: simulazione trigger automatico email Torriglia"
