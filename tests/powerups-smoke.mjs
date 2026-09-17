import assert from 'node:assert/strict';

await import('../web/powerups-core.js');
const core = globalThis.PowerupCore;
assert.ok(core, 'PowerupCore should be exposed');

assert.deepEqual(Object.keys(core.POWERUPS).sort(), ['ace', 'attack', 'defense', 'second_ball']);
assert.equal(core.card('ace').bonus, 0.10);
assert.equal(core.card('second_ball').reroll, true);
assert.equal(core.card('missing'), null);

assert.equal(core.isEligible('attack', { possession: 'player' }), true);
assert.equal(core.isEligible('attack', { possession: 'opponent' }), false);
assert.equal(core.isEligible('defense', { possession: 'opponent' }), true);
assert.equal(core.isEligible('defense', { possession: 'player' }), false);
assert.equal(core.isEligible('ace', { possession: 'player' }), true);
assert.equal(core.isEligible('second_ball', { possession: 'opponent' }), true);

const rngValues = [0.1, 0.8, 0.4];
let rngIndex = 0;
const hand = core.drawHand(3, () => rngValues[rngIndex++ % rngValues.length]);
assert.equal(hand.length, 3);
assert.equal(new Set(hand).size, 3, 'hand must not contain duplicate cards');
assert.ok(hand.every(id => core.card(id)));

const fullHand = ['ace', 'attack', 'defense'];
assert.equal(core.canActivate({
  cardId: 'ace', hand: fullHand, usedIds: new Set(), possession: 'player',
}), true);
assert.equal(core.canActivate({
  cardId: 'attack', hand: fullHand, usedIds: new Set(), possession: 'opponent',
}), false);
assert.equal(core.canActivate({
  cardId: 'defense', hand: fullHand, usedIds: new Set(), possession: 'opponent',
}), true);
assert.equal(core.canActivate({
  cardId: 'ace', hand: fullHand, usedIds: new Set(['ace']), possession: 'player',
}), false);
assert.equal(core.canActivate({
  cardId: 'ace', hand: fullHand, usedIds: new Set(), activeCard: 'attack', possession: 'player',
}), false);
assert.equal(core.canActivate({
  cardId: 'ace', hand: fullHand, usedIds: new Set(), lockedCard: 'defense', possession: 'player',
}), false);
assert.equal(core.canActivate({
  cardId: 'second_ball', hand: fullHand, usedIds: new Set(), possession: 'player',
}), false, 'card outside the dealt hand cannot be activated');

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`);
};

closeTo(core.adjustedChance(0.55, 'ace', { possession: 'player' }), 0.65);
closeTo(core.adjustedChance(0.55, 'attack', { possession: 'player' }), 0.69);
closeTo(core.adjustedChance(0.55, 'attack', { possession: 'opponent' }), 0.55);
closeTo(core.adjustedChance(0.55, 'defense', { possession: 'opponent' }), 0.69);
closeTo(core.adjustedChance(0.94, 'ace', { possession: 'player' }), 0.97);
closeTo(core.adjustedChance(0.02, null, { possession: 'player' }), 0.04);

closeTo(core.rerollChance(0.60, 'second_ball'), 0.42);
closeTo(core.rerollChance(0.95, 'second_ball'), 0.665);
assert.equal(core.rerollChance(0.60, 'ace'), null);
assert.equal(core.impactLabel('ace', { possession: 'player' }), '+10 pp');
assert.equal(core.impactLabel('attack', { possession: 'opponent' }), 'bez efektu w tej sytuacji');
assert.equal(core.impactLabel('second_ball', { possession: 'player' }), 'drugi rzut po pudle');

console.log('Power-ups smoke: OK');
