(function attachMatchContinuityCore(root) {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function normalizeState(value = {}) {
    return {
      possession: value.possession === 'opponent' ? 'opponent' : 'player',
      zone: clamp(Math.round(Number(value.zone ?? 2)), 0, 4),
      clearChance: Boolean(value.clearChance),
      lastSituationId: value.lastSituationId || null,
      lastPossession: value.lastPossession === 'opponent' ? 'opponent' : (value.lastPossession === 'player' ? 'player' : null),
    };
  }

  function templateEligible(template, state) {
    if (!template || template.possession !== state.possession) return false;
    const minZone = clamp(template.minZone ?? template.zone ?? 0, 0, 4);
    const maxZone = clamp(template.maxZone ?? template.zone ?? 4, 0, 4);
    if (state.zone < minZone || state.zone > maxZone) return false;
    if (template.clearChanceOnly && !state.clearChance) return false;
    if (template.noClearChance && state.clearChance) return false;
    const turnover = Boolean(state.lastPossession && state.lastPossession !== state.possession);
    if (template.requiresTurnover && !turnover) return false;
    if (template.forbidTurnover && turnover) return false;
    return true;
  }

  function weightedPick(items, rng = Math.random) {
    if (!items.length) return null;
    const total = items.reduce((sum, item) => sum + Math.max(0.01, Number(item.weight || 1)), 0);
    let roll = clamp(Number(rng()), 0, 0.999999) * total;
    for (const item of items) {
      roll -= Math.max(0.01, Number(item.weight || 1));
      if (roll < 0) return item;
    }
    return items[items.length - 1];
  }

  function chooseSituation(templates, rawState = {}, rng = Math.random) {
    const state = normalizeState(rawState);
    let candidates = (Array.isArray(templates) ? templates : []).filter(item => templateEligible(item, state));
    if (!candidates.length) return null;

    const withoutImmediateRepeat = candidates.filter(item => item.id !== state.lastSituationId);
    if (withoutImmediateRepeat.length) candidates = withoutImmediateRepeat;

    const chosen = weightedPick(candidates, rng);
    if (!chosen) return null;
    return {
      ...chosen,
      possession: state.possession,
      zone: state.zone,
      clearChance: state.clearChance || Boolean(chosen.forceClearChance),
    };
  }

  function continuityInvariant(before = {}, situation = {}) {
    const state = normalizeState(before);
    if (!situation) return false;
    return situation.possession === state.possession && Number(situation.zone) === state.zone;
  }

  const api = Object.freeze({
    clamp,
    normalizeState,
    templateEligible,
    weightedPick,
    chooseSituation,
    continuityInvariant,
  });

  root.MatchContinuityCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
