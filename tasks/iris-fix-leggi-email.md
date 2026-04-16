Aggiungi alla PWA (projects/iris/pwa/index.html) un bottone "Leggi email" su ogni card che:

1. Apre un modale (o espande la card) mostrando il corpo completo dell'email
2. Il testo deve essere leggibile — sfondo scuro, testo bianco, font monospace, scroll se lungo
3. Bottone "Chiudi" per tornare alla lista

Il body completo dell'email è già salvato in Firestore nel campo raw.body_text di ogni documento.

Rideploya su Firebase Hosting dopo la modifica.
Apri https://nexo-hub-15f2d.web.app nel browser dopo il deploy.
Committa con "feat(iris): bottone leggi email completa"
