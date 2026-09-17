import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/substitutions-core.js');
const closeTo = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

const active = {
  id: 'starter', player: 'Starter', club: 'Clavia', season: '2025/26', sample_reliable: true,
  stats: { appearances: 20, starts: 20, sub_entries: 0 },
  ratings: { rhythm: 78, game_rating: 79 },
};
const profiles = [
  active,
  {
    id: 'joker', player: 'Joker', club: 'Clavia', season: '2025/26', sample_reliable: true,
    stats: { appearances: 18, starts: 4, sub_entries: 14 },
    ratings: { rhythm: 86, game_rating: 81 },
  },
  {
    id: 'fresh', player: 'Fresh', club: 'Clavia', season: '2025/26', sample_reliable: true,
    stats: { appearances: 14, starts: 7, sub_entries: 7 },
    ratings: { rhythm: 92, game_rating: 82 },
  },
  {
    id: 'steady', player: 'Steady', club: 'Clavia', season: '2025/26', sample_reliable: true,
    stats: { appearances: 19, starts: 16, sub_entries: 3 },
    ratings: { rhythm: 79, game_rating: 86 },
  },
  {
    id: 'other-club', player: 'Other', club: 'Tempo', season: '2025/26', sample_reliable: true,
    stats: { appearances: 20, starts: 5, sub_entries: 15 },
    ratings: { rhythm: 95, game_rating: 90 },
  },
  {
    id: 'other-season', player: 'Old', club: 'Clavia', season: '2024/25', sample_reliable: true,
    stats: { appearances: 20, starts: 5, sub_entries: 15 },
    ratings: { rhythm: 95, game_rating: 90 },
  },
];

assert.equal(core.windowForMinute(54), null);
assert.equal(core.windowForMinute(55), 'middle');
assert.equal(core.windowForMinute(71), 'middle');
assert.equal(core.windowForMinute(72), 'late');
assert.equal(core.windowForMinute(90), null);
assert.equal(core.canOffer({ minute: 61, usedCount: 0, resolvedBands: [] }), 'middle');
assert.equal(core.canOffer({ minute: 61, usedCount: 0, resolvedBands: ['middle'] }), null);
assert.equal(core.canOffer({ minute: 78, usedCount: 2, resolvedBands: [] }), null);

const eligible = core.eligibleCandidates(profiles, active, new Set(['steady']));
assert.deepEqual(new Set(eligible.map(p => p.id)), new Set(['joker', 'fresh']));
assert.ok(core.benchScore(profiles[1]) > core.benchScore(profiles[3]));

const picked = core.pickCandidates(profiles, active, new Set(), 3, () => 0);
assert.equal(picked.length, 3);
assert.equal(new Set(picked.map(p => p.id)).size, 3);
assert.ok(picked.every(p => p.club === 'Clavia' && p.season === '2025/26'));

const good = core.knowledgeEffect(true);
const bad = core.knowledgeEffect(false);
closeTo(core.adjustedChance(0.70, good), 0.76);
closeTo(core.adjustedChance(0.70, bad), 0.67);
assert.equal(core.tickEffect(good).actionsLeft, 1);
assert.equal(core.tickEffect(core.tickEffect(good)), null);
assert.match(core.effectLabel(good), /^\+6 pp/);
assert.match(core.effectLabel(bad), /^-3 pp/);
closeTo(core.adjustedChance(0.95, good), 0.97);
closeTo(core.adjustedChance(0.05, bad), 0.04);

console.log('substitution core smoke test: OK');
