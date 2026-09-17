import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/player-characters-core.js');

const profiles = [
  {
    id: 'a', player: 'Snajper', club: 'Clavia', season: '2025/26', sample_reliable: true,
    ratings: { finishing: 91, rhythm: 74, experience: 70, discipline: 82, game_rating: 80 },
  },
  {
    id: 'b', player: 'Pomocnik', club: 'Clavia', season: '2025/26', sample_reliable: true,
    ratings: { finishing: 58, rhythm: 92, experience: 85, discipline: 90, game_rating: 83 },
  },
  {
    id: 'c', player: 'Weteran', club: 'Tempo', season: '2025/26', sample_reliable: true,
    ratings: { finishing: 55, rhythm: 70, experience: 94, discipline: 94, game_rating: 81 },
  },
  {
    id: 'd', player: 'Mała próba', club: 'Clavia', season: '2026/27', sample_reliable: false,
    ratings: { finishing: 95, rhythm: 95, experience: 45, discipline: 85, game_rating: 78 },
  },
];

assert.deepEqual(
  core.filterProfiles(profiles, { club: 'Clavia', seasons: ['2025/26'] }).map(p => p.id),
  ['a', 'b'],
);
assert.equal(core.filterProfiles(profiles, { seasons: ['2026/27'] }).length, 1);

const picked = core.pickCandidates(profiles, 3, () => 0);
assert.equal(picked.length, 3);
assert.equal(new Set(picked.map(p => p.id)).size, 3);
assert.ok(picked.every(p => p.sample_reliable), 'reliable profiles should be preferred when enough exist');

const shotContext = { kind: 'shot', dc: 4, possession: 'player' };
assert.ok(core.actionModifier(profiles[0], shotContext) > 0);
assert.ok(core.actionModifier(profiles[0], shotContext) > core.actionModifier(profiles[1], shotContext));

const defendContext = { kind: 'danger_tackle', dc: 5, possession: 'opponent' };
assert.ok(core.actionModifier(profiles[2], defendContext) > 0);
assert.ok(core.adjustedChance(0.94, profiles[2], defendContext) <= 0.97);
assert.ok(core.adjustedChance(0.03, profiles[0], shotContext) >= 0.04);

assert.match(core.impactLabel(0.054), /^\+5 pp$/);
assert.equal(core.impactLabel(0), '0 pp');

console.log('player character core smoke test: OK');
