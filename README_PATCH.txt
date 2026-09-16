Patch v15.1
- fixes missing normalize_text import in SportoweTempo crawl
- prevents one malformed report from terminating the whole crawl

Copy the contents of this patch over the project root and replace existing files.
Then run:
  pytest -q
  myslenice-quiz crawl-sportowetempo-season --season "2009/10" --delay 0.5 "https://www.sportowetempo.pl/pn_malopolska_a_klasa_myslenice/50"
