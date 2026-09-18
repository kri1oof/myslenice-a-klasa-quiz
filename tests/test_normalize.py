from myslenice_quiz.normalize import canonical_club_name, normalize_text, slugify


def test_polish_normalization():
    assert normalize_text("Clavia Świątniki Górne") == "clavia swiatniki gorne"
    assert slugify("LKS Rudnik") == "lks-rudnik"


def test_known_club_aliases_collapse_to_one_club():
    assert canonical_club_name("Clavia") == "Clavia Świątniki Górne"
    assert canonical_club_name("Clavia Świątniki Górne") == "Clavia Świątniki Górne"

    assert canonical_club_name("Zielonka") == "Zielonka Wrząsowice"
    assert canonical_club_name("Zielonka Gamar") == "Zielonka Wrząsowice"
    assert canonical_club_name("Zielonka Wrząsowice") == "Zielonka Wrząsowice"

    assert canonical_club_name("Wróblowianka") == "Wróblowianka Wróblowice (Kraków)"
    assert canonical_club_name("Wróblowianka Wróblowice") == "Wróblowianka Wróblowice (Kraków)"

    assert canonical_club_name("Opatkowianka") == "Opatkowianka"
    assert canonical_club_name("Opatkowianka Opatkowice") == "Opatkowianka"


def test_uppercase_official_club_names_use_preferred_casing():
    assert canonical_club_name("BESKID TOKARNIA") == "Beskid Tokarnia"
    assert canonical_club_name("DALIN II MYŚLENICE") == "Dalin II Myślenice"
    assert canonical_club_name("DZIECANOVIA DZIEKANOWICE") == "Dziecanovia Dziekanowice"
    assert canonical_club_name("GOŚCIBIA SUŁKOWICE") == "Gościbia Sułkowice"
    assert canonical_club_name("ISKRA GŁOGOCZÓW") == "Iskra Głogoczów"
    assert canonical_club_name("LKS RUDNIK") == "LKS Rudnik"
    assert canonical_club_name("ORZEŁ NOWA WIEŚ") == "Orzeł Nowa Wieś"
    assert canonical_club_name("SKALNIK TRZEMEŚNIA") == "Skalnik Trzemeśnia"
