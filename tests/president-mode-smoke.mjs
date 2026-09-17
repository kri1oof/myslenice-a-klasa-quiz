import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const core = require('../web/president-mode-core.js');
const runtime = fs.readFileSync(new URL('../web/president-mode.js', import.meta.url), 'utf8');
const achievementBridge = fs.readFileSync(new URL('../web/president-achievements-bridge.js', import.meta.url), 'utf8');

assert.equal(core.DECISIONS.length, 26, 'president v2 should cover a full A-class season with varied club issues');
assert.equal(new Set(core.DECISIONS.map(item => item.id)).size, 26, 'decision ids must be unique');
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
assert.equal(initial.order.length, 26);
assert.equal(new Set(initial.order).size, 26);
assert.equal('currentMatchEffect' in initial, false, 'v2 must not keep an in-match president modifier');

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

// Runtime contract: President v2 simulates football in the background rather than entering Match RPG.
assert.match(runtime, /function simulatePresidentRound/);
assert.match(runtime, /seasonCareerCore\.simulateFixture/);
assert.match(runtime, /bez pytań i decyzji boiskowych/);
assert.match(runtime, /MECZ W TLE/);
assert.doesNotMatch(runtime, /scenarioOdds\s*=/, 'president mode must not alter individual RPG action odds');
assert.doesNotMatch(runtime, /renderActionPanel\s*=/, 'president mode must not inject president decisions into pitch actions');
assert.match(achievementBridge, /recordFinish/);
assert.match(achievementBridge, /rpg:false/);
assert.match(achievementBridge, /president:true/);

console.log('president mode smoke: ok');
