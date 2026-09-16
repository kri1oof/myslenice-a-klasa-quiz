from __future__ import annotations

SOURCE_AUTHORITY = {
    "mzpn": 1.00,
    "pzpn_laczynaspilka": 1.00,
    "90minut": 0.92,
    "futbolowo": 0.80,
    "ktowygral": 0.82,
    "regionalny_futbol": 0.84,
    "sportowetempo": 0.88,
    "club_site": 0.72,
    "regional_portal": 0.65,
}


def combine_confidence(values: list[float]) -> float:
    """Combine independent evidence conservatively using 1 - product(1-p)."""
    values = [max(0.0, min(1.0, value)) for value in values if value is not None]
    if not values:
        return 0.0
    remaining = 1.0
    for value in values:
        remaining *= 1.0 - value
    return round(1.0 - remaining, 4)


def publishable(confidence: float, threshold: float = 0.80) -> bool:
    return confidence >= threshold
