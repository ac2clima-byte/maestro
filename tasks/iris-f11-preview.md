Implementa F11 — Screenshot Allegati Inline per IRIS.

1. Per gli allegati PDF: quando la pipeline processa un'email con PDF allegato, usa Playwright per renderizzare la prima pagina del PDF e salvare un thumbnail
2. Per le immagini allegate: salva direttamente come thumbnail ridimensionato
3. Salva i thumbnail in Firebase Storage (bucket del progetto nexo-hub-15f2d)
4. Nella PWA: mostra thumbnail cliccabili nella sezione allegati del pannello lettura. Click → mostra full size in modale
5. Se non riesci con Firebase Storage, salva i thumbnail come base64 in Firestore (campo attachmentPreviews)
6. Rideploya PWA, apri nel browser
7. Committa con "feat(iris): F11 attachment previews"
