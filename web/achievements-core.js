(function exposeAchievementsCore(root) {
  'use strict';

  const VERSION = 1;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || 0)));
  }

  function emptyStats() {
    return {
      answered: 0,
      correct: 0,
      bestStreak: 0,
      perfectSessions: 0,
      difficulty5Correct: 0,
      gamesFinished: 0,
      rpgMatches: 0,
      rpgWins: 0,
      cleanSheetWins: 0,
      maxGoalsMatch: 0,
      powerupsUsed: 0,
      maxPowerupsMatch: 0,
      powerupRerollsSaved: 0,
      rivalryWins: 0,
      derbyWins: 0,
      maxAClassEventsMatch: 0,
      substitutionQuizCorrect: 0,
      maxCorrectSubQuizzesMatch: 0,
      careerMatches: 0,
      careerWins: 0,
      seasonsCompleted: 0,
      objectivesCompleted: 0,
      presidentDecisions: 0,
      presidentSeasonsCompleted: 0,
      presidentHighTrustSeasons: 0,
      presidentHealthyBudgetSeasons: 0,
      presidentStableSeasons: 0,
    };
  }

  function emptyProfile() {
    return { version: VERSION, stats: emptyStats(), unlocked: {} };
  }

  function sanitizeProfile(value) {
    const base = emptyProfile();
    if (!value || typeof value !== 'object') return base;
    const sourceStats = value.stats && typeof value.stats === 'object' ? value.stats : {};
    Object.keys(base.stats).forEach(key => {
      const number = Number(sourceStats[key]);
      base.stats[key] = Number.isFinite(number) && number >= 0 ? number : 0;
    });
    if (value.unlocked && typeof value.unlocked === 'object') {
      Object.entries(value.unlocked).forEach(([id, unlock]) => {
        if (!unlock || typeof unlock !== 'object') return;
        base.unlocked[id] = {
          at: typeof unlock.at === 'string' ? unlock.at : '',
          note: typeof unlock.note === 'string' ? unlock.note : '',
        };
      });
    }
    return base;
  }

  function copyProfile(profile) {
    return sanitizeProfile(JSON.parse(JSON.stringify(profile || emptyProfile())));
  }

  const ACHIEVEMENTS = Object.freeze([
    { id:'first_correct', category:'knowledge', icon:'✅', title:'Pierwszy gwizdek', desc:'Odpowiedz poprawnie na pierwsze pytanie.', value:s=>s.correct, target:1 },
    { id:'streak_five', category:'knowledge', icon:'🔥', title:'Forma rośnie', desc:'Zdobądź serię 5 poprawnych odpowiedzi.', value:s=>s.bestStreak, target:5 },
    { id:'streak_ten', category:'knowledge', icon:'🚂', title:'Nie do zatrzymania', desc:'Zdobądź serię 10 poprawnych odpowiedzi.', value:s=>s.bestStreak, target:10 },
    { id:'perfect_ten', category:'knowledge', icon:'💯', title:'Bez VAR-u', desc:'Ukończ rozgrywkę z minimum 10 odpowiedziami i wynikiem 100%.', value:s=>s.perfectSessions, target:1 },
    { id:'hard_five', category:'knowledge', icon:'🧠', title:'Kronikarz ligi', desc:'Odpowiedz poprawnie na 5 pytań poziomu 5.', value:s=>s.difficulty5Correct, target:5 },
    { id:'century', category:'knowledge', icon:'📚', title:'Setka w protokole', desc:'Zbierz łącznie 100 poprawnych odpowiedzi.', value:s=>s.correct, target:100 },

    { id:'first_rpg_win', category:'match', icon:'🏆', title:'Pierwsze trzy punkty', desc:'Wygraj mecz RPG.', value:s=>s.rpgWins, target:1 },
    { id:'clean_sheet', category:'match', icon:'🧤', title:'Mur nie do przejścia', desc:'Wygraj mecz RPG bez straty gola.', value:s=>s.cleanSheetWins, target:1 },
    { id:'three_goals', category:'match', icon:'⚽', title:'Hat-trick drużyny', desc:'Strzel co najmniej 3 gole w jednym meczu RPG.', value:s=>s.maxGoalsMatch, target:3 },

    { id:'full_hand', category:'aclass', icon:'🃏', title:'Pełna talia', desc:'Wykorzystaj wszystkie 3 karty specjalne w jednym meczu.', value:s=>s.maxPowerupsMatch, target:3 },
    { id:'second_ball_save', category:'aclass', icon:'🔄', title:'Druga piłka, druga szansa', desc:'Uratuj nieudaną akcję dzięki ponowieniu z karty „Druga piłka”.', value:s=>s.powerupRerollsSaved, target:1 },
    { id:'rivalry_win', category:'aclass', icon:'⚔️', title:'Gorący teren', desc:'Wygraj mecz oznaczony jako rywalizacja, derby lub podwyższona stawka.', value:s=>s.rivalryWins, target:1 },
    { id:'derby_win', category:'aclass', icon:'🔥', title:'Derby są nasze', desc:'Wygraj mecz sklasyfikowany przez grę jako derby.', value:s=>s.derbyWins, target:1 },
    { id:'aclass_double', category:'aclass', icon:'🐕', title:'A-klasowe życie', desc:'Przeżyj co najmniej 2 wydarzenia A-klasowe w jednym meczu.', value:s=>s.maxAClassEventsMatch, target:2 },
    { id:'super_subs', category:'aclass', icon:'🔁', title:'Złota ławka', desc:'Zdaj poprawnie 2 testy zmian w jednym meczu.', value:s=>s.maxCorrectSubQuizzesMatch, target:2 },

    { id:'career_ten', category:'career', icon:'📅', title:'Stały bywalec', desc:'Rozegraj 10 meczów w karierze lub trybie prezesa.', value:s=>s.careerMatches, target:10 },
    { id:'season_complete', category:'career', icon:'🏁', title:'Od sierpnia do czerwca', desc:'Ukończ pełny sezon kariery.', value:s=>s.seasonsCompleted, target:1 },
    { id:'objective_complete', category:'career', icon:'🎯', title:'Plan wykonany', desc:'Ukończ sezon na miejscu spełniającym cel kariery.', value:s=>s.objectivesCompleted, target:1 },

    { id:'president_first', category:'president', icon:'👔', title:'Pierwsza uchwała', desc:'Doprowadź do końca mecz po pierwszej decyzji prezesa.', value:s=>s.presidentDecisions, target:1 },
    { id:'president_balance', category:'president', icon:'💼', title:'Klub na stabilnych nogach', desc:'Ukończ sezon prezesa z budżetem co najmniej 12 000 zł i średnim zaufaniem co najmniej 65/100.', value:s=>s.presidentStableSeasons, target:1 },
  ]);

  const BY_ID = new Map(ACHIEVEMENTS.map(item => [item.id, item]));

  function achievement(id) {
    return BY_ID.get(id) || null;
  }

  function progress(item, stats) {
    const value = Math.max(0, Number(item?.value?.(stats || emptyStats()) || 0));
    const target = Math.max(1, Number(item?.target || 1));
    return {
      value,
      target,
      ratio: clamp(value / target, 0, 1),
      complete: value >= target,
      label: `${Math.min(value, target)}/${target}`,
    };
  }

  function evaluate(profile, now = new Date().toISOString()) {
    const next = copyProfile(profile);
    const newlyUnlocked = [];
    ACHIEVEMENTS.forEach(item => {
      if (next.unlocked[item.id]) return;
      if (!progress(item, next.stats).complete) return;
      next.unlocked[item.id] = { at: now, note:'' };
      newlyUnlocked.push(item.id);
    });
    return { profile:next, newlyUnlocked };
  }

  function recordAnswer(profile, event = {}) {
    const next = copyProfile(profile);
    next.stats.answered += 1;
    if (event.correct) next.stats.correct += 1;
    next.stats.bestStreak = Math.max(next.stats.bestStreak, Number(event.streak || 0));
    if (event.correct && Number(event.difficulty || 0) >= 5) next.stats.difficulty5Correct += 1;
    return next;
  }

  function recordFinish(profile, event = {}) {
    const next = copyProfile(profile);
    const stats = next.stats;
    stats.gamesFinished += 1;
    const answered = Number(event.answered || 0);
    const correct = Number(event.correct || 0);
    if (answered >= 10 && correct === answered) stats.perfectSessions += 1;

    if (event.rpg) {
      stats.rpgMatches += 1;
      const playerGoals = Math.max(0, Number(event.playerGoals || 0));
      const opponentGoals = Math.max(0, Number(event.opponentGoals || 0));
      const win = playerGoals > opponentGoals;
      stats.maxGoalsMatch = Math.max(stats.maxGoalsMatch, playerGoals);
      if (win) stats.rpgWins += 1;
      if (win && opponentGoals === 0) stats.cleanSheetWins += 1;

      const powerups = Math.max(0, Number(event.powerupsUsed || 0));
      stats.powerupsUsed += powerups;
      stats.maxPowerupsMatch = Math.max(stats.maxPowerupsMatch, powerups);
      stats.powerupRerollsSaved += Math.max(0, Number(event.powerupRerollsSaved || 0));
      stats.maxAClassEventsMatch = Math.max(stats.maxAClassEventsMatch, Math.max(0, Number(event.aClassEvents || 0)));
      const subCorrect = Math.max(0, Number(event.substitutionQuizCorrect || 0));
      stats.substitutionQuizCorrect += subCorrect;
      stats.maxCorrectSubQuizzesMatch = Math.max(stats.maxCorrectSubQuizzesMatch, subCorrect);

      const rivalry = String(event.rivalryLevel || 'normal');
      if (win && rivalry !== 'normal') stats.rivalryWins += 1;
      if (win && rivalry === 'derby') stats.derbyWins += 1;
    }

    if (event.career) {
      stats.careerMatches += 1;
      if (event.result === 'W') stats.careerWins += 1;
      if (event.seasonCompleted) {
        stats.seasonsCompleted += 1;
        if (event.objectiveAchieved) stats.objectivesCompleted += 1;
      }
    }

    if (event.president) {
      if (event.presidentDecisionMade) stats.presidentDecisions += 1;
      if (event.seasonCompleted) {
        const highTrust = Number(event.presidentAverageTrust || 0) >= 65;
        const healthyBudget = Number(event.presidentBudget || 0) >= 12000;
        stats.presidentSeasonsCompleted += 1;
        if (highTrust) stats.presidentHighTrustSeasons += 1;
        if (healthyBudget) stats.presidentHealthyBudgetSeasons += 1;
        if (highTrust && healthyBudget) stats.presidentStableSeasons += 1;
      }
    }
    return next;
  }

  function unlockedCount(profile) {
    const safe = sanitizeProfile(profile);
    return ACHIEVEMENTS.filter(item => Boolean(safe.unlocked[item.id])).length;
  }

  function categoryCounts(profile) {
    const safe = sanitizeProfile(profile);
    const result = {};
    ACHIEVEMENTS.forEach(item => {
      if (!result[item.category]) result[item.category] = { total:0, unlocked:0 };
      result[item.category].total += 1;
      if (safe.unlocked[item.id]) result[item.category].unlocked += 1;
    });
    return result;
  }

  const api = {
    VERSION,
    ACHIEVEMENTS,
    emptyStats,
    emptyProfile,
    sanitizeProfile,
    achievement,
    progress,
    evaluate,
    recordAnswer,
    recordFinish,
    unlockedCount,
    categoryCounts,
  };

  root.AchievementsCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
