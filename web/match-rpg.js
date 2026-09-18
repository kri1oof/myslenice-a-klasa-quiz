// RPG football mode: the knowledge question replaces the dice roll.
// The player chooses a football action, then the answer decides whether that action succeeds.
// Loaded after match-mode.js and intentionally overrides Match 90' only.

const rpgBaseShowQuestion = typeof matchLegacyShowQuestion === 'function' ? matchLegacyShowQuestion : showQuestion;
const rpgBaseAnswer = typeof matchLegacyAnswer === 'function' ? matchLegacyAnswer : answer;
const rpgNonMatchStart = startGame;
const RPG_MAX_ACTIONS = 20;

function rpgActive() {
  return currentFormat() === 'match90';
}

function ensureRpgUi() {
  const quiz = el('quiz');
  if (!quiz || el('rpg-board')) return;

  const board = document.createElement('div');
  board.id = 'rpg-board';
  board.className = 'rpg-board';
  board.innerHTML = `
    <div class="rpg-score-row" aria-live="polite">
      <div class="rpg-team"><small>TY</small><strong id="rpg-player-score">0</strong></div>
      <div class="rpg-clock"><strong id="rpg-minute">0’</strong><span id="rpg-half">1. połowa</span></div>
      <div class="rpg-team"><small>RYWAL</small><strong id="rpg-opponent-score">0</strong></div>
    </div>
    <div class="rpg-pitch-shell">
      <div class="rpg-pitch" aria-label="Pozycja piłki na boisku">
        <div class="rpg-zone" data-label="Nasze pole karne"></div>
        <div class="rpg-zone" data-label="Nasza połowa"></div>
        <div class="rpg-zone" data-label="Środek pola"></div>
        <div class="rpg-zone" data-label="Atak"></div>
        <div class="rpg-zone" data-label="Pole karne rywala"></div>
        <div class="rpg-midline"></div>
        <div class="rpg-center-circle"></div>
        <div class="rpg-goal home"></div>
        <div class="rpg-goal away"></div>
        <div id="rpg-ball" class="rpg-ball" aria-hidden="true">⚽</div>
      </div>
    </div>
    <div class="rpg-possession">
      <span class="rpg-tag" id="rpg-possession-tag">Twoje posiadanie</span>
      <span id="rpg-zone-text">Piłka w środku pola</span>
      <span id="rpg-chance-tag" class="rpg-tag chance hidden">Wykreowana okazja</span>
    </div>
    <div id="rpg-narrator" class="rpg-narrator">
      <small>Mistrz meczu</small>
      <strong>Zaczynasz od środka. Wybierz pierwsze zagranie.</strong>
    </div>
    <div id="rpg-log" class="rpg-log hidden"></div>
    <div id="rpg-action-panel" class="rpg-action-panel"></div>
    <div class="rpg-tools">
      <button id="rpg-hint-btn" class="rpg-tool" type="button">🎧 Podpowiedź trenera 50/50</button>
      <button id="rpg-swap-btn" class="rpg-tool" type="button">🔁 Zmiana pytania</button>
    </div>`;

  const phase = el('phase-card');
  quiz.insertBefore(board, phase || quiz.firstChild);
  el('rpg-hint-btn').addEventListener('click', useRpgHint);
  el('rpg-swap-btn').addEventListener('click', useRpgQuestionSwap);
}

function resetRpgState() {
  state.rpgPlayerGoals = 0;
  state.rpgOpponentGoals = 0;
  state.rpgMinute = 0;
  state.rpgPossession = 'player';
  state.rpgZone = 2;
  state.rpgClearChance = false;
  state.rpgHalftimeDone = false;
  state.rpgHalftimePending = false;
  state.rpgInAddedTime = false;
  state.rpgAddedTimePending = false;
  state.rpgEnded = false;
  state.rpgAwaitingAction = true;
  state.rpgCurrentAction = null;
  state.rpgQuestionBank = [];
  state.rpgUsedQuestionIds = new Set();
  state.rpgLastCategory = null;
  state.rpgLogs = [];
  state.rpgHintAvailable = true;
  state.rpgSwapAvailable = true;
  state.rpgActionsPlayed = 0;
  state.rpgShots = 0;
  state.rpgSuccessfulActions = 0;
  state.rpgContextualQuestions = 0;
  state.rpgLastQuestionContext = null;
}

