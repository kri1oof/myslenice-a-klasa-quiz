// Reset president bookkeeping only when a genuinely new career object starts.
const presidentLifecycleBaseStartSeasonCareerMatch = startSeasonCareerMatch;
startSeasonCareerMatch = function presidentLifecycleStartSeasonCareerMatch() {
  const career = typeof careerState === 'function' ? careerState() : null;
  const freshCareer = Boolean(
    typeof presidentSelected === 'function' && presidentSelected() &&
    career?.active && Number(career.roundIndex || 0) === 0 &&
    Array.isArray(career.history) && career.history.length === 0 &&
    Number(state.presidentMode?.matches || 0) > 0
  );
  if (freshCareer) state.presidentMode = null;
  return presidentLifecycleBaseStartSeasonCareerMatch();
};
