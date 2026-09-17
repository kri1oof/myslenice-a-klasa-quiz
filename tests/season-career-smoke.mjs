import assert from 'node:assert/strict';

await import('../web/season-career-core.js');
const core = globalThis.SeasonCareerCore;
assert.ok(core, 'SeasonCareerCore should be exposed');

const clubs = ['Clavia', 'Tempo', 'Pasternik', 'Zielonka'];
const rounds = core.roundRobin(clubs);
assert.equal(rounds.length, 6, 'four clubs should play six double-round-robin rounds');

const pairCounts = new Map();
const homeCounts = new Map();
rounds.flat().forEach(fixture => {
  const key = [fixture.home, fixture.away].sort().join('|');
  pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  homeCounts.set(`${fixture.home}|${fixture.away}`, (homeCounts.get(`${fixture.home}|${fixture.away}`) || 0) + 1);
});
assert.equal(pairCounts.size, 6);
assert.ok([...pairCounts.values()].every(value => value === 2), 'every pair should meet twice');
assert.equal(homeCounts.get('Clavia|Tempo'), 1);
assert.equal(homeCounts.get('Tempo|Clavia'), 1);

const oddRounds = core.roundRobin(['A','B','C','D','E']);
assert.equal(oddRounds.length, 10);
const oddAppearances = oddRounds.flat().filter(f => f.home === 'A' || f.away === 'A');
assert.equal(oddAppearances.length, 8, 'five-team league gives each club eight matches');

let table = core.createTable(clubs);
table = core.applyResult(table, { home:'Clavia', away:'Tempo' }, 2, 1);
table = core.applyResult(table, { home:'Pasternik', away:'Zielonka' }, 0, 0);
assert.equal(table.Clavia.points, 3);
assert.equal(table.Clavia.gf, 2);
assert.equal(table.Tempo.losses, 1);
assert.equal(table.Pasternik.points, 1);
assert.equal(core.position(table, 'Clavia'), 1);

const characters = [
  { id:'c1', club:'Clavia', season:'2026/27', ratings:{ game_rating:80 } },
  { id:'c2', club:'Clavia', season:'2026/27', ratings:{ game_rating:70 } },
  { id:'t1', club:'Tempo', season:'2026/27', ratings:{ game_rating:60 } },
  { id:'p1', club:'Pasternik', season:'2026/27', ratings:{ game_rating:66 } },
  { id:'z1', club:'Zielonka', season:'2026/27', ratings:{ game_rating:68 } },
  { id:'x1', club:'Extra', season:'2026/27', ratings:{ game_rating:64 } },
  { id:'y1', club:'Yeti', season:'2026/27', ratings:{ game_rating:62 } },
];
const questions = [
  { season:'2026/27', clubs:['Clavia','Tempo'] },
  { season:'2025/26', clubs:['Old A','Old B'] },
];
assert.deepEqual(core.clubsForSeason(characters, questions, '2026/27'), ['Clavia','Extra','Pasternik','Tempo','Yeti','Zielonka']);
assert.equal(Math.round(core.clubStrength(characters, 'Clavia', '2026/27')), 75);

const strengths = core.strengthMap(characters, ['Clavia','Tempo'], '2026/27');
const fixture = { round:1, home:'Clavia', away:'Tempo' };
const simulatedA = core.simulateFixture(fixture, strengths, 'same-seed');
const simulatedB = core.simulateFixture(fixture, strengths, 'same-seed');
assert.deepEqual(simulatedA, simulatedB, 'AI league result should be deterministic for a seed');
assert.ok(simulatedA.homeGoals >= 0 && simulatedA.homeGoals <= 6);
assert.ok(simulatedA.awayGoals >= 0 && simulatedA.awayGoals <= 6);

assert.deepEqual(
  core.userResultForFixture({ home:'Tempo', away:'Clavia' }, 'Clavia', 3, 1),
  { home:'Tempo', away:'Clavia', homeGoals:1, awayGoals:3, simulated:false },
);
assert.equal(core.resultCode(2, 1), 'W');
assert.equal(core.resultCode(1, 1), 'D');
assert.equal(core.resultCode(0, 1), 'L');

const xpWin = core.developmentXp({ correct:8, answered:10, result:'W' });
const xpLoss = core.developmentXp({ correct:4, answered:10, result:'L' });
assert.ok(xpWin > xpLoss);
let development = core.addDevelopment({}, ['c1','c2'], 20);
assert.equal(development.c1.level, 2);
assert.equal(development.c1.matches, 1);
assert.ok(core.developmentBonus(development.c1) > 0);
development = core.addDevelopment(development, ['c1'], 90);
assert.equal(development.c1.level, 5);
assert.ok(core.adjustChance(0.70, development.c1) > 0.70);
assert.ok(core.adjustChance(0.96, development.c1) <= 0.97);

const objective = core.objective(14);
assert.equal(objective.targetPosition, 7);
const next = core.nextUserFixture(rounds, 0, 'Clavia');
assert.ok(next);
assert.equal(next.index, 0);
assert.ok(next.fixture.home === 'Clavia' || next.fixture.away === 'Clavia');

console.log('Season career smoke: OK');
