// Small compatibility guard for switching from career back to the standalone modes.
(function installSeasonCareerCompatibility() {
  const format = document.getElementById('game-format');
  if (!format) return;
  format.addEventListener('change', () => {
    if (format.value === 'career') return;
    document.getElementById('play-again')?.classList.remove('hidden');
    document.getElementById('career-round-summary')?.replaceChildren();
    document.getElementById('rpg-season-career-hud')?.classList.add('hidden');
    if (state?.seasonCareer) state.seasonCareer.active = false;
  });
}());
