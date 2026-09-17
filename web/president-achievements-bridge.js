// President mode v2 does not finish Match RPG games, so achievement progress is recorded per background league round.
// Loaded after achievements.js, where achievementProfile/evaluateAchievements are available.
if (globalThis.PresidentModeCore && globalThis.AchievementsCore && typeof simulatePresidentRound === 'function') {
  const presidentAchievementsFirst = globalThis.AchievementsCore.achievement('president_first');
  if (presidentAchievementsFirst) {
    presidentAchievementsFirst.desc = 'Podejmij pierwszą decyzję prezesa i zakończ kolejkę z meczem rozegranym w tle.';
  }

  const presidentAchievementsBaseSimulateRound = simulatePresidentRound;
  simulatePresidentRound = function presidentAchievementsSimulateRound() {
    const round = presidentAchievementsBaseSimulateRound();
    if (!round || !state.presidentMode || !state.seasonCareer) return round;

    const career = state.seasonCareer;
    const profile = state.presidentMode;
    const position = globalThis.SeasonCareerCore?.position(career.table, career.club);
    const objectiveAchieved = Boolean(
      career.completed && position && position <= Number(career.objective?.targetPosition || 0)
    );

    achievementProfile = globalThis.AchievementsCore.recordFinish(achievementProfile, {
      answered:0,
      correct:0,
      rpg:false,
      career:true,
      president:true,
      result:round.resultCode,
      seasonCompleted:Boolean(career.completed),
      objectiveAchieved,
      presidentDecisionMade:true,
      presidentBudget:Number(profile.budget || 0),
      presidentAverageTrust:globalThis.PresidentModeCore.averageTrust(profile),
    });
    evaluateAchievements({ resultCard:false });
    return round;
  };
}
