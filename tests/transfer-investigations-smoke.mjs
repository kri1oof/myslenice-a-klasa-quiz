import assert from 'node:assert/strict';

await import('../web/transfer-investigations-core.js');
const core = globalThis.TransferInvestigationCore;
assert.ok(core, 'TransferInvestigationCore should be exposed');

const p = (id, player, club, season, confidence = 1) => ({
  id: `${season}|${club}|${id}`,
  player,
  club,
  season,
  confidence,
  sources: [`https://example.test/${id}/${season}/${club}`],
});

const profiles = [
  p('lnp:a', 'Adam Transfer', 'Clavia', '2025/26'),
  p('lnp:a', 'Adam Transfer', 'Tempo', '2026/27', 0.95),
  p('lnp:b', 'Bartek Stały', 'Pasternik', '2025/26'),
  p('lnp:b', 'Bartek Stały', 'Pasternik', '2026/27'),
  p('lnp:c', 'Celina Ruch', 'Zielonka', '2025/26'),
  p('lnp:c', 'Celina Ruch', 'Beskid', '2026/27'),
  // Ambiguous: two clubs in the same season, so direction must not be inferred.
  p('lnp:d', 'Darek Ambiguous', 'A', '2025/26'),
  p('lnp:d', 'Darek Ambiguous', 'B', '2025/26'),
  p('lnp:d', 'Darek Ambiguous', 'C', '2026/27'),
  // Non-stable fallback id is intentionally rejected.
  p('name:jan-kowalski', 'Jan Bez Id', 'Old', '2025/26'),
  p('name:jan-kowalski', 'Jan Bez Id', 'New', '2026/27'),
  // Extra clubs provide realistic distractors.
  p('lnp:e', 'Ewa', 'Orzeł', '2025/26'),
  p('lnp:e', 'Ewa', 'Orzeł', '2026/27'),
  p('lnp:f', 'Filip', 'Sokół', '2025/26'),
  p('lnp:f', 'Filip', 'Sokół', '2026/27'),
  p('lnp:g', 'Gabi', 'Iskra', '2025/26'),
  p('lnp:g', 'Gabi', 'Iskra', '2026/27'),
];

assert.equal(core.stablePlayerKey(profiles[0]), 'lnp:a');
assert.equal(core.stablePlayerKey(profiles.find(x => x.player === 'Jan Bez Id')), null);

const transitions = core.detectTransitions(profiles);
assert.equal(transitions.length, 2);
assert.deepEqual(
  transitions.map(t => [t.player, t.fromClub, t.toClub]),
  [
    ['Adam Transfer', 'Clavia', 'Tempo'],
    ['Celina Ruch', 'Zielonka', 'Beskid'],
  ],
);
assert.equal(transitions[0].confidence, 0.95);
assert.ok(transitions[0].sources.length >= 2);

assert.equal(core.filterTransitions(transitions, { club: 'Tempo' }).length, 1);
assert.equal(core.filterTransitions(transitions, { club: 'Clavia' }).length, 1);
assert.equal(core.filterTransitions(transitions, { club: 'Pasternik' }).length, 0);
assert.equal(core.filterTransitions(transitions, { seasons: ['2026/27'] }).length, 2);
assert.equal(core.filterTransitions(transitions, { seasons: ['2024/25'] }).length, 0);

const questions = core.buildQuestions(profiles);
assert.equal(questions.length, 6, 'three investigation variants per certain transition');
assert.ok(questions.every(q => q.special?.kind === 'transfer'));
assert.ok(questions.every(q => q.options.includes(q.answer)));
assert.ok(questions.every(q => q.options.length >= 2));
assert.ok(questions.every(q => q.sources.length >= 2));

const fromQuestion = questions.find(q => q.id.includes('transfer:from:lnp:a'));
assert.ok(fromQuestion);
assert.equal(fromQuestion.answer, 'Clavia');
assert.ok(fromQuestion.question.includes('Tempo'));
assert.deepEqual(fromQuestion.transferSeasons, ['2025/26', '2026/27']);

const toQuestion = questions.find(q => q.id.includes('transfer:to:lnp:a'));
assert.equal(toQuestion.answer, 'Tempo');

const routeQuestion = questions.find(q => q.id.includes('transfer:route:lnp:a'));
assert.equal(routeQuestion.answer, 'Clavia → Tempo');

const clubQuestions = core.buildQuestions(profiles, { club: 'Zielonka' });
assert.equal(clubQuestions.length, 3);
assert.ok(clubQuestions.every(q => q.special.player === 'Celina Ruch'));

assert.equal(core.questionMatchesSelectedSeasons(fromQuestion, ['2025/26']), true);
assert.equal(core.questionMatchesSelectedSeasons(fromQuestion, ['2026/27']), true);
assert.equal(core.questionMatchesSelectedSeasons(fromQuestion, ['2024/25']), false);

console.log('Transfer investigations smoke: OK');
