# Rozbudowa bazy danych

## Warstwy danych

Baza rozróżnia kompletność osobno dla: `matches`, `dates`, `standings`, `club_memberships`, `players`, `goals` i `lineups`.
To ważne: brak nazwiska na niepełnej stronie nie może być traktowany jako dowód, że zawodnik nie grał lub nie strzelił.

## Główne źródła

- **MZPN/PZPN** — oficjalny szkielet nowszych rozgrywek: tabela, kolejki, wyniki.
- **RegionalnyFutbol** — tabela, kolejki, dokładne daty i godziny; dobry do uzupełniania terminarzy.
- **KtoWygral** — historyczne tabele i uczestnicy A-klasy Myślenice, wykorzystywane do katalogu klubów od 2002/03.
- **Futbolowo** — terminarze oraz, gdy strona meczu zawiera dane, strzelcy, minuty, składy, rezerwowi, zmiany, kapitan i numery.
- **90minut** — warstwa kontrolna i starsze wyniki/historia klubów.

## Automatyczna synchronizacja

Z aktywnym `.venv`:

```powershell
.\scripts\enrich_database.ps1
```

Wersja próbująca przejść również po stronach szczegółowych Futbolowo:

```powershell
.\scripts\enrich_database.ps1 -DeepFutbolowo
```

Skrypt niczego nie kasuje. Dane są dopisywane/uzupełniane, a sprzeczności trafiają do `data_conflicts`.

## Pojedyncze importy

```powershell
myslenice-quiz sync-history --start-year 2002 --end-year 2026
myslenice-quiz sync-regionalny-history --start-year 2017 --end-year 2025
myslenice-quiz fetch-futbolowo-schedule --season "2021/22" "https://dziecanovia.futbolowo.pl/schedule/420/24698/270"
myslenice-quiz crawl-futbolowo-schedule --season "2021/22" "https://dziecanovia.futbolowo.pl/schedule/420/24698/270"
myslenice-quiz fetch-crests
myslenice-quiz audit-data
```

## Herby

`fetch-crests` korzysta z zapisanych profili klubów, preferuje obraz oznaczony jako logo drużyny i zapisuje lokalną kopię w `web/assets/crests`.
Jeśli herb nie zostanie znaleziony, frontend pokazuje inicjały klubu, a brak można uzupełnić później bez blokowania gry.

## Bezpieczeństwo quizu

Pytania wymagające informacji negatywnej lub sumarycznej powstają tylko przy odpowiednim `coverage`.
Przykład: pytanie „kto NIE grał?” jest niedozwolone przy niepełnym rosterze, a dokładna liczba goli zawodnika w meczu wymaga kompletnego zapisu zdarzeń bramkowych.

## v15: SportoweTempo
Archiwum SportoweTempo jest warstwą dla starszych sezonów. Najpierw importujemy pełną stronę sezonu (tabela + terminarz), potem opcjonalnie crawl linków `/relacja/`. Parser oznacza walkowery i nie tworzy tożsamości zawodnika z samego jednowyrazowego nazwiska w starym składzie.
