La PWA ha un errore CORS quando aperta da file://. Il firebase-config.js non viene caricato.

Fix: incorpora il contenuto di firebase-config.js direttamente dentro index.html come tag <script> inline. Elimina l'import esterno. Tutto deve essere in un singolo file HTML autocontenuto che funziona aperto da file://.

Dopo il fix, apri la pagina nel browser con: cmd.exe /c start projects/iris/pwa/index.html

Committa con "fix(iris): inline firebase config to avoid CORS on file://"
