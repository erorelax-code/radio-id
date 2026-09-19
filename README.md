# Radio ID v9 Online

Ta wersja dodaje backendowy proxy streamów dla PRL, Sami Swoi Radio i Fix Radio. Dzięki temu problematyczne stacje nie muszą być odtwarzane bezpośrednio z `content://`.

## Uruchomienie lokalne
Wymagany Node.js 18+.

```bash
npm start
```

Następnie otwórz `http://localhost:8080`. Na telefonie aplikacja powinna być wdrożona na hostingu HTTPS (np. serwer Node obsługujący ten folder). Samo otwarcie `index.html` jako `content://` nie uruchomi endpointów `/api/stream/...`.

## Co działa w v9
- nowoczesny interfejs v8,
- logo/miniatury stacji i fallback,
- ulubione i ostatnio słuchane,
- backendowy proxy dla PRL, Sami Swoi i Fix Radio,
- endpoint `/health`,
- przygotowany endpoint `/api/recognize`.

## Rozpoznawanie utworów
`/api/recognize` celowo nie zawiera klucza API w kodzie klienta. Aby uruchomić prawdziwe rozpoznawanie, trzeba podłączyć wybranego dostawcę po stronie serwera i przechowywać klucz jako sekret/zmienną środowiskową.
