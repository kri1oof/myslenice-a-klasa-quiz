import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const core = require('../web/president-mode-core.js');
const runtime = fs.readFileSync(new URL('../web/president-mode.js', import.meta.url), 'utf8');
const achievementBridge = fs.readFileSync(new URL('../web/president-achievements-bridge.js', import.meta.url), 'utf8');

assert.equal(core.DECISIONS.length, 34, 'president v3 should provide more club issues than a full A-class season');
assert.equal(new Set(core.DECISIONS.map(item => item.id)).size, 34, 'decision ids must be unique');
assert.equal(core.STRATEGIES.length, 3, 'president v3 should offer three board strategies');
assert.deepEqual(Object.keys(core.UPGRADE_META), ['squad','staff','academy','facilities','organization','community']);
assert.ok(core.DECISIONS.every(item => Array.isArray(item.choices) && item.choices.length === 3), 'every decision should have three choices');
assert.ok(core.DECISIONS.every(item => item.choices.every(choice => !('match' in (choice.effect || {})))), 'president decisions must not contain in-match action bonuses');

const categories = new Set(core.DECISIONS.map(item => item.category));
for (const category of ['finance','staff','squad','academy','facilities','organization','community']) {
  assert.ok(categories.has(category), `missing president category: ${category}`);
}

const initial = core.initialState(26, () => 0.42);
assert.equal(initial.budget, 12000);
assert.equal(initial.recurring, 0);
assert.deepEqual(initial.trust, { players:55, coach:55, supporters:50, sponsors:50 });
assert.deepEqual(initial.areas, { squad:55, staff:55, academy:45, facilities:45, organization:55, community:50 });
assert.equal(initial.order.length, 34);
assert.equal(new Set(initial.order).size, 34);
assert.equal(initial.strategy, null);
assert.equal(initial.careerYear, 1);
assert.equal(initial.seasonsCompleted, 0);
assert.deepEqual(initial.seasonHistory, []);
assert.equal(initial.offseason, null);
assert.deepEqual(initial.offseasonHistory, []);
assert.deepEqual(initial.transferRoster, []);
assert.deepEqual(initial.transferHistory, []);
assert.deepEqual(initial.upgradeLevels, { squad:0, staff:0, academy:0, facilities:0, organization:0, community:0 });
assert.equal(initial.lastUpgradeRound, -99);
assert.equal('currentMatchEffect' in initial, false, 'president mode must not keep an in-match president modifier');

const strategy = core.chooseStrategy(initial, 'promotion');
assert.equal(strategy.ok, true);
assert.equal(strategy.profile.strategy, 'promotion');
assert.equal(strategy.profile.budget, 9800);
assert.equal(strategy.profile.recurring, -80);
assert.equal(strategy.profile.areas.squad, 62);
assert.equal(strategy.profile.trust.coach, 60);
assert.equal(strategy.profile.history[0].type, 'strategy');
assert.equal(core.boardTargetPosition(strategy.profile, 14), 3);

assert.equal(core.canUpgrade(strategy.profile, 'squad', 0), true);
const investment = core.buyUpgrade(strategy.profile, 'squad', 0);
assert.equal(investment.ok, true);
assert.equal(investment.profile.upgradeLevels.squad, 1);
assert.equal(investment.profile.areas.squad, 66);
assert.equal(investment.profile.budget, 9100);
assert.equal(core.canUpgrade(investment.profile, 'staff', 1), false, 'investment cooldown should block consecutive upgrades');
assert.equal(core.canUpgrade(investment.profile, 'staff', 3), true, 'investment should reopen after three rounds');

const sponsor = core.decisionById('shirt_sponsor');
assert.ok(sponsor);
const applied = core.applyChoice(initial, sponsor, 0, 0);
assert.equal(applied.ok, true);
assert.equal(applied.profile.budget, 16200);
assert.equal(applied.profile.recurring, 220);
assert.equal(applied.profile.trust.sponsors, 58);
assert.equal(applied.profile.areas.community, 53);
assert.equal(applied.profile.history.length, 1);
assert.equal(applied.profile.history[0].category, 'finance');
assert.equal(applied.profile.usedIds.includes('shirt_sponsor'), true);
assert.notEqual(core.pickDecision(applied.profile, 1)?.id, 'shirt_sponsor', 'fresh decisions should be preferred');

