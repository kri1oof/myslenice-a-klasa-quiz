from myslenice_quiz.player_characters import archetype_for, derive_ratings, played_minutes


def test_played_minutes_uses_regulation_cap_and_earliest_end():
    assert played_minutes(starter=True, entered_minute=None, left_minute=70, red_minute=60) == 60
    assert played_minutes(starter=False, entered_minute=65, left_minute=None, red_minute=None) == 25
    assert played_minutes(starter=False, entered_minute=None, left_minute=None, red_minute=None) == 0


def test_ratings_are_bounded_and_responsive_to_real_stats():
    base = {
        "appearances": 10,
        "starts": 8,
        "minutes": 700,
        "goals": 1,
        "yellow_cards": 1,
        "red_cards": 0,
        "captaincies": 0,
    }
    scorer = {**base, "goals": 7}
    regular = derive_ratings(base, season_max_minutes=900)
    finisher = derive_ratings(scorer, season_max_minutes=900)

    assert all(35 <= value <= 95 for value in regular.values())
    assert all(35 <= value <= 95 for value in finisher.values())
    assert finisher["finishing"] > regular["finishing"]


def test_more_minutes_raise_experience_with_same_season_reference():
    low = derive_ratings(
        {"appearances": 5, "starts": 2, "minutes": 180, "goals": 0, "yellow_cards": 0, "red_cards": 0},
        season_max_minutes=900,
    )
    high = derive_ratings(
        {"appearances": 10, "starts": 9, "minutes": 810, "goals": 0, "yellow_cards": 0, "red_cards": 0},
        season_max_minutes=900,
    )
    assert high["experience"] > low["experience"]
    assert high["rhythm"] > low["rhythm"]


def test_archetypes_are_explained_by_observed_stats():
    leader_stats = {
        "appearances": 10,
        "starts": 10,
        "minutes": 850,
        "goals": 1,
        "captaincies": 5,
    }
    sniper_stats = {
        "appearances": 10,
        "starts": 8,
        "minutes": 700,
        "goals": 8,
        "captaincies": 0,
    }
    assert archetype_for(leader_stats, {"finishing": 60, "discipline": 90, "experience": 90}) == "Lider"
    assert archetype_for(sniper_stats, {"finishing": 90, "discipline": 85, "experience": 80}) == "Snajper"
