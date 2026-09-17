import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/match-commentator-core.js');

assert.equal(core.scoreText(2, 1), '2:1');
assert.equal(core.zoneLabel(4), 'polu karnym rywala');
assert.equal(core.intensity({ minute:84, playerGoalsAfter:1, opponentGoalsAfter:1 }), 'late_close');
assert.equal(core.intensity({ minute:30, playerGoalsAfter:0, opponentGoalsAfter:0, rivalryType:'derby' }), 'derby');

const opening = core.openingLine({ rivalryType:'derby', opponentClub:'Tempo Rzeszotary' });
assert.match(opening, /Derby/);
assert.match(opening, /Tempo Rzeszotary/);

const decision = core.decisionLine({ actionLabel:'Prostopadła piłka', possession:'player' });
assert.match(decision, /Prostopadła piłka/);
assert.match(decision, /Wiedza/);

const goal = core.outcomeLine({
  minute:71,
  actionLabel:'Strzał po ziemi',
  success:true,
  knowledgeCorrect:true,
  playerGoalsBefore:1,
  playerGoalsAfter:2,
  opponentGoalsBefore:1,
  opponentGoalsAfter:1,
  possessionBefore:'player',
  zoneAfter:2,
  playerName:'Jan Testowy',
});
assert.match(goal, /2:1/);
assert.match(goal, /(GOOOL|trafienie|siatce)/i);

const conceded = core.outcomeLine({
  minute:55,
  actionLabel:'Wślizg ostatniej szansy',
  success:false,
  knowledgeCorrect:false,
  playerGoalsBefore:0,
  playerGoalsAfter:0,
  opponentGoalsBefore:0,
  opponentGoalsAfter:1,
  possessionBefore:'opponent',
  zoneAfter:2,
});
assert.match(conceded, /0:1/);
assert.match(conceded, /(Gol|bramki|wpada)/i);

const correctButFailed = core.outcomeLine({
  minute:34,
  actionLabel:'Długa piłka',
  success:false,
  knowledgeCorrect:true,
  playerGoalsBefore:0,
  playerGoalsAfter:0,
  opponentGoalsBefore:0,
  opponentGoalsAfter:0,
  possessionBefore:'player',
  zoneAfter:2,
});
assert.match(correctButFailed, /(Wiedza|odpowiedź|Test zdany)/i);

assert.match(core.finishLine({ playerGoals:3, opponentGoals:1 }), /3:1/);
assert.match(core.finishLine({ playerGoals:1, opponentGoals:2 }), /1:2/);
assert.match(core.finishLine({ playerGoals:2, opponentGoals:2 }), /2:2/);

const index = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
assert.match(index, /class="toolbar game-setup readable-setup"/);
assert.match(index, /id="match-settings" class="match-settings"/);
assert.match(index, /id="match-settings-summary"/);
assert.ok(index.indexOf('match-commentator-core.js') < index.indexOf('match-commentator.js'));
assert.ok(index.indexOf('match-commentator.js') < index.indexOf('readability.js'));
assert.match(index, /readability\.css/);

const readability = fs.readFileSync(new URL('../web/readability.css', import.meta.url), 'utf8');
assert.match(readability, /--ui-dark-text:\s*#f8fafc/);
assert.match(readability, /\.rpg-context-drawer/);
assert.match(readability, /\.rpg-scenario-hud \.scenario-rule \{ display: none; \}/);
assert.match(readability, /\.rpg-commentator/);

console.log('Match commentator + readability smoke: OK');
