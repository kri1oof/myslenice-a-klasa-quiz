# Quiz A-klasy Myślenice

Starter kompletnego projektu do budowy gry wiedzy dla kibiców myślenickiej A-klasy. Projekt rozdziela **zbieranie faktów** od **generowania pytań**, dzięki czemu pytania nie są ręcznie wpisanymi rekordami i mogą być automatycznie odświeżane wraz z kolejnymi sezonami.

## Co już zawiera repozytorium

- SQLite jako kanoniczna baza faktów.
- Importery: MZPN, 90minut, Futbolowo oraz ręczne CSV.
- Normalizacja polskich nazw klubów i zawodników.
- Przechowywanie URL-i źródeł i poziomu pewności każdego rekordu.
- Wykrywanie konfliktów między źródłami i blokowanie danych spornych.
- Oddzielne oznaczenie kompletności danych (`matches`, `standings`, `players`, `goals`).
- Generator ponad 30 rodzin pytań oraz lista kolejnych typów w `QUESTION_TYPES.md`.
- Eksport zweryfikowanych pytań do JSON.
- Gotowy responsywny frontend bez frameworka.
- Testy automatyczne i GitHub Actions.
- Gotowy workflow GitHub Pages.
- 10 pytań demonstracyjnych opartych na zweryfikowanych stronach MZPN/Futbolowo.

## Dlaczego baza faktów zamiast tabeli „pytanie/odpowiedź”

Jeden rekord meczu może wygenerować wiele pytań: wynik, zwycięzca, suma goli, przeciwnik w kolejce, numer kolejki, gole zdobyte/stracone i wynik do przerwy. Podobnie tabela sezonu generuje pytania o miejsce, punkty, bilans i porównania klubów. Dzięki temu wraz ze wzrostem bazy liczba możliwych pytań rośnie znacznie szybciej niż liczba ręcznie wpisanych danych.

## Źródła i hierarchia

Domyślna hierarchia znajduje się w `config/sources.json`:

1. MZPN / PZPN / Łączy nas piłka — źródła oficjalne.
2. 90minut — historia lig, wyniki i tabele.
3. Futbolowo — szczególnie cenne przy strzelcach, minutach, składach i starszych statystykach.
4. Strony klubowe i portale regionalne — uzupełnienie brakujących faktów.

Zweryfikowane przykłady, na których oparto starter:

- MZPN, sezon 2026/27, A-klasa Myślenice: `https://krakow.malopolskizpn.pl/rozgrywki/2026-2027/seniorzy/myslenice-klasa-a-83c3b646/?view=schedule`
- MZPN, bieżąca tabela: `https://krakow.malopolskizpn.pl/rozgrywki/2026-2027/seniorzy/myslenice-klasa-a-83c3b646/`
- Futbolowo, Dziecanovia – Clavia 4:4 z 07.08.2021: `https://dziecanovia.futbolowo.pl/game/1040940`
- Futbolowo, przykładowa tabela strzelców rozgrywek: `https://iskraglogoczow.futbolowo.pl/statystyki`

Nie zakładamy istnienia stabilnego publicznego API Łączy nas piłka. Jeśli później znajdziemy oficjalny endpoint albo eksport, dodamy adapter bez zmiany reszty projektu.

## Zasady jakości

Domyślny próg publikacji pytania wynosi `0.80`. Rekord oficjalnego MZPN otrzymuje 1.00, 90minut 0.92, Futbolowo 0.80. Jeśli dwa źródła podają różne wartości tego samego wyniku, tworzony jest rekord `data_conflicts`, a pewność meczu spada poniżej progu publikacji.

Generator nie tworzy pytań o zawodnika, jeśli bramka ma wpis `Nieznany zawodnik`. Pytania o brak występu („który NIE grał”, „w którym z tych sezonów grał”) są dozwolone tylko dla sezonów oznaczonych jako mające kompletny zbiór zawodników.

## Instalacja — Windows

W PowerShell, w katalogu projektu:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup_windows.ps1
```

Albo ręcznie:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
myslenice-quiz init-db
pytest -q
```

## Podgląd gry lokalnie

```powershell
python -m http.server 8000 -d web
```

Następnie otwórz `http://localhost:8000`.

## Typowy import sezonu

Przykład MZPN:

```powershell
myslenice-quiz fetch-mzpn --season "2026/27" "https://krakow.malopolskizpn.pl/rozgrywki/2026-2027/seniorzy/myslenice-klasa-a-83c3b646/?view=schedule"
```

Przykład Futbolowo — konkretny mecz:

```powershell
myslenice-quiz fetch-futbolowo-match --season "2021/22" "https://dziecanovia.futbolowo.pl/game/1040940"
```

Przykład tabeli strzelców Futbolowo:

```powershell
myslenice-quiz fetch-futbolowo-stats --season "2021/22" "https://iskraglogoczow.futbolowo.pl/statystyki"
```

