Radio ID v17 — rozpoznawanie AudD

1. Podmień tylko server.js w repozytorium.
2. AUDD_API_TOKEN musi być ustawiony w Render > Environment.
3. Po deployu otwórz /health. Powinno być:
   "app":"Radio ID v17 recognition"
   "auddConfigured":true

Endpoint:
POST /api/recognize
JSON:
{"station":"fix"}
albo:
{"url":"https://adres-streamu"}

Backend nagrywa około 12 sekund streamu i wysyła fragment do AudD.
Token nigdy nie trafia do przeglądarki.
