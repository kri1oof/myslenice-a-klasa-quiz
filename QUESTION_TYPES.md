# Katalog typów pytań

Generator publikuje pytanie tylko wtedy, gdy ma dokładnie jedną poprawną odpowiedź i rekord przekracza próg pewności. Pytania oznaczone jako **pełny sezon** wymagają `seasons.is_complete=1`.

| Typ | Przykład | Wymagane dane | Status |
|---|---|---|---|
| `match_score` | Jakim wynikiem zakończył się Clavia – Skalnik? | wynik meczu | gotowe |
| `match_winner` | Kto wygrał dany mecz? | wynik meczu | gotowe |
| `match_total_goals` | Ile łącznie padło bramek? | wynik meczu | gotowe |
| `club_match_goals` | Ile goli zdobyła Clavia z X? | wynik meczu | gotowe |
| `club_match_conceded` | Ile goli straciła Clavia z X? | wynik meczu | gotowe |
| `round_opponent` | Z kim klub grał w 8. kolejce? | kolejka + mecz | gotowe |
| `round_number` | W której kolejce był mecz X–Y? | kolejka + mecz | gotowe |
| `halftime_score` | Jaki był wynik do przerwy? | wynik HT | gotowe |
| `final_position` | Które miejsce zajął klub? | tabela | gotowe |
| `club_by_position` | Kto zajął 3. miejsce? | tabela | gotowe |
| `season_points` | Ile punktów zdobył klub? | tabela | gotowe |
| `season_wins` | Ile zwycięstw odniósł klub? | tabela | gotowe |
| `season_draws` | Ile remisów zanotował klub? | tabela | gotowe |
| `season_losses` | Ile porażek zanotował klub? | tabela | gotowe |
| `season_goals_for` | Ile goli strzelił klub w sezonie? | tabela | gotowe |
| `season_goals_against` | Ile goli stracił klub w sezonie? | tabela | gotowe |
| `season_goal_difference` | Jaki był bilans bramkowy? | tabela | gotowe |
| `higher_finish` | Który z dwóch klubów był wyżej? | tabela | gotowe |
| `club_season_participation` | W którym z sezonów klub grał w A-klasie? | pełne tabele wielu sezonów | gotowe |
| `most_goals_team` | Kto strzelił najwięcej goli w lidze? | kompletna tabela | gotowe |
| `fewest_conceded_team` | Kto stracił najmniej goli? | kompletna tabela | gotowe |
| `player_club_season` | W którym klubie grał zawodnik X? | statystyki zawodnika | gotowe |
| `player_season_goals` | Ile bramek strzelił zawodnik X? | statystyki zawodnika | gotowe |
| `player_season_for_club` | W którym z tych sezonów X grał w klubie Y? | pełne rostery wielu sezonów | gotowe |
| `player_not_in_club` | Który zawodnik NIE grał w klubie X? | pełny roster sezonu | gotowe |
| `player_season_appearances` | Ile miał występów? | statystyki zawodnika | gotowe |
| `club_top_scorer` | Kto był najlepszym strzelcem klubu? | komplet statystyk strzelców klubu | gotowe |
| `compare_player_goals` | Kto strzelił więcej: X czy Y? | statystyki obu | gotowe |
| `match_scorer` | Kto strzelił dla drużyny X z Y? | zdarzenia bramkowe | gotowe |
| `player_match_goals` | Ile bramek X strzelił w konkretnym meczu? | zdarzenia bramkowe | gotowe |
| `scorer_minute` | W której minucie X strzelił gola? | minuta bramki | gotowe |
| `different_scorers_match` | Ilu różnych strzelców miał klub? | komplet znanych bramek | gotowe* |
| `first_scorer_match` | Kto strzelił pierwszego znanego gola? | minuty bramek | gotowe* |
| `season_clean_sheets` | Ile czystych kont miał klub? | pełny sezon | gotowe |
| `season_btts` | W ilu meczach obu stron padł gol? | pełny sezon | gotowe |
| `longest_winning_streak` | Najdłuższa seria zwycięstw? | pełny sezon + kolejność | gotowe |
| `biggest_win_opponent` | Z kim było najwyższe zwycięstwo? | pełny sezon | gotowe |
| `highest_scoring_match_opponent` | Z kim padło najwięcej goli łącznie? | pełny sezon | gotowe |

