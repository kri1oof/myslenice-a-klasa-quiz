import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/match-scenarios-core.js');

assert.equal(core.scenarioCount(() => 0), 8);
assert.equal(core.scenarioCount(() => 0.999999), 12);

for (const count of [8, 9, 10, 11, 12]) {
  const plan = core.buildMinutePlan(count, () => 0.5);
  assert.equal(plan.length, count);
  assert.equal(plan[0], 6);
  assert.equal(plan.at(-1), 87);
  for (let i = 1; i < plan.length; i += 1) {
    assert.ok(plan[i] > plan[i - 1], `minutes must increase: ${plan}`);
    assert.ok(plan[i] - plan[i - 1] >= 4, `situations must be separated: ${plan}`);
  }
}

const easyCorrect = core.successChance({ dc: 1, knowledgeCorrect: true, kind: 'advance' });
const hardCorrect = core.successChance({ dc: 5, knowledgeCorrect: true, kind: 'advance' });
const easyWrong = core.successChance({ dc: 1, knowledgeCorrect: false, kind: 'advance' });
const hardWrong = core.successChance({ dc: 5, knowledgeCorrect: false, kind: 'advance' });
assert.ok(easyCorrect > hardCorrect);
assert.ok(easyWrong > hardWrong);
assert.ok(hardCorrect > hardWrong);

const shotCorrect = core.successChance({ dc: 3, knowledgeCorrect: true, kind: 'shot' });
const passCorrect = core.successChance({ dc: 3, knowledgeCorrect: true, kind: 'advance' });
assert.ok(passCorrect > shotCorrect, 'a goal attempt should be harder than a normal action');

const clearShot = core.successChance({ dc: 3, knowledgeCorrect: true, kind: 'shot', clearChance: true });
assert.ok(clearShot > shotCorrect, 'a clear chance should improve finishing odds');

const momentumBoost = core.successChance({
  dc: 3,
  knowledgeCorrect: true,
  kind: 'advance',
  momentum: 100,
  opponentMomentum: 0,
});
assert.ok(momentumBoost > passCorrect, 'positive momentum should improve execution');

const certainSuccess = core.rollOutcome({ dc: 1, knowledgeCorrect: true }, () => 0);
assert.equal(certainSuccess.success, true);
const certainFailure = core.rollOutcome({ dc: 5, knowledgeCorrect: false }, () => 0.999999);
assert.equal(certainFailure.success, false);

assert.equal(core.percent(0.864), '86%');
console.log('Match scenarios smoke: OK');