const broke = { ...initial, budget:100 };
const expensive = core.decisionById('pitch_renovation');
assert.equal(core.canChoose(broke, expensive.choices[0]), false);
assert.deepEqual(core.applyChoice(broke, expensive, 0, 0), { ok:false, reason:'budget' });
assert.equal(core.canChoose(broke, expensive.choices[2]), true, 'free fallback should keep the decision playable');

const healthy = {
  ...initial,
  areas:{ squad:80, staff:80, academy:70, facilities:70, organization:75, community:65 },
  trust:{ players:75, coach:75, supporters:60, sponsors:60 },
};
const struggling = {
  ...initial,
  areas:{ squad:25, staff:25, academy:30, facilities:30, organization:25, community:35 },
  trust:{ players:30, coach:30, supporters:40, sponsors:40 },
};
assert.ok(core.managementStrengthModifier(healthy) > 0);
assert.ok(core.managementStrengthModifier(struggling) < 0);
assert.ok(core.managementStrengthModifier(healthy) <= 5);
assert.ok(core.managementStrengthModifier(struggling) >= -5);
assert.ok(core.adjustedClubStrength(65, healthy) > 65);
assert.ok(core.adjustedClubStrength(65, struggling) < 65);

const sponsorProfile = applied.profile;
const homeWinFinance = core.roundFinance(sponsorProfile, { venue:'DOM', result:'W' });
const awayLossFinance = core.roundFinance(sponsorProfile, { venue:'WYJAZD', result:'L' });
assert.ok(homeWinFinance > awayLossFinance, 'home/win background economics should differ from away/loss');

const afterWin = core.applyPostRound(sponsorProfile, {
  venue:'DOM', result:'W', match:{ home:'A', away:'B', homeGoals:2, awayGoals:1 },
});
assert.equal(afterWin.roundsCompleted, 1);
assert.equal(afterWin.lastResult, 'W');
assert.equal(afterWin.lastMatch.homeGoals, 2);
assert.equal(afterWin.budget, sponsorProfile.budget + homeWinFinance);
assert.equal(afterWin.trust.supporters, sponsorProfile.trust.supporters + 2);

assert.equal(core.averageTrust(initial), 53);
assert.equal(core.averageAreas(initial), 51);
assert.equal(core.trustLabel(80), 'bardzo wysokie');
assert.equal(core.areaLabel(65), 'mocne');
assert.equal(core.financeLabel({ budget:-1 }), 'zadłużenie');
assert.match(core.money(12000), /12.*000.*zł/);
assert.ok(core.boardConfidence(healthy, { position:2, teamCount:14 }) > core.boardConfidence(struggling, { position:12, teamCount:14 }));
assert.equal(core.boardLabel(85), 'pełne poparcie');
assert.ok(core.managementWarnings({ ...struggling, budget:500 }, { position:14, teamCount:14 }).length >= 2);
assert.equal(core.competitionByLevel(1).label, 'A klasa Myślenice');
const promotion = core.competitionMovement({ level:1, position:1, teamCount:14 });
assert.equal(promotion.code, 'promotion');
assert.equal(promotion.toLevel, 2);
assert.equal(promotion.toLabel, 'Liga okręgowa');
assert.match(core.competitionMovementLabel(promotion), /Awans/);
const relegation = core.competitionMovement({ level:1, position:14, teamCount:14 });
assert.equal(relegation.code, 'relegation');
assert.equal(relegation.toLevel, 0);
assert.equal(relegation.toLabel, 'B klasa');
const survival = core.competitionMovement({ level:1, position:8, teamCount:14 });
assert.equal(survival.code, 'stay');
assert.equal(survival.toLevel, 1);

const completed = core.completeSeason(strategy.profile, {
  season:'2025/26', club:'Clavia', position:1, points:61,
  wins:19, draws:4, losses:3, gf:70, ga:28, target:3, boardConfidence:92,
  competitionLevel:1, competitionLabel:'A klasa Myślenice', teamCount:14,
});
assert.equal(completed.seasonsCompleted, 1);
assert.equal(completed.seasonHistory.length, 1);
assert.equal(completed.seasonHistory[0].verdict, 'champion');
assert.equal(completed.seasonHistory[0].competitionLevel, 1);
assert.equal(completed.seasonHistory[0].movement.code, 'promotion');
assert.equal(completed.seasonHistory[0].movement.toLevel, 2);
assert.equal(core.seasonVerdict({ position:1, target:3 }).label, 'Mistrz ligi');

