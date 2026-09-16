$ErrorActionPreference = "Stop"
& .\.venv\Scripts\Activate.ps1
myslenice-quiz validate
myslenice-quiz generate --min-confidence 0.80
myslenice-quiz export --min-confidence 0.80 --output web/data/questions.json
Write-Host "Bank pytań przebudowany."