function zoneName(zone) {
  return ['naszym polu karnym', 'naszej połowie', 'środku pola', 'strefie ataku', 'polu karnym rywala'][Math.max(0, Math.min(4, zone))];
}

function narratorText() {
  const z = state.rpgZone;
  if (state.rpgInAddedTime) return '90+3’. To może być ostatnia akcja meczu.';
  if (state.rpgPossession === 'player') {
    if (z === 0) return 'Bramkarz ma piłkę. Trzeba wyjść spod pressingu.';
    if (z === 1) return 'Budujesz akcję na własnej połowie. Rywal ustawia pressing.';
    if (z === 2) return 'Masz piłkę w środku. Możesz cierpliwie budować albo zagrać odważniej.';
    if (z === 3) return 'Jesteś trzydzieści metrów od bramki. Tutaj decyzje zaczynają ważyć więcej.';
    if (state.rpgClearChance) return 'Obrona rywala jest rozciągnięta. Masz wykreowaną okazję w polu karnym.';
    return 'Piłka w polu karnym rywala. Czas zdecydować, jak wykończyć akcję.';
  }
  if (z >= 3) return 'Rywal zaczyna od tyłu. Możesz czekać albo spróbować odebrać wysoko.';
  if (z === 2) return 'Rywal prowadzi piłkę przez środek. Musisz zdecydować, jak bronisz.';
  if (z === 1) return 'Rywal jest pod twoim polem karnym. Każdy błąd może otworzyć drogę do strzału.';
  return 'Alarm w polu karnym. Teraz bronisz bezpośredniej sytuacji bramkowej.';
}

function renderRpgBoard() {
  ensureRpgUi();
  if (!rpgActive()) return;
  document.body.classList.add('rpg-match-active');
  el('rpg-player-score').textContent = String(state.rpgPlayerGoals || 0);
  el('rpg-opponent-score').textContent = String(state.rpgOpponentGoals || 0);
  el('rpg-minute').textContent = state.rpgInAddedTime ? '90+3’' : `${state.rpgMinute || 0}’`;
  el('rpg-half').textContent = state.rpgHalftimeDone ? (state.rpgInAddedTime ? 'doliczony czas' : '2. połowa') : '1. połowa';
  const ball = el('rpg-ball');
  ball.style.left = `${10 + Math.max(0, Math.min(4, state.rpgZone)) * 20}%`;
  ball.classList.toggle('opponent', state.rpgPossession === 'opponent');
  el('rpg-possession-tag').textContent = state.rpgPossession === 'player' ? 'Twoje posiadanie' : 'Rywal przy piłce';
  el('rpg-zone-text').textContent = `Piłka w ${zoneName(state.rpgZone)}.`;
  el('rpg-chance-tag').classList.toggle('hidden', !state.rpgClearChance);
  el('rpg-narrator').querySelector('strong').textContent = narratorText();
  el('score-label').textContent = 'Mecz';
  el('score').textContent = `${state.rpgPlayerGoals || 0} : ${state.rpgOpponentGoals || 0}`;
  renderRpgLog();
  updateRpgTools();
}

function addRpgLog(text, tone = '') {
  const minute = state.rpgInAddedTime ? '90+3’' : `${state.rpgMinute}’`;
  state.rpgLogs.unshift({ text: `${minute} ${text}`, tone });
  state.rpgLogs = state.rpgLogs.slice(0, 5);
  renderRpgLog();
}

function renderRpgLog() {
  const box = el('rpg-log');
  if (!box) return;
  box.innerHTML = (state.rpgLogs || []).map(item => `<div class="rpg-log-line ${item.tone || ''}">${item.text}</div>`).join('');
  box.classList.toggle('hidden', !state.rpgLogs?.length);
}