90minut:

```powershell
myslenice-quiz fetch-90minut --season "2015/16" "URL_STRONY_LIGI_90MINUT"
```

W źródłach historycznych markup bywa różny. Importer działa konserwatywnie: rekord, którego nie rozpozna jednoznacznie, pomija. Nie należy obniżać tej ostrożności tylko po to, by „zebrać więcej”.

## Ręczne uzupełnienie

Gdy np. artykuł klubowy potwierdza strzelca, ale nie da się go łatwo sparsować, dane można wprowadzić przez kontrolowany CSV. Szablony znajdują się w `data/templates/`.

```powershell
myslenice-quiz import-csv matches data/templates/matches.csv
myslenice-quiz import-csv players data/templates/players.csv
myslenice-quiz import-csv clubs data/templates/clubs.csv
```

## Oznaczanie kompletności

To bardzo ważny krok. Przykładowo dopiero po sprawdzeniu pełnej listy zawodników sezonu:

```powershell
myslenice-quiz set-coverage "2024/25" players --complete --notes "zweryfikowano pełny roster ligi"
```

Analogicznie:

```powershell
myslenice-quiz set-coverage "2024/25" standings --complete
myslenice-quiz set-coverage "2024/25" matches --complete
myslenice-quiz set-coverage "2024/25" goals --complete
```

Dla pytań o serie meczowe istnieje też flaga całego sezonu:

```powershell
myslenice-quiz set-season-complete "2024/25" --yes
```

## Budowa banku pytań

```powershell
myslenice-quiz validate
myslenice-quiz generate --min-confidence 0.80
myslenice-quiz export --min-confidence 0.80 --output web/data/questions.json
```

Na Windows można użyć skrótu:

```powershell
.\scripts\rebuild_questions.ps1
```

## Rodzaje pytań

Pełna lista jest w `QUESTION_TYPES.md`. Gotowe są m.in.:

- wynik meczu i wynik do przerwy,
- zwycięzca i suma goli,
- rywal/numer kolejki,
- gole zdobyte i stracone w meczu,
- miejsce, punkty, zwycięstwa, remisy, porażki i bilans sezonu,
- klub z określonego miejsca tabeli,
- porównanie dwóch klubów,
- najlepszy atak i najlepsza defensywa,
- klub zawodnika w sezonie,
- sezon, w którym zawodnik grał w klubie,
- liczba goli i występów zawodnika,
- najlepszy strzelec klubu,
- porównanie dwóch strzelców,
- strzelec konkretnego meczu,
- liczba bramek zawodnika w meczu,
- minuta bramki,
- liczba różnych znanych strzelców,
- czyste konta, BTTS, serie zwycięstw,
- rywal z najwyższego zwycięstwa,
- rywal z najbardziej bramkowego meczu,
- uczestnictwo klubu w konkretnym sezonie,
- negatywne pytania o skład — tylko przy pełnej bazie rosterów.

## GitHub

Projekt jest gotowy do wrzucenia jako repozytorium. Po utworzeniu repo:

```bash
git init
git add .
git commit -m "Initial Myślenice A-klasa quiz"
git branch -M main
git remote add origin ADRES_REPO
git push -u origin main
```

Workflow `tests.yml` uruchomi testy przy pushu/PR. Workflow `pages.yml` publikuje katalog `web/` przez GitHub Pages po włączeniu Pages w ustawieniach repozytorium.

## Dalszy plan danych

Najbezpieczniej zacząć od sezonów 2021/22–2026/27, ponieważ w nowszym okresie łatwiej łączyć oficjalne wyniki z danymi zawodników. Potem można rozszerzać historię wstecz przez 90minut i archiwalne strony klubowe. Każdy sezon może mieć inny poziom kompletności dla wyników, tabel, zawodników i strzelców.

## Ważne przy automatyzacji

Importer pobiera pojedyncze wskazane strony z własnym User-Agentem i nie zawiera mechanizmów omijania blokad. Przy rozbudowie crawlera należy respektować regulaminy, robots.txt, limity zapytań i prawa do danych/treści. Do samego quizu eksportujemy fakty i linki źródłowe, nie kopie artykułów.

## Rozbudowa pełnej bazy

Do projektu dodano warstwę historyczną klubów, import dokładnych dat/kolejek, obsługę składów i strzelców, pobieranie herbów oraz rozszerzony generator pytań. Szczegóły: [`DATA_EXPANSION.md`](DATA_EXPANSION.md).

Najprostsza aktualizacja:

```powershell
.\scripts\enrich_database.ps1
```

Głębsza próba pobierania szczegółowych stron meczów Futbolowo:

```powershell
.\scripts\enrich_database.ps1 -DeepFutbolowo
```

## Pokrycie danych per drużyna (v6)

