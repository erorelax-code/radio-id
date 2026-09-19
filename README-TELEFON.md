# Radio ID Mobile — uruchomienie na telefonie

Ta paczka jest przygotowana do hostingu HTTPS jako jedna usługa Node.js. Frontend i proxy streamów działają pod tym samym adresem, więc po wdrożeniu nie używasz już `content://`.

## Najprostsze wdrożenie: Render
1. Umieść zawartość tego folderu w repozytorium GitHub.
2. W Render wybierz **New → Web Service** i połącz repozytorium.
3. Ustaw: Language **Node**, Build Command `npm install`, Start Command `npm start`.
4. Health Check Path: `/health`. Możesz wybrać plan Free do testów.
5. Po wdrożeniu otwórz przydzielony adres `https://...onrender.com` w Chrome na Androidzie.
6. W menu Chrome wybierz **Dodaj do ekranu głównego / Zainstaluj aplikację**.

Plik `render.yaml` zawiera gotową konfigurację dla Render Blueprint.

## Ważne
- PRL, Sami Swoi i Fix Radio korzystają z `/api/stream/...` po stronie serwera.
- `/api/recognize` jest przygotowane, ale prawdziwe rozpoznawanie wymaga jeszcze klucza i integracji z dostawcą (np. AudD/ACRCloud). Klucza nie należy wkładać do HTML.
- Darmowy serwer może mieć ograniczenia hostingu i czas wybudzania po bezczynności.