function hideQuestionUi(hidden) {
  ['question-clubs','question-number','season','difficulty-label','question-type-label','question-style','question','hints-box','reveal-hint','answers','feedback','sources','next','source-box']
    .forEach(id => el(id)?.classList.toggle('hidden', hidden));
  const meta = document.querySelector('#quiz .meta');
  meta?.classList.toggle('hidden', hidden);
  const actions = document.querySelector('#quiz .actions');
  actions?.classList.toggle('hidden', hidden);
}

function riskLabel(dc) {
  if (dc <= 2) return ['risk-low', 'bezpieczne'];
  if (dc >= 4) return ['risk-high', 'ryzykowne'];
  return ['', 'umiarkowane'];
}

function playerActions() {
  const z = state.rpgZone;
  if (z <= 1) return [
    { id:'short_build', label:'Krótko od tyłu', desc:'Spokojne wyprowadzenie piłki o jedną strefę.', dc:2, kind:'advance', move:1 },
    { id:'carry', label:'Wyjdź z piłką', desc:'Próba minięcia pierwszej linii pressingu.', dc:3, kind:'advance', move:1 },
    { id:'long_ball', label:'Długa piłka', desc:'Możesz ominąć dwie strefy, ale strata oddaje rywalowi środek.', dc:4, kind:'advance', move:2, failZone:2 },
  ];
  if (z === 2) return [
    { id:'safe_pass', label:'Cierpliwe rozegranie', desc:'Przesuń akcję o jedną strefę małym ryzykiem.', dc:2, kind:'advance', move:1 },
    { id:'vertical', label:'Podanie między liniami', desc:'Szybsze wejście w atak. Trudniejszy test.', dc:3, kind:'advance', move:1 },
    { id:'through_ball', label:'Prostopadła piłka', desc:'Udana akcja przenosi cię od razu w pole karne.', dc:4, kind:'advance', move:2 },
  ];
  if (z === 3) return [
    { id:'combination', label:'Klepka przed polem karnym', desc:'Wypracuj wejście w szesnastkę.', dc:2, kind:'advance', move:1 },
    { id:'killer_pass', label:'Podanie otwierające', desc:'Trudniej, ale po sukcesie dostaniesz czystszą okazję.', dc:4, kind:'create_chance', move:1 },
    { id:'long_shot', label:'Strzał z dystansu', desc:'Bez budowania kolejnej akcji. Bardzo trudny test bezpośrednio o gola.', dc:5, kind:'shot', shot:'distance' },
  ];
  const bonus = state.rpgClearChance ? 1 : 0;
  return [
    { id:'cutback', label:'Wycofanie na czystą pozycję', desc:'Nie strzelasz od razu — przygotowujesz łatwiejsze wykończenie następnej akcji.', dc:2, kind:'setup_chance' },
    { id:'placed_shot', label:'Strzał po ziemi', desc:'Kontrolowane wykończenie akcji.', dc:Math.max(1, 3 - bonus), kind:'shot', shot:'placed' },
    { id:'power_shot', label:'Mocny strzał', desc:'Trudniejsze wykończenie, bez miejsca na poprawkę.', dc:Math.max(2, 4 - bonus), kind:'shot', shot:'power' },
  ];
}

function opponentActions() {
  const z = state.rpgZone;
  if (z >= 2) return [
    { id:'shape', label:'Zostań w ustawieniu', desc:'Bezpieczna obrona pozycyjna. Sukces spycha rywala do tyłu.', dc:2, kind:'defend_shape', failAdvance:1 },
    { id:'press', label:'Wysoki pressing', desc:'Możesz od razu odzyskać piłkę. Błąd otwiera rywalowi przestrzeń.', dc:3, kind:'defend_win', failAdvance:1 },
    { id:'tackle', label:'Agresywny odbiór', desc:'Po sukcesie ruszasz z kontrą, ale nieudany odbiór jest bardzo kosztowny.', dc:4, kind:'defend_tackle', failAdvance:2 },
  ];
  return [
    { id:'block', label:'Zablokuj strzał', desc:'Najbardziej zachowawcza próba przerwania sytuacji.', dc:2, kind:'danger_block' },
    { id:'close_angle', label:'Zamknij kąt', desc:'Sukces wypycha rywala z pola karnego.', dc:3, kind:'danger_shape' },
    { id:'last_tackle', label:'Wślizg ostatniej szansy', desc:'Wygrany test uruchamia kontrę. Błąd może skończyć się golem.', dc:4, kind:'danger_tackle' },
  ];
}

