ECHO non deve avere numeri hardcodati in echo_config. I numeri di telefono sono già nel CRM di COSMINA. MEMO li conosce.

FIX nel nexusRouter:

1. Quando ECHO deve mandare un WA a "Malvicino" o "Alberto" o qualsiasi nome:
   - Prima chiedi a MEMO: cerca in crm_clienti e in cosmina_config/tecnici_acg il numero di telefono della persona
   - I tecnici (Malvicino, Dellafiore, ecc.) sono in cosmina_config/tecnici_acg
   - I clienti sono in crm_clienti
   - Alberto (il proprietario) potrebbe essere in cosmina_config o nell'env

2. Rimuovi la whitelist statica da echo_config. La sicurezza resta con:
   - DRY_RUN=true di default
   - Solo nomi/numeri che MEMO trova nel CRM possono ricevere messaggi
   - Numeri sconosciuti → "Non trovo questo contatto nel CRM"

3. Mantieni gli alias come fallback per i nomi comuni:
   - "alberto" → cerca in tecnici_acg o config
   - "malvicino" → cerca in tecnici_acg
   - Se non trova → "Non trovo il numero di [nome] nel CRM. Verifica in COSMINA."

4. Testa: "manda whatsapp a Malvicino: domani intervento Kristal ore 14"
   - Deve trovare il numero di Malvicino in tecnici_acg
   - In dry-run: "Simulato: WA a Malvicino (+39xxx) — domani intervento Kristal ore 14"

5. Rideploya functions
6. Committa con "feat(echo): numeri da MEMO/CRM invece di whitelist statica"
