// Continuity layer for Match RPG.
// Later key situations are generated from the actual state left by the previous action.
// This prevents impossible jumps such as defending one moment and receiving a penalty next.

const continuityCore = globalThis.MatchContinuityCore;

const CONTINUITY_TEMPLATES = Object.freeze([
  { id:'player_build_low', possession:'player', minZone:0, maxZone:1, weight:5, icon:'🧤', label:'Budowanie od tyłu', desc:'Masz piłkę na własnej stronie boiska. Kolejna akcja zaczyna się dokładnie tam, gdzie skończyła się poprzednia.' },
  { id:'player_restart_low', possession:'player', minZone:0, maxZone:1, weight:2, icon:'🔄', label:'Spokojne wznowienie', desc:'Po poprzedniej fazie utrzymujesz piłkę nisko i próbujesz ponownie wyjść spod presji.' },
  { id:'player_midfield', possession:'player', minZone:2, maxZone:2, weight:5, icon:'⚔️', label:'Piłka w środku', desc:'Masz posiadanie w centrum. Następna decyzja wynika z miejsca, w którym zakończyła się poprzednia akcja.' },
  { id:'player_counter_mid', possession:'player', minZone:2, maxZone:3, weight:5, requiresTurnover:true, icon:'⚡', label:'Kontra po odbiorze', desc:'Właśnie odzyskałeś piłkę. Możesz wykorzystać moment, zanim rywal odbuduje ustawienie.' },
  { id:'player_attack', possession:'player', minZone:3, maxZone:3, weight:6, icon:'🎯', label:'Atak przed polem karnym', desc:'Utrzymujesz piłkę wysoko. Trzeba wykorzystać pozycję wypracowaną w poprzedniej akcji.' },
  { id:'player_free_kick', possession:'player', minZone:3, maxZone:4, weight:1.4, noClearChance:true, icon:'🎯', label:'Rzut wolny w ataku', desc:'W tej samej wysokiej strefie rywal przerywa akcję faulem. Dostajesz stały fragment.', setPiece:{ icon:'🎯', label:'Rzut wolny', desc:'Stały fragment po przerwaniu wysokiej akcji.', type:'free_kick' } },
  { id:'player_box', possession:'player', minZone:4, maxZone:4, weight:5, noClearChance:true, icon:'🔥', label:'Atak w polu karnym', desc:'Piłka nadal jest przy tobie w polu karnym rywala. Teraz trzeba znaleźć wykończenie.' },
  { id:'player_clear', possession:'player', minZone:4, maxZone:4, weight:9, clearChanceOnly:true, icon:'🔥', label:'Wykreowana okazja', desc:'Poprzednia akcja otworzyła obronę. Nadal masz piłkę i czystą okazję do wykończenia.' },
  { id:'player_corner', possession:'player', minZone:4, maxZone:4, weight:1.5, noClearChance:true, icon:'🚩', label:'Rzut rożny', desc:'Wysoka akcja kończy się wybiciem piłki przez rywala. Zostajesz w ataku i masz rzut rożny.', setPiece:{ icon:'🚩', label:'Rzut rożny', desc:'Stały fragment po zablokowanej akcji.', type:'corner' } },
  { id:'player_penalty', possession:'player', minZone:4, maxZone:4, weight:.45, noClearChance:true, icon:'🥅', label:'Rzut karny', desc:'Akcja w polu karnym zostaje przerwana przewinieniem. Dostajesz rzut karny.', setPiece:{ icon:'🥅', label:'Rzut karny', desc:'Przewinienie nastąpiło w trwającej akcji w polu karnym.', type:'penalty' } },

  { id:'opponent_build_high', possession:'opponent', minZone:3, maxZone:4, weight:5, icon:'🧱', label:'Rywal buduje od tyłu', desc:'Przeciwnik ma piłkę daleko od twojej bramki. Bronisz kolejną fazę bez przeskoku do nagłego zagrożenia.' },
  { id:'opponent_midfield', possession:'opponent', minZone:2, maxZone:2, weight:5, icon:'⚔️', label:'Rywal w środku pola', desc:'Przeciwnik utrzymuje piłkę w centrum. Kolejna sytuacja zaczyna się z tej samej strefy.' },
  { id:'opponent_counter_mid', possession:'opponent', minZone:1, maxZone:2, weight:5, requiresTurnover:true, icon:'🚨', label:'Kontra rywala po stracie', desc:'Straciłeś piłkę i przeciwnik od razu rusza. Musisz zatrzymać kontrę w strefie, w której naprawdę się znalazła.' },
  { id:'opponent_attack', possession:'opponent', minZone:1, maxZone:1, weight:7, icon:'🛡️', label:'Rywal pod polem karnym', desc:'Przeciwnik nadal prowadzi atak blisko twojego pola karnego. Trzeba obronić następną fazę.' },
  { id:'opponent_box', possession:'opponent', minZone:0, maxZone:0, weight:7, icon:'🚨', label:'Alarm w polu karnym', desc:'Rywal utrzymał akcję w twoim polu karnym. Następna decyzja jest bezpośrednią kontynuacją zagrożenia.' },
  { id:'opponent_corner', possession:'opponent', minZone:0, maxZone:0, weight:1.6, icon:'🚩', label:'Róg dla rywala', desc:'Broniona akcja kończy się wybiciem za linię. Rywal nadal atakuje, tym razem z rzutu rożnego.', setPiece:{ icon:'🚩', label:'Róg dla rywala', desc:'Stały fragment po trwającej akcji rywala.', type:'opponent_corner' } },
]);

