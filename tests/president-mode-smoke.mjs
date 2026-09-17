import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/president-mode-core.js');

assert.equal(core.DECISIONS.length, 18, 'first president-mode version should expose 18 organizational decisions');
assert.equal(new Set(core.DECISIONS.map(item => item.id)).size, 18, 'decision ids must be unique');
assert.ok(core.DECISIONS.every(item => Array.isArray(item.choices) && item.choices.length === 3), 'every decision should have three choices');
assert.ok(core.DECISIONS.every(item => item.choices.some(choice => Number(choice.effect?.budget || 0) >= 0)), 'every decision needs at least one no-debt fallback');

const initial = core.initialState(26, () => 0.42);
assert.equal(initial.budget, 12000);
assert.deepEqual(initial.trust, { players:55, coach:55, supporters:50, sponsors:50 });
assert.equal(initial.order.length, 18);
assert.equal(new Set(initial.order).size, 18);

const first = core.pickDecision(initial, 0);
assert.ok(first);
const applied = core.applyChoice(initial, first, 0, 0);
assert.equal(applied.ok, true);
assert.equal(applied.profile.usedIds.includes(first.id), true);
assert.equal(applied.profile.history.length, 1);
assert.equal(applied.profile.decidedRound, 0);
assert.notEqual(core.pickDecision(applied.profile, 1)?.id, first.id, 'used decisions should not repeat');

const broke = { ...initial, budget:100 };
const expensiveDecision = core.DECISIONS.find(item => item.choices.some(choice => Number(choice.effect?.budget || 0) < -100));
const expensiveIndex = expensiveDecision.choices.findIndex(choice => Number(choice.effect?.budget || 0) < -100);
assert.equal(core.canChoose(broke, expensiveDecision.choices[expensiveIndex]), false);
assert.deepEqual(core.applyChoice(broke, expensiveDecision, expensiveIndex, 0), { ok:false, reason:'budget' });

assert.equal(core.chanceModifier({ all:0.02, attack:0.03, defence:-0.01 }, 'player'), 0.05);
assert.equal(core.chanceModifier({ all:0.02, attack:0.03, defence:-0.01 }, 'opponent'), 0.01);
assert.equal(core.adjustedChance(0.94, { all:0.08 }, 'player'), 0.97, 'chance should stay capped');
assert.equal(core.adjustedChance(0.05, { all:-0.08 }, 'player'), 0.04, 'chance should keep a minimum');

assert.equal(core.matchFinance({ venue:'DOM', result:'W' }), 1000);
assert.equal(core.matchFinance({ venue:'DOM', result:'D' }), 800);
assert.equal(core.matchFinance({ venue:'WYJAZD', result:'L' }), -250);

const afterWin = core.applyPostMatch(initial, { venue:'DOM', result:'W' });
assert.equal(afterWin.budget, 13000);
assert.deepEqual(afterWin.trust, { players:58, coach:57, supporters:53, sponsors:52 });
assert.equal(afterWin.matches, 1);
assert.equal(afterWin.currentMatchEffect, null);

const afterLoss = core.applyPostMatch(initial, { venue:'WYJAZD', result:'L' });
assert.equal(afterLoss.budget, 11750);
assert.deepEqual(afterLoss.trust, { players:53, coach:53, supporters:47, sponsors:49 });

assert.equal(core.averageTrust(initial), 53);
assert.equal(core.trustLabel(80), 'bardzo wysokie');
assert.equal(core.trustLabel(65), 'wysokie');
assert.equal(core.trustLabel(50), 'stabilne');
assert.equal(core.trustLabel(30), 'niskie');
assert.equal(core.trustLabel(10), 'kryzysowe');
assert.match(core.money(12000), /12.*000.*zł/);

console.log('president mode smoke: ok');
