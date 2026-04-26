Il tecnico "Berberi Ergest" è un nome errato. Il nome corretto è "Leshi Ergest".

1. Cerca in TUTTO il codice e i file di contesto riferimenti a "Berberi":
   grep -r "Berberi\|BERBERI\|berberi" projects/ context/ CLAUDE.md tasks/ 2>/dev/null

2. Sostituisci TUTTI i riferimenti "Berberi Ergest" con "Leshi Ergest"

3. Se il dato è in COSMINA Firestore (cosmina_config/tecnici_acg o rubrica contatti), segnala: "Il dato errato è nel database COSMINA, Alberto deve correggerlo manualmente dalla console Firebase"

4. Aggiorna CLAUDE.md con il nome corretto nella lista tecnici ACG

5. Committa con "fix: nome tecnico corretto Leshi Ergest (non Berberi)"
