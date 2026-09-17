import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tactical = require('../web/tactical-decisions-core.js');

assert.equal(tactical.decisionBand(10), null);
assert.equal(tactical.decisionBand(30), 'first_half');
assert.equal(tactical.decisionBand(58), 'second_half');
assert.equal(tactical.decisionBand(80), 'late');

assert.deepEqual(
  tactical.decisionSet({ minute: 80, scoreDiff: 1 }),
  ['low_block', 'balanced', 'second_goal'],
);
assert.deepEqual(
  tactical.decisionSet({ minute: 80, scoreDiff: -1 }),
  ['all_in', 'direct', 'control'],
);
assert.deepEqual(
  tactical.decisionSet({ minute: 80, scoreDiff: 0 }),
  ['high_press', 'balanced', 'counter'],
);

const base = 0.70;
const lowBlockDef = tactical.adjustedChance(base, {
  profileId: 'low_block', possession: 'opponent', kind: 'danger_block', dc: 3,
});
const lowBlockAttack = tactical.adjustedChance(base, {
  profileId: 'low_block', possession: 'player', kind: 'shot', dc: 3,
});
assert(lowBlockDef > base, 'low block should improve defensive execution');
assert(lowBlockAttack < base, 'low block should reduce attacking execution');

const allInAttack = tactical.adjustedChance(base, {
  profileId: 'all_in', possession: 'player', kind: 'shot', dc: 4,
});
const allInDef = tactical.adjustedChance(base, {
  profileId: 'all_in', possession: 'opponent', kind: 'danger_block', dc: 4,
});
assert(allInAttack > base, 'all-in should boost attack');
assert(allInDef < base, 'all-in should weaken defence');

assert.equal(tactical.questionShift({
  profileId: 'low_block', possession: 'opponent', kind: 'danger_block', dc: 3,
}), -1);
assert.equal(tactical.questionShift({
  profileId: 'low_block', possession: 'player', kind: 'shot', dc: 3,
}), 1);
assert.equal(tactical.questionShift({
  profileId: 'second_goal', possession: 'player', kind: 'shot', dc: 4,
}), -1);

assert.match(
  tactical.decisionHeadline({ minute: 78, scoreDiff: 1 }),
  /bronisz prowadzenia/i,
);

console.log('tactical decisions smoke: ok');
