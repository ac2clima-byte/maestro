PREREQUISITO: questo task va eseguito DOPO il task nexo-scaffolding-completo.

Implementa il motore di regole di IRIS.

1. Crea projects/iris/src/rules/RuleEngine.ts con la classe completa (non stub):
   - loadRules(): carica regole da Firestore collection iris_rules
   - evaluate(email): valuta tutte le regole, ritorna azioni della prima che matcha
   - execute(email, actions): esegue le azioni (scrivi lavagna, archivia, notifica, ecc.)
   - matchCondizioni(): match su mittente, oggetto, categoria, sentiment, allegati

2. Crea le 4 regole predefinite in Firestore:
   - "Incassi ACG da Malvicino": mittente contiene malvicino + oggetto contiene INCASSI → estrai dati + scrivi lavagna charta + notifica echo WA + archivia
   - "Newsletter e spam": categoria NEWSLETTER_SPAM → archivia
   - "PEC ufficiale": categoria PEC_UFFICIALE → scrivi lavagna dikea + notifica echo WA
   - "Guasto urgente": categoria GUASTO_URGENTE → scrivi lavagna ares + notifica echo WA + priorità critical

3. Integra il RuleEngine nella pipeline: dopo la classificazione, esegui le regole

4. Aggiorna la PWA con una sezione "Regole" in /settings dove Alberto può vedere e attivare/disattivare le regole

5. Testa con le email esistenti in Firestore

6. Rideploya PWA

7. Committa con "feat(iris): rule engine con 4 regole predefinite"
