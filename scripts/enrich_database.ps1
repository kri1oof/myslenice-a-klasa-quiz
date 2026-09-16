param(
  [switch]$DeepFutbolowo,
  [switch]$DeepSportoweTempo
)
$ErrorActionPreference = "Stop"

Write-Host "[1/13] Katalog historycznych klubow"
myslenice-quiz import-club-catalog data/historical_clubs_seed.csv

Write-Host "[2/13] Historia uczestnikow - bez automatycznego KtoWygral"
Write-Host "KtoWygral blokuje seryjne zapytania (HTTP 429). Pomijam ten serwis, aby nie obchodzic limitow."

Write-Host "[3/13] Tabele, terminarze, kolejki i daty z RegionalnyFutbol (2017/18-2025/26)"
myslenice-quiz sync-regionalny-history --start-year 2017 --end-year 2025

Write-Host "[4/13] Biezacy sezon 2026/27 z oficjalnego MZPN"
myslenice-quiz fetch-mzpn --season "2026/27" "https://krakow.malopolskizpn.pl/rozgrywki/2026-2027/seniorzy/myslenice-klasa-a-83c3b646/?view=schedule"
myslenice-quiz fetch-mzpn --season "2026/27" "https://krakow.malopolskizpn.pl/rozgrywki/2026-2027/seniorzy/myslenice-klasa-a-83c3b646/"

Write-Host "[5/13] Historyczne terminarze Futbolowo 2014/15-2016/17 i 2021/22"
$futbolowoSchedules = @(
  @{ Season = "2014/15"; Url = "https://dziecanovia.futbolowo.pl/schedule/420/3502/16359" },
  @{ Season = "2015/16"; Url = "https://rokitakornatka.futbolowo.pl/schedule/420/8299/9651" },
  @{ Season = "2016/17"; Url = "https://rokitakornatka.futbolowo.pl/schedule/420/12308/9650" },
  @{ Season = "2021/22"; Url = "https://dziecanovia.futbolowo.pl/schedule/420/24698/270" }
)
foreach ($archive in $futbolowoSchedules) {
  myslenice-quiz fetch-futbolowo-schedule --season $archive.Season $archive.Url
}

if ($DeepFutbolowo) {
  Write-Host "[6/13] Szczegoly dostepnych meczow Futbolowo"
  foreach ($archive in $futbolowoSchedules) {
    myslenice-quiz crawl-futbolowo-schedule --season $archive.Season --delay 0.5 $archive.Url
  }
} else {
  Write-Host "[6/13] Pomijam gleboki crawl Futbolowo. Uzyj -DeepFutbolowo, aby pobrac szczegoly meczow."
}

Write-Host "[7/13] Archiwa SportoweTempo 2009/10-2012/13: tabele, terminarze i linki relacji"
$sportoweTempo = @(
  @{ Season = "2009/10"; Url = "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice/50" },
  @{ Season = "2010/11"; Url = "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice_11/50" },
  @{ Season = "2011/12"; Url = "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice_12/50" },
  @{ Season = "2012/13"; Url = "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice_13/50" }
)
foreach ($archive in $sportoweTempo) {
  myslenice-quiz fetch-sportowetempo-season --season $archive.Season $archive.Url
}

if ($DeepSportoweTempo) {
  Write-Host "[8/13] Gleboki crawl relacji SportoweTempo"
  foreach ($archive in $sportoweTempo) {
    myslenice-quiz crawl-sportowetempo-season --season $archive.Season --delay 0.5 $archive.Url
  }
} else {
  Write-Host "[8/13] Pomijam gleboki crawl SportoweTempo. Uzyj -DeepSportoweTempo, aby pobrac gole i sklady z relacji."
}

Write-Host "[9/13] Zweryfikowane fakty meczowe i kontekst lokalny"
python scripts/import_social_context.py

Write-Host "[10/13] Herby klubow"
myslenice-quiz fetch-crests --delay 0.25

Write-Host "[11/13] Audyt danych"
myslenice-quiz audit-data

Write-Host "[12/13] Generator pytan"
myslenice-quiz generate

Write-Host "[13/13] Eksport gry"
myslenice-quiz export
Write-Host "Gotowe. Uruchom: python -m http.server 8000 -d web"
