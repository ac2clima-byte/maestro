Deploya la PWA aggiornata su Firebase Hosting. Riesegui anche la pipeline completa sulle ultime 30 email per aggiornare tutti i dati in Firestore (thread, followup, sentiment, scoring, profili mittenti).

cd projects/iris
python3 scripts/pipeline.py
firebase deploy --only hosting

Apri nel browser: cmd.exe /c start https://nexo-hub-15f2d.web.app
Committa con "deploy: IRIS v0.1 completa con F1-F12"
