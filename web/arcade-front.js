// Small final presentation patch for the arcade gameplay layer.
// Loaded after front-controller.js so the title screen reflects the current game version.

const arcadeFrontBaseEnsureLandingScreen = ensureLandingScreen;
ensureLandingScreen = function arcadeFrontEnsureLandingScreen() {
  const screen = arcadeFrontBaseEnsureLandingScreen();
  const kicker = screen?.querySelector('.landing-kicker');
  const subtitle = screen?.querySelector('.landing-subtitle');
  const matchCard = screen?.querySelector('.mode-card[data-mode="match90"] small');
  if (kicker) kicker.textContent = 'MYŚLENICKA A-KLASA · ARCADE RPG · v0.3';
  if (subtitle) subtitle.textContent = 'Rozgrywaj akcje, buduj formę i combo, odpalaj zagrania specjalne oraz reaguj na styl rywala, stałe fragmenty i losowe wydarzenia meczu.';
  if (matchCard) matchCard.textContent = 'Arcade RPG: momentum, sekwencje akcji, specjalne zagrania, style rywali i wydarzenia meczowe.';
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
