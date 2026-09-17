import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/match-continuity-core.js');
const runtime = fs.readFileSync(new URL('../web/match-continuity.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

const templates = [
  { id:'player_low', possession:'player', minZone:0, maxZone:1, weight:1 },
  { id:'player_mid', possession:'player', minZone:2, maxZone:2, weight:1 },
  { id:'player_high', possession:'player', minZone:3, maxZone:4, weight:1 },
  { id:'player_penalty', possession:'player', minZone:4, maxZone:4, weight:1 },
  { id:'opp_high', possession:'opponent', minZone:3, maxZone:4, weight:1 },
  { id:'opp_mid', possession:'opponent', minZone:2, maxZone:2, weight:1 },
  { id:'opp_danger', possession:'opponent', minZone:0, maxZone:1, weight:1 },
  { id:'player_counter', possession:'player', minZone:2, maxZone:3, requiresTurnover:true, weight:10 },
];

for (const possession of ['player','opponent']) {
  for (let zone = 0; zone <= 4; zone += 1) {
    const selected = core.chooseSituation(templates, { possession, zone }, () => 0);
    assert.ok(selected, `${possession} zone ${zone} should have a situation`);
    assert.equal(selected.possession, possession, 'situation cannot switch possession');
    assert.equal(selected.zone, zone, 'situation cannot teleport the ball to another zone');
    assert.equal(core.continuityInvariant({ possession, zone }, selected), true);
  }
}

const defending = core.chooseSituation(templates, { possession:'opponent', zone:1 }, () => .999);
assert.equal(defending.possession, 'opponent');
assert.notEqual(defending.id, 'player_penalty', 'defending cannot jump directly to a penalty for the player');

const playerOwnHalf = core.chooseSituation(templates, { possession:'player', zone:1 }, () => .999);
assert.notEqual(playerOwnHalf.id, 'player_penalty', 'a penalty cannot appear from the player own half');

const turnover = core.chooseSituation(templates, {
  possession:'player', zone:2, lastPossession:'opponent',
}, () => .99);
assert.equal(turnover.id, 'player_counter', 'turnover-only counter should become eligible after winning possession');

const noTurnover = core.chooseSituation(templates, {
  possession:'player', zone:2, lastPossession:'player',
}, () => .99);
assert.notEqual(noTurnover.id, 'player_counter');

const avoidRepeat = core.chooseSituation([
  { id:'a', possession:'player', minZone:2, maxZone:2 },
  { id:'b', possession:'player', minZone:2, maxZone:2 },
], { possession:'player', zone:2, lastSituationId:'a' }, () => 0);
assert.equal(avoidRepeat.id, 'b');

assert.match(runtime, /dynamic:'continuity'/);
assert.match(runtime, /continuityInvariant/);
assert.match(runtime, /player_penalty[\s\S]*minZone:4[\s\S]*maxZone:4/);
assert.match(runtime, /opponent_corner[\s\S]*minZone:0[\s\S]*maxZone:0/);
assert.match(runtime, /lastPossession:state\.rpgScenarioLastApplied\?\.possession/);
assert.ok(index.indexOf('match-scenarios.js') < index.indexOf('match-continuity-core.js'));
assert.ok(index.indexOf('match-continuity-core.js') < index.indexOf('match-continuity.js'));
assert.ok(index.indexOf('match-continuity.js') < index.indexOf('tactical-decisions-core.js'));

console.log('Match continuity smoke: OK');
