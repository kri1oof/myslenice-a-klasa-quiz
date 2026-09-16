from __future__ import annotations

import re
import unicodedata


def normalize_text(value: str) -> str:
    value = value.strip().lower()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("ł", "l")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def slugify(value: str) -> str:
    return normalize_text(value).replace(" ", "-")

# Only unambiguous variants. Short labels such as "Iskra" are intentionally not
# canonicalized because multiple clubs share them in this competition.
_CLUB_VARIANTS = {
    "lks rudnik k myslenic": "LKS Rudnik",
    "lks rudnik myslenice": "LKS Rudnik",
    "lks ii rudnik myslenice": "LKS Rudnik II",
    "rudnik ii": "LKS Rudnik II",
    "wroblowianka wroblowice krakow": "Wróblowianka Wróblowice (Kraków)",
    "krakus swoszowice krakow": "Krakus Swoszowice (Kraków)",
    "jordan zakliczyn": "Jordan Sum Zakliczyn",
    "lks jordan zakliczyn": "Jordan Sum Zakliczyn",
    "jordan sum zakliczyn": "Jordan Sum Zakliczyn",
}


def canonical_club_name(value: str) -> str:
    clean = " ".join(value.split()).strip()
    return _CLUB_VARIANTS.get(normalize_text(clean), clean)
