// Contextual A-class event layer.
// Extends the existing local-club-events system instead of duplicating its classic events.
const aClassEventsCore = globalThis.AClassEventsCore;
const aClassBaseResetRpgState = resetRpgState;
const aClassBaseRenderRpgBoard = renderRpgBoard;
const aClassBaseRenderActionPanel = renderActionPanel;
const aClassBaseScenarioOdds = scenarioOdds;
const aClassBaseAnswer = answer;
const aClassBaseFinishGame = finishGame;
const aClassBaseShowRpgDecisionStage = showRpgDecisionStage;
const aClassBaseLocalLifeForce = localLifeForce;
const aClassBaseLocalLifeChoose = localLifeChoose;

const A_CLASS_EXTRA_EVENTS = Object.freeze([
  {
    id:'forgotten_kits', category:'dressing', icon:'👕', title:'Stroje zostały w domu',
    copy:'Wszyscy są na miejscu. Wszystko jest gotowe. Poza kompletem meczowym, który jedzie właśnie w bagażniku kierownika.',
    choices:[
      { label:'Gramy w znacznikach', desc:'Numery są umowne, kolory mniej więcej się zgadzają.', result:'Znaczniki robią za stroje. Wygląda średnio, ale pierwszy gwizdek nie czeka.', effect:{ playerMomentum:6, attackDc:1 } },
      { label:'Pożyczamy awaryjny komplet', desc:'Gospodarz ma coś w magazynku.', result:'Kolor nie klubowy, rozmiary losowe, ale przynajmniej wszyscy wyglądają jak jedna drużyna.', effect:{ clock:2, defenseDc:-1 } },
      { label:'Czekamy na samochód kierownika', desc:'„Pięć minut i jestem”.', result:'Komplet dojeżdża. Szatnia przyjmuje to jak pierwsze zwycięstwo dnia.', effect:{ clock:3, delayed:{ after:2, playerMomentum:10, log:'👕 Stroje dojechały i temat zamknięty. +10% ognia po organizacyjnym zwycięstwie.' } } },
    ],
  },
  {
    id:'flat_ball', category:'pitch', icon:'🎈', title:'Piłka miękka jak poduszka',
    copy:'Po jednym mocniejszym podaniu wszyscy już wiedzą: powietrza jest w niej mniej niż optymizmu przed sezonem.',
    choices:[
      { label:'Gramy, jaka jest', desc:'Nie ma czasu na serwis.', result:'Piłka zostaje w grze. Strzały zaczynają przypominać podania do bramkarza.', effect:{ attackDc:1 } },
      { label:'Pompka od kibica', desc:'Ktoś za płotem na pewno ma w samochodzie.', result:'Pompka znaleziona szybciej niż można było przypuszczać. Gramy dalej.', effect:{ clock:1, playerMomentum:5 } },
      { label:'Nowa z magazynku', desc:'O ile ktoś pamięta, gdzie jest klucz.', result:'Nowa piłka ląduje na murawie. Nagle wszyscy odzyskują technikę.', effect:{ clock:1, attackDc:-1 } },
    ],
  },
  {
    id:'torn_net', category:'pitch', icon:'🥅', title:'Siatka puściła przy słupku',
    copy:'Piłka przechodzi przez dziurę w siatce, a dyskusja czy był gol zaczyna się zanim ktokolwiek zdąży odetchnąć.',
    choices:[
      { label:'Trytytki kierownika', desc:'Najbardziej uniwersalne narzędzie w lokalnym futbolu.', result:'Dwie trytytki i bramka znowu spełnia normy przynajmniej do końca meczu.', effect:{ clock:1, defenseDc:-1 } },
      { label:'Taśma z apteczki', desc:'Nie pytamy, dlaczego tam była.', result:'Siatka sklejona. Estetyka 2/10, skuteczność 9/10.', effect:{ clock:1, playerMomentum:6 } },
      { label:'Rezerwowy trzyma siatkę', desc:'Do pierwszej przerwy w grze.', result:'Najdziwniejsze zadanie rezerwowego w tym sezonie wykonane bez protestu.', effect:{ clock:2, attackDc:-1, defenseDc:1 } },
    ],
  },
]);

function aClassAllEvents() {
  return [...LOCAL_LIFE_EVENTS, ...A_CLASS_EXTRA_EVENTS];
}

function aClassContext(prematch = false) {
  const style = typeof arcadeStyle === 'function' ? arcadeStyle() : null;
  return {
    prematch,
    minute: Number(state.rpgScenarioCurrent?.minute || state.rpgMinute || 0),
    scoreDiff: Number(state.rpgPlayerGoals || 0) - Number(state.rpgOpponentGoals || 0),
    chaos: style?.id === 'chaos',
  };
}

