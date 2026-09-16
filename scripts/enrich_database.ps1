param(
  [switch]$DeepFutbolowo,
  [switch]$DeepSportoweTempo
)
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$VenvQuiz = Join-Path $Root ".venv\Scripts\myslenice-quiz.exe"

if (Test-Path $VenvPython) {
  $Python = $VenvPython
} else {
  $Python = "python"
}

if (Test-Path $VenvQuiz) {
  $Quiz = $VenvQuiz
} else {
  $Quiz = "myslenice-quiz"
}

function Run-Quiz {
  & $Quiz @args
  if ($LASTEXITCODE -ne 0) { throw "myslenice-quiz zakonczyl sie kodem $LASTEXITCODE" }
}

function Run-Python {
  & $Python @args
  if ($LASTEXITCODE -ne 0) { throw "python zakonczyl sie kodem $LASTEXITCODE" }
}

Write-Host "[1/15] Katalog historycznych klubow"
Run-Quiz import-club-catalog data/historical_clubs_seed.csv

Write-Host "[2/15] Historia uczestnikow - bez automatycznego KtoWygral"
Write-Host "KtoWygral blokuje seryjne zapytania (HTTP 429). Pomijam ten serwis, aby nie obchodzic limitow."

Write-Host "[3/15] Tabele, terminarze, kolejki i daty z RegionalnyFutbol (2017/18-2025/26)"
Run-Quiz sync-regionalny-history --start-year 2017 --end-year 2025

Write-Host "[4/15] Zweryfikowany kompletny sezon 2019/20"
Run-Python scripts/import_2019_20_reference.py

Write-Host "[5/15] Biezacy sezon 2026/27 z oficjalnego MZPN"
Run-Quiz fetch-mzpn --season "2026/27" "https://krakow.malopolskizpn.pl/rozgrywki/2026-2027/seniorzy/myslenice-klasa-a-83c3b646/?view=schedule"
Run-Quiz fetch-mzpn --season "2026/27" "https://krakow.malopolskizpn.pl/rozgrywki/2026-2027/seniorzy/myslenice-klasa-a-83c3b646/"

Write-Host "[6/15] Historyczne terminarze Futbolowo 2014/15-2018/19 i 2021/22"
$futbolowoSchedules = @(
  @{ Season = "2014/15"; Url = "https://rokitakornatka.futbolowo.pl/schedule/420/3502/16359" },
  @{ Season = "2015/16"; Url = "https://rokitakornatka.futbolowo.pl/schedule/420/8299/9651" },
  @{ Season = "2016/17"; Url = "https://rokitakornatka.futbolowo.pl/schedule/420/12308/9650" },
  @{ Season = "2017/18"; Url = "https://rokitakornatka.futbolowo.pl/schedule/420/15808/14098" },
  @{ Season = "2018/19"; Url = "https://rokitakornatka.futbolowo.pl/schedule/420/19095/16359" },
  @{ Season = "2021/22"; Url = "https://dziecanovia.futbolowo.pl/schedule/420/24698/270" }
)
foreach ($archive in $futbolowoSchedules) {
  Run-Quiz fetch-futbolowo-schedule --season $archive.Season $archive.Url
}

if ($DeepFutbolowo) {
  Write-Host "[7/15] Szczegoly dostepnych meczow Futbolowo"
  foreach ($archive in $futbolowoSchedules) {
    Run-Quiz crawl-futbolowo-schedule --season $archive.Season --delay 0.5 $archive.Url
  }
} else {
  Write-Host "[7/15] Pomijam gleboki crawl Futbolowo. Uzyj -DeepFutbolowo, aby pobrac szczegoly meczow."
}

Write-Host "[8/15] Archiwa SportoweTempo 2009/10-2012/13: tabele, terminarze i linki relacji"
$sportoweTempo = @(
  @{ Season = "2009/10"; Url = "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice/50" },
  @{ Season = "2010/11"; Url = "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice_11/50" },
  @{ Season = "2011/12"; Url = "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice_12/50" },
  @{ Season = "2012/13"; Url = "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice_13/50" }
)
foreach ($archive in $sportoweTempo) {
  Run-Quiz fetch-sportowetempo-season --season $archive.Season $archive.Url
}

if ($DeepSportoweTempo) {
  Write-Host "[9/15] Gleboki crawl relacji SportoweTempo"
  foreach ($archive in $sportoweTempo) {
    Run-Quiz crawl-sportowetempo-season --season $archive.Season --delay 0.5 $archive.Url
  }
} else {
  Write-Host "[9/15] Pomijam gleboki crawl SportoweTempo. Uzyj -DeepSportoweTempo, aby pobrac gole i sklady z relacji."
}

Write-Host "[10/15] Zweryfikowane korekty wynikow"
Run-Python scripts/apply_verified_match_corrections.py

Write-Host "[11/15] Zweryfikowane fakty meczowe i kontekst lokalny"
Run-Python scripts/import_social_context.py

Write-Host "[12/15] Herby klubow"
Run-Quiz fetch-crests --delay 0.25

Write-Host "[13/15] Audyt danych"
Run-Quiz audit-data

Write-Host "[14/15] Generator pytan"
Run-Quiz generate

Write-Host "[15/15] Eksport gry"
Run-Quiz export
Write-Host "Gotowe. Uruchom: $Python -m http.server 8000 -d web"