function buildContinuousSituationScript() {
  const count = scenarioCore.scenarioCount();
  const minutes = scenarioCore.buildMinutePlan(count);
  return minutes.map((minute, index) => {
    if (index === 0) {
      return {
        id:'opening_build', icon:'🧤', label:'Wyjście spod pressingu',
        desc:'Początek meczu. Budujesz pierwszą akcję od własnej połowy.',
        possession:'player', zone:1, minute, number:1, total:count,
      };
    }
    return {
      id:index === count - 1 ? 'late_continuity' : `continuity_${index + 1}`,
      dynamic:'continuity', minute, number:index + 1, total:count,
    };
  });
}

function lateContinuousSituation(raw, context) {
  const playerGoals = Number(state.rpgPlayerGoals || 0);
  const opponentGoals = Number(state.rpgOpponentGoals || 0);
  const possession = context.possession;
  let label;
  let desc;
  let icon = '⏱️';

  if (possession === 'player') {
    if (playerGoals < opponentGoals) {
      label = 'Ostatnia szansa na remis';
      desc = 'Końcówka meczu. Nadal masz piłkę w miejscu wynikającym z poprzedniej akcji — musisz zbudować ostatnią szansę.';
    } else if (playerGoals === opponentGoals) {
      label = 'Akcja na zwycięstwo';
      desc = 'Końcówka meczu. Masz posiadanie i możesz spróbować rozstrzygnąć spotkanie bez sztucznego przenoszenia piłki.';
    } else {
      label = 'Utrzymaj prowadzenie z piłką';
      desc = 'Końcówka meczu. Prowadzisz i masz piłkę — decyzja dotyczy bezpiecznego rozegrania obecnej fazy.';
    }
  } else if (playerGoals > opponentGoals) {
    label = 'Obrona wyniku';
    desc = 'Końcówka meczu. Rywal ma piłkę w aktualnej strefie i szuka wyrównania.';
  } else if (playerGoals === opponentGoals) {
    label = 'Ostatni atak rywala';
    desc = 'Końcówka meczu. Przeciwnik jest przy piłce i próbuje przechylić remis na swoją stronę.';
  } else {
    label = 'Nie dać zamknąć meczu';
    desc = 'Końcówka meczu. Rywal ma piłkę, a ty musisz ją odzyskać, żeby zachować szansę na powrót.';
  }

  return {
    id:`late_${possession}_${context.zone}`,
    icon, label, desc,
    possession,
    zone:context.zone,
    clearChance:context.clearChance,
    minute:raw.minute,
    number:raw.number,
    total:raw.total,
  };
}

