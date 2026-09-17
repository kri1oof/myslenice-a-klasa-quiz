// Pure helpers for personal in-match form and morale.
(function playerFormMoraleCoreFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PlayerFormMoraleCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function playerFormMoraleCore() {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function initialState(character) {
    const rhythm = Number(character?.ratings?.rhythm || 65);
    const form = clamp(Math.round(50 + (rhythm - 65) * 0.22), 44, 58);
    return {
      form,
      morale: 50,
      successStreak: 0,
      failureStreak: 0,
      peakForm: form,
      peakMorale: 50,
      lowestForm: form,
      lowestMorale: 50,
      actions: 0,
    };
  }

  function normalize(profile) {
    const source = profile || {};
    const form = clamp(Number(source.form ?? 50), 20, 90);
    const morale = clamp(Number(source.morale ?? 50), 20, 90);
    return {
      form,
      morale,
      successStreak: Math.max(0, Number(source.successStreak || 0)),
      failureStreak: Math.max(0, Number(source.failureStreak || 0)),
      peakForm: Math.max(form, Number(source.peakForm ?? form)),
      peakMorale: Math.max(morale, Number(source.peakMorale ?? morale)),
      lowestForm: Math.min(form, Number(source.lowestForm ?? form)),
      lowestMorale: Math.min(morale, Number(source.lowestMorale ?? morale)),
      actions: Math.max(0, Number(source.actions || 0)),
    };
  }

  function updateExtremes(profile) {
    const next = normalize(profile);
    next.peakForm = Math.max(next.peakForm, next.form);
    next.peakMorale = Math.max(next.peakMorale, next.morale);
    next.lowestForm = Math.min(next.lowestForm, next.form);
    next.lowestMorale = Math.min(next.lowestMorale, next.morale);
    return next;
  }

  function applyMatchOutcome(profile, {
    success = false,
    knowledgeCorrect = false,
    scored = false,
    conceded = false,
  } = {}) {
    const next = normalize(profile);
    const before = { form: next.form, morale: next.morale };
    next.actions += 1;

    if (success) {
      next.form += 5;
      next.morale += 2;
      next.successStreak += 1;
      next.failureStreak = 0;
      if (next.successStreak === 3) {
        next.form += 3;
        next.morale += 2;
      }
    } else {
      next.form -= 5;
      next.morale -= 2;
      next.failureStreak += 1;
      next.successStreak = 0;
      if (next.failureStreak === 2) next.morale -= 2;
    }

    if (knowledgeCorrect) next.morale += 1;
    if (scored) {
      next.form += 8;
      next.morale += 7;
    }
    if (conceded) {
      next.form -= 2;
      next.morale -= 7;
    }

    next.form = clamp(next.form, 20, 90);
    next.morale = clamp(next.morale, 20, 90);
    const finalState = updateExtremes(next);
    return {
      profile: finalState,
      deltaForm: finalState.form - before.form,
      deltaMorale: finalState.morale - before.morale,
    };
  }

  function applySubstitutionEntry(profile, correct) {
    const next = normalize(profile);
    const before = { form: next.form, morale: next.morale };
    if (correct === true) {
      next.form += 3;
      next.morale += 4;
    } else if (correct === false) {
      next.form -= 2;
      next.morale -= 2;
    }
    next.form = clamp(next.form, 20, 90);
    next.morale = clamp(next.morale, 20, 90);
    const finalState = updateExtremes(next);
    return {
      profile: finalState,
      deltaForm: finalState.form - before.form,
      deltaMorale: finalState.morale - before.morale,
    };
  }

  function chanceModifier(profile) {
    if (!profile) return 0;
    const current = normalize(profile);
    const formPart = (current.form - 50) / 1000;
    const moralePart = (current.morale - 50) / 1500;
    return clamp(formPart + moralePart, -0.05, 0.06);
  }

  function adjustedChance(baseChance, profile) {
    return clamp(Number(baseChance || 0) + chanceModifier(profile), 0.04, 0.97);
  }

  function impactLabel(modifier) {
    const points = Math.round(Number(modifier || 0) * 100);
    if (points === 0) return '0 pp';
    return `${points > 0 ? '+' : ''}${points} pp`;
  }

  function formLabel(value) {
    const score = Number(value || 0);
    if (score >= 75) return '🔥 świetna';
    if (score >= 60) return '↗ dobra';
    if (score >= 41) return 'stabilna';
    if (score >= 30) return '↘ słaba';
    return '🧊 kryzys';
  }

  function moraleLabel(value) {
    const score = Number(value || 0);
    if (score >= 75) return 'bardzo wysokie';
    if (score >= 60) return 'wysokie';
    if (score >= 41) return 'neutralne';
    if (score >= 30) return 'niskie';
    return 'bardzo niskie';
  }

  return Object.freeze({
    clamp,
    initialState,
    normalize,
    applyMatchOutcome,
    applySubstitutionEntry,
    chanceModifier,
    adjustedChance,
    impactLabel,
    formLabel,
    moraleLabel,
  });
}));
