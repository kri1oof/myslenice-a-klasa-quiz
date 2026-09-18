import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const core = require('../web/president-mode-core.js');
const runtime = fs.readFileSync(new URL('../web/president-mode.js', import.meta.url), 'utf8');
const lifecycle = fs.readFileSync(new URL('../web/president-mode-lifecycle.js', import.meta.url), 'utf8');
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
assert.deepEqual(initial.financeLedger, []);
assert.equal(initial.supporterBase, 220);
assert.deepEqual(initial.attendanceHistory, []);
assert.deepEqual(initial.recentResults, []);
assert.equal(initial.reputation, 40);
assert.deepEqual(initial.reputationHistory, []);
assert.equal(core.reputationScore(initial), 40);
assert.equal(core.reputationLabel(initial.reputation), 'rozpoznawalny lokalnie');
assert.deepEqual(initial.contracts, []);
assert.deepEqual(initial.contractHistory, []);
assert.deepEqual(initial.trust, { players:55, coach:55, supporters:50, sponsors:50 });
assert.deepEqual(initial.areas, { squad:55, staff:55, academy:45, facilities:45, organization:55, community:50 });
assert.equal(initial.order.length, 34);
assert.equal(new Set(initial.order).size, 34);
assert.equal(initial.strategy, null);
assert.equal(initial.careerYear, 1);
assert.equal(initial.seasonsCompleted, 0);
assert.deepEqual(initial.seasonHistory, []);
assert.equal(initial.boardMandate, null);
assert.deepEqual(initial.boardMandateHistory, []);
assert.equal(core.BOARD_MANDATES.length, 4);
assert.equal(initial.offseason, null);
assert.deepEqual(initial.offseasonHistory, []);
assert.deepEqual(initial.transferRoster, []);
assert.deepEqual(initial.transferHistory, []);
assert.deepEqual(initial.academyRoster, []);
assert.deepEqual(initial.academyHistory, []);
assert.deepEqual(initial.retainedRoster, []);
assert.deepEqual(initial.playerContractHistory, []);
assert.deepEqual(initial.playerDevelopmentHistory, []);
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

assert.equal(core.canChooseMatchdayPolicy(initial, 'standard'), false, 'matchday policy requires a season strategy first');
assert.equal(core.canChooseMatchdayPolicy(strategy.profile, 'local'), true);
const localPolicyChoice = core.chooseMatchdayPolicy(strategy.profile, 'local');
assert.equal(localPolicyChoice.ok, true);
assert.equal(localPolicyChoice.profile.matchdayPolicy, 'local');
assert.equal(localPolicyChoice.profile.matchdayPolicyHistory.length, 1);
assert.equal(localPolicyChoice.profile.matchdayPolicyHistory[0].policyId, 'local');
assert.equal(localPolicyChoice.profile.trust.supporters, strategy.profile.trust.supporters + 4);
assert.equal(localPolicyChoice.profile.trust.sponsors, strategy.profile.trust.sponsors - 1);
assert.equal(core.canChooseMatchdayPolicy(localPolicyChoice.profile, 'commercial'), false, 'policy is fixed for the whole season');
assert.equal(core.activeMatchdayPolicy({ ...initial, matchdayPolicy:null }).id, 'standard', 'missing legacy policy must fall back neutrally');

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

const infrastructureCrisis = {
  ...initial,
  budget:12000,
  areas:{ squad:85, staff:85, academy:85, facilities:12, organization:85, community:85 },
  trust:{ players:70, coach:70, supporters:70, sponsors:70 },
  usedIds:[],
  history:[],
  order:core.DECISIONS.map(item => item.id),
};
const infrastructureCase = core.pickDecision(infrastructureCrisis, 4);
assert.equal(infrastructureCase.category, 'facilities', 'weak facilities should prioritize infrastructure cases');
assert.match(core.decisionTrigger(infrastructureCrisis, infrastructureCase).label, /obiekt/i);

const cashCrisis = {
  ...initial,
  budget:800,
  areas:{ squad:80, staff:80, academy:80, facilities:80, organization:80, community:80 },
  trust:{ players:60, coach:60, supporters:60, sponsors:50 },
  usedIds:[],
  history:[],
  order:core.DECISIONS.map(item => item.id),
};
assert.equal(core.pickDecision(cashCrisis, 4).category, 'finance', 'low cash should prioritize finance cases');

const dressingRoomCrisis = {
  ...initial,
  budget:12000,
  areas:{ squad:80, staff:80, academy:80, facilities:80, organization:80, community:80 },
  trust:{ players:10, coach:70, supporters:70, sponsors:70 },
  usedIds:[],
  history:[],
  order:core.DECISIONS.map(item => item.id),
};
assert.equal(core.pickDecision(dressingRoomCrisis, 4).id, 'squad_integration');
assert.match(core.decisionTrigger(dressingRoomCrisis, core.decisionById('squad_integration')).label, /szatni/i);

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
const baseAttendance = core.estimateAttendance(sponsorProfile, { venue:'DOM', competitionLevel:1 });
assert.equal(baseAttendance.home, true);
assert.ok(baseAttendance.attendance >= 80);
assert.ok(baseAttendance.attendance <= baseAttendance.capacity);
assert.ok(baseAttendance.matchdayRevenue > 0);
const strongerSupport = {
  ...sponsorProfile,
  supporterBase:450,
  recentResults:['W','W','W','D','W'],
  trust:{ ...sponsorProfile.trust, supporters:80 },
  areas:{ ...sponsorProfile.areas, community:80, facilities:75, organization:75 },
};
const strongerAttendance = core.estimateAttendance(strongerSupport, { venue:'DOM', competitionLevel:2 });
assert.ok(strongerAttendance.attendance > baseAttendance.attendance);
assert.ok(core.attendanceCapacity(strongerSupport, 2) > core.attendanceCapacity(sponsorProfile, 1));
assert.ok(core.supporterBaseDelta(strongerSupport, { result:'W' }, strongerAttendance) > 0);