const offseasonStarted = core.beginOffseason(completed);
assert.equal(offseasonStarted.ok, true);
assert.ok(offseasonStarted.offseason.settlement.performanceBonus > 0);
assert.ok(offseasonStarted.offseason.settlement.maintenanceCost > 0);
assert.equal(
  offseasonStarted.profile.budget,
  completed.budget + offseasonStarted.offseason.settlement.net,
  'annual settlement should affect the summer budget exactly once',
);
const offseasonRepeated = core.beginOffseason(offseasonStarted.profile);
assert.equal(offseasonRepeated.reused, true);
assert.equal(offseasonRepeated.profile.budget, offseasonStarted.profile.budget, 're-rendering offseason must not settle twice');
assert.equal(core.OFFSEASON_PLANS.length, 4);
assert.equal(core.canChooseOffseasonPlan(offseasonStarted.profile, core.offseasonPlanById('reserve')), true);
const summer = core.applyOffseasonPlan(offseasonStarted.profile, 'reserve');
assert.equal(summer.ok, true);
assert.equal(summer.profile.offseason.planId, 'reserve');
assert.equal(summer.profile.offseasonHistory.length, 1);
assert.equal(core.applyOffseasonPlan(summer.profile, 'community').reason, 'already');


const departureCandidate = {
  id:'2025/26|Clavia|lnp:test-departure',
  playerKey:'lnp:test-departure',
  player:'Kluczowy Zawodnik',
  club:'Clavia',
  season:'2025/26',
  archetype:'Lider',
  stats:{ appearances:22, minutes:1850, goals:8 },
  ratings:{ game_rating:82 },
  factualTransition:true,
  observedNextClub:'Tempo',
  observedNextSeason:'2026/27',
};
const departureTerms = core.departureGameTerms(departureCandidate);
assert.ok(departureTerms.retentionCost > 0);
assert.ok(departureTerms.compensation > 0);
assert.equal(core.canResolveDeparture(summer.profile, departureCandidate, 'retain'), true);
assert.equal(core.canSignTransfer(summer.profile, {
  id:'blocked-before-departure',
  playerKey:'lnp:blocked',
}), false, 'incoming market should stay closed until outgoing case is resolved');
const retained = core.resolveDeparture(summer.profile, departureCandidate, 'retain');
assert.equal(retained.ok, true);
assert.equal(retained.profile.offseason.departureResolved, true);
assert.equal(retained.profile.departureHistory.length, 1);
assert.equal(retained.profile.departureHistory[0].outcome, 'retain');
assert.equal(retained.profile.budget, summer.profile.budget - departureTerms.retentionCost);
assert.equal(retained.profile.recurring, summer.profile.recurring - departureTerms.retentionRecurring);
assert.ok(retained.profile.areas.squad > summer.profile.areas.squad);

const marketCandidate = {
  id:'2025/26|Tempo|lnp:test-transfer',
  playerKey:'lnp:test-transfer',
  player:'Testowy Zawodnik',
  club:'Tempo',
  season:'2025/26',
  archetype:'Lider',
  stats:{ appearances:20, minutes:1700, goals:7 },
  ratings:{ game_rating:78 },
};
const transferTerms = core.transferGameTerms(marketCandidate);
assert.ok(transferTerms.fee >= 350);
assert.ok(transferTerms.recurring > 0);
assert.ok(transferTerms.squadGain >= 2);
assert.equal(core.canSignTransfer(retained.profile, marketCandidate), true);
const signed = core.signTransfer(retained.profile, marketCandidate);
assert.equal(signed.ok, true);
assert.equal(signed.profile.transferRoster.length, 1);
assert.equal(signed.profile.transferHistory.length, 1);
assert.equal(signed.profile.budget, retained.profile.budget - transferTerms.fee);
assert.equal(signed.profile.recurring, retained.profile.recurring - transferTerms.recurring);
assert.ok(signed.profile.areas.squad > retained.profile.areas.squad);
assert.equal(core.canSignTransfer(signed.profile, marketCandidate), false, 'same player cannot be signed twice');
const closedWindow = core.closeTransferWindow(signed.profile);
assert.equal(closedWindow.ok, true);
assert.equal(closedWindow.profile.offseason.transferWindowClosed, true);
assert.equal(core.canSignTransfer(closedWindow.profile, {
  ...marketCandidate,
  id:'other',
  playerKey:'lnp:other',
}), false, 'closed transfer window must block signings');

