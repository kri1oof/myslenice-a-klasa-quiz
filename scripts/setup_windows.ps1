$ErrorActionPreference = "Stop"
if (-not (Test-Path ".venv")) { py -3.12 -m venv .venv }
& .\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -e ".[dev]"
myslenice-quiz init-db
Write-Host "Gotowe. Uruchom testy: pytest -q"
Write-Host "Podgląd gry: python -m http.server 8000 -d web"