const localAttendance = core.estimateAttendance(
  { ...strongerSupport, matchdayPolicy:'local' },
  { venue:'DOM', competitionLevel:2 },
);
const standardAttendance = core.estimateAttendance(
  { ...strongerSupport, matchdayPolicy:'standard' },
  { venue:'DOM', competitionLevel:2 },
);
const commercialAttendance = core.estimateAttendance(
  { ...strongerSupport, matchdayPolicy:'commercial' },
  { venue:'DOM', competitionLevel:2 },
);
assert.ok(localAttendance.attendance >= standardAttendance.attendance);
assert.ok(standardAttendance.attendance >= commercialAttendance.attendance);
assert.ok(commercialAttendance.unitYield > standardAttendance.unitYield);
assert.ok(standardAttendance.unitYield > localAttendance.unitYield);
assert.ok(commercialAttendance.operatingCost > localAttendance.operatingCost);
assert.ok(commercialAttendance.matchdayRevenue > localAttendance.matchdayRevenue);
assert.equal(localAttendance.policyLabel, 'Lokalny i dostępny');
assert.equal(commercialAttendance.policyLabel, 'Mocniej komercyjny');
assert.ok(
  core.supporterBaseDelta({ ...strongerSupport, matchdayPolicy:'local' }, { result:'W' }, localAttendance) >
  core.supporterBaseDelta({ ...strongerSupport, matchdayPolicy:'commercial' }, { result:'W' }, commercialAttendance),
);

const awayAttendance = core.estimateAttendance(sponsorProfile, { venue:'WYJAZD', competitionLevel:1 });
assert.equal(awayAttendance.attendance, 0);
assert.equal(awayAttendance.matchdayRevenue, -320);

const homeBreakdown = core.roundFinanceBreakdown(sponsorProfile, { venue:'DOM', result:'W', competitionLevel:1 });
assert.equal(homeBreakdown.total, core.roundFinance(sponsorProfile, { venue:'DOM', result:'W' }));
assert.ok(homeBreakdown.rows.some(row => row.category === 'matchday'));
assert.ok(homeBreakdown.rows.some(row => row.category === 'contracts'));
const homeWinFinance = core.roundFinance(sponsorProfile, { venue:'DOM', result:'W', competitionLevel:1 });
const awayLossFinance = core.roundFinance(sponsorProfile, { venue:'WYJAZD', result:'L', competitionLevel:1 });
assert.ok(homeWinFinance > awayLossFinance, 'home/win background economics should differ from away/loss');

const afterWin = core.applyPostRound(sponsorProfile, {
  venue:'DOM', result:'W', competitionLevel:1, match:{ home:'A', away:'B', homeGoals:2, awayGoals:1 },
});
assert.equal(afterWin.roundsCompleted, 1);
assert.equal(afterWin.lastResult, 'W');
assert.equal(afterWin.lastMatch.homeGoals, 2);
assert.equal(afterWin.budget, sponsorProfile.budget + homeWinFinance);
assert.equal(afterWin.trust.supporters, sponsorProfile.trust.supporters + 2);
assert.ok(afterWin.supporterBase > sponsorProfile.supporterBase);
assert.equal(afterWin.attendanceHistory.length, 1);
assert.equal(afterWin.attendanceHistory[0].home, true);
assert.equal(afterWin.lastAttendance, afterWin.attendanceHistory[0].attendance);
assert.equal(afterWin.recentResults.at(-1), 'W');
assert.ok(afterWin.financeLedger.length >= homeBreakdown.rows.filter(row => row.amount !== 0).length);
const financeSummary = core.financeCategorySummary(afterWin, afterWin.careerYear);
assert.equal(
  Object.values(financeSummary).reduce((sum, value) => sum + value, 0),
  afterWin.financeLedger.filter(entry => entry.careerYear === afterWin.careerYear).reduce((sum, entry) => sum + entry.amount, 0),
);
const afterAway = core.applyPostRound(afterWin, {
  venue:'WYJAZD', result:'L', competitionLevel:1, match:{ home:'B', away:'A', homeGoals:2, awayGoals:0 },
});
assert.equal(afterAway.lastAttendance, afterWin.lastAttendance, 'away round must preserve last home attendance');
assert.equal(afterAway.lastAttendanceCapacity, afterWin.lastAttendanceCapacity);
assert.equal(afterAway.attendanceHistory.length, 2);

assert.equal(core.averageTrust(initial), 53);
assert.equal(core.averageAreas(initial), 51);
assert.equal(core.trustLabel(80), 'bardzo wysokie');
assert.equal(core.areaLabel(65), 'mocne');
assert.equal(core.financeLabel({ budget:-1 }), 'zadłużenie');
assert.match(core.money(12000), /12.*000.*zł/);
assert.ok(core.boardConfidence(healthy, { position:2, teamCount:14 }) > core.boardConfidence(struggling, { position:12, teamCount:14 }));
assert.equal(core.boardLabel(85), 'pełne poparcie');
assert.equal(core.employmentLabel(initial), 'stanowisko bezpieczne');

const mandateChoice = core.chooseBoardMandate(initial, 'promotion_path', { competitionLevel:1 });
assert.equal(mandateChoice.ok, true);
assert.equal(mandateChoice.profile.boardMandate.status, 'active');
assert.equal(mandateChoice.profile.boardMandate.startedCareerYear, 1);
assert.equal(mandateChoice.profile.boardMandate.deadlineCareerYear, 3);
assert.equal(mandateChoice.profile.boardMandate.target.level, 2);
assert.equal(core.canChooseBoardMandate(mandateChoice.profile, 'academy_path'), false);
const openingMandateProgress = core.boardMandateProgress(mandateChoice.profile, { competitionLevel:1, position:6 });
assert.equal(openingMandateProgress.percent, 0);
assert.equal(openingMandateProgress.achieved, false);