function aClassActivateExtra(event, countEvent = true) {
  if (!event || state.rpgLifeActiveEvent) return false;
  state.rpgLifeActiveEvent = event;
  if (!(state.rpgLifeUsedIds instanceof Set)) state.rpgLifeUsedIds = new Set();
  state.rpgLifeUsedIds.add(event.id);
  if (countEvent) {
    state.rpgLifeEventCount = Number(state.rpgLifeEventCount || 0) + 1;
    state.rpgLifeLastEventAction = Number(state.rpgActionsPlayed || 0);
  }
  state.rpgLifeNarration = `${event.icon} ${event.title}. ${event.copy}`;
  addRpgLog(`${event.icon} A-KLASOWE ŻYCIE: ${event.title}.`, '');
  return event;
}

localLifeForce = function aClassContextualLifeForce(id = null, countEvent = true) {
  if (id) {
    const extra = A_CLASS_EXTRA_EVENTS.find(event => event.id === id);
    if (extra) return aClassActivateExtra(extra, countEvent);
    return aClassBaseLocalLifeForce(id, countEvent);
  }
  const event = aClassEventsCore.pickWeighted(
    aClassAllEvents(),
    aClassContext(false),
    state.rpgLifeUsedIds || new Set(),
  );
  if (!event) return false;
  const extra = A_CLASS_EXTRA_EVENTS.some(item => item.id === event.id);
  return extra ? aClassActivateExtra(event, countEvent) : aClassBaseLocalLifeForce(event.id, countEvent);
};

function aClassForcePrematchEvent() {
  const event = aClassEventsCore.pickWeighted(
    aClassAllEvents(),
    aClassContext(true),
    state.rpgLifeUsedIds || new Set(),
  );
  if (!event) return false;
  const extra = A_CLASS_EXTRA_EVENTS.some(item => item.id === event.id);
  state.rpgAClassPrematchPending = true;
  return extra ? aClassActivateExtra(event, true) : aClassBaseLocalLifeForce(event.id, true);
}

maybeTriggerLocalLifeEvent = function aClassMaybeTriggerLocalLifeEvent() {
  if (!rpgActive() || state.rpgEnded || state.rpgHalftimePending || state.rpgInAddedTime || state.rpgSetPiece || state.rpgLifeActiveEvent) return false;
  if (Number(state.rpgLifeEventCount || 0) >= 2) return false;
  const actionNo = Number(state.rpgActionsPlayed || 0);
  if (actionNo < 2 || actionNo - Number(state.rpgLifeLastEventAction ?? -4) < 3) return false;
  if (Number(state.rpgLastEventAction ?? -1) === actionNo || Number(state.rpgMediaLastEventAction ?? -1) === actionNo) return false;

  const guaranteed = aClassEventsCore.shouldGuaranteeEvent({
    actionNo,
    eventCount: Number(state.rpgLifeEventCount || 0),
  });
  const style = typeof arcadeStyle === 'function' ? arcadeStyle() : null;
  const chance = style?.id === 'chaos' ? 0.42 : 0.25;
  if (!guaranteed && Math.random() > chance) return false;
  return Boolean(localLifeForce());
};

resetRpgState = function aClassEventResetRpgState() {
  aClassBaseResetRpgState();
  state.rpgAClassPrematchResolved = false;
  state.rpgAClassPrematchPending = false;
  state.rpgAClassCondition = null;
  state.rpgAClassEventHistory = [];
};

function ensureAClassEventHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-a-class-event-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-a-class-event-hud';
  hud.className = 'rpg-a-class-event-hud';
  hud.innerHTML = `
    <span class="a-class-hud-icon">🏟️</span>
    <span class="a-class-hud-copy">
      <small>A-KLASOWE ŻYCIE</small>
      <strong id="rpg-a-class-event-count">0/2 zdarzeń</strong>
      <em id="rpg-a-class-condition">Warunki meczu: normalne</em>
    </span>`;
  const mentalHud = el('rpg-player-mental-hud');
  const substitutionHud = el('rpg-substitution-hud');
  if (mentalHud) mentalHud.insertAdjacentElement('afterend', hud);
  else if (substitutionHud) substitutionHud.insertAdjacentElement('afterend', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

function renderAClassEventHud() {
  ensureAClassEventHud();
  if (!rpgActive()) return;
  const count = Number(state.rpgAClassEventHistory?.length || 0);
  if (el('rpg-a-class-event-count')) el('rpg-a-class-event-count').textContent = `${count}/2 zdarzeń`;
  const conditionNode = el('rpg-a-class-condition');
  if (!conditionNode) return;
  const condition = state.rpgAClassCondition;
  if (condition) {
    conditionNode.textContent = `${condition.label} · jeszcze ${condition.actionsLeft} ${condition.actionsLeft === 1 ? 'akcja' : 'akcje'}`;
    conditionNode.classList.add('active');
  } else {
    conditionNode.textContent = 'Warunki meczu: normalne';
    conditionNode.classList.remove('active');
  }
}

renderRpgBoard = function aClassEventRenderRpgBoard() {
  const result = aClassBaseRenderRpgBoard();
  renderAClassEventHud();
  return result;
};

scenarioOdds = function aClassEventScenarioOdds(action, knowledgeCorrect) {
  const base = aClassBaseScenarioOdds(action, knowledgeCorrect);
  return aClassEventsCore.adjustedChance(base, state.rpgAClassCondition, action, state.rpgPossession || 'player');
};

renderActionPanel = function aClassEventRenderActionPanel() {
  const result = aClassBaseRenderActionPanel();
  if (!rpgActive() || !state.rpgAClassCondition || state.rpgLifeActiveEvent) return result;
  const heading = el('rpg-action-panel')?.querySelector('.rpg-action-heading');
  if (heading && !heading.querySelector('.a-class-condition-chip')) {
    const chip = document.createElement('span');
    chip.className = 'a-class-condition-chip';
    chip.textContent = `🏟️ ${state.rpgAClassCondition.label}`;
    heading.appendChild(chip);
  }
  return result;
};

localLifeChoose = function aClassEventLifeChoose(index) {
  const event = state.rpgLifeActiveEvent;
  const choice = event?.choices?.[index];
  const minute = Number(state.rpgScenarioCurrent?.minute || state.rpgMinute || 0);
  const result = aClassBaseLocalLifeChoose(index);
  if (!result || !event || !choice) return result;

  const condition = aClassEventsCore.conditionFor(event.id, index);
  if (condition) {
    state.rpgAClassCondition = condition;
    addRpgLog(`🏟️ Warunek meczu: ${condition.label}. Wpływ utrzyma się przez ${condition.actionsLeft} akcje.`, '');
  }
  state.rpgAClassEventHistory.push({
    minute,
    id: event.id,
    title: event.title,
    icon: event.icon,
    choice: choice.label,
    result: choice.result,
    condition: condition?.label || null,
  });
  if (state.rpgAClassPrematchPending) {
    state.rpgAClassPrematchPending = false;
    state.rpgAClassPrematchResolved = true;
  }
  renderAClassEventHud();
  return result;
};

showRpgDecisionStage = function aClassEventDecisionStage() {
  const result = aClassBaseShowRpgDecisionStage();
  if (!rpgActive() || state.rpgEnded || state.rpgAClassPrematchResolved || state.rpgLifeActiveEvent) return result;
  if (Number(state.rpgActionsPlayed || 0) !== 0) {
    state.rpgAClassPrematchResolved = true;
    return result;
  }
  if (!state.rpgCharacterSelected || state.rpgCharacterPending || state.rpgSubstitutionPending || state.rpgTacticalPending) return result;

  state.rpgAClassPrematchResolved = true;
  const style = typeof arcadeStyle === 'function' ? arcadeStyle() : null;
  const chance = style?.id === 'chaos' ? 0.58 : 0.38;
  if (Math.random() > chance) return result;
  if (aClassForcePrematchEvent()) {
    state.rpgAClassPrematchResolved = false;
    renderRpgBoard();
    renderActionPanel();
  }
  return result;
};

answer = function aClassEventAnswer(button, option) {
  if (!rpgActive()) return aClassBaseAnswer(button, option);
  const resolvingMatchAction = Boolean(state.current && state.rpgCurrentAction && !state.rpgAwaitingAction);
  const conditionBefore = state.rpgAClassCondition ? { ...state.rpgAClassCondition } : null;
  const result = aClassBaseAnswer(button, option);
  if (resolvingMatchAction && conditionBefore) {
    state.rpgAClassCondition = aClassEventsCore.tickCondition(conditionBefore);
    if (!state.rpgAClassCondition) addRpgLog(`🏟️ Warunek „${conditionBefore.label}” przestaje wpływać na mecz.`, '');
    renderAClassEventHud();
  }
  return result;
};

finishGame = function aClassEventFinishGame() {
  const history = [...(state.rpgAClassEventHistory || [])];
  const result = aClassBaseFinishGame();
  if (!rpgActive() || !history.length || !el('result-details')) return result;
  const summary = history.map(item => `${item.icon} ${item.title} → ${item.choice}`).join(' · ');
  el('result-details').textContent += ` · A-klasowe życie: ${summary}`;
  return result;
};