function availableRpgActions() {
  return state.rpgPossession === 'player' ? playerActions() : opponentActions();
}

function renderActionPanel() {
  const panel = el('rpg-action-panel');
  const actions = availableRpgActions();
  const role = state.rpgPossession === 'player' ? 'Wybierz zagranie' : 'Wybierz sposób obrony';
  panel.innerHTML = `
    <div class="rpg-action-heading"><div><strong>${role}</strong><span>Trudność zagrania ustala trudność testu wiedzy.</span></div><span>${state.rpgPossession === 'player' ? '⚽ Masz piłkę' : '🛡️ Bronisz'}</span></div>
    <div class="rpg-actions"></div>`;
  const grid = panel.querySelector('.rpg-actions');
  actions.forEach(action => {
    const [riskClass, riskText] = riskLabel(action.dc);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `rpg-action ${riskClass}`;
    button.innerHTML = `<strong>${action.label}</strong><p>${action.desc}</p><div class="rpg-action-meta"><span class="rpg-dc">Test ${action.dc}/5</span><span class="rpg-risk">${riskText}</span></div>`;
    button.addEventListener('click', () => chooseRpgAction(action));
    grid.appendChild(button);
  });
}

function rpgQuestionContext(action = {}) {
  const situation = state.rpgScenarioCurrent || {};
  const setPiece = state.rpgSetPiece || situation.setPiece || {};
  return {
    situationId:String(situation.id || ''),
    actionKind:String(action.kind || ''),
    actionId:String(action.id || ''),
    setPieceType:String(setPiece.type || ''),
    minute:Number(situation.minute ?? state.rpgMinute ?? 0),
    dc:Number(action.dc || 3),
  };
}

function chooseRpgQuestion(actionOrDc, excludeId = null) {
  const action = typeof actionOrDc === 'object' && actionOrDc
    ? actionOrDc
    : { dc:Number(actionOrDc || 3), kind:'', id:'' };
  const dc = Number(action.dc || 3);
  let candidates = state.rpgQuestionBank.filter(q =>
    q.id !== excludeId &&
    !state.rpgUsedQuestionIds.has(q.id) &&
    Array.isArray(q.options) &&
    q.options.length >= 2 &&
    !String(q.type || '').startsWith('special_')
  );
  if (!candidates.length) {
    state.rpgUsedQuestionIds.clear();
    candidates = state.rpgQuestionBank.filter(q =>
      q.id !== excludeId &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      !String(q.type || '').startsWith('special_')
    );
  }
  if (!candidates.length) return null;

  const shortlistSize = Math.min(candidates.length, 72);
  const shortlist = smartPick(candidates, shortlistSize, { difficultyTarget:dc });
  const context = rpgQuestionContext(action);
  const selected = matchQuestionContextCore
    ? matchQuestionContextCore.chooseQuestion(shortlist, context, {
        targetDifficulty:dc,
        lastCategory:state.rpgLastCategory,
      })
    : null;
  const chosen = selected?.question || shortlist[0] || candidates[0];
  if (!chosen) return null;

  state.rpgUsedQuestionIds.add(chosen.id);
  state.rpgLastCategory = categoryForType(chosen.type);
  state.rpgLastQuestionContext = selected
    ? {
        id:selected.profile?.id || 'general',
        label:selected.profile?.label || '',
        contextual:Boolean(selected.contextual),
        boost:Number(selected.contextBoost || 0),
      }
    : null;
  if (selected?.contextual) {
    state.rpgContextualQuestions = Number(state.rpgContextualQuestions || 0) + 1;
  }
  return chosen;
}

