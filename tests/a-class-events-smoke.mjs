import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/a-class-events-core.js');

const noLinesman = { id:'no_linesman' };
const noLight = { id:'no_light' };
const dog = { id:'dog_on_pitch' };
const downpour = { id:'downpour' };

assert.ok(core.eventWeight(noLinesman, { prematch:true }) > 4);
assert.equal(core.eventWeight(noLinesman, { prematch:false, minute:70 }), 0);
assert.ok(core.eventWeight(noLight, { minute:80 }) > core.eventWeight(noLight, { minute:25 }));
assert.ok(core.eventWeight(dog, { minute:70, chaos:true }) > core.eventWeight(dog, { minute:70, chaos:false }));

const prematchPick = core.pickWeighted(
  [noLinesman, noLight, dog],
  { prematch:true },
  new Set(),
  () => 0,
);
assert.equal(prematchPick.id, 'no_linesman');

const usedPick = core.pickWeighted(
  [noLinesman, noLight, dog],
  { prematch:false, minute:80 },
  new Set(['no_light']),
  () => 0,
);
assert.notEqual(usedPick.id, 'no_light');
assert.ok(['dog_on_pitch'].includes(usedPick.id));

assert.equal(core.shouldGuaranteeEvent({ actionNo:4, eventCount:0 }), false);
assert.equal(core.shouldGuaranteeEvent({ actionNo:5, eventCount:0 }), true);
assert.equal(core.shouldGuaranteeEvent({ actionNo:8, eventCount:1 }), false);

const rainSafe = core.conditionFor('downpour', 0);
assert.equal(rainSafe.actionsLeft, 3);
assert.ok(core.chanceModifier(rainSafe, { id:'long_ball' }, 'player') > 0);
assert.ok(core.chanceModifier(rainSafe, { id:'short_build' }, 'player') < 0);
assert.ok(core.chanceModifier(rainSafe, { id:'shape' }, 'opponent') > 0);

const uneven = core.conditionFor('uneven_pitch', 0);
assert.ok(core.chanceModifier(uneven, { id:'long_ball' }, 'player') > core.chanceModifier(uneven, { id:'combination' }, 'player'));

const flat = core.conditionFor('flat_ball', 0);
assert.ok(core.adjustedChance(0.70, flat, { id:'placed_shot', kind:'shot' }, 'player') < 0.70);

const oneLeft = { ...downpour, actionsLeft:1 };
assert.equal(core.tickCondition(oneLeft), null);
assert.equal(core.tickCondition(downpour).actionsLeft, 2);
assert.equal(core.modifierLabel(0.06), '+6 pp');
assert.equal(core.modifierLabel(-0.03), '-3 pp');

console.log('A-class events smoke: OK');
