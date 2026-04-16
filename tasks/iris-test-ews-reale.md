Test connessione EWS reale.

Leggi le credenziali dal file /mnt/c/HERMES/.env (cerca OUTLOOK_USER e OUTLOOK_PASSWORD).

Poi scrivi uno script Python che:
1. Si connette a https://remote.gruppobadano.it/ews/exchange.asmx usando exchangelib con NTLM
2. IMPORTANTE: disabilita la verifica TLS (il server ha certificato self-signed) con: from exchangelib.protocol import BaseProtocol, NoVerifyHTTPAdapter; BaseProtocol.HTTP_ADAPTER_CLS = NoVerifyHTTPAdapter
3. Legge le ultime 5 email dalla inbox
4. Per ogni email stampa: mittente, oggetto, data, primi 200 caratteri del body
5. Salva l'output in projects/iris/test-ews-output.md

NON modificare nulla sulla casella email. Solo lettura.
Esegui lo script e mostra i risultati.
Committa con "test(iris): connessione EWS reale verificata"