const mandateOngoing = core.chooseBoardMandate(initial, 'academy_path', { competitionLevel:1 });
const ongoingSettlement = core.settleBoardMandateSeason(mandateOngoing.profile, {
  careerYear:1,
  competitionLevel:1,
  movement:{ toLevel:1, code:'stay' },
  position:7,
});
assert.equal(ongoingSettlement.outcome, null);
assert.equal(ongoingSettlement.profile.boardMandate.status, 'active');
assert.equal(ongoingSettlement.profile.boardMandateHistory.length, 0);

const financeMandate = core.chooseBoardMandate(
  { ...initial, careerYear:1, budget:5000, recurring:-200 },
  'financial_stability',
  { competitionLevel:1 },
);
const failedMandate = core.settleBoardMandateSeason(
  { ...financeMandate.profile, careerYear:2, budget:7000, recurring:-150 },
  { careerYear:2, competitionLevel:1, movement:{ toLevel:1, code:'stay' }, position:8 },
);
assert.equal(failedMandate.outcome, 'failed');
assert.equal(failedMandate.reputationDelta, -6);
assert.equal(failedMandate.profile.boardMandate.status, 'failed');
assert.equal(failedMandate.profile.boardMandateHistory.length, 1);
assert.equal(failedMandate.profile.jobSecurity.status, 'warning');

const achievedMandate = core.settleBoardMandateSeason(
  { ...mandateChoice.profile, careerYear:1 },
  { careerYear:1, competitionLevel:1, movement:{ toLevel:2, code:'promotion' }, position:1 },
);
assert.equal(achievedMandate.outcome, 'achieved');
assert.equal(achievedMandate.reputationDelta, 6);
assert.equal(achievedMandate.profile.boardMandate.status, 'achieved');
assert.equal(achievedMandate.profile.boardMandateHistory.length, 1);

const highMandateProgress = core.chooseBoardMandate(
  { ...initial, areas:{ ...initial.areas, academy:75 }, academyHistory:[
    { type:'promoted', careerYear:1 },
    { type:'promoted', careerYear:1 },
  ] },
  'academy_path',
  { competitionLevel:1 },
);
assert.ok(core.boardMandateConfidenceModifier(highMandateProgress.profile, { competitionLevel:1 }) > 0);
const sampleOffer = {
  club:'Beskid',
  fromClub:'Clavia',
  competitionLevel:1,
  competitionLabel:'A klasa Myślenice',
  reason:'dismissal',
  simulated:false,
};
const offerTerms = core.jobOfferTerms(sampleOffer);
assert.ok(offerTerms.budget >= 9000);
const switched = core.acceptJobOffer({
  ...mandateChoice.profile,
  budget:25000,
  recurring:-500,
  upgradeLevels:{ squad:3, staff:2, academy:1, facilities:2, organization:1, community:2 },
  transferRoster:[{ id:'x' }],
  departedPlayerKeys:['lnp:x'],
  jobSecurity:{ status:'fired', lowRounds:2, ultimatumRoundsLeft:0, fired:true, reason:'test', history:[] },
}, sampleOffer);
assert.equal(switched.ok, true);
assert.equal(switched.profile.budget, offerTerms.budget);
assert.equal(switched.profile.recurring, 0);
assert.equal(switched.profile.supporterBase, 250);
assert.deepEqual(switched.profile.attendanceHistory, []);
assert.deepEqual(switched.profile.recentResults, []);
assert.deepEqual(switched.profile.transferRoster, []);
assert.deepEqual(switched.profile.departedPlayerKeys, []);
assert.equal(switched.profile.jobSecurity.status, 'secure');
assert.equal(switched.profile.employmentHistory.length, 1);
assert.equal(switched.profile.employmentHistory[0].toClub, 'Beskid');
assert.equal(switched.profile.boardMandate, null);
assert.equal(switched.profile.boardMandateHistory.at(-1).status, 'abandoned');
const pressureBase = {
  ...struggling,
  budget:500,
  jobSecurity:{ status:'secure', lowRounds:0, ultimatumRoundsLeft:0, fired:false, reason:null, history:[] },
};
const warningJob = core.reviewEmployment(pressureBase, { position:14, teamCount:14, round:1 });
assert.equal(warningJob.jobSecurity.status, 'warning');
const ultimatumJob = core.reviewEmployment(warningJob, { position:14, teamCount:14, round:2 });
assert.equal(ultimatumJob.jobSecurity.status, 'ultimatum');
assert.equal(ultimatumJob.jobSecurity.ultimatumRoundsLeft, 3);
const ultimatum2 = core.reviewEmployment(ultimatumJob, { position:14, teamCount:14, round:3 });
const ultimatum1 = core.reviewEmployment(ultimatum2, { position:14, teamCount:14, round:4 });
const firedJob = core.reviewEmployment(ultimatum1, { position:14, teamCount:14, round:5 });
assert.equal(firedJob.jobSecurity.fired, true);
assert.equal(core.employmentLabel(firedJob), 'zwolniony');
assert.equal(firedJob.reputation, pressureBase.reputation - 6);
assert.equal(firedJob.reputationHistory.at(-1).type, 'dismissal');
const recoveredJob = core.reviewEmployment(
  { ...ultimatumJob, budget:12000, trust:{ players:80, coach:80, supporters:80, sponsors:80 }, areas:{ squad:80, staff:80, academy:80, facilities:80, organization:80, community:80 } },
  { position:1, teamCount:14, round:3 },
);
assert.equal(recoveredJob.jobSecurity.status, 'secure');
assert.ok(core.managementWarnings({ ...struggling, budget:500 }, { position:14, teamCount:14 }).length >= 2);
assert.equal(core.competitionByLevel(1).label, 'A klasa Myślenice');
assert.deepEqual(core.jobMarketLevels({ ...initial, reputation:40 }, 1, 'career'), [1]);
assert.deepEqual(core.jobMarketLevels({ ...initial, reputation:60 }, 1, 'career'), [2,1]);
assert.deepEqual(core.jobMarketLevels({ ...initial, reputation:85 }, 1, 'career'), [3,2,1]);
assert.deepEqual(core.jobMarketLevels({ ...initial, reputation:25 }, 1, 'career'), [1,0]);
assert.deepEqual(core.jobMarketLevels({ ...initial, reputation:40 }, 1, 'dismissal'), [1,0]);
assert.deepEqual(core.jobMarketLevels({ ...initial, reputation:80 }, 1, 'dismissal'), [2,1,0]);
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
assert.equal(completed.seasonHistory[0].supporterBaseDelta, 30);
assert.equal(completed.supporterBase, strategy.profile.supporterBase + 30);
assert.ok(completed.reputation > strategy.profile.reputation);
assert.equal(completed.reputationHistory.length, 1);
assert.equal(completed.reputationHistory[0].type, 'season');
assert.ok(completed.seasonHistory[0].reputationDelta > 0);
assert.equal(completed.seasonHistory[0].reputationAfter, completed.reputation);
assert.equal(core.seasonVerdict({ position:1, target:3 }).label, 'Mistrz ligi');