Futbolowo często zawiera pełny protokół tylko jednej drużyny w meczu. Dlatego baza rozróżnia teraz:

- `match_coverage` — kompletność całego meczu,
- `match_team_coverage` — kompletność danych konkretnej drużyny w meczu.

Datasety per drużyna:

- `goal_events` — liczba zapisanych zdarzeń bramkowych zgadza się z wynikiem drużyny,
- `scorers` — wszystkie bramki drużyny mają znanego strzelca,
- `starters` — zapisano co najmniej 11 zawodników podstawowego składu.

Po istniejącym crawl'u nie trzeba ponownie pobierać stron. Uruchom:

```powershell
myslenice-quiz rebuild-team-coverage --season "2021/22"
myslenice-quiz audit-data
```

Kolumny `STR.T` i `XI.T` w audycie pokazują liczbę stron drużynowych meczu z kompletnymi strzelcami / pełną jedenastką.

### V7 — częściowe protokoły + historia 90minut

Nowe polecenia:

```powershell
myslenice-quiz audit-players --season "2021/22"
myslenice-quiz fetch-90-club-history "URL_DO_SKARBU_90MINUT"
```

`fetch-90-club-history` zapisuje wyłącznie sezony, w których strona klubu 90minut wskazuje A-klasę z grupą Myślenice (w tym starsze nazwy typu Kraków IV - Myślenice). Nie oznacza całego sezonu jako kompletnego na podstawie pojedynczego klubu.

Generator wykorzystuje też pozytywne wpisy z niepełnych protokołów: może zapytać, dla którego klubu zawodnik wystąpił w konkretnym meczu i czy był starterem/rezerwowym, bez wyciągania wniosków z braku zawodnika w niepełnym składzie.

## Archiwalne kadry Futbolowo (v8)

Kadry sezonowe są przechowywane osobno od potwierdzonych występów. To ważne:
`figuruje w kadrze` nie oznacza automatycznie `zagrał w meczu`.

Przykład importu:

```powershell
myslenice-quiz fetch-futbolowo-roster --season "2021/22" --club "Dziecanovia Dziekanowice" "https://lksdziecanovia.futbolowo.pl/roster/kadra"
myslenice-quiz audit-players --season "2021/22"
myslenice-quiz generate
myslenice-quiz export
```

Importer zapisuje również pozycję (np. Bramkarz, Obrońca / Pomocnik), jeśli jest widoczna na stronie. Strona kadry jest oznaczana jako kompletna dla konkretnego klubu i sezonu dopiero, gdy parser rozpozna stronę `Kadra` i co najmniej 8 zawodników.

## v9: kadry archiwalne bez fałszywej kompletności

Archiwalne strony Futbolowo `/roster/kadra` są dowodem, że widoczny zawodnik figurował na liście, ale nie są automatycznie traktowane jako pełna kadra. Dla Dziecanovii 2021/22 strona pokazuje 12 nazwisk, podczas gdy protokoły meczowe potwierdzają co najmniej 25 zawodników.

Po aktualizacji:
```powershell
myslenice-quiz fetch-futbolowo-roster --season "2021/22" --club "Dziecanovia Dziekanowice" "https://lksdziecanovia.futbolowo.pl/roster/kadra"
myslenice-quiz reconcile-roster-coverage --season "2021/22"
myslenice-quiz generate
myslenice-quiz export
```

## v9: strony kariery Futbolowo
Po ponownym imporcie kadry zawodnicy z linkiem Futbolowo dostają stabilny `external_key`. Można następnie pobrać ich strony kariery, które zawierają sezonowe sumy meczów i goli:

```powershell
myslenice-quiz crawl-futbolowo-careers --season "2021/22" --base-url "https://lksdziecanovia.futbolowo.pl" --delay 0.35
```

## v10 — naprawa tożsamości zawodników Futbolowo

Niektóre szablony Futbolowo umieszczają pozycję zawodnika wewnątrz tekstu linku/H1, np. `Bartłomiej Idzi Obrońca / Pomocnik`. v10 rozdziela nazwisko od pozycji i nigdy nie używa pozycji jako części tożsamości zawodnika.

Jeżeli baza była zasilona wersją v9, uruchom jednorazowo:

```powershell
myslenice-quiz repair-futbolowo-player-names
```

Komenda scala stare duplikaty, przenosi identyfikatory Futbolowo, członkostwa w kadrach, statystyki sezonowe i dowody źródłowe. Następnie ponownie pobierz stronę kadry, uruchom `reconcile-roster-coverage`, `audit-players`, `generate` i `export`.

## v11: bezpieczny probe archiwalnych kadr wielu klubów

Aktywna domena Futbolowo nie oznacza, że jej `/roster/kadra` nadal pokazuje historyczny sezon. Dlatego komenda masowa importuje kadrę tylko wtedy, gdy sama strona jawnie podaje dokładnie żądany sezon.

