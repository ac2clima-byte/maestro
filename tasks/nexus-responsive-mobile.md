La PWA NEXO e NEXUS Chat non sono responsive su smartphone. Fix.

1. Testa la PWA con Playwright in viewport mobile (375x812, iPhone 14):
   - Apri https://nexo-hub-15f2d.web.app
   - Screenshot homepage
   - Apri NEXUS Chat
   - Screenshot chat aperta
   - Scrivi un messaggio e screenshot risposta
   - Naviga nelle pagine dei Colleghi (IRIS, CHRONOS, PHARO)
   - Screenshot di ogni pagina
   - Analizza tutti gli screenshot e identifica i problemi

2. Fix comuni da applicare:
   - Sidebar: su mobile deve essere nascosta con hamburger menu (☰), non fissa
   - NEXUS Chat: su mobile deve occupare tutto lo schermo (100vw, 100vh)
   - FAB chat: posizione corretta su mobile (non sovrapposto alla navbar)
   - Font: leggibili su mobile (min 14px)
   - Card/badge: una colonna su mobile, non grid multipla
   - Input chat: tastiera mobile non deve coprire il campo input (position fixed bottom)
   - Dashboard home: card una sotto l'altra su mobile
   - Tabelle: scroll orizzontale su mobile se troppo larghe
   - Touch target: bottoni almeno 44x44px

3. Meta viewport tag se mancante:
   <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">

4. Media queries:
   @media (max-width: 768px) { ... } per tablet
   @media (max-width: 480px) { ... } per smartphone

5. Testa di nuovo dopo il fix con viewport mobile
6. Screenshot before/after
7. Deploy hosting
8. Committa con "fix(pwa): responsive mobile completo"