const strategyWithMandate = core.chooseBoardMandate(strategy.profile, 'promotion_path', { competitionLevel:1 });
const completedMandate = core.completeSeason(strategyWithMandate.profile, {
  season:'2025/26', club:'Clavia', position:1, points:61,
  wins:19, draws:4, losses:3, gf:70, ga:28, target:3, boardConfidence:92,
  competitionLevel:1, competitionLabel:'A klasa Myślenice', teamCount:14,
});
assert.equal(completedMandate.boardMandate.status, 'achieved');
assert.equal(completedMandate.seasonHistory[0].mandateOutcome, 'achieved');
assert.equal(
  completedMandate.seasonHistory[0].reputationDelta,
  completed.seasonHistory[0].reputationDelta + 6,
);
assert.ok(completedMandate.reputation > completed.reputation);

const offseasonStarted = core.beginOffseason(completed);
assert.equal(offseasonStarted.ok, true);
assert.ok(offseasonStarted.offseason.settlement.performanceBonus > 0);
assert.ok(offseasonStarted.offseason.settlement.maintenanceCost > 0);
assert.ok(Array.isArray(offseasonStarted.offseason.academyProspects));
assert.ok(offseasonStarted.offseason.academyProspects.length >= 1);
assert.equal(offseasonStarted.offseason.playerContractsResolved, true);
assert.deepEqual(offseasonStarted.offseason.playerContractCases, []);
assert.deepEqual(offseasonStarted.offseason.retirementNotices, []);
assert.equal(offseasonStarted.offseason.academyDecisionResolved, false);
assert.equal(offseasonStarted.offseason.competitionReadinessLevel, 2);
assert.equal(offseasonStarted.offseason.competitionReadinessResolved, false);
assert.equal(core.competitionRequirements(2).facilities, 55);
assert.equal(core.competitionRequirements(2).organization, 55);
const readinessBefore = core.competitionReadiness(offseasonStarted.profile, 2);
assert.equal(readinessBefore.ready, false);
assert.equal(readinessBefore.gaps.facilities, 10);
assert.equal(readinessBefore.gaps.organization, 0);
assert.ok(readinessBefore.upgradeCost > readinessBefore.temporaryCost);
assert.equal(
  offseasonStarted.profile.budget,
  completed.budget + offseasonStarted.offseason.settlement.net,
  'annual settlement should affect the summer budget exactly once',
);
const offseasonRepeated = core.beginOffseason(offseasonStarted.profile);
assert.equal(offseasonRepeated.reused, true);
assert.equal(offseasonRepeated.profile.budget, offseasonStarted.profile.budget, 're-rendering offseason must not settle twice');
assert.equal(core.OFFSEASON_PLANS.length, 4);
assert.equal(core.canChooseOffseasonPlan(offseasonStarted.profile, core.offseasonPlanById('reserve')), false, 'summer planning must wait for competition readiness');

const temporaryReadiness = core.resolveCompetitionReadiness(offseasonStarted.profile, 'temporary');
assert.equal(temporaryReadiness.ok, true);
assert.equal(temporaryReadiness.profile.offseason.competitionReadinessResolved, true);
assert.equal(temporaryReadiness.profile.offseason.competitionReadinessMethod, 'temporary');
assert.equal(temporaryReadiness.profile.areas.facilities, offseasonStarted.profile.areas.facilities);
assert.equal(temporaryReadiness.profile.areas.organization, offseasonStarted.profile.areas.organization);
assert.equal(
  temporaryReadiness.profile.budget,
  offseasonStarted.profile.budget - readinessBefore.temporaryCost,
);

const readinessUpgrade = core.resolveCompetitionReadiness(offseasonStarted.profile, 'upgrade');
assert.equal(readinessUpgrade.ok, true);
assert.equal(readinessUpgrade.profile.offseason.competitionReadinessResolved, true);
assert.equal(readinessUpgrade.profile.offseason.competitionReadinessMethod, 'upgrade');
assert.ok(readinessUpgrade.profile.areas.facilities >= 55);
assert.ok(readinessUpgrade.profile.areas.organization >= 55);
assert.equal(readinessUpgrade.profile.readinessHistory.length, 1);
assert.equal(readinessUpgrade.profile.readinessHistory[0].method, 'upgrade');
assert.equal(
  readinessUpgrade.profile.budget,
  offseasonStarted.profile.budget - readinessBefore.upgradeCost,
);
assert.equal(core.canChooseOffseasonPlan(readinessUpgrade.profile, core.offseasonPlanById('reserve')), true);
const summer = core.applyOffseasonPlan(readinessUpgrade.profile, 'reserve');
assert.equal(summer.ok, true);
assert.equal(summer.profile.offseason.planId, 'reserve');
assert.equal(summer.profile.offseasonHistory.length, 1);
assert.equal(core.applyOffseasonPlan(summer.profile, 'community').reason, 'already');

assert.equal(core.CONTRACT_TEMPLATES.length, 3);
assert.equal(summer.profile.offseason.sponsorDecisionResolved, false);
assert.ok(core.availableContractTemplates(summer.profile).length >= 3);
assert.ok(core.availableContractOffers(summer.profile).length >= 3);

