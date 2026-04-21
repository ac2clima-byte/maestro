Modifica projects/nexo-pwa/public/index.html:

1. Rimuovi TUTTO il blocco "Collega in costruzione" / "⏳" per ogni Collega

2. Per ogni pagina Collega nella sidebar, sostituisci il placeholder con una sezione semplice che:
   - Mostra il pallino VERDE (non grigio) per: ARES, CHRONOS, MEMO, CHARTA, ECHO, EMPORION, DIKEA, DELPHI, PHARO
   - Pallino GIALLO per CALLIOPE
   - Sotto il nome: "Operativo v0.1" invece di "Collega in costruzione"
   - Un bottone grande: "Parla con [NOME] via NEXUS" che apre il pannello chat

3. NON servono dashboard elaborate per ogni Collega — il punto di accesso è NEXUS Chat. Le pagine Collega sono solo informative con il bottone per aprire la chat.

4. Rideploya: cd projects/nexo-pwa && firebase deploy --only hosting

5. Committa con "fix(pwa): rimuovi placeholder, tutti i Colleghi attivi"
