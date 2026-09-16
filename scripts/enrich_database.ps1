param(
  [switch]$DeepFutbolowo
)
$ErrorActionPreference = "Stop"

Write-Host "[1/10] Katalog historycznych klubow"
myslenice-quiz import-club-catalog data/historical_clubs_seed.csv

Write-Host "[2/10] Historia uczestnikow - bez automatycznego KtoWygral"
Write-Host "KtoWygral blokuje seryjne zapytania (HTTP 429). Pomijam ten serwis, aby nie obchodzic limitow."

Write-Host "[3/10] Tabele, terminarze, kolejki i daty z RegionalnyFutbol (2017/18-2025/26)"
myslenice-quiz sync-regionalny-history --start-year 2017 --end-year 2025

Write-Host "[4/10] Biezacy sezon 2026/27 z oficjalnego MZPN"
myslenice-quiz fetch-mzpn --season "2026/27" "https://krakow.malopolskizpn.pl/rozgrywki/2026-2027/seniorzy/myslenice-klasa-a-83c3b646/?view=schedule"
myslenice-quiz fetch-mzpn --season "2026/27" "https://krakow.malopolskizpn.pl/rozgrywki/2026-2027/seniorzy/myslenice-klasa-a-83c3b646/"

Write-Host "[5/10] Terminarz Futbolowo 2021/22 + profile i herby klubow"
$fut = "https://dziecanovia.futbolowo.pl/schedule/420/24698/270"
myslenice-quiz fetch-futbolowo-schedule --season "2021/22" $fut

if ($DeepFutbolowo) {
  Write-Host "[6/10] Szczegoly dostepnych meczow Futbolowo"
  myslenice-quiz crawl-futbolowo-schedule --season "2021/22" --delay 0.5 $fut
} else {
  Write-Host "[6/10] Pomijam gleboki crawl Futbolowo. Najpierw sprawdz liczbe linkow szczegolow."
}

Write-Host "[7/10] Herby klubow"
myslenice-quiz fetch-crests --delay 0.25

Write-Host "[8/10] Audyt danych"
myslenice-quiz audit-data

Write-Host "[9/10] Generator pytan"
myslenice-quiz generate

Write-Host "[10/10] Eksport gry"
myslenice-quiz export
Write-Host "Gotowe. Uruchom: python -m http.server 8000 -d web"