const commercial = core.commercialValue(summer.profile);
assert.ok(commercial.score >= 0 && commercial.score <= 100);
assert.ok(commercial.multiplier >= .75 && commercial.multiplier <= 1.5);
assert.ok(commercial.attendance > 0);
const performanceOffer = core.sponsorOfferTerms(summer.profile, 'performance_partner');
assert.ok(performanceOffer);
assert.equal(performanceOffer.commercialScore, commercial.score);
assert.equal(performanceOffer.commercialMultiplier, commercial.multiplier);

const weakCommercialProfile = {
  ...summer.profile,
  supporterBase:100,
  attendanceHistory:[],
  trust:{ ...summer.profile.trust, sponsors:25, supporters:30 },
  reputation:25,
  areas:{ ...summer.profile.areas, community:30, facilities:40, organization:40 },
};
const strongCommercialProfile = {
  ...summer.profile,
  supporterBase:950,
  attendanceHistory:[
    { home:true, attendance:720 },
    { home:true, attendance:760 },
    { home:true, attendance:800 },
  ],
  trust:{ ...summer.profile.trust, sponsors:85, supporters:85 },
  reputation:80,
  areas:{ ...summer.profile.areas, community:80, facilities:80, organization:80 },
};
const weakCommercial = core.commercialValue(weakCommercialProfile);
const strongCommercial = core.commercialValue(strongCommercialProfile);
assert.ok(strongCommercial.score > weakCommercial.score);
assert.ok(strongCommercial.multiplier > weakCommercial.multiplier);
assert.ok(
  core.sponsorOfferTerms(strongCommercialProfile, 'performance_partner').signingBonus >
  core.sponsorOfferTerms(weakCommercialProfile, 'performance_partner').signingBonus
);
assert.ok(
  core.sponsorOfferTerms(strongCommercialProfile, 'performance_partner').recurring >
  core.sponsorOfferTerms(weakCommercialProfile, 'performance_partner').recurring
);

const sponsorContract = core.acceptSponsorContract(summer.profile, 'performance_partner');
assert.equal(sponsorContract.ok, true);
assert.equal(sponsorContract.profile.contracts.length, 1);
assert.equal(sponsorContract.profile.offseason.sponsorDecisionResolved, true);
assert.equal(sponsorContract.profile.contracts[0].remainingSeasons, 2);
assert.equal(
  sponsorContract.profile.budget,
  summer.profile.budget + performanceOffer.signingBonus,
);
assert.equal(
  sponsorContract.profile.recurring,
  summer.profile.recurring + performanceOffer.recurring,
);
assert.equal(sponsorContract.profile.contracts[0].commercialScore, commercial.score);
assert.equal(sponsorContract.profile.contracts[0].commercialMultiplier, commercial.multiplier);
assert.equal(sponsorContract.profile.contracts[0].signingBonus, performanceOffer.signingBonus);
assert.equal(sponsorContract.profile.contracts[0].recurring, performanceOffer.recurring);
const contractMet = core.processSeasonContracts(sponsorContract.profile, { position:4 });
assert.equal(contractMet.contracts.length, 1);
assert.equal(contractMet.contracts[0].remainingSeasons, 1);
assert.equal(contractMet.recurring, sponsorContract.profile.recurring);
const contractFailed = core.processSeasonContracts(sponsorContract.profile, { position:8 });
assert.equal(contractFailed.contracts.length, 0);
assert.equal(
  contractFailed.recurring,
  sponsorContract.profile.recurring - sponsorContract.profile.contracts[0].recurring,
);
assert.equal(contractFailed.contractHistory.at(-1).endReason, 'condition');