function chooseRpgAction(action) {
  const q = chooseRpgQuestion(action);
  if (!q) {
    state.rpgEnded = true;
    finishGame();
    return;
  }
  state.rpgCurrentAction = action;
  state.rpgAwaitingAction = false;
  const wrapped = {
    ...q,
    gameMeta: {
      phase: state.rpgHalftimeDone ? '2. POŁOWA' : '1. POŁOWA',
      minute: state.rpgInAddedTime ? '90+3’' : `${state.rpgMinute}’`,
      points: 0,
      position: state.index + 1,
      contextId:state.rpgLastQuestionContext?.id || null,
      contextLabel:state.rpgLastQuestionContext?.contextual
        ? state.rpgLastQuestionContext.label
        : null,
      contextBoost:Number(state.rpgLastQuestionContext?.boost || 0),
    },
  };
  state.pool[state.index] = wrapped;
  state.current = null;
  el('rpg-action-panel').classList.add('hidden');
  hideQuestionUi(false);
  showQuestion();
}

function updateRpgTools() {
  const hint = el('rpg-hint-btn');
  const swap = el('rpg-swap-btn');
  if (!hint || !swap) return;
  const inQuestion = rpgActive() && !state.rpgAwaitingAction && state.current;
  hint.disabled = !inQuestion || !state.rpgHintAvailable || !Array.isArray(state.current?.options) || state.current.options.length < 4;
  hint.textContent = state.rpgHintAvailable ? '🎧 Podpowiedź trenera 50/50' : '🎧 Podpowiedź wykorzystana';
  swap.disabled = !inQuestion || !state.rpgSwapAvailable;
  swap.textContent = state.rpgSwapAvailable ? '🔁 Zmiana pytania' : '🔁 Zmiana wykorzystana';
}

function useRpgHint() {
  if (!rpgActive() || !state.rpgHintAvailable || !state.current) return;
  const buttons = [...document.querySelectorAll('#answers .answer')];
  const wrong = shuffle(buttons.filter(b => b.textContent !== state.current.answer && !b.disabled));
  if (wrong.length < 2) return;
  wrong.slice(0,2).forEach(b => { b.disabled = true; b.style.opacity = '.22'; });
  state.rpgHintAvailable = false;
  updateRpgTools();
  addRpgLog('🎧 Trener podpowiada z ławki: dwie odpowiedzi odpadają.', 'good');
}

function useRpgQuestionSwap() {
  if (!rpgActive() || !state.rpgSwapAvailable || !state.current || !state.rpgCurrentAction) return;
  const replacement = chooseRpgQuestion(state.rpgCurrentAction, state.current.id);
  if (!replacement) return;
  state.rpgSwapAvailable = false;
  state.pool[state.index] = {
    ...replacement,
    gameMeta:{
      ...state.current.gameMeta,
      contextId:state.rpgLastQuestionContext?.id || null,
      contextLabel:state.rpgLastQuestionContext?.contextual
        ? state.rpgLastQuestionContext.label
        : null,
      contextBoost:Number(state.rpgLastQuestionContext?.boost || 0),
    },
  };
  state.current = null;
  addRpgLog('🔁 Zmiana z ławki: inne pytanie rozstrzygnie tę samą akcję.', 'good');
  showQuestion();
}

function goalForPlayer(reason) {
  state.rpgPlayerGoals += 1;
  state.rpgPossession = 'opponent';
  state.rpgZone = 2;
  state.rpgClearChance = false;
  addRpgLog(`⚽ GOL! ${reason} Rywal wznowi od środka.`, 'goal');
}

function goalForOpponent(reason) {
  state.rpgOpponentGoals += 1;
  state.rpgPossession = 'player';
  state.rpgZone = 2;
  state.rpgClearChance = false;
  addRpgLog(`🥅 Gol dla rywala. ${reason} Wznawiasz od środka.`, 'bad');
}

