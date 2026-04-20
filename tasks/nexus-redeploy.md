Deploya tutto per NEXUS:

1. Cloud Functions: cd projects/iris && firebase deploy --only functions
2. Hosting (PWA): cd projects/nexo-pwa && firebase deploy --only hosting
3. Firestore rules: cd projects/iris && firebase deploy --only firestore:rules
4. Firestore indexes: cd projects/iris && firebase deploy --only firestore:indexes

Se qualche deploy fallisce, stampa l'errore e continua con gli altri.

Apri nel browser: cmd.exe /c start https://nexo-hub-15f2d.web.app
