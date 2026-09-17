// Match Situations layer for Match RPG.
// Loaded after all existing RPG/arcade flavour layers and before front-controller.js.
// A match is now 8-12 distinct situations spread across 90 minutes. Knowledge changes
// the probability of executing the chosen football action instead of guaranteeing it.

const scenarioCore = globalThis.MatchScenarioCore;
const scenarioBaseEnsureRpgUi = ensureRpgUi;
const scenarioBaseResetRpgState = resetRpgState;
const scenarioBaseRenderRpgBoard = renderRpgBoard;
const scenarioBaseRenderActionPanel = renderActionPanel;
const scenarioBaseChooseRpgAction = chooseRpgAction;
const scenarioBaseResolvePlayerAction = resolvePlayerAction;
const scenarioBaseResolveOpponentAction = resolveOpponentAction;
const scenarioBaseShowRpgDecisionStage = showRpgDecisionStage;
const scenarioBaseShowQuestion = showQuestion;
const scenarioBaseAnswer = answer;
const scenarioBaseFinishGame = finishGame;

const MATCH_SITUATION_POOL = Object.freeze([
  {
    id: 'attack_entry', icon: '🎯', label: 'Atak pozycyjny',
    desc: 'Masz piłkę trzydzieści metrów od bramki. Trzeba otworzyć obronę rywala.',
    possession: 'player', zone: 3,
  },
  {
    id: 'defend_transition', icon: '🛡️', label: 'Powrót do obrony',
    desc: 'Rywal przyspiesza po twojej stronie boiska. Trzeba zatrzymać akcję przed polem karnym.',
    possession: 'opponent', zone: 1,
  },
  {
    id: 'counter_3v2', icon: '⚡', label: 'Kontra 3 na 2',
    desc: 'Odbierasz piłkę i masz przewagę liczebną. Jedna decyzja może stworzyć sytuację bramkową.',
    possession: 'player', zone: 2,
    setPiece: { icon: '⚡', label: 'Kontra 3 na 2', desc: 'Obrona rywala jest rozciągnięta. Wybierz drogę do bramki.', type: 'counter_3v2' },
  },
  {
    id: 'corner', icon: '🚩', label: 'Rzut rożny',
    desc: 'Stały fragment dla ciebie. Możesz zagrać krótko albo szukać bezpośredniego zagrożenia.',
    possession: 'player', zone: 4,
    setPiece: { icon: '🚩', label: 'Rzut rożny', desc: 'Masz stały fragment. Wybierz sposób rozegrania.', type: 'corner' },
  },
  {
    id: 'free_kick', icon: '🎯', label: 'Wolny przed polem karnym',
    desc: 'Faul około 20–25 metrów od bramki. Możesz strzelać lub dograć.',
    possession: 'player', zone: 4,
    setPiece: { icon: '🎯', label: 'Rzut wolny 20–25 m', desc: 'Możesz strzelać albo dograć w pole karne.', type: 'free_kick' },
  },
  {
    id: 'opponent_corner', icon: '🚩', label: 'Róg dla rywala',
    desc: 'Rywal ustawia się do niebezpiecznego stałego fragmentu. Musisz wybrać sposób obrony.',
    possession: 'opponent', zone: 0,
    setPiece: { icon: '🚩', label: 'Róg dla rywala', desc: 'Musisz ustawić obronę stałego fragmentu.', type: 'opponent_corner' },
  },
  {
    id: 'box_chance', icon: '🔥', label: 'Czysta okazja',
    desc: 'Wchodzisz w pole karne przy rozciągniętej obronie. To jedna z najlepszych okazji meczu.',
    possession: 'player', zone: 4, clearChance: true,
  },
  {
    id: 'midfield_duel', icon: '⚔️', label: 'Walka o środek',
    desc: 'Mecz jest zamknięty. Wygranie tej fazy może dać kontrolę nad kolejną akcją.',
    possession: 'player', zone: 2,
  },
  {
    id: 'opponent_break', icon: '🚨', label: 'Rywal pod polem karnym',
    desc: 'Przeciwnik znalazł miejsce między liniami i atakuje twoją bramkę.',
    possession: 'opponent', zone: 1,
  },
  {
    id: 'penalty', icon: '🥅', label: 'Rzut karny',
    desc: 'Największa pojedyncza szansa w meczu. Wiedza pomaga, ale wykonanie nadal ma znaczenie.',
    possession: 'player', zone: 4,
    setPiece: { icon: '🥅', label: 'Rzut karny!', desc: 'Wybierz sposób wykonania. Wiedza zwiększy szansę skutecznego strzału.', type: 'penalty' },
  },
]);

