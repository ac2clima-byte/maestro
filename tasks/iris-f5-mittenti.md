Implementa F5 — Mappa Relazioni Mittenti per IRIS.

1. Crea projects/iris/scripts/sender_profiler.py:
   - Analizza tutte le email in Firestore e costruisce un profilo per ogni mittente
   - Profilo: nome, email, totale email, prima/ultima email, frequenza media, categorie più comuni, condomini menzionati, sentiment medio
   - Salva i profili in Firestore collection iris_sender_profiles

2. Aggiorna la PWA:
   - Cliccando sul nome mittente in una card, appare un popup/tooltip con il profilo:
     "Rossi — 23 email in 3 mesi, ultimo contatto 3gg fa, categorie: 60% interventi, 30% preventivi, sentiment medio: neutro"
   - Badge sul mittente se è un mittente frequente (>5 email)

3. Riesegui il profiler sulle email esistenti
4. Rideploya PWA
5. Apri nel browser
6. Committa con "feat(iris): F5 sender profiles"
