import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/player-form-morale-core.js');

const hotPlayer = { ratings: { rhythm: 95 } };
const coldPlayer = { ratings: { rhythm: 35 } };
assert.equal(core.initialState(hotPlayer).form, 57);
assert.equal(core.initialState(hotPlayer).morale, 50);
assert.equal(core.initialState(coldPlayer).form, 44);

const neutral = {
  form: 50,
  morale: 50,
  successStreak: 0,
  failureStreak: 0,
  peakForm: 50,
  peakMorale: 50,
  lowestForm: 50,
  lowestMorale: 50,
  actions: 0,
};

const success = core.applyMatchOutcome(neutral, { success: true, knowledgeCorrect: true });
assert.equal(success.profile.form, 55);
assert.equal(success.profile.morale, 53);
assert.equal(success.deltaForm, 5);
assert.equal(success.deltaMorale, 3);

let streak = neutral;
streak = core.applyMatchOutcome(streak, { success: true, knowledgeCorrect: true }).profile;
streak = core.applyMatchOutcome(streak, { success: true, knowledgeCorrect: true }).profile;
streak = core.applyMatchOutcome(streak, { success: true, knowledgeCorrect: true }).profile;
assert.equal(streak.successStreak, 3);
assert.equal(streak.form, 68, 'third success should trigger a streak boost');
assert.equal(streak.morale, 61);

const goal = core.applyMatchOutcome(neutral, { success: true, knowledgeCorrect: true, scored: true });
assert.equal(goal.profile.form, 63);
assert.equal(goal.profile.morale, 60);

const conceded = core.applyMatchOutcome(neutral, { success: false, knowledgeCorrect: false, conceded: true });
assert.equal(conceded.profile.form, 43);
assert.equal(conceded.profile.morale, 41);

const goodEntry = core.applySubstitutionEntry(neutral, true);
assert.equal(goodEntry.profile.form, 53);
assert.equal(goodEntry.profile.morale, 54);
const badEntry = core.applySubstitutionEntry(neutral, false);
assert.equal(badEntry.profile.form, 48);
assert.equal(badEntry.profile.morale, 48);

const hot = { ...neutral, form: 90, morale: 90 };
const low = { ...neutral, form: 20, morale: 20 };
assert.ok(Math.abs(core.chanceModifier(hot) - 0.06) < 1e-9);
assert.ok(Math.abs(core.chanceModifier(low) - (-0.05)) < 1e-9);
assert.equal(core.adjustedChance(0.95, hot), 0.97);
assert.equal(core.adjustedChance(0.05, low), 0.04);
assert.equal(core.impactLabel(0.034), '+3 pp');
assert.equal(core.impactLabel(-0.026), '-3 pp');
assert.equal(core.formLabel(76), '🔥 świetna');
assert.equal(core.moraleLabel(50), 'neutralne');

console.log('player form and morale smoke test: OK');
