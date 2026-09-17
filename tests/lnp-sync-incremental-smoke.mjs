import assert from 'node:assert/strict';
import { played, matchFingerprint, selectEventMatches, shouldFreezeSeason } from '../scripts/lnp_sync_helpers.mjs';

const scheduled = { matchId: 'future', state: 'Nierozegrany', scores: { final: null } };
const playedMatch = { matchId: 'm1', state: 'Rozegrany', queue: 1, dateTime: '2026-09-10T17:00:00', host: { id: 'h', name: 'H' }, guest: { id: 'g', name: 'G' }, scores: { final: '2:1', half: '1:0' } };
const same = structuredClone(playedMatch);
const changed = structuredClone(playedMatch);
changed.scores.final = '3:1';
const newPlayed = { ...playedMatch, matchId: 'm2' };

assert.equal(played(scheduled), false);
assert.equal(played(playedMatch), true);
assert.equal(matchFingerprint(playedMatch), matchFingerprint(same));
assert.notEqual(matchFingerprint(playedMatch), matchFingerprint(changed));
assert.equal(selectEventMatches([scheduled, playedMatch], [same], { m1: { host: {}, guest: {} } }).length, 0);
assert.deepEqual(selectEventMatches([newPlayed], [same], { m1: {} }).map(x => x.matchId), ['m2']);
assert.deepEqual(selectEventMatches([changed], [same], { m1: {} }).map(x => x.matchId), ['m1']);
assert.deepEqual(selectEventMatches([playedMatch], [same], {}).map(x => x.matchId), ['m1']);
assert.deepEqual(selectEventMatches([playedMatch], [same], { m1: {} }, true).map(x => x.matchId), ['m1']);
assert.equal(shouldFreezeSeason('2024/25', { matches: [] }), true);
assert.equal(shouldFreezeSeason('2025/26', { matches: [] }), true);
assert.equal(shouldFreezeSeason('2025/26', null), false);
assert.equal(shouldFreezeSeason('2025/26', { matches: [] }, true), false);
assert.equal(shouldFreezeSeason('2026/27', { matches: [] }), false);
assert.equal(shouldFreezeSeason('2027/28', { matches: [] }, false, '2027/28'), false);

console.log('ŁNP incremental sync smoke: OK');