const prospects = sponsorContract.profile.offseason.academyProspects;
assert.ok(prospects.length >= 1);
const firstProspect = prospects[0];
assert.equal(firstProspect.fictional, true);
assert.equal(firstProspect.source, 'career_academy');
assert.ok(firstProspect.ratings.game_rating >= 48);
assert.ok(firstProspect.ratings.potential >= firstProspect.ratings.game_rating);
assert.equal(core.canPromoteAcademyProspect(sponsorContract.profile, firstProspect.id), true);
const promotedAcademy = core.promoteAcademyProspect(sponsorContract.profile, firstProspect.id);
assert.equal(promotedAcademy.ok, true);
assert.equal(promotedAcademy.profile.offseason.academyDecisionResolved, true);
assert.equal(promotedAcademy.profile.academyRoster.length, 1);
assert.equal(promotedAcademy.profile.academyHistory.at(-1).type, 'promoted');
assert.equal(promotedAcademy.profile.academyRoster[0].fictional, true);
assert.equal(promotedAcademy.profile.academyRoster[0].contractYears, 3);
assert.equal(promotedAcademy.profile.academyRoster[0].contractRemaining, 3);
assert.equal(promotedAcademy.profile.academyRoster[0].contractRecurring, firstProspect.recurring);
assert.equal(
  promotedAcademy.profile.budget,
  sponsorContract.profile.budget - firstProspect.developmentCost,
);
assert.equal(
  promotedAcademy.profile.recurring,
  sponsorContract.profile.recurring - firstProspect.recurring,
);

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
assert.equal(core.canResolveDeparture(sponsorContract.profile, departureCandidate, 'retain'), false, 'academy intake must be resolved before outgoing case');
assert.equal(core.canResolveDeparture(promotedAcademy.profile, departureCandidate, 'retain'), true);
assert.equal(core.canSignTransfer(promotedAcademy.profile, {
  id:'blocked-before-departure',
  playerKey:'lnp:blocked',
}), false, 'incoming market should stay closed until outgoing case is resolved');
const retained = core.resolveDeparture(promotedAcademy.profile, departureCandidate, 'retain');
assert.equal(retained.ok, true);
assert.equal(retained.profile.offseason.departureResolved, true);
assert.equal(retained.profile.departureHistory.length, 1);
assert.equal(retained.profile.departureHistory[0].outcome, 'retain');
assert.equal(retained.profile.retainedRoster.length, 1);
assert.equal(retained.profile.retainedRoster[0].playerKey, departureCandidate.playerKey);
assert.equal(retained.profile.retainedRoster[0].contractYears, 2);
assert.equal(retained.profile.retainedRoster[0].contractRemaining, 2);
assert.equal(retained.profile.retainedRoster[0].contractRecurring, departureTerms.retentionRecurring);
assert.equal(retained.profile.budget, promotedAcademy.profile.budget - departureTerms.retentionCost);
assert.equal(retained.profile.recurring, promotedAcademy.profile.recurring - departureTerms.retentionRecurring);
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
assert.equal(signed.profile.transferRoster[0].sourceGameRating, 78);
assert.ok(signed.profile.transferRoster[0].ratings.potential >= 78);
assert.equal(signed.profile.transferRoster[0].contractYears, 2);
assert.equal(signed.profile.transferRoster[0].contractRemaining, 2);
assert.equal(signed.profile.transferRoster[0].contractRecurring, transferTerms.recurring);
assert.equal(marketCandidate.ratings.game_rating, 78, 'source candidate data must remain unchanged');
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
assert.equal(nextSeason.matchdayPolicy, null);
assert.deepEqual(nextSeason.matchdayPolicyHistory, closedWindow.profile.matchdayPolicyHistory || []);
assert.equal(nextSeason.budget, closedWindow.profile.budget, 'post-transfer summer budget must carry across seasons');
assert.equal(nextSeason.recurring, closedWindow.profile.recurring, 'contracts and transfer costs must carry across seasons');
assert.equal(nextSeason.supporterBase, closedWindow.profile.supporterBase, 'supporter base must carry across seasons');
assert.deepEqual(nextSeason.recentResults, [], 'short-term form must reset between seasons');
assert.deepEqual(nextSeason.upgradeLevels, closedWindow.profile.upgradeLevels, 'investments must carry across seasons');
assert.deepEqual(nextSeason.transferRoster, closedWindow.profile.transferRoster, 'career signings must carry across seasons');
assert.deepEqual(nextSeason.academyRoster, closedWindow.profile.academyRoster, 'academy graduates must carry across seasons');
assert.deepEqual(nextSeason.retainedRoster, closedWindow.profile.retainedRoster, 'retained career players must carry across seasons');
assert.equal(nextSeason.transferRoster[0].contractRemaining, 2, 'new transfer contract must not tick down immediately');
assert.equal(nextSeason.academyRoster[0].contractRemaining, 3, 'new academy contract must not tick down immediately');
assert.equal(nextSeason.retainedRoster[0].contractRemaining, 2, 'new retained-player contract must not tick down immediately');
assert.deepEqual(nextSeason.seasonHistory, closedWindow.profile.seasonHistory, 'career history must carry across seasons');
assert.equal(nextSeason.offseason, null, 'the finished offseason should close when the next season starts');
assert.equal(nextSeason.offseasonHistory.length, 1, 'summer decisions should remain in career history');
assert.equal(nextSeason.lastUpgradeRound, -99, 'offseason should clear investment cooldown');
assert.equal(nextSeason.usedIds.length, 0, 'seasonal decision pool should reset');
assert.equal(nextSeason.playerDevelopmentHistory.length, 1);
assert.equal(nextSeason.playerDevelopmentHistory[0].targetCareerYear, 2);
assert.equal(nextSeason.playerDevelopmentHistory[0].changes.length, 0, 'new summer arrivals must not develop immediately');

const policyCarryProfile = core.prepareNextSeason(
  {
    ...localPolicyChoice.profile,
    matchdayPolicyHistory:[...localPolicyChoice.profile.matchdayPolicyHistory],
  },
  26,
  () => 0.25,
);
assert.equal(policyCarryProfile.matchdayPolicy, null);
assert.equal(policyCarryProfile.matchdayPolicyHistory.length, 1);
assert.equal(policyCarryProfile.matchdayPolicyHistory[0].policyId, 'local');

const academyBeforeDevelopment = nextSeason.academyRoster[0].ratings.game_rating;
const academyAgeBeforeDevelopment = nextSeason.academyRoster[0].age;
const sourceTransferRating = nextSeason.transferRoster[0].sourceGameRating;
const developedForYear3 = core.developCareerSquad(nextSeason, 3);
assert.equal(developedForYear3.playerDevelopmentHistory.length, 2);
assert.ok(developedForYear3.playerDevelopmentHistory.at(-1).changes.length >= 2);
assert.equal(developedForYear3.academyRoster[0].age, academyAgeBeforeDevelopment + 1);
assert.ok(developedForYear3.academyRoster[0].ratings.game_rating >= academyBeforeDevelopment);
assert.equal(developedForYear3.transferRoster[0].sourceGameRating, sourceTransferRating);
assert.equal(marketCandidate.ratings.game_rating, 78, 'career development must never mutate source ŁNP-like candidate data');
const developedAgain = core.developCareerSquad(developedForYear3, 3);
assert.equal(developedAgain.playerDevelopmentHistory.length, developedForYear3.playerDevelopmentHistory.length, 'same target season must not apply development twice');

const migratedContract = core.normalizeCareerPlayerContract({ player:'Stary zapis', recurring:25 }, 'transfer');
assert.equal(migratedContract.contractYears, 2);
assert.equal(migratedContract.contractRemaining, 2);
assert.equal(migratedContract.__careerContractMigrated, true);