function resolvePlayerAction(action, correct) {
  if (action.kind === 'shot') {
    state.rpgShots += 1;
    if (correct) goalForPlayer(action.shot === 'distance' ? 'Strzał z dystansu znajduje drogę do siatki.' : 'Wykańczasz akcję.');
    else {
      state.rpgPossession = 'opponent';
      state.rpgZone = action.shot === 'distance' ? 2 : 1;
      state.rpgClearChance = false;
      addRpgLog('Strzał nie kończy się golem. Rywal przejmuje piłkę.', 'bad');
    }
    return;
  }
  if (action.kind === 'setup_chance') {
    if (correct) {
      state.rpgClearChance = true;
      addRpgLog('Udane wycofanie. Obrona jest rozciągnięta — następny strzał będzie łatwiejszy.', 'good');
    } else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 2;
      state.rpgClearChance = false;
      addRpgLog('Podanie przecięte. Rywal wychodzi z pola karnego.', 'bad');
    }
    return;
  }
  if (correct) {
    state.rpgZone = Math.min(4, state.rpgZone + (action.move || 1));
    if (action.kind === 'create_chance') state.rpgClearChance = true;
    addRpgLog(`Udana akcja: ${action.label.toLowerCase()}. Piłka przesuwa się do ${zoneName(state.rpgZone)}.`, 'good');
  } else {
    state.rpgPossession = 'opponent';
    if (Number.isInteger(action.failZone)) state.rpgZone = action.failZone;
    state.rpgClearChance = false;
    addRpgLog(`Strata przy próbie: ${action.label.toLowerCase()}. Rywal przejmuje piłkę.`, 'bad');
  }
}

function resolveOpponentAction(action, correct) {
  if (action.kind === 'danger_block' || action.kind === 'danger_shape' || action.kind === 'danger_tackle') {
    if (correct) {
      if (action.kind === 'danger_shape') {
        state.rpgZone = Math.min(2, state.rpgZone + 1);
        addRpgLog('Dobrze zamykasz przestrzeń. Rywal musi wycofać akcję.', 'good');
      } else {
        state.rpgPossession = 'player';
        state.rpgZone = action.kind === 'danger_tackle' ? 2 : 1;
        addRpgLog(action.kind === 'danger_tackle' ? 'Perfekcyjny wślizg i od razu możesz wyjść z kontrą.' : 'Blokujesz próbę i przejmujesz piłkę.', 'good');
      }
    } else if (action.kind === 'danger_shape' && state.rpgZone === 1) {
      state.rpgZone = 0;
      addRpgLog('Rywal znajduje jeszcze metr przestrzeni. Następna akcja jest już w polu karnym.', 'bad');
    } else {
      goalForOpponent(action.kind === 'danger_tackle' ? 'Spóźniony wślizg otworzył drogę do bramki.' : 'Nie udało się zatrzymać strzału.');
    }
    return;
  }

  if (correct) {
    if (action.kind === 'defend_shape') {
      if (state.rpgZone >= 4) {
        state.rpgPossession = 'player';
        state.rpgZone = 3;
        addRpgLog('Cierpliwa obrona wymusza błąd rywala. Odbierasz piłkę.', 'good');
      } else {
        state.rpgZone = Math.min(4, state.rpgZone + 1);
        addRpgLog('Dobra organizacja. Rywal zostaje wypchnięty dalej od twojej bramki.', 'good');
      }
    } else {
      state.rpgPossession = 'player';
      if (action.kind === 'defend_tackle') state.rpgZone = Math.min(4, state.rpgZone + 1);
      addRpgLog(action.kind === 'defend_tackle' ? 'Odbiór! Masz od razu lepszą pozycję do kontry.' : 'Pressing zadziałał. Piłka jest twoja.', 'good');
    }
  } else {
    state.rpgZone = Math.max(0, state.rpgZone - (action.failAdvance || 1));
    addRpgLog(`Rywal wychodzi spod presji i przesuwa akcję do ${zoneName(state.rpgZone)}.`, 'bad');
  }
}

function advanceRpgClock(action) {
  if (state.rpgInAddedTime) {
    state.rpgEnded = true;
    return;
  }
  const delta = 5 + Math.ceil((action.dc || 3) / 2);
  state.rpgMinute += delta;
  if (!state.rpgHalftimeDone && state.rpgMinute >= 45) {
    state.rpgMinute = 45;
    state.rpgHalftimePending = true;
    return;
  }
  if (state.rpgHalftimeDone && state.rpgMinute >= 90) {
    const dangerous = (state.rpgPossession === 'player' && state.rpgZone >= 3) || (state.rpgPossession === 'opponent' && state.rpgZone <= 1);
    if (dangerous && !state.rpgAddedTimePending) {
      state.rpgMinute = 90;
      state.rpgAddedTimePending = true;
    } else {
      state.rpgMinute = 90;
      state.rpgEnded = true;
    }
  }
}

