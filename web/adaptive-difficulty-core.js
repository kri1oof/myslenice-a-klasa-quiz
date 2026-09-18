(function initAdaptiveDifficultyCore(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AdaptiveDifficultyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function adaptiveDifficultyFactory() {
  const MIN_DIFFICULTY = 1;
  const MAX_DIFFICULTY = 5;
  const DEFAULT_RATING = 2.6;
  const RECENT_LIMIT = 5;

  function clamp(value, min = MIN_DIFFICULTY, max = MAX_DIFFICULTY) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function normalizedDifficulty(value, fallback = 3) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? clamp(numeric) : clamp(fallback);
  }

  function initialState(options = {}) {
    const baseline = normalizedDifficulty(options.rating, DEFAULT_RATING);
    return {
      rating:Math.round(baseline * 100) / 100,
      answered:0,
      correct:0,
      streak:0,
      missStreak:0,
      recent:[],
      lastDelta:0,
      lastQuestionDifficulty:null,
    };
  }

  function recentAccuracy(state) {
    const recent = Array.isArray(state?.recent) ? state.recent : [];
    if (!recent.length) return .5;
    return recent.filter(Boolean).length / recent.length;
  }

  function recordAnswer(state, answer = {}) {
    const current = state ? { ...state } : initialState();
    const correct = Boolean(answer.correct);
    const difficulty = normalizedDifficulty(answer.difficulty, current.rating);
    const before = normalizedDifficulty(current.rating, DEFAULT_RATING);
    const nextStreak = correct ? Number(current.streak || 0) + 1 : 0;
    const nextMissStreak = correct ? 0 : Number(current.missStreak || 0) + 1;

    let delta;
    if (correct) {
      const challenge = difficulty - before;
      delta = .16 + Math.max(0, challenge) * .12 - Math.max(0, -challenge) * .04;
      if (nextStreak >= 2) delta += Math.min(.16, (nextStreak - 1) * .05);
    } else {
      const easeGap = before - difficulty;
      delta = -(.22 + Math.max(0, easeGap) * .12 - Math.max(0, -easeGap) * .04);
      if (nextMissStreak >= 2) delta -= Math.min(.12, (nextMissStreak - 1) * .05);
    }
    delta = Math.max(-.48, Math.min(.42, delta));

    const rating = Math.round(clamp(before + delta) * 100) / 100;
    const recent = [...(Array.isArray(current.recent) ? current.recent : []), correct].slice(-RECENT_LIMIT);
    return {
      ...current,
      rating,
      answered:Number(current.answered || 0) + 1,
      correct:Number(current.correct || 0) + (correct ? 1 : 0),
      streak:nextStreak,
      missStreak:nextMissStreak,
      recent,
      lastDelta:Math.round(delta * 100) / 100,
      lastQuestionDifficulty:difficulty,
    };
  }

  function pressureBonus(state, progress = 0) {
    const p = Math.max(0, Math.min(1, Number(progress || 0)));
    if (p < .72) return 0;
    const recent = Array.isArray(state?.recent) ? state.recent : [];
    if (recent.slice(-2).length === 2 && recent.slice(-2).every(value => value === false)) return 0;
    if (recentAccuracy(state) < .58) return 0;
    const ramp = (p - .72) / .28;
    return Math.round(Math.max(0, Math.min(.38, ramp * .38)) * 100) / 100;
  }

  function recommendedDifficulty(state, options = {}) {
    const current = state || initialState();
    const pressure = options.pressure === false ? 0 : pressureBonus(current, options.progress);
    return Math.round(clamp(Number(current.rating || DEFAULT_RATING) + pressure) * 100) / 100;
  }

  function recommendedLevel(state, options = {}) {
    return Math.round(recommendedDifficulty(state, options));
  }

  function questionDifficultyScore(question, state, options = {}) {
    const target = Number.isFinite(Number(options.target))
      ? normalizedDifficulty(options.target)
      : recommendedDifficulty(state, options);
    const difficulty = normalizedDifficulty(question?.difficulty, 3);
    const distance = Math.abs(difficulty - target);
    let score = 42 - distance * 30;
    if (distance <= .35) score += 10;
    else if (distance > 1.5) score -= 22;
    return Math.round(score * 100) / 100;
  }

  function trend(state) {
    const delta = Number(state?.lastDelta || 0);
    if (delta >= .14) return 'up';
    if (delta <= -.18) return 'down';
    return 'steady';
  }

  return {
    MIN_DIFFICULTY,
    MAX_DIFFICULTY,
    DEFAULT_RATING,
    RECENT_LIMIT,
    clamp,
    normalizedDifficulty,
    initialState,
    recentAccuracy,
    recordAnswer,
    pressureBonus,
    recommendedDifficulty,
    recommendedLevel,
    questionDifficultyScore,
    trend,
  };
});
