# Radar traderów

Narzędzie do podglądu ruchów topowych traderów na Hyperliquid. Pokazuje ranking, statystyki wybranego portfela, symulację kopiowania i alerty o zmianach pozycji przeliczone proporcjonalnie na własny kapitał.

Czyta wyłącznie publiczne dane. Nie ma dostępu do żadnego portfela, nie prosi o klucze i nie składa zleceń. To narzędzie informacyjne, a nie porada inwestycyjna.

## Jak używać

**Najprościej: strona w przeglądarce.** Wystarczy otworzyć link do strony tego repozytorium (GitHub Pages). Bot działa wtedy w otwartej karcie, a ustawienia i lista obserwowanych zapisują się w przeglądarce.

**Wtyczka do Chrome, Edge lub Brave.** Działa w tle i wysyła powiadomienia systemowe. Na `chrome://extensions` włącz tryb dewelopera, wybierz „Załaduj rozpakowane” i wskaż folder `extension`.

**Wersja na komputerze.** Wymaga Node 22 lub nowszego, bez dodatkowych paczek:

```bash
node server.js
```

Panel jest wtedy pod adresem `http://localhost:8791`.

## Czym różnią się wersje

| | Strona | Wtyczka | Na komputerze |
|---|---|---|---|
| Instalacja | brak | 2 minuty | Node |
| Alerty przy zamkniętym panelu | nie | tak | tak |
| Newsy | nie | tak | tak |

## Budowa

Cała logika jest w `extension/lib/` i jest wspólna dla wszystkich trzech wersji. `extension/dashboard.html` i `extension/dashboard.js` to panel, `extension/background.js` to proces w tle wtyczki, a `server.js` to wersja lokalna.
