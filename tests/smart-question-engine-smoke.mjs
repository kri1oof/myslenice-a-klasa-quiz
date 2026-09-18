import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/smart-question-engine-core.js');

function q(id, type, question, answer, clubs = [], season = '2025/26', sources = []) {
  return {
    id,
    type,
    difficulty:3,
    question,
    answer,
    options:[answer, 'X', 'Y'],
    explanation:'',
    season,
    clubs,
    sources,
  };
}

assert.equal(core.HISTORY_LIMIT, 30);
assert.equal(core.categoryForType('match_score'), 'mecze');
assert.equal(core.categoryForType('player_season_goals'), 'zawodnicy');
assert.equal(core.categoryForType('starting_xi_player'), 'sklady');
assert.equal(core.categoryForType('season_points'), 'sezon');
assert.equal(core.categoryForType('longest_winning_streak'), 'rekordy');
assert.equal(core.categoryForType('round_number'), 'terminarz');
assert.equal(core.categoryForType('social_mvp'), 'ciekawostki');

const sameMatchWinner = q(
  'match-winner',
  'match_winner',
  'Kto wygrał mecz Clavia Świątniki Górne – Tempo Rzeszotary?',
  'Clavia Świątniki Górne',
  ['Clavia Świątniki Górne', 'Tempo Rzeszotary'],
  '2025/26',
  ['https://www.laczynaspilka.pl/mecz/abc-123'],
);
const sameMatchScore = q(
  'match-score',
  'match_score',
  'Jaki był wynik meczu Clavia Świątniki Górne – Tempo Rzeszotary?',
  '2:1',
  ['Clavia Świątniki Górne', 'Tempo Rzeszotary'],
  '2025/26',
  ['https://www.laczynaspilka.pl/mecz/abc-123'],
);
assert.equal(
  core.factFingerprint(sameMatchWinner),
  core.factFingerprint(sameMatchScore),
  'different question types about the same match should share an event fingerprint',
);

const samePlayerGoals = q(
  'player-goals',
  'player_season_goals',
  'Ile goli w sezonie strzelił Krzysztof Zając?',
  '9',
  ['Clavia Świątniki Górne'],
);
const samePlayerClub = q(
  'player-club',
  'player_club_season',
  'W którym klubie w tym sezonie grał Krzysztof Zając?',
  'Clavia Świątniki Górne',
  ['Clavia Świątniki Górne'],
);
assert.ok(core.subjectKeys(samePlayerGoals).includes('person:krzysztof zajac'));
assert.ok(core.subjectKeys(samePlayerClub).includes('person:krzysztof zajac'));

const unrelatedSeason = q(
  'season-points',
  'season_points',
  'Ile punktów zdobył Beskid Tokarnia?',
  '44',
  ['Beskid Tokarnia'],
);
const unrelatedPlayer = q(
  'other-player',
  'match_captain',
  'Kto był kapitanem Gościbii Sułkowice?',
  'Jan Kowalski',
  ['Gościbia Sułkowice'],
);
const poolWithDuplicateMatch = core.buildQuestionPool(
  [sameMatchWinner, sameMatchScore, unrelatedSeason, unrelatedPlayer],
  4,
  { random:() => 0 },
);
assert.equal(poolWithDuplicateMatch[0].id, 'match-winner');
assert.ok(
  poolWithDuplicateMatch.findIndex(item => item.id === 'match-score') >= 2,
  'same match asked in another form should be pushed away when alternatives exist',
);

const categories = [
  q('m1', 'match_score', 'Wynik meczu A – B?', '1:0', ['A', 'B']),
  q('m2', 'match_winner', 'Kto wygrał C – D?', 'C', ['C', 'D']),
  q('s1', 'season_points', 'Ile punktów miał Klub E?', '40', ['Klub E']),
  q('p1', 'player_season_goals', 'Ile goli strzelił Adam Nowak?', '8', ['Klub F']),
  q('l1', 'starting_xi_player', 'Kto wyszedł w składzie Klubu G?', 'Piotr Kowal', ['Klub G']),
  q('r1', 'longest_winning_streak', 'Najdłuższa seria Klubu H?', '5', ['Klub H']),
  q('t1', 'round_number', 'W której kolejce Klub I grał z Klubem J?', '7', ['Klub I', 'Klub J']),
  q('c1', 'social_mvp', 'Kto był bohaterem relacji Klubu K?', 'Tomasz Lis', ['Klub K']),
];
const rotated = core.buildQuestionPool(categories, 7, { random:() => 0 });
const firstCategories = rotated.slice(0, 6).map(item => core.categoryForType(item.type));
assert.equal(
  new Set(firstCategories).size,
  6,
  'with enough variety, the engine should rotate categories before repeating them',
);

const recent = [
  core.historyEntry(sameMatchWinner),
  core.historyEntry(samePlayerGoals),
];
const replayPool = core.buildQuestionPool(
  [sameMatchWinner, unrelatedSeason, samePlayerClub, unrelatedPlayer],
  3,
  { history:recent, random:() => 0 },
);
assert.notEqual(replayPool[0].id, 'match-winner', 'recent exact question should not lead a replay');
assert.notEqual(replayPool[0].id, 'player-club', 'recent player subject should not lead a replay if alternatives exist');

let history = [];
for (let index = 0; index < 40; index += 1) {
  history = core.appendHistory(history, q(
    'history-' + index,
    'season_points',
    'Ile punktów zdobył Klub ' + index + '?',
    String(index),
    ['Klub ' + index],
  ));
}
assert.equal(history.length, 30);
assert.equal(history[0].id, 'history-10');
assert.equal(history.at(-1).id, 'history-39');

const indexHtml = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
assert.match(indexHtml, /smart-question-engine-core\.js/);
assert.ok(
  indexHtml.indexOf('smart-question-engine-core.js') < indexHtml.indexOf('app.js'),
  'smart question core must load before app.js',
);
assert.match(app, /SMART_QUESTION_HISTORY_KEY/);
assert.match(app, /buildQuestionPool/);
assert.match(app, /rememberSmartQuestion\(q\)/);
assert.match(app, /smartQuestionHistory/);
assert.doesNotMatch(
  app,
  /const matching = shuffle\(state\.all\.filter/,
  'base game must no longer pick the first items from a plain shuffled pool',
);

console.log('Smart question engine smoke: OK');
