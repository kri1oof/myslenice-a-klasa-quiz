// One-use special cards for Match RPG.
// Loaded after the existing match modifiers so the card changes the final execution chance.
const powerupCore = globalThis.PowerupCore;
const powerupBaseResetRpgState = resetRpgState;
const powerupBaseEnsureRpgUi = ensureRpgUi;
const powerupBaseRenderRpgBoard = renderRpgBoard;
const powerupBaseRenderActionPanel = renderActionPanel;
const powerupBaseScenarioOdds = scenarioOdds;
const powerupBaseChooseRpgAction = chooseRpgAction;
const powerupBaseRollScenarioAction = rollScenarioAction;
const powerupBaseAnswer = answer;
const powerupBaseFinishGame = finishGame;

function powerupContext() {
  return { possession: state.rpgPossession || 'player' };
}

function powerupCardForOdds() {
  return state.rpgPowerupLocked || state.rpgPowerupActive || null;
}

resetRpgState = function powerupResetRpgState() {
  powerupBaseResetRpgState();
  state.rpgPowerupHand = powerupCore.drawHand(3);
  state.rpgPowerupUsedIds = new Set();
  state.rpgPowerupActive = null;
  state.rpgPowerupLocked = null;
  state.rpgPowerupHistory = [];
};

function ensurePowerupHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-powerup-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-powerup-hud';
  hud.className = 'rpg-powerup-hud';
  hud.innerHTML = `
    <div class="powerup-head">
      <span><small>KARTY SPECJALNE</small><strong id="rpg-powerup-summary">3 karty · każda raz</strong></span>
      <em id="rpg-powerup-active-label">Wybierz kartę przed akcją</em>
    </div>
    <div id="rpg-powerup-hand" class="powerup-hand"></div>
    <small class="powerup-rule">Karta nie zmienia poprawności odpowiedzi. Wpływa wyłącznie na wykonanie boiskowe następnej akcji.</small>`;
  const rivalryHud = el('rpg-rivalry-hud');
  const aClassHud = el('rpg-a-class-event-hud');
  if (rivalryHud) rivalryHud.insertAdjacentElement('afterend', hud);
  else if (aClassHud) aClassHud.insertAdjacentElement('afterend', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

ensureRpgUi = function powerupEnsureRpgUi() {
  powerupBaseEnsureRpgUi();
  ensurePowerupHud();
};

function powerupInteractionOpen() {
  if (!rpgActive() || state.rpgEnded || !state.rpgAwaitingAction || state.current || state.rpgPowerupLocked) return false;
  if (state.rpgCharacterPending || state.rpgSubstitutionPending || state.rpgTacticalPending || state.rpgLifeActiveEvent) return false;
  return true;
}

function powerupCanActivate(cardId) {
  if (!powerupInteractionOpen()) return false;
  return powerupCore.canActivate({
    cardId,
    hand: state.rpgPowerupHand || [],
    usedIds: state.rpgPowerupUsedIds || new Set(),
    activeCard: state.rpgPowerupActive,
    lockedCard: state.rpgPowerupLocked,
    possession: state.rpgPossession || 'player',
  });
}

function powerupStatus(cardId) {
  if (state.rpgPowerupUsedIds?.has(cardId)) return 'ZUŻYTA';
  if (state.rpgPowerupLocked === cardId) return 'W GRZE';
  if (state.rpgPowerupActive === cardId) return 'AKTYWNA';
  if (!powerupCore.isEligible(cardId, powerupContext())) {
    return state.rpgPossession === 'player' ? 'TYLKO OBRONA' : 'TYLKO ATAK';
  }
  return 'GOTOWA';
}

function togglePowerup(cardId) {
  if (state.rpgPowerupActive === cardId && powerupInteractionOpen()) {
    state.rpgPowerupActive = null;
    renderPowerupHud();
    renderActionPanel();
    return;
  }
  if (!powerupCanActivate(cardId)) return;
  state.rpgPowerupActive = cardId;
  renderPowerupHud();
  renderActionPanel();
}

function renderPowerupHud() {
  ensurePowerupHud();
  if (!rpgActive()) return;
  const hand = state.rpgPowerupHand || [];
  const used = state.rpgPowerupUsedIds || new Set();
  const summary = el('rpg-powerup-summary');
  if (summary) summary.textContent = `${Math.max(0, hand.length - used.size)}/${hand.length} kart zostało`;

  const activeId = state.rpgPowerupLocked || state.rpgPowerupActive;
  const active = powerupCore.card(activeId);
  const activeLabel = el('rpg-powerup-active-label');
  if (activeLabel) {
    activeLabel.textContent = active
      ? `${active.icon} ${active.label} · ${powerupCore.impactLabel(active.id, powerupContext())}`
      : 'Wybierz kartę przed akcją';
    activeLabel.classList.toggle('active', Boolean(active));
  }

  const box = el('rpg-powerup-hand');
  if (!box) return;
  box.innerHTML = '';
  hand.forEach(cardId => {
    const item = powerupCore.card(cardId);
    if (!item) return;
    const isUsed = used.has(cardId);
    const isActive = state.rpgPowerupActive === cardId || state.rpgPowerupLocked === cardId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `powerup-card ${isUsed ? 'used' : ''} ${isActive ? 'active' : ''}`;
    button.disabled = isUsed || (!isActive && !powerupCanActivate(cardId));
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.innerHTML = `
      <span class="powerup-icon">${item.icon}</span>
      <span class="powerup-copy"><strong>${item.label}</strong><small>${item.desc}</small></span>
      <em>${powerupStatus(cardId)}</em>`;
    button.addEventListener('click', () => togglePowerup(cardId));
    box.appendChild(button);
  });
}

renderRpgBoard = function powerupRenderRpgBoard() {
  const result = powerupBaseRenderRpgBoard();
  renderPowerupHud();
  return result;
};

scenarioOdds = function powerupScenarioOdds(action, knowledgeCorrect) {
  const base = powerupBaseScenarioOdds(action, knowledgeCorrect);
  return powerupCore.adjustedChance(base, powerupCardForOdds(), powerupContext());
};

renderActionPanel = function powerupRenderActionPanel() {
  const result = powerupBaseRenderActionPanel();
  if (!rpgActive() || state.rpgCharacterPending || state.rpgSubstitutionPending || state.rpgTacticalPending || state.rpgLifeActiveEvent) return result;
  const panel = el('rpg-action-panel');
  const heading = panel?.querySelector('.rpg-action-heading');
  const cardId = state.rpgPowerupActive;
  const item = powerupCore.card(cardId);
  if (heading && item && !heading.querySelector('.powerup-active-chip')) {
    const chip = document.createElement('span');
    chip.className = 'powerup-active-chip';
    chip.textContent = `${item.icon} ${item.label} · ${powerupCore.impactLabel(cardId, powerupContext())}`;
    heading.appendChild(chip);
  }
  return result;
};

chooseRpgAction = function powerupChooseRpgAction(action) {
  const selected = state.rpgPowerupActive;
  if (selected && powerupCore.isEligible(selected, powerupContext())) {
    const item = powerupCore.card(selected);
    state.rpgPowerupLocked = selected;
    state.rpgPowerupActive = null;
    state.rpgPowerupUsedIds.add(selected);
    addRpgLog(`🃏 ${item.icon} ${item.label}: karta przypisana do akcji „${action?.label || 'zagranie'}”.`, 'good');
  }
  const result = powerupBaseChooseRpgAction(action);
  renderPowerupHud();
  return result;
};

rollScenarioAction = function powerupRollScenarioAction(action, knowledgeCorrect) {
  const cardId = state.rpgPowerupLocked;
  const result = powerupBaseRollScenarioAction(action, knowledgeCorrect);
  const outcome = state.rpgScenarioLastOutcome;
  if (!outcome) return result;
  outcome.powerupCard = cardId || null;

  if (result || cardId !== 'second_ball') return result;
  const rerollChance = powerupCore.rerollChance(outcome.chance, cardId);
  if (rerollChance === null) return result;
  const rerollSuccess = Math.random() < rerollChance;
  outcome.firstAttemptSuccess = false;
  outcome.rerolled = true;
  outcome.rerollChance = rerollChance;
  outcome.rerollSuccess = rerollSuccess;
  outcome.success = rerollSuccess;
  if (rerollSuccess) {
    state.rpgScenarioSuccessfulEvents = Number(state.rpgScenarioSuccessfulEvents || 0) + 1;
  }
  return rerollSuccess;
};

function appendPowerupResolution(cardId, outcome) {
  const item = powerupCore.card(cardId);
  const feedback = el('feedback');
  if (!item || !feedback) return;
  const node = document.createElement('div');
  const success = outcome?.success === true;
  node.className = `powerup-resolution ${success ? 'good' : 'bad'}`;
  if (outcome?.rerolled) {
    const chance = Math.round(Number(outcome.rerollChance || 0) * 100);
    node.innerHTML = `<strong>${item.icon} ${item.label}</strong><span>Pierwsze wykonanie nie wyszło. Druga piłka: ${chance}% → ${outcome.rerollSuccess ? 'akcja uratowana' : 'ponowna próba także nieudana'}.</span>`;
  } else {
    node.innerHTML = `<strong>${item.icon} ${item.label}</strong><span>Karta została zużyta na tę akcję · efekt ${powerupCore.impactLabel(cardId, powerupContext())}.</span>`;
  }
  feedback.appendChild(node);
}

answer = function powerupAnswer(button, option) {
  if (!rpgActive()) return powerupBaseAnswer(button, option);
  const resolvingAction = Boolean(state.current && state.rpgCurrentAction && !state.rpgAwaitingAction);
  const cardId = state.rpgPowerupLocked;
  const minute = Number(state.rpgScenarioCurrent?.minute || state.rpgMinute || 0);
  const actionLabel = state.rpgCurrentAction?.label || 'Akcja';
  const result = powerupBaseAnswer(button, option);

  if (resolvingAction && cardId) {
    const item = powerupCore.card(cardId);
    const outcome = state.rpgScenarioLastOutcome || {};
    state.rpgPowerupHistory.push({
      id: cardId,
      label: item?.label || cardId,
      icon: item?.icon || '🃏',
      minute,
      action: actionLabel,
      success: outcome.success === true,
      rerolled: Boolean(outcome.rerolled),
      rerollSuccess: Boolean(outcome.rerollSuccess),
    });
    appendPowerupResolution(cardId, outcome);
    state.rpgPowerupLocked = null;
    renderPowerupHud();
  }
  return result;
};

finishGame = function powerupFinishGame() {
  const history = [...(state.rpgPowerupHistory || [])];
  const handSize = Number(state.rpgPowerupHand?.length || 0);
  const result = powerupBaseFinishGame();
  if (!rpgActive() || !el('result-details')) return result;
  if (!history.length) {
    el('result-details').textContent += ` · karty specjalne: 0/${handSize}`;
    return result;
  }
  const used = history.map(item => `${item.icon} ${item.label} ${item.minute}’`).join(', ');
  el('result-details').textContent += ` · karty specjalne: ${history.length}/${handSize} · ${used}`;
  return result;
};
