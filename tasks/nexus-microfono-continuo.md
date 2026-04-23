Il microfono di NEXUS deve funzionare in modalità conversazione continua, non one-shot.

Quando Alberto attiva il microfono:
1. Il microfono resta ACCESO continuamente (non si spegne dopo ogni frase)
2. Web Speech API: continuous=true, interimResults=true
3. Quando rileva una pausa nel parlato (1-2 secondi di silenzio) → invia il messaggio automaticamente
4. Mentre NEXUS risponde (TTS): metti in pausa il riconoscimento vocale per non catturare la voce di NEXUS
5. Quando NEXUS finisce di parlare → riattiva il microfono automaticamente
6. Il loop continua: Alberto parla → NEXUS risponde → Alberto parla → ...
7. Per uscire: tocca il bottone microfono o dì "stop" / "basta"

Indicatore visivo:
- Microfono attivo: icona rossa pulsante + onda sonora animata
- NEXUS sta rispondendo: icona blu + "sta parlando..."
- In attesa: icona verde + "ti ascolto..."

È come una telefonata con NEXUS. Alberto parla naturalmente, NEXUS risponde con voce Diego, la conversazione va avanti.

Deploy hosting.
Committa con "feat(nexus): microfono conversazione continua"