const continuityBaseBuildScript = buildMatchSituationScript;
const continuityBaseCurrentSituation = currentMatchSituation;
const continuityBaseApplySituation = applyMatchSituation;
const continuityBaseResetRpgState = resetRpgState;

buildMatchSituationScript = function continuityBuildMatchSituationScript() {
  return buildContinuousSituationScript();
};

currentMatchSituation = function continuityCurrentMatchSituation() {
  const script = state.rpgScenarioScript || [];
  const index = Math.min(Number(state.rpgActionsPlayed || 0), Math.max(0, script.length - 1));
  const raw = script[index] || null;
  if (!raw) return null;
  if (!raw.dynamic) return raw;

  state.rpgScenarioResolved = state.rpgScenarioResolved || [];
  if (state.rpgScenarioResolved[index]) return state.rpgScenarioResolved[index];

  const context = {
    possession:state.rpgPossession === 'opponent' ? 'opponent' : 'player',
    zone:Number.isInteger(state.rpgZone) ? state.rpgZone : 2,
    clearChance:Boolean(state.rpgClearChance),
    lastSituationId:state.rpgScenarioLastApplied?.id || null,
    lastPossession:state.rpgScenarioLastApplied?.possession || null,
  };

  let situation;
  if (index === script.length - 1) {
    situation = lateContinuousSituation(raw, context);
  } else {
    const selected = continuityCore.chooseSituation(CONTINUITY_TEMPLATES, context);
    situation = selected ? {
      ...selected,
      minute:raw.minute,
      number:raw.number,
      total:raw.total,
    } : {
      id:`fallback_${context.possession}_${context.zone}`,
      icon:context.possession === 'player' ? '⚽' : '🛡️',
      label:context.possession === 'player' ? 'Kontynuacja ataku' : 'Kontynuacja obrony',
      desc:'Następna sytuacja zachowuje dokładnie posiadanie i strefę pozostawioną przez poprzednią akcję.',
      possession:context.possession,
      zone:context.zone,
      clearChance:context.clearChance,
      minute:raw.minute,
      number:raw.number,
      total:raw.total,
    };
  }

  state.rpgScenarioResolved[index] = situation;
  return situation;
};

applyMatchSituation = function continuityApplyMatchSituation(situation) {
  if (!situation) return;
  const before = {
    possession:state.rpgPossession,
    zone:state.rpgZone,
    clearChance:state.rpgClearChance,
  };
  const isOpening = Number(situation.number || 0) === 1;
  if (!isOpening && !continuityCore.continuityInvariant(before, situation)) {
    // Defensive guard: never let an inconsistent generated situation overwrite match state.
    situation = {
      ...situation,
      possession:before.possession === 'opponent' ? 'opponent' : 'player',
      zone:Number.isInteger(before.zone) ? before.zone : 2,
      clearChance:Boolean(before.clearChance),
      setPiece:null,
      label:before.possession === 'opponent' ? 'Kontynuacja obrony' : 'Kontynuacja ataku',
      desc:'Sytuacja została skorygowana do rzeczywistego stanu pozostawionego przez poprzednią akcję.',
    };
  }
  continuityBaseApplySituation(situation);
  state.rpgScenarioLastApplied = {
    id:situation.id,
    possession:situation.possession,
    zone:situation.zone,
  };
};

resetRpgState = function continuityResetRpgState() {
  continuityBaseResetRpgState();
  // match-scenarios reset called the current buildMatchSituationScript binding,
  // but set these explicitly as a guard against future wrapper-order changes.
  state.rpgScenarioScript = buildContinuousSituationScript();
  state.rpgScenarioResolved = [];
  state.rpgScenarioLastApplied = null;
};
