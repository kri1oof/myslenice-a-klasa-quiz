$ErrorActionPreference = "Stop"
& .\.venv\Scripts\Activate.ps1
myslenice-quiz validate
myslenice-quiz generate --min-confidence 0.80
$tmpQuestions = Join-Path $env:TEMP "myslenice-questions.json"
myslenice-quiz export --min-confidence 0.80 --output $tmpQuestions
python scripts/split_question_database.py --input $tmpQuestions --output web/data/questions
if (Test-Path docs/data/questions) { Remove-Item docs/data/questions -Recurse -Force }
Copy-Item web/data/questions docs/data/questions -Recurse
Write-Host "Bank pytań przebudowany i podzielony na pliki sezonowe."
