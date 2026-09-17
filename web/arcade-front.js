// Small final presentation patch for the arcade gameplay layer.
// Loaded after front-controller.js so the title screen reflects the current game version.

const arcadeFrontBaseEnsureLandingScreen = ensureLandingScreen;
ensureLandingScreen = function arcadeFrontEnsureLandingScreen() {
  const screen = arcadeFrontBaseEnsureLandingScreen();
  const kicker = screen?.querySelector('.landing-kicker');
  const subtitle = screen?.querySelector('.landing-subtitle');
  const matchCard = screen?.querySelector('.mode-card[data-mode="match90"] small');
  if (kicker) kicker.textContent = 'MYŚLENICKA A-KLASA · SWOJSKIE ARCADE RPG · v0.3.3';
  if (subtitle) subtitle.textContent = 'Laga, klepka, wrzutka na aferę, lokalne media, organizacyjny chaos i trochę piłkarskiej wiedzy. Rozgrywaj akcje, podejmuj A-klasowe decyzje i przeżyj pełne 90 minut lokalnego futbolu.';
  if (matchCard) matchCard.textContent = 'Arcade RPG po A-klasowemu: boiskowe akcje, media przy linii i „A-klasowe życie” — decyzje o spóźnionych graczach, psie na murawie, piłce w rzece i całej reszcie.';
  return screen;
};

const arcadeFrontBaseSplashScenario = actionSplashScenario;
actionSplashScenario = function arcadeSplashScenario(correct, action, possessionBefore, scoreBefore) {
  if ((state.rpgPlayerGoals || 0) > (scoreBefore?.player || 0)) return 'goal';
  if ((state.rpgOpponentGoals || 0) > (scoreBefore?.opponent || 0)) return 'defenseFailure';
  const kind = String(action?.kind || '');
  if (kind.includes('shot') || kind.includes('penalty') || kind.includes('finish')) {
    return correct ? 'attackSuccess' : 'shotFailure';
  }
  return arcadeFrontBaseSplashScenario(correct, action, possessionBefore, scoreBefore);
};

const arcadeFrontBaseShowActionSplash = showActionSplash;
showActionSplash = function arcadeShowActionSplash(correct, action, possessionBefore, scoreBefore) {
  arcadeFrontBaseShowActionSplash(correct, action, possessionBefore, scoreBefore);
  if (!action?.refereeRobbery) return;

  const splash = document.getElementById('action-splash');
  splash?.classList.remove('success', 'goal');
  splash?.classList.add('failure');
  if (splash) splash.dataset.scenario = 'refereeRobbery';

  const icon = document.getElementById('action-splash-icon');
  const title = document.getElementById('action-splash-title');
  const tag = document.getElementById('action-splash-tag');
  const copy = document.getElementById('action-splash-copy');
  if (icon) icon.textContent = '🧑‍⚖️';
  if (title) title.textContent = 'PAN SĘDZIA?!';
  if (tag) tag.textContent = `WAŁEK SĘDZIOWSKI · ${action.label || 'Akcja'}`;
  if (copy) copy.textContent = 'Odpowiedź była prawidłowa i zagranie się udało, ale decyzja sędziego kasuje efekt boiskowy. Wiedza zostaje zaliczona — pretensje prosimy kierować do człowieka z gwizdkiem.';
};

if (document.getElementById('landing-screen')) ensureLandingScreen();
