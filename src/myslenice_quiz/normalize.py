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


# Only unambiguous variants. Short labels are included only when they refer to
# a single club in this project and were observed as duplicate club records.
_CLUB_VARIANTS = {
    "lks rudnik k myslenic": "LKS Rudnik",
    "lks rudnik myslenice": "LKS Rudnik",
    "lks ii rudnik myslenice": "LKS Rudnik II",
    "rudnik ii": "LKS Rudnik II",
    "clavia": "Clavia Świątniki Górne",
    "clavia swiatniki": "Clavia Świątniki Górne",
    "clavia swiatniki gorne": "Clavia Świątniki Górne",
    "zielonka": "Zielonka Wrząsowice",
    "zielonka gamar": "Zielonka Wrząsowice",
    "zielonka wrzasowice": "Zielonka Wrząsowice",
    "wroblowianka": "Wróblowianka Wróblowice (Kraków)",
    "wroblowianka wroblowice": "Wróblowianka Wróblowice (Kraków)",
    "wroblowianka wroblowice krakow": "Wróblowianka Wróblowice (Kraków)",
    "opatkowianka opatkowice": "Opatkowianka",
    "opatkowianka": "Opatkowianka",
    "krakus swoszowice krakow": "Krakus Swoszowice (Kraków)",
    "jordan zakliczyn": "Jordan Sum Zakliczyn",
    "lks jordan zakliczyn": "Jordan Sum Zakliczyn",
    "jordan sum zakliczyn": "Jordan Sum Zakliczyn",
}


def canonical_club_name(value: str) -> str:
    clean = " ".join(value.split()).strip()
    return _CLUB_VARIANTS.get(normalize_text(clean), clean)