\* Pytania o gole są blokowane, jeżeli brakujący/„Nieznany zawodnik” mógłby zmienić prawidłową odpowiedź. Dalsza walidacja kompletności zdarzeń powinna być rozwijana wraz z danymi.

## Typy przewidziane do kolejnego etapu

Poniższe są uwzględnione w modelu danych i mogą zostać dopisane bez zmiany schematu:

- kto zdobył dublet/hat-tricka w meczu,
- ilu zawodników danego klubu zdobyło co najmniej N goli,
- który zawodnik strzelił więcej goli u siebie / na wyjeździe,
- kto zdobył ostatnią bramkę meczu,
- kto strzelił przed przerwą / po przerwie,
- ile punktów klub zdobył u siebie / na wyjeździe,
- bilans bezpośrednich spotkań dwóch klubów w sezonie lub w zadanym okresie,
- ile razy dwa kluby zremisowały w ostatnich N sezonach,
- kto strzelił więcej goli w bezpośrednich spotkaniach,
- największa wygrana w historii wskazanej pary klubów,
- najczęstszy wynik w sezonie,
- w której kolejce klub pierwszy raz wygrał / przegrał,
- ile kolejek klub był niepokonany,
- najdłuższa seria bez porażki,
- najdłuższa seria bez zwycięstwa,
- liczba comebacków po przegrywaniu do przerwy (jeśli HT jest kompletne),
- liczba meczów 0:0,
- liczba meczów z minimum 5 golami,
- średnia goli na mecz klubu / ligi,
- która kolejka była najbardziej bramkowa,
- który klub występował w A-klasie Myślenice w danym sezonie,
- w których z podanych sezonów występował wskazany klub,
- w których z podanych sezonów zawodnik reprezentował wskazany klub,
- który z podanych zawodników NIE grał w danym klubie,
- przeciwko komu zawodnik strzelił najwięcej goli,
- któremu klubowi zawodnik nigdy nie strzelił w zadanym okresie,
- ile klubów reprezentował zawodnik w historii bazy,
- czy zawodnik zmienił klub między dwoma sezonami,
- kto awansował/spadł — dopiero po dodaniu jawnych reguł awansów/spadków dla danego sezonu,
- rekord frekwencji — tylko jeżeli liczby widzów są kompletne i wiarygodne.

Te typy należy uruchamiać dopiero, kiedy baza ma odpowiednią kompletność. Generator nigdy nie powinien tworzyć odpowiedzi przez domysł.

## Rozszerzenie: daty, składy, pełne zdarzenia i historia

Poniższe typy są już zaimplementowane. Część pojawi się dopiero po pobraniu odpowiednio kompletnych danych.

| Typ | Przykład | Warunek |
|---|---|---|
| `match_date` | Kiedy rozegrano Clavia – Beskid? | data meczu |
| `match_weekday` | W jaki dzień tygodnia rozegrano mecz? | data meczu |
| `match_round` | W której kolejce rozegrano mecz? | numer kolejki |
| `starting_xi_player` | Który zawodnik zaczął w XI? | skład meczu |
| `came_off_bench` | Kto wszedł z ławki? | zmiany |
| `substitution_minute_in` | W której minucie zawodnik wszedł? | minuta zmiany |
| `match_captain` | Kto był kapitanem? | oznaczenie kapitana |
| `shirt_number_match` | Z jakim numerem grał zawodnik? | numer w protokole |
| `substitutes_used` | Ilu rezerwowych weszło na boisko? | kompletny skład |
| `first_scorer_complete` | Kto strzelił pierwszego gola? | komplet goli + minut |
| `last_scorer_complete` | Kto strzelił ostatniego gola? | komplet goli + minut |
| `distinct_scorers_complete` | Ilu różnych strzelców było w meczu? | komplet goli |
| `brace_scorer` | Kto zdobył dokładnie dwie bramki? | komplet goli |
| `hattrick_scorer` | Kto zdobył co najmniej trzy bramki? | komplet goli |
| `first_half_goal_count` | Ile goli padło w I połowie? | komplet goli + minut |
| `second_half_goal_count` | Ile goli padło w II połowie? | komplet goli + minut |
| `round_total_goals` | Ile goli padło w całej kolejce? | komplet meczów sezonu |
| `round_highest_scoring_match` | W którym meczu kolejki było najwięcej goli? | komplet kolejki |
| `highest_scoring_round` | Która kolejka była najbardziej bramkowa? | komplet sezonu |
| `most_common_score` | Jaki wynik padał najczęściej? | komplet sezonu |
| `season_zero_zero_matches` | Ile było bezbramkowych remisów? | komplet sezonu |
| `season_five_plus_goal_matches` | Ile było meczów z minimum 5 golami? | komplet sezonu |
| `club_home_points` | Ile punktów klub zdobył u siebie? | komplet sezonu |
| `club_away_points` | Ile punktów klub zdobył na wyjazdach? | komplet sezonu |
| `first_win_round` | W której kolejce klub wygrał pierwszy raz? | komplet sezonu + kolejki |
| `longest_unbeaten_streak` | Najdłuższa seria bez porażki? | komplet sezonu |
| `longest_winless_streak` | Najdłuższa seria bez zwycięstwa? | komplet sezonu |
| `h2h_season_points` | Ile punktów klub zdobył w dwumeczu z rywalem? | komplet sezonu |
| `league_team_count` | Ile drużyn grało w lidze? | kompletna lista uczestników |
| `club_not_in_season` | Który klub NIE grał w tym sezonie? | kompletna lista uczestników |