const expiringProfile = {
  ...nextSeason,
  careerYear:3,
  offseason:null,
  academyRoster:[{ ...nextSeason.academyRoster[0], contractRemaining:1, promotedCareerYear:1 }],
  transferRoster:[{ ...nextSeason.transferRoster[0], contractRemaining:1, careerYear:1 }],
  retainedRoster:[{ ...nextSeason.retainedRoster[0], contractRemaining:1, careerYear:1 }],
};
const expiry = core.processCareerPlayerContracts(expiringProfile, { season:'2027/28', careerYear:3 });
assert.equal(expiry.cases.length, 3);
assert.equal(expiry.retirements.length, 0);
assert.ok(expiry.cases.every(item => item.resolved === false));
assert.ok(expiry.profile.academyRoster.every(item => item.contractRemaining === 0));
assert.ok(expiry.profile.transferRoster.every(item => item.contractRemaining === 0));
assert.ok(expiry.profile.retainedRoster.every(item => item.contractRemaining === 0));

let contractDecisionProfile = {
  ...expiry.profile,
  budget:20000,
  offseason:{
    careerYear:3,
    season:'2027/28',
    sponsorDecisionResolved:true,
    playerContractCases:expiry.cases,
    playerContractsResolved:false,
  },
};
const firstExpiry = core.currentCareerPlayerContractCase(contractDecisionProfile);
assert.ok(firstExpiry);
assert.equal(core.canResolveCareerPlayerContract(contractDecisionProfile, firstExpiry.id, 'renew'), true);
const renewedCareerPlayer = core.resolveCareerPlayerContract(contractDecisionProfile, firstExpiry.id, 'renew');
assert.equal(renewedCareerPlayer.ok, true);
assert.equal(renewedCareerPlayer.event.type, 'renewed');
assert.ok(renewedCareerPlayer.event.years >= 1);
assert.equal(renewedCareerPlayer.profile.playerContractHistory.at(-1).type, 'renewed');
const renewedRoster = renewedCareerPlayer.profile[firstExpiry.rosterKey];
const renewedPlayer = renewedRoster.find(player => core.normalizeCareerPlayerContract(player, firstExpiry.kind).contractRemaining > 0);
assert.ok(renewedPlayer);
assert.ok(Number(renewedPlayer.contractRenewals || 0) >= 1);

const secondExpiry = core.currentCareerPlayerContractCase(renewedCareerPlayer.profile);
assert.ok(secondExpiry);
const recurringBeforeRelease = renewedCareerPlayer.profile.recurring;
const releasedCareerPlayer = core.resolveCareerPlayerContract(renewedCareerPlayer.profile, secondExpiry.id, 'release');
assert.equal(releasedCareerPlayer.ok, true);
assert.equal(releasedCareerPlayer.event.type, 'released');
assert.equal(releasedCareerPlayer.profile[secondExpiry.rosterKey].some(player =>
  core.normalizeCareerPlayerContract(player, secondExpiry.kind).contractRemaining === 0 &&
  String(player.player) === String(secondExpiry.player)
), false);
assert.ok(releasedCareerPlayer.profile.recurring > recurringBeforeRelease, 'releasing an expiring career player must free recurring cost');

const oldCareerPlayer = {
  id:'academy:old-veteran',
  player:'Weteran Kariery',
  age:37,
  careerAge:37,
  promotedCareerYear:1,
  careerSeasons:5,
  ratings:{ game_rating:58, potential:58 },
  recurring:30,
  contractYears:1,
  contractRemaining:1,
  contractRecurring:30,
  squadGain:2,
  fictional:true,
};
const retirementProfile = {
  ...initial,
  careerYear:6,
  recurring:-30,
  academyRoster:[oldCareerPlayer],
  areas:{ ...initial.areas, squad:60 },
};
const retirement = core.processCareerPlayerContracts(retirementProfile, { season:'2030/31', careerYear:6 });
assert.equal(retirement.cases.length, 0);
assert.equal(retirement.retirements.length, 1);
assert.equal(retirement.retirements[0].type, 'retired');
assert.equal(retirement.retirements[0].player, 'Weteran Kariery');
assert.equal(retirement.profile.academyRoster.length, 0);
assert.equal(retirement.profile.recurring, 0);
assert.equal(retirement.profile.playerContractHistory.at(-1).type, 'retired');

