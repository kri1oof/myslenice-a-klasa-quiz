import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../web/fact-card-core.js');

const cardQuestion = {
  id:'card-1',
  type:'lnp_match_card',
  difficulty:5,
  question:'Jaką kartkę otrzymał Jan Kowalski w meczu Clavia Świątniki Górne – Tempo Rzeszotary?',
  answer:'Żółtą',
  options:['Żółtą','Czerwoną'],
  explanation:'Oficjalny protokół ŁNP zapisuje: żółtą w 63. minucie.',
  season:'2025/26',
  clubs:['Clavia Świątniki Górne','Tempo Rzeszotary'],
  sources:['https://www.laczynaspilka.pl/mecz/abc-123'],
};

const correct = core.buildFactCard(cardQuestion, {
  correct:true,
  typeLabel:'Kartka w meczu',
});
assert.equal(correct.status, 'correct');
assert.equal(correct.statusLabel, 'Dobra odpowiedź');
assert.equal(correct.answer, 'Żółtą');
assert.equal(correct.explanation, cardQuestion.explanation);
assert.ok(correct.highlights.includes('63. minuta'));
assert.ok(correct.metadata.some(item => item.label === 'Sezon 2025/26'));
assert.ok(correct.metadata.some(item => item.label === 'Clavia Świątniki Górne'));
assert.ok(correct.metadata.some(item => item.label === 'Tempo Rzeszotary'));
assert.ok(correct.metadata.some(item => item.label === 'Kartka w meczu'));
assert.ok(correct.metadata.some(item => item.label === 'Poziom 5/5'));
assert.equal(correct.sources[0].label, 'Łączy Nas Piłka');

const wrong = core.buildFactCard(cardQuestion, { correct:false });
assert.equal(wrong.status, 'wrong');
assert.equal(wrong.statusLabel, 'Nie tym razem');
assert.equal(wrong.answer, 'Żółtą');

const matchQuestion = {
  type:'match_score',
  difficulty:2,
  question:'Jaki był wynik meczu?',
  answer:'3:1',
  explanation:'Mecz w 24. kolejce zakończył się wynikiem 3:1 w dniu 12.05.2024.',
  season:'2023/24',
  clubs:['A','B'],
  sources:[
    'http://www.90minut.pl/mecz.php?id=1',
    'https://club.futbolowo.pl/game/1',
    'https://myslenice.malopolskizpn.pl/news/test',
  ],
};
const matchCard = core.buildFactCard(matchQuestion, { correct:true, typeLabel:'Dokładny wynik meczu' });
assert.ok(matchCard.highlights.includes('24. kolejka'));
assert.ok(matchCard.highlights.includes('3:1'));
assert.ok(matchCard.highlights.includes('12.05.2024'));
assert.deepEqual(matchCard.sources.map(source => source.label), ['90minut.pl','Futbolowo','MZPN']);

const noInventing = core.buildFactCard({
  type:'player_season_goals',
  difficulty:3,
  question:'Ile goli strzelił Adam Nowak?',
  answer:'7',
  explanation:'Adam Nowak zdobył 7 bramek.',
  season:'2024/25',
  clubs:['Klub'],
  sources:[],
}, { correct:true });
assert.deepEqual(noInventing.highlights, [], 'card must not invent minute/date/round context');
assert.equal(noInventing.explanation, 'Adam Nowak zdobył 7 bramek.');

assert.equal(core.sourceLabel('https://www.laczynaspilka.pl/test'), 'Łączy Nas Piłka');
assert.equal(core.sourceLabel('https://example.com/a'), 'example.com');
assert.equal(core.sourceLabel('not a url'), 'Źródło');

const index = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

assert.match(index, /fact-card-core\.js/);
assert.ok(
  index.indexOf('fact-card-core.js') < index.indexOf('app.js'),
  'fact card core must load before app.js',
);
assert.match(app, /renderFactCard\(q, isCorrect\)/);
assert.match(app, /renderSourceBox/);
assert.match(app, /Źródło faktu/);
assert.match(app, /factCardCore\.buildFactCard/);
assert.doesNotMatch(
  app,
  /factual\.textContent = q\.explanation/,
  'plain one-line feedback should be replaced by the fact card',
);
assert.match(styles, /\.fact-card-head/);
assert.match(styles, /\.fact-card-highlights/);
assert.match(styles, /\.fact-source-link/);

console.log('Fact card feedback smoke: OK');
