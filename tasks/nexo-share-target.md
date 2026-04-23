La PWA NEXO deve registrarsi come Share Target su Android per ricevere messaggi WA e altri contenuti.

## 1. Web Share Target API

Nel manifest.json della PWA (projects/nexo-pwa/public/manifest.json o dentro index.html):

```json
{
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [
        {
          "name": "media",
          "accept": ["image/*", "audio/*", "video/*", "application/pdf"]
        }
      ]
    }
  }
}
```

## 2. Gestione /share nella PWA

Quando la PWA riceve contenuto condiviso:
1. Apri automaticamente il pannello NEXUS Chat
2. Se è testo: mettilo nel campo input con prefisso "📱 Messaggio condiviso: "
3. Se è un'immagine: mostrala in anteprima nella chat + "Vuoi che analizzi questa immagine?"
4. Se è un audio: "Vuoi che trascrivo questo audio?"
5. Se è un PDF: "Vuoi che leggo questo documento?"
6. NEXUS analizza il contenuto e propone azioni come farebbe per qualsiasi messaggio

## 3. Service Worker

Il Service Worker deve gestire la route /share:
- Intercetta il POST
- Estrae i dati (testo, file)
- Li passa alla PWA
- Se la PWA è chiusa, la apre

## 4. Manifest completo

Verifica che il manifest.json abbia anche:
- name, short_name, start_url, display: standalone
- icons (almeno 192x192 e 512x512)
- theme_color, background_color
- Così Android la tratta come app vera (non sito web)

## 5. Deploy hosting
## 6. Testa:
- Installa la PWA su un browser Chrome desktop (simula)
- Apri un file/testo e condividilo con la PWA
- Verifica che NEXUS riceva il contenuto
## 7. Committa con "feat(nexo): Web Share Target - ricevi contenuti da altre app"
