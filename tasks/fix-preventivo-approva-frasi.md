PROBLEMA: il preventivo si approva SOLO con "sì". Ma Alberto dice "mettilo su doc", "mandami il pdf", "genera il pdf", "procedi", "ok", "vai", "fallo" — e NEXUS non capisce.

## Fix

1. In tryInterceptPreventivoSi, aggiungi TUTTI questi pattern:
   - "sì", "si", "ok", "vai", "procedi", "fallo", "genera", "conferma", "approvato", "approva"
   - "mettilo su doc", "salvalo su doc", "genera il pdf", "crea il pdf", "mandami il pdf"
   - "mandami il preventivo", "manda il preventivo", "invia il preventivo"
   - "mandami via mail", "mandamelo via mail", "inviamelo"
   - Qualsiasi frase che contenga "pdf" o "doc" o "manda" nel contesto di un preventivo in attesa_approvazione

2. Se la frase contiene un indirizzo email (regex email):
   - Salva l'email come destinatario nel preventivo pending
   - Procedi con la generazione PDF + invio email a quell'indirizzo

3. Se la frase contiene "mail" o "manda" + nessun indirizzo:
   - Genera il PDF
   - Chiedi: "A chi lo mando? All'intestatario (davide.torriglia@gruppo3i.it) o a un altro indirizzo?"

4. Se Haiku fallback riceve la frase e c'è un pending in attesa_approvazione:
   - Haiku deve capire che "mettilo su doc" = approva
   - Haiku deve capire che "mandami il pdf via mail" = approva + invia email
   - Haiku deve capire che "alberto.contardi@acgclimaservice.com" = indirizzo destinatario

5. Dopo la generazione PDF, se Alberto ha chiesto di mandarlo via mail:
   - Usa ECHO per mandare email con PDF allegato
   - Se non specificato il destinatario: chiedi a chi mandarlo
   - Se specificato: manda subito

## Test con nexusTestInternal

Flusso 1 (base):
1. "prepara preventivo per De Amicis intestato a 3i"
2. "verifica 200€"
3. "iva 0 reverse charge"
4. "mettilo su doc" → DEVE generare PDF e mostrare link

Flusso 2 (con email):
1. "prepara preventivo per De Amicis intestato a 3i"
2. "verifica 200€"
3. "ok mandami il pdf a alberto.contardi@acgclimaservice.com" → DEVE generare PDF e mandare email

Flusso 3 (semplice):
1. "prepara preventivo per De Amicis intestato a 3i"
2. "verifica 200€"
3. "vai" → DEVE generare PDF

Deploy + test + email report.
Committa con "fix(preventivo): approva con frasi naturali + invio email"
