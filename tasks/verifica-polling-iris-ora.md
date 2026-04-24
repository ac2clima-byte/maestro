Verifica SUBITO se il polling IRIS funziona.

1. Controlla qual è l'ultima email in iris_emails:
   python3 -c "
   import firebase_admin
   from firebase_admin import firestore
   app = firebase_admin.initialize_app(options={'projectId': 'nexo-hub-15f2d'})
   db = firestore.client(app)
   docs = db.collection('iris_emails').order_by('date', direction=firestore.Query.DESCENDING).limit(3).get()
   for d in docs:
       data = d.to_dict()
       print(f\"{data.get('date','')} | {data.get('senderEmail',data.get('sender','?'))} | {data.get('subject','?')}\")
   "

2. Se l'ultima email è vecchia (prima di oggi), il polling NON funziona.

3. Verifica se il poller locale è attivo:
   ps aux | grep iris | grep -v grep
   ls ~/maestro-bridge/logs/iris_poller.log 2>/dev/null && tail -20 ~/maestro-bridge/logs/iris_poller.log

4. Se il poller non gira, avvialo manualmente:
   cd ~/maestro-bridge/projects/iris/scripts && python3 pipeline.py 2>&1 | tail -30

5. Se pipeline.py fallisce, stampa l'errore COMPLETO

6. Dopo l'esecuzione, verifica quante email nuove sono state importate

7. Committa con "fix(iris): verifica e fix polling"
