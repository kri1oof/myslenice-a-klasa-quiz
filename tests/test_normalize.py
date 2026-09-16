from myslenice_quiz.normalize import normalize_text, slugify


def test_polish_normalization():
    assert normalize_text("Clavia Świątniki Górne") == "clavia swiatniki gorne"
    assert slugify("LKS Rudnik") == "lks-rudnik"