// Runtime contract: President v3 remains a board-management mode, not Match RPG.
assert.match(runtime, /function simulatePresidentRound/);
assert.match(runtime, /seasonCareerCore\.simulateFixture/);
assert.match(runtime, /bez pytań i decyzji boiskowych/);
assert.match(runtime, /MECZ W TLE/);
assert.match(runtime, /renderPresidentStrategySelection/);
assert.match(runtime, /WIELOSEZONOWY MANDAT ZARZĄDU/);
assert.match(runtime, /data-board-mandate/);
assert.match(runtime, /Mandat wieloletni jest ustalony/);
assert.match(runtime, /DZIEŃ MECZOWY/);
assert.match(runtime, /data-matchday-policy/);
assert.deepEqual(
  core.MATCHDAY_POLICIES.map(item => item.label),
  ['Lokalny i dostępny', 'Standard klubowy', 'Mocniej komercyjny'],
);
assert.match(runtime, /symulowaną frekwencję, przychód na kibica/);
assert.match(runtime, /model wybrany na cały sezon/);
assert.match(runtime, /presidentEnsureMatchdayPolicy/);
assert.match(runtime, /MANDAT ZARZĄDU/);
assert.match(runtime, /Poprzedni mandat/);
assert.match(runtime, /Najpierw wybierz wielosezonowy mandat zarządu/);
assert.match(runtime, /decisionTrigger/);
assert.match(runtime, /DLACZEGO TERAZ/);
assert.match(runtime, /presidentInvestmentsHtml/);
assert.match(runtime, /presidentSquadProfiles/);
assert.match(runtime, /presidentCareerDevelopmentText/);
assert.match(runtime, /ROZWÓJ KADRY PRZED SEZONEM/);
assert.match(runtime, /ostatni rozwój/);
assert.match(runtime, /nie zmieniają danych ŁNP/);
assert.match(runtime, /POPARCIE ZARZĄDU/);
assert.match(runtime, /startNextPresidentSeason/);
assert.match(runtime, /prepareNextSeason/);
assert.match(runtime, /presidentCareerHistoryHtml/);
assert.match(runtime, /presidentCompetitionMovement/);
assert.match(runtime, /presidentSimulatedCompetitionPlan/);
assert.match(runtime, /STATUS LIGOWY/);
assert.match(runtime, /renderPresidentDismissal/);
assert.match(runtime, /presidentManagementHubHtml/);
assert.match(runtime, /financeCategorySummary/);
assert.match(runtime, /BILANS SEZONU/);
assert.match(runtime, /BAZA KIBICÓW GRY/);
assert.match(runtime, /FREKWENCJA GRY/);
assert.match(runtime, /frekwencja nie jest realną daną klubu/);
assert.match(runtime, /nie odwzorowują rzeczywistych finansów ani widowni klubu/);
assert.match(runtime, /Ostatnie operacje/);
assert.match(runtime, /zarejestrowane przepływy/);
assert.match(runtime, /bindPresidentManagementTabs/);
assert.match(runtime, /data-president-tab/);
assert.match(runtime, /Pulpit/);
assert.match(runtime, /Kadra/);
assert.match(runtime, /Finanse/);
assert.match(runtime, /Klub/);
assert.match(runtime, /Historia/);
assert.match(runtime, /REPUTACJA PREZESA/);
assert.match(runtime, /presidentBuildJobOffers/);
assert.match(runtime, /jobMarketSummary/);
assert.match(runtime, /RYNEK DOSTĘPNY NA POZIOMACH/);
assert.match(runtime, /KROK WYŻEJ/);
assert.match(runtime, /presidentJobOffersHtml/);
assert.match(runtime, /acceptPresidentJobOffer/);
assert.match(runtime, /RYNEK PRACY · PO ZWOLNIENIU/);
assert.match(runtime, /Zostaję w obecnym klubie/);
assert.match(runtime, /nowy klub:/i);
assert.match(runtime, /Ultimatum/);
assert.match(runtime, /STANOWISKO PREZESA/);
assert.match(runtime, /Zarząd zakończył współpracę/);
assert.match(runtime, /AWANS/);
assert.match(runtime, /SPADEK/);
assert.match(runtime, /Przejdź do lata/);
assert.match(runtime, /renderPresidentOffseason/);
assert.match(runtime, /Lato prezesa/);
assert.match(runtime, /DECYZJA LETNIA/);
assert.match(runtime, /GOTOWOŚĆ NA POZIOM LIGI/);
assert.match(runtime, /fikcyjne progi kariery/);
assert.match(runtime, /nie regulamin licencyjny PZPN/);
assert.match(runtime, /data-readiness-method/);
assert.match(runtime, /Trwałe przygotowanie/);
assert.match(runtime, /Rozwiązanie tymczasowe/);
assert.match(runtime, /UMOWY WIELOSEZONOWE/);
assert.match(runtime, /data-sponsor-contract/);
assert.match(runtime, /Pakiety są fikcyjne/);
assert.match(runtime, /WARTOŚĆ KOMERCYJNA GRY/);
assert.match(runtime, /symulowanej wartości komercyjnej klubu/);
assert.match(runtime, /MNOŻNIK OFERT/);
assert.match(runtime, /Stawka podpisywana przy wartości komercyjnej/);
assert.match(runtime, /po podpisaniu nie zmienia się w trakcie umowy/);
assert.match(runtime, /Aktywne umowy wielosezonowe/);
assert.match(runtime, /UMOWY KADRY KARIERY/);
assert.match(runtime, /fikcyjna umowa w alternatywnej karierze/);
assert.match(runtime, /data-career-contract-id/);
assert.match(runtime, /Odnów umowę/);
assert.match(runtime, /Pozwól odejść/);
assert.match(runtime, /fikcyjny koniec kariery/);
assert.match(runtime, /NABÓR Z AKADEMII/);
assert.match(runtime, /FIKCYJNY WYCHOWANEK/);
assert.match(runtime, /data-academy-prospect/);
assert.match(runtime, /Nie włączam wychowanka tego lata/);
assert.match(runtime, /UMOWA KARIERY/);
assert.match(runtime, /umowa kariery 2 sez/);
assert.match(runtime, /contractRemaining \|\| 3/);
assert.match(runtime, /nie są używani jako fakty ani pytania quizowe/);
assert.match(runtime, /president-career-academy/);
assert.match(runtime, /RUCH WYCHODZĄCY/);
assert.match(runtime, /FAKT ŁNP \+ DECYZJA GRY/);
assert.match(runtime, /data-departure-outcome/);
assert.match(runtime, /Zatrzymaj zawodnika/);
assert.match(runtime, /Nie blokuj odejścia/);
assert.match(runtime, /OKNO KADROWE/);
assert.match(runtime, /data-transfer-player/);
assert.match(runtime, /fikcyjną mechaniką tej kariery/);
assert.match(runtime, /Wzmocnienie kariery/);
assert.match(runtime, /alternatywnej warstwy kariery/);
assert.match(runtime, /nie opisują realnych kontraktów/);
assert.match(runtime, /Zamknij okno transferowe/);
assert.match(runtime, /Przejdź do planowania sezonu/);
assert.match(lifecycle, /myslenice-president-career-v1/);
assert.match(lifecycle, /presidentPersistCareer/);
assert.match(lifecycle, /resumePresidentCareer/);
assert.match(lifecycle, /Wznów karierę/);
assert.match(lifecycle, /Usuń zapis/);
assert.match(lifecycle, /window\.localStorage/);
assert.match(lifecycle, /renderResumedPresidentCareer/);
assert.match(lifecycle, /presidentClearSave\(\)/);
assert.match(runtime, /SYMULACJA KARIERY/);
assert.doesNotMatch(runtime, /scenarioOdds\s*=/, 'president mode must not alter individual RPG action odds');
assert.doesNotMatch(runtime, /renderActionPanel\s*=/, 'president mode must not inject president decisions into pitch actions');
assert.match(achievementBridge, /recordFinish/);
assert.match(achievementBridge, /rpg:false/);
assert.match(achievementBridge, /president:true/);

console.log('president mode smoke: ok');
