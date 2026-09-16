# Dane

`quiz.db` jest lokalną bazą roboczą i domyślnie nie trafia do Git. Do repozytorium publikujemy przede wszystkim kod oraz wyeksportowany, zweryfikowany `web/data/questions.json`.

Katalog `templates/` zawiera szablony CSV do ręcznych uzupełnień, gdy źródło internetowe nie zawiera kompletnych danych.

Nie oznaczaj `players`, `goals`, `standings` ani `matches` jako kompletne, dopóki cały zakres sezonu nie został sprawdzony. Negatywne pytania (np. „kto NIE grał”) opierają się właśnie na tej deklaracji kompletności.
