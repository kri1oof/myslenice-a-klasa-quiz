import assert from 'node:assert/strict';

await import('../web/rivalry-matches-core.js');
const core = globalThis.RivalryMatchCore;
assert.ok(core, 'RivalryMatchCore should be exposed');

const questions = [
  ['1','1:0'], ['2','1:1'], ['3','2:1'], ['4','0:0'], ['5','1:2'], ['6','3:1'],
].map(([id, answer]) => ({
  id,
  type:'match_score',
  answer,
  season:'2025/26',
  clubs:['Clavia Świątniki Górne', 'Pasternik Ochojno'],
}));
questions.push({ id:'x', type:'match_winner', answer:'Remis', clubs:['Clavia Świątniki Górne','Pasternik Ochojno'] });
questions.push({ id:'y', type:'match_score', answer:'2:0', season:'2025/26', clubs:['Inny Klub','Pasternik Ochojno'] });

const h2h = core.h2hProfile(questions, 'Clavia Świątniki Górne', 'Pasternik Ochojno');
assert.equal(h2h.matches, 6);
assert.equal(h2h.closeMatches, 5);
assert.equal(h2h.draws, 2);
assert.ok(h2h.closeRate > 0.8);

const rivalry = core.classify(h2h, {
  'Clavia Świątniki Górne': { city:'Świątniki Górne' },
  'Pasternik Ochojno': { city:'Ochojno' },
});
assert.equal(rivalry.id, 'rivalry');
assert.equal(rivalry.pressure, 70);

const derby = core.classify(h2h, {
  'Clavia Świątniki Górne': { city:'Świątniki Górne' },
  'Pasternik Ochojno': { city:'Świątniki Górne' },
});
assert.equal(derby.id, 'derby');
assert.ok(derby.pressure > rivalry.pressure);

const characters = [
  { club:'Clavia Świątniki Górne', season:'2026/27' },
  { club:'Pasternik Ochojno', season:'2026/27' },
  { club:'Pasternik Ochojno', season:'2026/27' },
  { club:'Zielonka Wrząsowice', season:'2026/27' },
  { club:'Górki Myślenice', season:'2025/26' },
];
assert.deepEqual(
  core.opponentPool(characters, 'Clavia Świątniki Górne', '2026/27'),
  ['Pasternik Ochojno', 'Zielonka Wrząsowice'],
);

const latePressure = core.pressureForContext(70, { minute:82, scoreDiff:0, level:'rivalry' });
assert.ok(latePressure > 70);
const correctChance = core.adjustedChance(0.70, {
  pressure:70, minute:75, scoreDiff:0, level:'rivalry', knowledgeCorrect:true, action:{ dc:4 }, possession:'player',
});
const wrongChance = core.adjustedChance(0.70, {
  pressure:70, minute:75, scoreDiff:0, level:'rivalry', knowledgeCorrect:false, action:{ dc:4 }, possession:'player',
});
assert.ok(correctChance > 0.70);
assert.ok(wrongChance < 0.70);

const moments = core.momentCandidates({ minute:78, scoreDiff:0 }, new Set());
assert.ok(moments.some(moment => moment.id === 'late_tension'));
const lateMoment = moments.find(moment => moment.id === 'late_tension');
assert.ok(core.momentModifier(lateMoment, { dc:4 }, true, 'player') > 0);
assert.ok(core.momentModifier(lateMoment, { dc:4 }, false, 'player') < 0);
assert.equal(core.tickMoment({ ...lateMoment, actionsLeft:1 }), null);

const afterConceding = core.updatePressure(70, { conceded:true, actionFailed:true, minute:80, scoreDiff:-1 });
assert.ok(afterConceding > 70);
assert.ok(core.adjustedChance(0.96, {
  pressure:90, minute:88, scoreDiff:0, level:'derby', knowledgeCorrect:true, action:{ dc:5 }, possession:'player',
}) <= 0.97);

console.log('Rivalry matches smoke: OK');
