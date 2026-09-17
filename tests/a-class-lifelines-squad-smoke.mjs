import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/question-sanity-core.js');

assert.equal(core.SQUAD_MIN, 11);
assert.equal(core.SQUAD_MAX, 20);
assert.equal(core.isMatchSquadSizeQuestion({ type:'match_squad_size', question:'x' }), true);
assert.equal(core.isMatchSquadSizeQuestion({ type:'other', question:'Ile liczyła kadra na mecz z Tempem?' }), true);
assert.equal(core.isMatchSquadSizeQuestion({ type:'match_total_goals', question:'Ile bramek padło w meczu?' }), false);

for (const answer of [11, 12, 15, 19, 20]) {
  const options = core.plausibleSquadOptions(answer, `seed-${answer}`);
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.ok(options.includes(String(answer)));
  options.forEach(option => {
    const value = Number(option);
    assert.ok(value >= 11 && value <= 20, `${option} must be inside 11–20`);
  });
}

const normalized = core.normalizeQuestion({
  id:'squad-test',
  type:'match_squad_size',
  question:'Ile liczyła kadra na mecz z X?',
  answer:'17',
  options:['8', '17', '22', '25'],
});
assert.equal(normalized.answer, '17');
assert.ok(normalized.options.every(value => Number(value) >= 11 && Number(value) <= 20));
assert.ok(normalized.options.includes('17'));

assert.equal(core.normalizeQuestion({
  type:'match_squad_size',
  question:'Ile liczyła kadra na mecz z X?',
  answer:'23',
  options:['17', '18', '19', '23'],
}), null, 'invalid squad-count questions should be removed rather than show impossible ranges');

const lifelines = fs.readFileSync(new URL('../web/a-class-lifelines.js', import.meta.url), 'utf8');
assert.match(lifelines, /A-klasowe koła ratunkowe/);
assert.match(lifelines, /Kibic za bramką/);
assert.match(lifelines, /Kierownik drużyny/);
assert.match(lifelines, /insertAdjacentElement\('beforebegin', tools\)/);
assert.match(lifelines, /normalizeQuestions/);

const css = fs.readFileSync(new URL('../web/a-class-lifelines.css', import.meta.url), 'utf8');
assert.match(css, /border:\s*2px solid #16a34a/);
assert.match(css, /\.rpg-lifelines \.rpg-tool\.rpg-lifeline-card/);

const index = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
assert.ok(index.indexOf('question-sanity-core.js') < index.indexOf('app.js'));
assert.ok(index.indexOf('ux-polish.js') < index.indexOf('a-class-lifelines.js'));
assert.match(index, /a-class-lifelines\.css/);

console.log('A-class lifelines + squad range smoke: OK');