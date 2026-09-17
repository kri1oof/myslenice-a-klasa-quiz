// Pure helpers for the Match 90' scenario layer.
// Kept separate from the browser UI so the probability model can be regression-tested in Node.

(function attachMatchScenarioCore(root) {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function scenarioCount(rng = Math.random) {
    const roll = clamp(Number(rng()) || 0, 0, 0.999999);
    return 8 + Math.floor(roll * 5);
  }

  function buildMinutePlan(count, rng = Math.random) {
    const total = clamp(Math.round(Number(count) || 10), 8, 12);
    const first = 6;
    const last = 87;
    const span = last - first;
    const plan = [];

    for (let index = 0; index < total; index += 1) {
      const base = first + (span * index) / Math.max(1, total - 1);
      const jitter = index === 0 || index === total - 1
        ? 0
        : (clamp(Number(rng()) || 0, 0, 0.999999) - 0.5) * 5;
      let minute = Math.round(base + jitter);
      if (plan.length) minute = Math.max(minute, plan[plan.length - 1] + 4);
      const remaining = total - index - 1;
      minute = Math.min(minute, last - remaining * 4);
      plan.push(clamp(minute, 1, 89));
    }
    return plan;
  }

  function isGoalAttempt(kind) {
    const value = String(kind || '');
    return value === 'shot'
      || value.includes('shot')
      || value.includes('penalty')
      || value.includes('header')
      || value.includes('finish')
      || value.includes('bomb');
  }

  function successChance({
    dc = 3,
    knowledgeCorrect = false,
    kind = '',
    clearChance = false,
    momentum = 0,
    opponentMomentum = 0,
  } = {}) {
    const difficulty = clamp(Math.round(Number(dc) || 3), 1, 5);
    const correctBase = [0.96, 0.92, 0.86, 0.78, 0.69][difficulty - 1];
    const wrongBase = [0.34, 0.27, 0.19, 0.12, 0.07][difficulty - 1];
    let chance = knowledgeCorrect ? correctBase : wrongBase;

    if (isGoalAttempt(kind)) chance -= knowledgeCorrect ? 0.10 : 0.03;
    if (clearChance) chance += knowledgeCorrect ? 0.08 : 0.04;

    const momentumDelta = clamp(
      (Number(momentum || 0) - Number(opponentMomentum || 0)) / 500,
      -0.12,
      0.12,
    );
    chance += momentumDelta;

    return clamp(chance, 0.04, 0.97);
  }

  function rollOutcome(options = {}, rng = Math.random) {
    const chance = successChance(options);
    const roll = clamp(Number(rng()) || 0, 0, 0.999999);
    return {
      success: roll < chance,
      chance,
      roll,
    };
  }

  function percent(value) {
    return `${Math.round(clamp(Number(value) || 0, 0, 1) * 100)}%`;
  }

  const api = Object.freeze({
    clamp,
    scenarioCount,
    buildMinutePlan,
    isGoalAttempt,
    successChance,
    rollOutcome,
    percent,
  });

  root.MatchScenarioCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