```powershell
myslenice-quiz probe-futbolowo-rosters --season "2021/22" --config config/futbolowo_club_sites_2021_22.json --delay 0.35
```

Przykładowo strona pokazująca `Kadra Beskid Tokarnia w 2022/2023` zostanie pominięta przy imporcie 2021/22. Brak klubu w pliku konfiguracyjnym nie jest dowodem, że klub nie miał strony Futbolowo — lista zawiera wyłącznie domeny, które udało się potwierdzić bez zgadywania.

## v12: historia klubów bez zgadywania kadr

Po v11 zwykłe `/roster/kadra` okazało się niewystarczające dla sezonu 2021/22. v12 dodaje dwie niezależne ścieżki historii klubów:

```powershell
myslenice-quiz sync-futbolowo-club-histories --delay 0.6
myslenice-quiz sync-ktowygral-team-histories --delay 1.25
```

Pierwsza korzysta wyłącznie z profili `/club/<id>` już odkrytych i zapisanych w bazie przez Futbolowo. Zapisuje tylko jawne wpisy `A Klasa - Podokręg Myślenice Sezon ...`.

Druga odpytuje po jednym profilu KtoWygral na klub (konfiguracja `config/ktowygral_team_profiles_2021_22.json`) i z jednego profilu potrafi uzyskać wiele sezonów, liczbę meczów, punktów i bilans bramek. Skrypt ma celowo duży odstęp i przy HTTP 429 natychmiast się zatrzymuje; nie próbuje obchodzić ograniczeń serwisu.

Żadna z tych ścieżek nie uznaje braku sezonu na profilu za dowód, że klub wtedy nie grał. Są to wyłącznie fakty pozytywne. Dzięki temu historyczne pytania o punkty i gole można tworzyć z potwierdzonych rekordów, a pytania negatywne nadal wymagają kompletnej tabeli całego sezonu.

## v13: historyczna sieć 90minut + aliasy klubów

Najpierw napraw jednoznaczne duplikaty nazw klubów (np. `JORDAN ZAKLICZYN` -> `Jordan Sum Zakliczyn`):

```powershell
myslenice-quiz repair-club-aliases
```

Następnie uruchom rekurencyjne odkrywanie historycznych sezonów A-klasy Myślenice z 90minut:

```powershell
myslenice-quiz sync-90minut-network-history --start-year 2002 --end-year 2019 --delay 0.8
```

Crawler domyślnie startuje od dobrze udokumentowanych profili Pasternika Ochojno i Pcimianki Pcim. Z profili klubów pobiera wyłącznie linki jawnie opisane jako `Klasa A` + `Myślenice`, z tabel ligowych odkrywa kolejne profile klubów i kontynuuje do wyczerpania nowych stron lub limitu `--max-pages` (domyślnie 140). Przy HTTP 429 zatrzymuje się i zachowuje dotychczasowy postęp.

Po zakończeniu:

```powershell
myslenice-quiz audit-club-history
myslenice-quiz audit-data
myslenice-quiz generate
myslenice-quiz export
```

Nie traktuj braku klubu w częściowo odkrytej historii jako dowodu, że klub nie grał w danym sezonie. Negatywne pytania sezonowe są bezpieczne dopiero po oznaczeniu `club_memberships` danego sezonu jako kompletne.

## Fallback dla niedostępnego 90minut

Gdy 90minut odrzuca bezpośrednie połączenia (np. WinError 10061 / 502), nie ponawiaj crawl w pętli.
Można importować zweryfikowane pozytywne członkostwa z lokalnego pliku:

```powershell
myslenice-quiz import-offline-history
```

Domyślny plik: `data/reference/historical_memberships_seed.csv`. Każdy rekord ma jawne źródło URL i confidence.
Import nie oznacza sezonu jako kompletnego — brak klubu w seedzie nie oznacza, że klub nie grał w lidze.

## SportoweTempo – archiwalne sezony i relacje (v15)

SportoweTempo ma starsze archiwa A-klasy Myślenice z tabelą, terminarzem, datami oraz wybranymi relacjami. Import jednego sezonu:

```powershell
myslenice-quiz fetch-sportowetempo-season --season "2009/10" "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice/50"
```

Aby dodatkowo przejść po linkach `relacja` znalezionych na stronie sezonu i pobrać potwierdzonych strzelców / bezpiecznie rozpoznawalne pełne nazwiska ze składów:

```powershell
myslenice-quiz crawl-sportowetempo-season --season "2009/10" --delay 0.5 "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice/50"
```

Parser oznacza oficjalne wyniki po weryfikacji jako `walkover`. W relacjach nie tworzy globalnych zawodników z samych nazwisk jednowyrazowych (np. `Kowalski`), dopóki nie ma sposobu ich jednoznacznie rozwiązać.
