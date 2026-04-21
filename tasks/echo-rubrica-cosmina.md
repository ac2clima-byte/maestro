ECHO deve leggere la rubrica interni di COSMINA, non cercare in tecnici_acg.

La rubrica è una collection in Firestore (progetto garbymobile-f89ac) che contiene tutti i contatti interni con: nome, interno, tel personale, tel lavoro, email, categoria (tecnico/ufficio), azienda (ACG/Guazzotti).

STEP:

1. Trova la collection della rubrica in COSMINA:
   python3 -c "
   import firebase_admin, json
   from firebase_admin import firestore
   app = firebase_admin.initialize_app(options={'projectId': 'garbymobile-f89ac'})
   db = firestore.client()
   # Cerca collection che potrebbe contenere la rubrica
   for c in db.collections():
       if any(k in c.id.lower() for k in ['rubrica', 'contatt', 'person', 'intern', 'staff', 'dipendent', 'phone']):
           print(c.id)
           docs = c.limit(2).get()
           for d in docs:
               print(json.dumps(d.to_dict(), default=str, indent=2)[:500])
   "

2. Se non la trovi con quei nomi, cerca in cosmina_config:
   python3 -c "
   import firebase_admin, json
   from firebase_admin import firestore
   app = firebase_admin.initialize_app(options={'projectId': 'garbymobile-f89ac'})
   db = firestore.client()
   doc = db.collection('cosmina_config').document('rubrica').get()
   if doc.exists:
       print(json.dumps(doc.to_dict(), default=str, indent=2)[:1000])
   else:
       # Prova tutti i documenti di cosmina_config
       for d in db.collection('cosmina_config').get():
           data = d.to_dict()
           if any(k in str(data).lower() for k in ['malvicino', 'contardi', 'dellafiore']):
               print(f'TROVATO in cosmina_config/{d.id}')
               print(json.dumps(data, default=str, indent=2)[:500])
   "

3. Una volta trovata la collection, aggiorna nexusRouter handleEchoWhatsApp:
   - Leggi TUTTI i contatti dalla rubrica COSMINA
   - Cerca per cognome (fuzzy, case insensitive)
   - Se ci sono più match (3 Malvicino), chiedi quale: "Ho trovato 3 Malvicino: Andrea, Lorenzo, Maurizio. Quale intendi?"
   - Usa il tel personale se disponibile, altrimenti tel lavoro
   - Se nessun telefono: "Trovato [nome] ma senza cellulare"

4. Testa con Playwright:
   - "manda whatsapp a Malvicino" → deve chiedere quale dei 3
   - "manda whatsapp a Andrea Malvicino: test" → deve trovare Andrea
   - "manda whatsapp a Dellafiore: domani Kristal ore 14" → deve chiedere Lorenzo o Victor
   - "manda whatsapp a Alberto: test nexo" → deve trovare Alberto Contardi con numero 3393343101
   - "manda whatsapp a Sara: test" → deve trovare Sara Quagliano con numero 3454108653

5. Rideploya functions
6. Committa con "feat(echo): rubrica interni da COSMINA con disambiguazione"
