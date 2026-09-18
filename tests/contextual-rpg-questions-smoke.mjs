import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/match-question-context-core.js');

function q(id, type, difficulty = 3) {
  return {
    id,
    type,
    difficulty,
    question:id,
    answer:'A',
    options:['A','B','C','D'],
    clubs:['Club'],
    season:'2025/26',
  };
}

assert.equal(core.profileForContext({ situationId:'penalty', actionKind:'arcade_penalty', minute:61 }).id, 'penalty');
assert.equal(core.profileForContext({ situationId:'corner', setPieceType:'corner', minute:22 }).id, 'set_piece');
assert.equal(core.profileForContext({ situationId:'late_drama_attack', actionKind:'shot', minute:87 }).id, 'late_game');
assert.equal(core.profileForContext({ situationId:'late_drama_defend', actionKind:'danger_block', minute:88 }).id, 'late_game');
assert.equal(core.profileForContext({ actionKind:'substitution', minute:55 }).id, 'substitution');
assert.equal(core.profileForContext({ situationId:'opponent_break', actionKind:'defend_tackle', minute:44 }).id, 'defence');
assert.equal(core.profileForContext({ situationId:'opening_build', actionKind:'advance', minute:6 }).id, 'build_up');

const penaltyQuestions = [
  q('season', 'season_points', 3),
  q('scorer', 'player_season_goals', 3),
  q('score', 'match_score', 3),
];
const penaltyPick = core.chooseQuestion(
  penaltyQuestions,
  { situationId:'penalty', actionKind:'arcade_penalty', minute:61, dc:3 },
  { targetDifficulty:3 },
);
assert.equal(penaltyPick.question.id, 'scorer');
assert.equal(penaltyPick.contextual, true);
assert.equal(penaltyPick.profile.id, 'penalty');
assert.ok(penaltyPick.contextBoost >= 10);

const lateQuestions = [
  q('captain', 'match_captain', 4),
  q('late-score', 'match_score', 4),
  q('standings', 'season_position', 4),
];
const latePick = core.chooseQuestion(
  lateQuestions,
  { situationId:'late_drama_attack', actionKind:'shot', minute:87, dc:4 },
  { targetDifficulty:4 },
);
assert.equal(latePick.question.id, 'late-score');
assert.equal(latePick.profile.id, 'late_game');

const substitutionQuestions = [
  q('points', 'season_points', 3),
  q('bench', 'substitution_player', 3),
  q('starter', 'starting_xi_player', 3),
];
const subPick = core.chooseQuestion(
  substitutionQuestions,
  { actionKind:'substitution', minute:65, dc:3 },
  { targetDifficulty:3 },
);
assert.ok(['bench','starter'].includes(subPick.question.id));
assert.equal(subPick.profile.id, 'substitution');

const difficultySafety = core.chooseQuestion(
  [
    q('too-easy-context', 'player_season_goals', 1),
    q('right-level-generic', 'season_points', 5),
  ],
  { situationId:'penalty', actionKind:'arcade_penalty', minute:70, dc:5 },
  { targetDifficulty:5 },
);
assert.equal(
  difficultySafety.question.id,
  'right-level-generic',
  'context should prefer, not force, a wildly wrong difficulty',
);

const defencePick = core.chooseQuestion(
  [
    q('card', 'lnp_match_card', 3),
    q('record', 'longest_winning_streak', 3),
  ],
  { situationId:'opponent_break', actionKind:'defend_tackle', minute:39, dc:3 },
  { targetDifficulty:3 },
);
assert.equal(defencePick.question.id, 'card');

const repeatedCategory = core.rankQuestions(
  [q('lineup','starting_xi_player',3), q('player','player_season_goals',3)],
  { situationId:'opening_build', actionKind:'advance', minute:8, dc:3 },
  { targetDifficulty:3, lastCategory:'sklady' },
);
assert.equal(repeatedCategory[0].question.id, 'player', 'recent category should lose some priority when alternatives fit');

const index = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const rpg = fs.readFileSync(new URL('../web/match-rpg.js', import.meta.url), 'utf8');
const scenarios = fs.readFileSync(new URL('../web/match-scenarios.js', import.meta.url), 'utf8');

assert.match(index, /match-question-context-core\.js/);
assert.ok(
  index.indexOf('match-question-context-core.js') < index.indexOf('match-rpg.js'),
  'context scorer must load before match-rpg runtime',
);
assert.match(rpg, /MatchQuestionContextCore/);
assert.match(rpg, /rpgQuestionContext/);
assert.match(rpg, /smartPick\(candidates, shortlistSize/);
assert.match(rpg, /chooseQuestion\(shortlist, context/);
assert.match(rpg, /contextLabel/);
assert.match(rpg, /dopasowane pytania/);
assert.match(scenarios, /contextLabel/);

console.log('Contextual RPG questions smoke: OK');