function prepareNextRpgTurn() {
  if (state.rpgHalftimePending) {
    state.rpgHalftimePending = false;
    state.rpgHalftimeDone = true;
    state.rpgMinute = 46;
    state.rpgPossession = 'opponent';
    state.rpgZone = 2;
    state.rpgClearChance = false;
    addRpgLog('⏸️ Przerwa. Po zmianie stron rywal rozpoczyna drugą połowę.', '');
  } else if (state.rpgAddedTimePending && !state.rpgInAddedTime) {
    state.rpgAddedTimePending = false;
    state.rpgInAddedTime = true;
    state.rpgMinute = 93;
    addRpgLog('⏱️ Sędzia pozwala dokończyć groźną akcję. To ostatnia piłka meczu.', '');
  }
}

function showRpgDecisionStage() {
  prepareNextRpgTurn();
  if (state.rpgEnded || state.index >= RPG_MAX_ACTIONS) {
    finishGame();
    return;
  }
  state.rpgAwaitingAction = true;
  state.current = null;
  hideQuestionUi(true);
  el('rpg-action-panel').classList.remove('hidden');
  renderRpgBoard();
  renderActionPanel();
  updateRpgTools();
}

function rpgResultText() {
  if (state.rpgPlayerGoals > state.rpgOpponentGoals) return ['WYGRYWASZ', 'Wiedza przełożyła się na decyzje boiskowe i wynik.'];
  if (state.rpgPlayerGoals < state.rpgOpponentGoals) return ['PRZEGRYWASZ', 'Mecz uciekł w kilku kluczowych testach. Rewanż może wyglądać zupełnie inaczej.'];
  return ['REMIS', 'Równo na tablicy. W tym meczu żadna strona nie znalazła decydującej przewagi.'];
}

updateScore = function rpgUpdateScore() {
  if (!rpgActive()) {
    if (typeof matchLegacyUpdateScore === 'function') matchLegacyUpdateScore();
    return;
  }
  el('score-label').textContent = 'Mecz';
  el('score').textContent = `${state.rpgPlayerGoals || 0} : ${state.rpgOpponentGoals || 0}`;
  renderRpgBoard();
};

showQuestion = function rpgShowQuestion() {
  if (!rpgActive()) {
    document.body.classList.remove('rpg-match-active');
    rpgBaseShowQuestion();
    return;
  }
  ensureRpgUi();
  if (state.rpgEnded || state.index >= RPG_MAX_ACTIONS) {
    finishGame();
    return;
  }
  if (state.rpgAwaitingAction || !state.pool[state.index]) {
    showRpgDecisionStage();
    return;
  }

  hideQuestionUi(false);
  el('rpg-action-panel').classList.add('hidden');
  rpgBaseShowQuestion();
  if (!state.current) return;
  const action = state.rpgCurrentAction;
  el('question-number').textContent = `Akcja ${state.index + 1}`;
  el('difficulty-label').textContent = `Test ${state.current.difficulty || action?.dc || 3}/5`;
  el('question-type-label').textContent = labelType(state.current.type);
  el('question-style').textContent = `TEST AKCJI · ${String(action?.label || '').toUpperCase()}`;
  const narrator = el('rpg-narrator')?.querySelector('strong');
  if (narrator) narrator.textContent = `${action.label}. Poprawna odpowiedź oznacza powodzenie akcji.`;
  renderRpgBoard();
  updateRpgTools();
};