const MATCH_OPENING_SITUATION = Object.freeze({
  id: 'opening_build', icon: '🧤', label: 'Wyjście spod pressingu',
  desc: 'Początek meczu. Budujesz pierwszą akcję od własnej połowy.',
  possession: 'player', zone: 1,
});

function scenarioShuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildMatchSituationScript() {
  const count = scenarioCore.scenarioCount();
  const minutes = scenarioCore.buildMinutePlan(count);
  const middle = [];
  let pool = scenarioShuffle(MATCH_SITUATION_POOL);
  while (middle.length < count - 2) {
    if (!pool.length) pool = scenarioShuffle(MATCH_SITUATION_POOL);
    middle.push(pool.shift());
  }
  const script = [MATCH_OPENING_SITUATION, ...middle, { id: 'late_drama', dynamic: true }];
  return script.map((item, index) => ({ ...item, minute: minutes[index], number: index + 1, total: count }));
}

function lateDramaSituation(minute, number, total) {
  const playerGoals = Number(state.rpgPlayerGoals || 0);
  const opponentGoals = Number(state.rpgOpponentGoals || 0);
  if (playerGoals <= opponentGoals) {
    return {
      id: 'late_drama_attack', icon: '⏱️', label: playerGoals < opponentGoals ? 'Ostatnia szansa na remis' : 'Akcja na zwycięstwo',
      desc: 'Końcówka meczu. Masz piłkę wysoko i niewiele czasu na rozstrzygnięcie.',
      possession: 'player', zone: 4, clearChance: true, minute, number, total,
    };
  }
  return {
    id: 'late_drama_defend', icon: '⏱️', label: 'Obrona wyniku',
    desc: 'Końcówka meczu. Rywal rzuca wszystko do ataku, a ty bronisz prowadzenia.',
    possession: 'opponent', zone: 0, minute, number, total,
  };
}

function currentMatchSituation() {
  const script = state.rpgScenarioScript || [];
  const index = Math.min(Number(state.rpgActionsPlayed || 0), Math.max(0, script.length - 1));
  const raw = script[index] || null;
  if (!raw) return null;
  if (raw.dynamic) return lateDramaSituation(raw.minute, raw.number, raw.total);
  return raw;
}

function applyMatchSituation(situation) {
  if (!situation) return;
  state.rpgScenarioCurrent = situation;
  state.rpgScenarioIndex = situation.number - 1;
  state.rpgMinute = situation.minute;
  state.rpgHalftimeDone = situation.minute > 45;
  state.rpgHalftimePending = false;
  state.rpgAddedTimePending = false;
  state.rpgInAddedTime = false;
  state.rpgPossession = situation.possession;
  state.rpgZone = situation.zone;
  state.rpgClearChance = Boolean(situation.clearChance);
  state.rpgSetPiece = situation.setPiece ? { ...situation.setPiece } : null;
}

function ensureScenarioHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-scenario-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-scenario-hud';
  hud.className = 'rpg-scenario-hud';
  hud.innerHTML = `
    <div class="scenario-counter"><small>SYTUACJA MECZOWA</small><strong id="rpg-scenario-count">1/10</strong></div>
    <div class="scenario-copy"><strong id="rpg-scenario-title">⚽ Początek meczu</strong><span id="rpg-scenario-desc">Wybierz zagranie.</span></div>
    <div class="scenario-rule"><strong>🧠 Wiedza daje przewagę</strong><span>Poprawna odpowiedź zwiększa szansę powodzenia, ale futbol nie daje gwarancji.</span></div>`;
  const arcadeHud = el('rpg-arcade-hud');
  if (arcadeHud) arcadeHud.insertAdjacentElement('beforebegin', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

ensureRpgUi = function scenarioEnsureRpgUi() {
  scenarioBaseEnsureRpgUi();
  ensureScenarioHud();
};

resetRpgState = function scenarioResetRpgState() {
  scenarioBaseResetRpgState();
  state.rpgScenarioScript = buildMatchSituationScript();
  state.rpgScenarioCurrent = null;
  state.rpgScenarioIndex = 0;
  state.rpgScenarioLastOutcome = null;
  state.rpgScenarioSuccessfulEvents = 0;
  state.rpgScenarioKnowledgeWins = 0;
};

function renderScenarioHud() {
  ensureScenarioHud();
  if (!rpgActive()) return;
  const situation = state.rpgScenarioCurrent || currentMatchSituation();
  if (!situation) return;
  const count = el('rpg-scenario-count');
  const title = el('rpg-scenario-title');
  const desc = el('rpg-scenario-desc');
  if (count) count.textContent = `${situation.number}/${situation.total} · ${situation.minute}’`;
  if (title) title.textContent = `${situation.icon || '⚽'} ${situation.label}`;
  if (desc) desc.textContent = situation.desc;
}

renderRpgBoard = function scenarioRenderRpgBoard() {
  scenarioBaseRenderRpgBoard();
  renderScenarioHud();
};

function scenarioOdds(action, knowledgeCorrect) {
  return scenarioCore.successChance({
    dc: action?.dc || 3,
    knowledgeCorrect,
    kind: action?.kind || '',
    clearChance: Boolean(state.rpgClearChance),
    momentum: Number(state.rpgMomentum || 0),
    opponentMomentum: Number(state.rpgOpponentMomentum || 0),
  });
}

renderActionPanel = function scenarioRenderActionPanel() {
  scenarioBaseRenderActionPanel();
  if (!rpgActive()) return;
  const buttons = [...(el('rpg-action-panel')?.querySelectorAll('.rpg-action') || [])];
  const actions = availableRpgActions();
  buttons.forEach((button, index) => {
    const action = actions[index];
    if (!action || button.querySelector('.scenario-odds')) return;
    const good = scenarioCore.percent(scenarioOdds(action, true));
    const bad = scenarioCore.percent(scenarioOdds(action, false));
    const odds = document.createElement('div');
    odds.className = 'scenario-odds';
    odds.innerHTML = `<span>✓ dobra odpowiedź: <strong>${good}</strong></span><span>✕ błąd: <strong>${bad}</strong></span>`;
    button.appendChild(odds);
  });
};

chooseRpgAction = function scenarioChooseRpgAction(action) {
  state.rpgScenarioLastOutcome = null;
  state.rpgScenarioAttempt = {
    actionId: action?.id || null,
    correctChance: scenarioOdds(action, true),
    wrongChance: scenarioOdds(action, false),
  };
  return scenarioBaseChooseRpgAction(action);
};

function rollScenarioAction(action, knowledgeCorrect) {
  const outcome = scenarioCore.rollOutcome({
    dc: action?.dc || 3,
    knowledgeCorrect,
    kind: action?.kind || '',
    clearChance: Boolean(state.rpgClearChance),
    momentum: Number(state.rpgMomentum || 0),
    opponentMomentum: Number(state.rpgOpponentMomentum || 0),
  });
  state.rpgScenarioLastOutcome = {
    ...outcome,
    knowledgeCorrect,
    actionId: action?.id || null,
    actionLabel: action?.label || 'Akcja',
  };
  if (outcome.success) state.rpgScenarioSuccessfulEvents = Number(state.rpgScenarioSuccessfulEvents || 0) + 1;
  if (knowledgeCorrect) state.rpgScenarioKnowledgeWins = Number(state.rpgScenarioKnowledgeWins || 0) + 1;
  return outcome.success;
}

resolvePlayerAction = function scenarioResolvePlayerAction(action, knowledgeCorrect) {
  const success = rollScenarioAction(action, knowledgeCorrect);
  return scenarioBaseResolvePlayerAction(action, success);
};

resolveOpponentAction = function scenarioResolveOpponentAction(action, knowledgeCorrect) {
  const success = rollScenarioAction(action, knowledgeCorrect);
  return scenarioBaseResolveOpponentAction(action, success);
};

advanceRpgClock = function scenarioAdvanceRpgClock() {
  const count = Number(state.rpgScenarioScript?.length || 0);
  const played = Number(state.rpgActionsPlayed || 0);
  if (count && played >= count) {
    state.rpgMinute = 90;
    state.rpgEnded = true;
    state.rpgHalftimePending = false;
    state.rpgAddedTimePending = false;
    state.rpgInAddedTime = false;
    return;
  }
  const next = state.rpgScenarioScript?.[played];
  if (next) {
    if (!state.rpgHalftimeDone && next.minute > 45) {
      state.rpgHalftimeDone = true;
      addRpgLog('⏸️ Przerwa. Druga połowa zaczyna się od kolejnej kluczowej sytuacji.', '');
    }
    state.rpgMinute = next.minute;
  }
  state.rpgHalftimePending = false;
  state.rpgAddedTimePending = false;
  state.rpgInAddedTime = false;
};

showRpgDecisionStage = function scenarioShowRpgDecisionStage() {
  if (rpgActive() && !state.rpgEnded) {
    const situation = currentMatchSituation();
    if (!situation) {
      state.rpgEnded = true;
      finishGame();
      return;
    }
    applyMatchSituation(situation);
  }
  const result = scenarioBaseShowRpgDecisionStage();
  renderScenarioHud();
  return result;
};

showQuestion = function scenarioShowQuestion() {
  const result = scenarioBaseShowQuestion();
  if (!rpgActive() || !state.current) return result;
  const situation = state.rpgScenarioCurrent;
  if (situation) {
    if (el('question-number')) el('question-number').textContent = `Sytuacja ${situation.number}/${situation.total} · ${situation.minute}’`;
    if (el('question-style')) {
      const action = state.rpgCurrentAction;
      el('question-style').textContent = `${situation.label.toUpperCase()} · ${String(action?.label || 'TEST AKCJI').toUpperCase()}`;
    }
  }
  return result;
};

function updateScenarioResolution(knowledgeCorrect) {
  const outcome = state.rpgScenarioLastOutcome;
  if (!outcome) return;
  const node = [...(el('feedback')?.querySelectorAll('.rpg-resolution') || [])].pop();
  if (!node) return;
  const chance = scenarioCore.percent(outcome.chance);
  node.classList.toggle('good', outcome.success);
  node.classList.toggle('bad', !outcome.success);
  if (knowledgeCorrect && outcome.success) {
    node.textContent = `✓ Odpowiedź poprawna — dostałeś ${chance} szans na wykonanie i akcja się udała.`;
  } else if (knowledgeCorrect && !outcome.success) {
    node.textContent = `✓ Odpowiedź poprawna dała ${chance} szans, ale wykonanie tym razem zawiodło.`;
  } else if (!knowledgeCorrect && outcome.success) {
    node.textContent = `✕ Odpowiedź błędna zostawiła tylko ${chance} szans, ale akcja mimo to się udała.`;
  } else {
    node.textContent = `✕ Odpowiedź błędna — tylko ${chance} szans na wykonanie. Akcja się nie udała.`;
  }
}

answer = function scenarioAnswer(button, option) {
  if (!rpgActive()) return scenarioBaseAnswer(button, option);
  const knowledgeCorrect = Boolean(state.current && option === state.current.answer);
  const before = Number(state.answered || 0);
  const result = scenarioBaseAnswer(button, option);
  if (Number(state.answered || 0) > before) updateScenarioResolution(knowledgeCorrect);
  renderScenarioHud();
  return result;
};

finishGame = function scenarioFinishGame() {
  const result = scenarioBaseFinishGame();
  if (!rpgActive()) return result;
  const played = Number(state.rpgActionsPlayed || 0);
  const success = Number(state.rpgScenarioSuccessfulEvents || 0);
  const total = Number(state.rpgScenarioScript?.length || played);
  const details = el('result-details');
  if (details) {
    details.textContent = `${details.textContent} · sytuacje meczowe: ${played}/${total} · akcje udane boiskowo: ${success}/${played}`;
  }
  return result;
};

el('game-format')?.addEventListener('change', () => {
  if (currentFormat() === 'match90' && el('format-description')) {
    el('format-description').textContent = 'Mecz składa się z 8–12 kluczowych sytuacji. Wiedza mocno zwiększa szansę powodzenia zagrania, ale wynik akcji nie jest gwarantowany.';
  }
});

if (currentFormat() === 'match90' && el('format-description')) {
  el('format-description').textContent = 'Mecz składa się z 8–12 kluczowych sytuacji. Wiedza mocno zwiększa szansę powodzenia zagrania, ale wynik akcji nie jest gwarantowany.';
}