const nextSeason = core.prepareNextSeason(closedWindow.profile, 26, () => 0.25);
assert.equal(nextSeason.careerYear, 2);
assert.equal(nextSeason.strategy, null);
assert.equal(nextSeason.budget, closedWindow.profile.budget, 'post-transfer summer budget must carry across seasons');
assert.equal(nextSeason.recurring, closedWindow.profile.recurring, 'contracts and transfer costs must carry across seasons');
assert.deepEqual(nextSeason.upgradeLevels, closedWindow.profile.upgradeLevels, 'investments must carry across seasons');
assert.deepEqual(nextSeason.transferRoster, closedWindow.profile.transferRoster, 'career signings must carry across seasons');
assert.deepEqual(nextSeason.seasonHistory, closedWindow.profile.seasonHistory, 'career history must carry across seasons');
assert.equal(nextSeason.offseason, null, 'the finished offseason should close when the next season starts');
assert.equal(nextSeason.offseasonHistory.length, 1, 'summer decisions should remain in career history');
assert.equal(nextSeason.lastUpgradeRound, -99, 'offseason should clear investment cooldown');
assert.equal(nextSeason.usedIds.length, 0, 'seasonal decision pool should reset');

// Runtime contract: President v3 remains a board-management mode, not Match RPG.
assert.match(runtime, /function simulatePresidentRound/);
assert.match(runtime, /seasonCareerCore\.simulateFixture/);
assert.match(runtime, /bez pytań i decyzji boiskowych/);
assert.match(runtime, /MECZ W TLE/);
assert.match(runtime, /renderPresidentStrategySelection/);
assert.match(runtime, /presidentInvestmentsHtml/);
assert.match(runtime, /presidentSquadProfiles/);
assert.match(runtime, /POPARCIE ZARZĄDU/);
assert.match(runtime, /startNextPresidentSeason/);
assert.match(runtime, /prepareNextSeason/);
assert.match(runtime, /presidentCareerHistoryHtml/);
assert.match(runtime, /presidentCompetitionMovement/);
assert.match(runtime, /presidentSimulatedCompetitionPlan/);
assert.match(runtime, /STATUS LIGOWY/);
assert.match(runtime, /AWANS/);
assert.match(runtime, /SPADEK/);
assert.match(runtime, /Przejdź do lata/);
assert.match(runtime, /renderPresidentOffseason/);
assert.match(runtime, /Lato prezesa/);
assert.match(runtime, /DECYZJA LETNIA/);
assert.match(runtime, /RUCH WYCHODZĄCY/);
assert.match(runtime, /FAKT ŁNP \+ DECYZJA GRY/);
assert.match(runtime, /data-departure-outcome/);
assert.match(runtime, /Zatrzymaj zawodnika/);
assert.match(runtime, /Nie blokuj odejścia/);
assert.match(runtime, /OKNO KADROWE/);
assert.match(runtime, /data-transfer-player/);
assert.match(runtime, /fikcyjną mechaniką tej kariery/);
assert.match(runtime, /Wzmocnienie kariery/);
assert.match(runtime, /alternatywną historię tej kariery/);
assert.match(runtime, /Zamknij okno transferowe/);
assert.match(runtime, /Przejdź do planowania sezonu/);
assert.match(runtime, /SYMULACJA KARIERY/);
assert.doesNotMatch(runtime, /scenarioOdds\s*=/, 'president mode must not alter individual RPG action odds');
assert.doesNotMatch(runtime, /renderActionPanel\s*=/, 'president mode must not inject president decisions into pitch actions');
assert.match(achievementBridge, /recordFinish/);
assert.match(achievementBridge, /rpg:false/);
assert.match(achievementBridge, /president:true/);

console.log('president mode smoke: ok');
