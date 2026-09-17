// Small final presentation patch for the arcade gameplay layer.
// Loaded after front-controller.js so the title screen reflects the current game version.

const arcadeFrontBaseEnsureLandingScreen = ensureLandingScreen;
ensureLandingScreen = function arcadeFrontEnsureLandingScreen() {
  const screen = arcadeFrontBaseEnsureLandingScreen();
  const kicker = screen?.querySelector('.landing-kicker');
  const subtitle = screen?.querySelector('.landing-subtitle');
  const matchCard = screen?.querySelector('.mode-card[data-mode="match90"] small');
  if (kicker) kicker.textContent = 'MYŚLENICKA A-KLASA · SWOJSKIE ARCADE RPG · v0.3.1';
  if (subtitle) subtitle.textContent = 'Laga, klepka, wrzutka na aferę, strzał życia po widłach i trochę piłkarskiej wiedzy. Rozgrywaj akcje, buduj ogień i przeżyj pełne 90 minut lokalnego futbolu.';
  if (matchCard) matchCard.textContent = 'Arcade RPG po A-klasowemu: laga i do przodu, murarka, stałe fragmenty, ogień, combo i wydarzenia z lokalnego boiska.';
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

if (document.getElementById('landing-screen')) ensureLandingScreen();