### Kolejne naturalne rozszerzenia po zebraniu większej liczby protokołów

- zawodnik, który najczęściej otwierał wynik,
- gole zawodnika w kolejnych przedziałach minutowych 1–15 / 16–30 / itd.,
- liczba meczów, w których zawodnik strzelał co najmniej dwa gole,
- najczęstszy partner zawodnika w wyjściowej jedenastce,
- zawodnik z największą liczbą występów w podstawowym składzie,
- najczęściej używany rezerwowy,
- najczęstszy kapitan klubu w sezonie,
- średni numer kolejki pierwszego gola zawodnika,
- comeback po przegrywaniu do przerwy,
- utracone zwycięstwa po prowadzeniu do przerwy,
- najpóźniejszy gol sezonu,
- najwcześniejszy gol sezonu,
- najdłuższa seria meczów ze strzelonym golem,
- najdłuższa seria czystych kont,
- historyczny bilans dwóch klubów przez wiele sezonów,
- liczba sezonów klubu w A-klasie Myślenice od 2002/03,
- najwcześniejszy i najpóźniejszy sezon klubu w kompletnej bazie,
- zawodnicy reprezentujący dwa lub więcej klubów w lidze,
- „wędrowiec sezonu” — zmiana klubu między sezonami, wyłącznie gdy rostery są kompletne.

## V7: bezpieczne pytania z częściowych protokołów
- `player_match_club` — w barwach którego klubu zawodnik wystąpił w konkretnym meczu.
- `player_match_role` — podstawowy skład czy ławka rezerwowych w konkretnym protokole.

Te pytania wykorzystują wyłącznie pozytywny fakt występu i nie wymagają pełnej kadry sezonu.

### Kadry sezonowe
- `roster_member` — który zawodnik figuruje w kompletnej archiwalnej kadrze klubu?
- `roster_role` — na jakiej pozycji zawodnik figuruje w archiwalnej kadrze?

Kadry są oddzielone od występów meczowych. Pytania nie zamieniają samej obecności na liście kadry w twierdzenie o rozegranym meczu.

### Bezpieczeństwo kadr v9
`roster_role` może korzystać z częściowej listy (pozytywny fakt). `roster_member` i każde pytanie używające braku nazwiska jako dowodu są blokowane, dopóki kompletność kadry nie zostanie potwierdzona niezależnie.

### Historia klubów – dodatkowe źródła v12

Profile klubów Futbolowo oraz KtoWygral mogą dostarczać pozytywne rekordy `klub → sezon A-klasy`. Gdy profil KtoWygral podaje liczby, generator może dodatkowo użyć pytań o liczbę meczów, punktów, bramek zdobytych, bramek straconych i bilans bramkowy. Brak sezonu na profilu nie może być użyty jako odpowiedź negatywna.

## Archiwalne pytania ze SportoweTempo (v15)
Po imporcie pełnego sezonu archiwalnego dochodzą te same bezpieczne pytania meczowe, tabelaryczne, datowe i kolejkowe co dla MZPN/RegionalnyFutbol. Relacje mogą dodatkowo dostarczyć potwierdzonych strzelców i — gdy nazwiska są jednoznaczne — składów. Walkower daje pytania o oficjalny wynik i zwycięzcę, ale nie o liczbę goli faktycznie strzelonych na boisku.
