import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const adaptive = require('../web/adaptive-difficulty-core.js');
const smart = require('../web/smart-question-engine-core.js');

let state = adaptive.initialState();
assert.equal(state.rating, 2.6);
assert.equal(adaptive.recommendedLevel(state), 3);
assert.equal(adaptive.recentAccuracy(state), .5);

state = adaptive.recordAnswer(state, { correct:true, difficulty:3 });
const afterOne = state.rating;
assert.ok(afterOne > 2.6);
state = adaptive.recordAnswer(state, { correct:true, difficulty:3 });
state = adaptive.recordAnswer(state, { correct:true, difficulty:4 });
assert.ok(state.rating > afterOne);
assert.ok(state.streak >= 3);
assert.ok(adaptive.recommendedDifficulty(state) >= 3);

const strongState = state;
const lateTarget = adaptive.recommendedDifficulty(strongState, { progress:.95 });
assert.ok(lateTarget > adaptive.recommendedDifficulty(strongState, { progress:.3 }));
assert.ok(adaptive.pressureBonus(strongState, .95) > 0);

let struggling = adaptive.initialState({ rating:3.4 });
struggling = adaptive.recordAnswer(struggling, { correct:false, difficulty:3 });
const afterMiss = struggling.rating;
struggling = adaptive.recordAnswer(struggling, { correct:false, difficulty:3 });
assert.ok(struggling.rating < afterMiss);
assert.equal(struggling.missStreak, 2);
assert.equal(adaptive.pressureBonus(struggling, .95), 0, 'two recent misses suppress late-game pressure');
assert.ok(adaptive.recommendedDifficulty(struggling, { progress:.95 }) < 3.4);

const hardCorrect = adaptive.recordAnswer(adaptive.initialState({ rating:2.4 }), {
  correct:true,
  difficulty:4,
});
const easyCorrect = adaptive.recordAnswer(adaptive.initialState({ rating:2.4 }), {
  correct:true,
  difficulty:2,
});
assert.ok(
  hardCorrect.lastDelta > easyCorrect.lastDelta,
  'correct answer above current level should improve rating more',
);

const easyWrong = adaptive.recordAnswer(adaptive.initialState({ rating:3.6 }), {
  correct:false,
  difficulty:2,
});
const hardWrong = adaptive.recordAnswer(adaptive.initialState({ rating:3.6 }), {
  correct:false,
  difficulty:5,
});
assert.ok(
  Math.abs(easyWrong.lastDelta) > Math.abs(hardWrong.lastDelta),
  'missing an easier question should hurt more than missing a much harder one',
);

function q(id, difficulty) {
  return {
    id,
    type:'season_points',
    difficulty,
    question:'Ile punktów zdobył Klub ' + id + '?',
    answer:'40',
    options:['40','41','42'],
    explanation:'',
    season:'2025/26',
    clubs:['Klub ' + id],
    sources:[],
  };
}

const difficultyPool = [q('one',1), q('two',2), q('three',3), q('four',4), q('five',5)];
const targetFour = smart.buildQuestionPool(difficultyPool, 1, {
  history:[],
  random:() => 0,
  difficultyTarget:4.1,
});
assert.equal(targetFour[0].difficulty, 4);
const targetTwo = smart.buildQuestionPool(difficultyPool, 1, {
  history:[],
  random:() => 0,
  difficultyTarget:1.8,
});
assert.equal(targetTwo[0].difficulty, 2);

const app = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const rounds = fs.readFileSync(new URL('../web/rounds.js', import.meta.url), 'utf8');
const matchMode = fs.readFileSync(new URL('../web/match-mode.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

assert.match(index, /adaptive-difficulty-core\.js/);
assert.ok(
  index.indexOf('adaptive-difficulty-core.js') < index.indexOf('app.js'),
  'adaptive core must load before app',
);
assert.match(app, /ADAPTIVE_DIFFICULTY_PROFILE_KEY/);
assert.match(app, /configureAdaptiveDynamicPool/);
assert.match(app, /ensureAdaptiveQuestion/);
assert.match(app, /recordAdaptiveAnswer/);
assert.match(app, /następny cel: poziom/);
assert.match(rounds, /configureAdaptiveDynamicPool/);
assert.match(rounds, /smartPick\(matching, requestedCount\)/);
assert.match(matchMode, /resetAdaptiveDifficulty\(true\)/);
assert.match(matchMode, /configureAdaptiveStaticPool\(pool, true\)/);
assert.match(matchMode, /difficultyTarget:state\.adaptiveEnabled/);

console.log('Adaptive difficulty smoke: OK');
