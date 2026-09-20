# Radio ID v18

Mobilna aplikacja PWA do słuchania radia internetowego z backendowym proxy streamów i rozpoznawaniem utworów przez AudD.

## Uruchomienie lokalne

Wymagany jest Node.js 18+ oraz token z panelu AudD.

```bash
AUDD_API_TOKEN=twoj_token npm start
```

Następnie otwórz `http://localhost:8080`. Stan konfiguracji można sprawdzić pod `http://localhost:8080/health` — pole `auddConfigured` powinno mieć wartość `true`.

## Konfiguracja na Render

Blueprint w `render.yaml` deklaruje sekret `AUDD_API_TOKEN`. Przy pierwszym wdrożeniu lub w ustawieniach istniejącej usługi dodaj token w sekcji **Environment**. Nie zapisuj tokenu w repozytorium ani w kodzie klienta.

Po ustawieniu sekretu Render automatycznie wdroży aplikację. Rozpoznawanie działa dla wbudowanych stacji oraz dla publicznych adresów HTTPS/HTTP zwracanych przez Radio Browser.

## Jak działa rozpoznawanie

1. Klient wysyła identyfikator stacji i jej publiczny adres do `POST /api/recognize`.
2. Serwer pobiera około 12 sekund transmisji.
3. Fragment audio jest przesyłany do AudD jako plik `multipart/form-data`.
4. Klient wyświetla wykonawcę, tytuł, album i dostępne linki do serwisów muzycznych.

Token AudD jest używany wyłącznie po stronie serwera. Endpoint odrzuca lokalne i prywatne adresy sieciowe.

## Testy

```bash
npm test
```

## Endpointy

- `GET /health` — status aplikacji i konfiguracji AudD,
- `POST /api/recognize` — rozpoznawanie utworu,
- `GET /api/stream/:station` — proxy dla wbudowanych stacji,
- `GET /api/stream?url=...` — proxy publicznego streamu.
