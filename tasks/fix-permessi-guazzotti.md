La Cloud Function di NEXO non riesce a leggere Firestore di guazzotti-tec. Mancano i permessi cross-project.

Esegui questo comando:

gcloud projects add-iam-policy-binding guazzotti-tec \
  --member=serviceAccount:272099489624-compute@developer.gserviceaccount.com \
  --role=roles/datastore.user

Poi verifica che funzioni: rideploya le functions e ricarica la pagina PHARO.

cd projects/iris && firebase deploy --only functions
cmd.exe /c start https://nexo-hub-15f2d.web.app

Committa con "fix: permessi cross-project guazzotti-tec per Cloud Functions"
