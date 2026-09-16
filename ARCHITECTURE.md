# Architektura

```text
źródła WWW / CSV
       │
       ▼
   importery
       │
       ▼
normalizacja nazw ──► wykrywanie konfliktów
       │
       ▼
  SQLite: fakty + evidence + coverage
       │
       ├──► walidator jakości
       │
       ▼
 generator pytań
       │
       ▼
question_bank (SQLite)
       │
       ▼
web/data/questions.json
       │
       ▼
statyczna gra HTML/CSS/JS ──► GitHub Pages
```

## Dlaczego statyczny frontend

Pierwsza wersja nie potrzebuje serwera aplikacyjnego. Dane są zbierane i walidowane lokalnie/CI, a następnie eksportowane do JSON. Dzięki temu gra może działać na GitHub Pages praktycznie bez kosztów i bez wystawiania SQLite do Internetu.

Gdy dojdą konta użytkowników, ranking online, codzienny challenge lub panel administratora, można dołożyć API (np. FastAPI + PostgreSQL) bez przebudowy warstwy danych.

## Warstwy danych

- `sources` — źródła i ich autorytet.
- `seasons`, `clubs`, `players` — encje kanoniczne.
- `club_aliases`, `player_aliases` — normalizacja różnych zapisów nazw.
- `matches`, `goals`, `appearances` — zdarzenia.
- `club_season_stats`, `player_season_stats` — agregaty sezonowe.
- `*_evidence` — dowody i URL-e do faktów.
- `data_conflicts` — sprzeczne dane wymagające rozstrzygnięcia.
- `season_coverage` — informacja, czy brak danych można traktować jako rzeczywisty brak.
- `question_bank` — gotowe, zwalidowane pytania.

## Zasada bezpieczeństwa logicznego

Generator nie powinien nigdy generować odpowiedzi z tekstowego podobieństwa albo „najbardziej prawdopodobnego” rekordu. Każda odpowiedź musi wynikać z konkretnego faktu w bazie; każdy fakt użyty publicznie powinien mieć provenance.

## Rozszerzona warstwa danych

- `club_profiles` — miasto, skrócona nazwa, źródło i lokalna ścieżka herbu.
- `club_season_memberships` — jawna obecność klubu w danym sezonie.
- `appearance_details` — numer koszulki i kapitan dla występu.
- `match_coverage` — kompletność danych na poziomie pojedynczego meczu, np. `goals` i `lineups`.
- `season_coverage` — kompletność całego sezonu osobno dla wyników, dat, tabel, rosterów itd.

Dzięki temu generator może odróżnić „brak informacji” od prawdziwego „nie wystąpił / nie strzelił”.
