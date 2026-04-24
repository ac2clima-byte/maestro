Nella sidebar della PWA, il click su un Collega non funziona — bisogna premere spazio dopo il Tab. 

Fix:
1. Ogni voce della sidebar deve rispondere al CLICK del mouse (non solo keyboard focus + space)
2. Verifica che ogni elemento della sidebar abbia onclick handler, non solo onfocus/onkeydown
3. Se gli elementi sono <div> o <span>, aggiungi: role="button", tabindex="0", cursor: pointer
4. Il click deve navigare direttamente alla pagina del Collega
5. Hover: mostra effetto visivo (sfondo leggermente più scuro)

Deploy hosting.
Committa con "fix(pwa): sidebar click funzionante"
