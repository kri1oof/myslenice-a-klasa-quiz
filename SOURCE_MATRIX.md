# Matryca źródeł

Stan projektu: 2026-09-16.

| Źródło | Co bierzemy | Mocne strony | Ryzyko / zasada |
|---|---|---|---|
| MZPN / Podokręg Kraków | terminarze, wyniki, HT, tabele | oficjalne; bardzo dobre dla nowszych sezonów | źródło nadrzędne dla wyniku i tabeli |
| PZPN / Łączy nas piłka | docelowo zawodnicy, występy, zdarzenia | oficjalna infrastruktura PZPN | brak potwierdzonego stabilnego publicznego API dla tego projektu; nie opierać ETL na prywatnych endpointach |
| PZPN+ | przyszłe statystyki/archiwum | nowa platforma uruchomiona w 2026 r. | na starcie pełne dane dotyczą wybranych rozgrywek; obserwować dostępność regionalnej A-klasy |
| 90minut.pl | historia lig, wyniki, tabele, przynależność klubów do lig | bardzo długie archiwum | markup historyczny może się różnić; krzyżować z oficjalnym źródłem, gdy jest dostępne |
| Futbolowo | strzelcy, minuty, kary, składy, statystyki zawodników | potrafi mieć szczegółowe dane lokalnych lig | kompletność zależy od klubu/meczu; „Nieznany zawodnik” blokuje pytania o nazwisko |
| strony klubów | relacje meczowe, strzelcy, składy | dobre do uzupełniania luk | jedna relacja nie powinna tworzyć negatywnego faktu („X nie grał”) |
| portale regionalne | relacje, kontekst historyczny | dodatkowe potwierdzenie | niższy priorytet niż dokumentacja organizatora |
| CSV ręczny | fakty zweryfikowane przez administratora | pozwala domknąć luki | wymaga zachowania źródła i ustawienia `confidence` |

## Fakty potwierdzone podczas przygotowania startera

- MZPN publikuje w sezonie 2026/27 osobną stronę A-klasy Myślenice z tabelą i terminarzem.
- W terminarzu MZPN widoczne są numer kolejki, data, drużyny, wynik końcowy oraz — gdy jest dostępny — wynik do przerwy.
- 90minut posiada stronę A-klasy Myślenice 2025/26 z tabelą oraz kolejkami i wynikami.
- Archiwa 90minut pokazują udział klubów w A-klasie Myślenice co najmniej w sezonach z pierwszej dekady XXI wieku; dokładny zakres należy katalogować sezon po sezonie.
- Futbolowo potrafi przechowywać szczegółowe zdarzenia bramkowe z minutami; w tym samym meczu dane jednej drużyny mogą być kompletne, a drugiej oznaczone jako „Nieznany zawodnik”.
- Futbolowo posiada także widoki statystyk strzelców całych rozgrywek dla części archiwalnych sezonów.

## Reguła konfliktu

Jeżeli oficjalny MZPN podaje wynik A, a źródło wtórne wynik B, pytanie nie jest publikowane automatycznie. Konflikt trafia do `data_conflicts`. Administrator rozstrzyga go po sprawdzeniu źródeł.

## Reguła kompletności

Brak rekordu nie oznacza automatycznie, że zdarzenie nie miało miejsca. Pytania używające negacji są dozwolone dopiero po oznaczeniu odpowiedniego datasetu sezonu jako kompletnego w `season_coverage`.

## Rozszerzenie historyczne i szczegółowe

| Źródło | Tabele/kluby | Wyniki | Daty/kolejki | Strzelcy/minuty | Składy | Herby |
|---|---:|---:|---:|---:|---:|---:|
| MZPN/PZPN | bardzo dobre | bardzo dobre | dobre | zależne od sezonu | zależne od sezonu | nie |
| RegionalnyFutbol | bardzo dobre | bardzo dobre | bardzo dobre | ograniczone | ograniczone | nie |
| KtoWygral | bardzo dobre historycznie | dobre | zależne od sezonu | nie | nie | tak, przez profil klubu |
| Futbolowo | dobre | dobre | bardzo dobre | dobre, gdy protokół jest uzupełniony | dobre, gdy protokół jest uzupełniony | częściowo |
| 90minut | dobre historycznie | bardzo dobre | dobre | ograniczone dla niższych lig | ograniczone | nie |

Nie zakładamy, że jedna baza jest kompletna. Każdy fakt zachowuje źródło i poziom pewności.

### SportoweTempo
Archiwalne tabele/terminarze i relacje lokalne. Przyjmujemy mecze/tabele z confidence 0.88, relacje i strzelców 0.80–0.82. Szczególnie cenne dla sezonów około 2009/10–2012/13. Walkowery są oznaczane osobnym statusem; nie należy z nich wyciągać pytań o faktycznie zdobyte gole.