answer = function rpgAnswer(button, option) {
  if (!rpgActive()) return rpgBaseAnswer(button, option);
  const q = state.current;
  const action = state.rpgCurrentAction;
  if (!q || !action) return;
  const correct = option === q.answer;
  const result = rpgBaseAnswer(button, option);
  state.rpgActionsPlayed += 1;
  if (correct) state.rpgSuccessfulActions += 1;

  if (state.rpgPossession === 'player') resolvePlayerAction(action, correct);
  else resolveOpponentAction(action, correct);
  advanceRpgClock(action);
  state.rpgAwaitingAction = true;

  const resolution = document.createElement('div');
  resolution.className = `rpg-resolution ${correct ? 'good' : 'bad'}`;
  resolution.textContent = correct ? '✓ Test zdany — zagranie się udało.' : '✕ Test niezdany — akcja kończy się niepowodzeniem.';
  el('feedback')?.appendChild(resolution);
  el('next').textContent = state.rpgEnded ? 'Końcowy gwizdek' : (state.rpgHalftimePending ? 'Do szatni' : 'Następna akcja');
  updateScore();
  updateRpgTools();
  return result;
};

finishGame = function rpgFinishGame() {
  if (!rpgActive()) {
    if (typeof matchLegacyFinishGame === 'function') matchLegacyFinishGame();
    return;
  }
  state.rpgEnded = true;
  hideQuestionUi(true);
  el('quiz').classList.add('hidden');
  el('match-hud')?.classList.add('hidden');
  const [headline, description] = rpgResultText();
  const total = state.answered || 0;
  const percent = total ? Math.round((state.correct / total) * 100) : 0;
  el('result-title').textContent = `${headline} ${state.rpgPlayerGoals}:${state.rpgOpponentGoals}`;
  el('result-score').textContent = `${state.rpgPlayerGoals}:${state.rpgOpponentGoals}`;
  el('result-percent').textContent = `${percent}%`;
  el('result-details').textContent = `Udane testy: ${state.correct}/${total} · rozegrane akcje: ${state.rpgActionsPlayed} · strzały: ${state.rpgShots} · dopasowane pytania: ${Number(state.rpgContextualQuestions || 0)}/${total}`;
  const rank = el('result-rank');
  rank.innerHTML = `<strong>${headline}</strong><span>${description}</span>`;
  rank.classList.remove('hidden');
  el('result-humor').classList.add('hidden');
  el('result').classList.remove('hidden');
  el('status').textContent = `Koniec meczu · ${state.rpgPlayerGoals}:${state.rpgOpponentGoals}`;
  document.body.classList.remove('rpg-match-active');
};

startGame = function rpgStartGame() {
  if (!rpgActive()) {
    document.body.classList.remove('rpg-match-active');
    rpgNonMatchStart();
    return;
  }
  ensureRpgUi();
  resetRpgState();
  state.rpgQuestionBank = baseFilteredQuestions().filter(q => Array.isArray(q.options) && q.options.length >= 2);
  state.pool = new Array(RPG_MAX_ACTIONS).fill(null);
  state.index = 0;
  state.correct = 0;
  state.answered = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.current = null;
  el('result').classList.add('hidden');
  el('quiz').classList.remove('hidden');
  el('status').classList.remove('hidden');
  el('match-hud')?.classList.add('hidden');

  if (state.rpgQuestionBank.length < 6) {
    el('status').textContent = 'Za mało pytań w tym zakresie, żeby zasymulować pełny mecz.';
    el('quiz').classList.add('hidden');
    return;
  }

  const selectedClub = el('scope-mode').value === 'club' ? el('club').value : null;
  el('status').textContent = `Symulowany mecz RPG · ${selectedClub || 'cała A-klasa Myślenice'} · ${selectedSeasonLabel()}`;
  document.body.classList.add('rpg-match-active');
  updateScore();
  showRpgDecisionStage();
};

el('game-format')?.addEventListener('change', () => {
  const desc = el('format-description');
  if (currentFormat() === 'match90' && desc) {
    desc.textContent = 'Rozgrywasz mecz akcja po akcji. Wybór zagrania ustala trudność, a poprawna odpowiedź zastępuje rzut kostką.';
  }
});
if (currentFormat() === 'match90' && el('format-description')) {
  el('format-description').textContent = 'Rozgrywasz mecz akcja po akcji. Wybór zagrania ustala trudność, a poprawna odpowiedź zastępuje rzut kostką.';
}
