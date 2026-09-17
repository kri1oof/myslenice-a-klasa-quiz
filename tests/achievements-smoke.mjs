import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/achievements-core.js');

assert.equal(core.ACHIEVEMENTS.length, 20, 'expected 20 achievements');
assert.equal(new Set(core.ACHIEVEMENTS.map(item => item.id)).size, 20, 'achievement ids must be unique');
assert.deepEqual([...new Set(core.ACHIEVEMENTS.map(item => item.category))].sort(), ['aclass','career','knowledge','match','president'].sort());

let profile = core.emptyProfile();
profile = core.recordAnswer(profile, { correct:true, streak:1, difficulty:5 });
assert.equal(profile.stats.answered, 1);
assert.equal(profile.stats.correct, 1);
assert.equal(profile.stats.difficulty5Correct, 1);
let evaluated = core.evaluate(profile, '2026-09-17T00:00:00.000Z');
assert.ok(evaluated.newlyUnlocked.includes('first_correct'));
assert.equal(core.unlockedCount(evaluated.profile), 1);

profile = evaluated.profile;
for (let streak = 2; streak <= 10; streak += 1) {
  profile = core.recordAnswer(profile, { correct:true, streak, difficulty:3 });
}
evaluated = core.evaluate(profile, '2026-09-17T00:01:00.000Z');
assert.ok(evaluated.newlyUnlocked.includes('streak_five'));
assert.ok(evaluated.newlyUnlocked.includes('streak_ten'));
profile = evaluated.profile;

profile = core.recordFinish(profile, {
  answered:10,
  correct:10,
  rpg:true,
  playerGoals:3,
  opponentGoals:0,
  result:'W',
  powerupsUsed:3,
  powerupRerollsSaved:1,
  rivalryLevel:'derby',
  aClassEvents:2,
  substitutionQuizCorrect:2,
});
evaluated = core.evaluate(profile, '2026-09-17T00:02:00.000Z');
for (const id of ['perfect_ten','first_rpg_win','clean_sheet','three_goals','full_hand','second_ball_save','rivalry_win','derby_win','aclass_double','super_subs']) {
  assert.ok(evaluated.newlyUnlocked.includes(id), `should unlock ${id}`);
}
profile = evaluated.profile;

for (let i = 0; i < 10; i += 1) {
  profile = core.recordFinish(profile, {
    answered:8,
    correct:5,
    rpg:true,
    playerGoals:2,
    opponentGoals:1,
    result:'W',
    career:true,
  });
}
evaluated = core.evaluate(profile, '2026-09-17T00:03:00.000Z');
assert.ok(evaluated.newlyUnlocked.includes('career_ten'));
profile = evaluated.profile;

profile = core.recordFinish(profile, {
  answered:9,
  correct:6,
  rpg:true,
  playerGoals:1,
  opponentGoals:0,
  result:'W',
  career:true,
  seasonCompleted:true,
  objectiveAchieved:true,
  president:true,
  presidentDecisionMade:true,
  presidentBudget:12500,
  presidentAverageTrust:67,
});
evaluated = core.evaluate(profile, '2026-09-17T00:04:00.000Z');
for (const id of ['season_complete','objective_complete','president_first','president_balance']) {
  assert.ok(evaluated.newlyUnlocked.includes(id), `should unlock ${id}`);
}
assert.equal(evaluated.profile.stats.presidentStableSeasons, 1);

let split = core.emptyProfile();
split = core.recordFinish(split, {
  president:true,
  career:true,
  seasonCompleted:true,
  presidentBudget:15000,
  presidentAverageTrust:50,
});
split = core.recordFinish(split, {
  president:true,
  career:true,
  seasonCompleted:true,
  presidentBudget:5000,
  presidentAverageTrust:80,
});
assert.equal(split.stats.presidentHealthyBudgetSeasons, 1);
assert.equal(split.stats.presidentHighTrustSeasons, 1);
assert.equal(split.stats.presidentStableSeasons, 0, 'president stability must be earned in the same season');
assert.equal(core.progress(core.achievement('president_balance'), split.stats).complete, false);

const dirty = core.sanitizeProfile({ stats:{ correct:-12, rpgWins:'3', answered:'bad' }, unlocked:{ first_correct:{ at:'x' } } });
assert.equal(dirty.stats.correct, 0);
assert.equal(dirty.stats.rpgWins, 3);
assert.equal(dirty.stats.answered, 0);
assert.equal(dirty.unlocked.first_correct.at, 'x');

console.log('Achievements smoke: OK');
