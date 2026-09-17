// Tactical decisions layer for Match RPG.
// Adds context-sensitive coaching decisions at three match checkpoints.
const tacticalCore = globalThis.TacticalDecisionCore;
const tacticalBaseResetRpgState = resetRpgState;
const tacticalBaseEnsureRpgUi = ensureRpgUi;
const tacticalBaseRenderRpgBoard = renderRpgBoard;
const tacticalBaseAvailableRpgActions = availableRpgActions;
const tacticalBaseRenderActionPanel = renderActionPanel;
const tacticalBaseShowRpgDecisionStage = showRpgDecisionStage;
const tacticalBaseScenarioOdds = scenarioOdds;
const tacticalBaseFinishGame = finishGame;

function tacticalProfile() {
  return tacticalCore.PROFILES[state.rpgTacticalProfile] || tacticalCore.PROFILES.balanced;
}

function tacticalContext(action) {
  return {
    profileId: state.rpgTacticalProfile || 'balanced',
    possession: state.rpgPossession || 'player',
    kind: action?.kind || '',
    dc: Number(action?.dc || 3),
  };
}

resetRpgState = function tacticalResetRpgState() {
  tacticalBaseResetRpgState();
  state.rpgTacticalProfile = 'balanced';
  state.rpgTacticalBands = new Set();
  state.rpgTacticalHistory = [];
  state.rpgTacticalPending = false;
};

function ensureTacticalHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-tactical-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-tactical-hud';
  hud.className = 'rpg-tactical-hud';
  hud.innerHTML = `
    <span class="tactical-hud-label">PLAN TAKTYCZNY</span>
    <strong id="rpg-tactical-name">⚖️ Graj swoje</strong>
    <span id="rpg-tactical-desc">Bez dodatkowego ryzyka.</span>`;
  const scenarioHud = el('rpg-scenario-hud');
  if (scenarioHud) scenarioHud.insertAdjacentElement('afterend', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

ensureRpgUi = function tacticalEnsureRpgUi() {
  tacticalBaseEnsureRpgUi();
  ensureTacticalHud();
};

function renderTacticalHud() {
  ensureTacticalHud();
  if (!rpgActive()) return;
  const profile = tacticalProfile();
  if (el('rpg-tactical-name')) el('rpg-tactical-name').textContent = `${profile.icon} ${profile.label}`;
  if (el('rpg-tactical-desc')) el('rpg-tactical-desc').textContent = profile.desc;
}

renderRpgBoard = function tacticalRenderRpgBoard() {
  tacticalBaseRenderRpgBoard();
  renderTacticalHud();
};

availableRpgActions = function tacticalAvailableRpgActions() {
  const actions = tacticalBaseAvailableRpgActions();
  if (!rpgActive() || !Array.isArray(actions)) return actions;
  return actions.map(action => {
    const shift = tacticalCore.questionShift(tacticalContext(action));
    const dc = Math.max(1, Math.min(5, Number(action.dc || 3) + shift));
    if (!shift) return { ...action, dc };
    return {
      ...action,
      dc,
      tacticalShift: shift,
      desc: `${action.desc} ${shift < 0 ? 'Taktyka ułatwia ten wariant.' : 'Taktyka zwiększa ryzyko tego wariantu.'}`,
    };
  });
};

scenarioOdds = function tacticalScenarioOdds(action, knowledgeCorrect) {
  const base = tacticalBaseScenarioOdds(action, knowledgeCorrect);
  return tacticalCore.adjustedChance(base, tacticalContext(action));
};

// Replace the scenario roll so the displayed tactical odds are also the real odds.
rollScenarioAction = function tacticalRollScenarioAction(action, knowledgeCorrect) {
  const chance = scenarioOdds(action, knowledgeCorrect);
  const success = Math.random() < chance;
  state.rpgScenarioLastOutcome = {
    success,
    chance,
    knowledgeCorrect,
    actionId: action?.id || null,
    actionLabel: action?.label || 'Akcja',
  };
  if (success) state.rpgScenarioSuccessfulEvents = Number(state.rpgScenarioSuccessfulEvents || 0) + 1;
  if (knowledgeCorrect) state.rpgScenarioKnowledgeWins = Number(state.rpgScenarioKnowledgeWins || 0) + 1;
  return success;
};

renderActionPanel = function tacticalRenderActionPanel() {
  tacticalBaseRenderActionPanel();
  if (!rpgActive() || state.rpgTacticalPending) return;
  const heading = el('rpg-action-panel')?.querySelector('.rpg-action-heading');
  const profile = tacticalProfile();
  if (heading && !heading.querySelector('.tactical-active-chip')) {
    const chip = document.createElement('span');
    chip.className = 'tactical-active-chip';
    chip.textContent = `${profile.icon} ${profile.label}`;
    heading.appendChild(chip);
  }
};

function scoreDiff() {
  return Number(state.rpgPlayerGoals || 0) - Number(state.rpgOpponentGoals || 0);
}

function tacticalImpactText(profileId) {
  const profile = tacticalCore.PROFILES[profileId];
  if (!profile) return '';
  const attack = Math.round(profile.attack * 100);
  const defence = Math.round(profile.defence * 100);
  const attackText = `${attack >= 0 ? '+' : ''}${attack}% atak`;
  const defenceText = `${defence >= 0 ? '+' : ''}${defence}% obrona`;
  return `${attackText} · ${defenceText}`;
}

function chooseTacticalProfile(profileId, band) {
  const profile = tacticalCore.PROFILES[profileId] || tacticalCore.PROFILES.balanced;
  state.rpgTacticalProfile = profile.id;
  state.rpgTacticalPending = false;
  state.rpgTacticalBands.add(band);
  state.rpgTacticalHistory.push({
    minute: Number(state.rpgMinute || 0),
    score: `${state.rpgPlayerGoals || 0}:${state.rpgOpponentGoals || 0}`,
    profileId: profile.id,
    label: profile.label,
  });
  addRpgLog(`📋 Zmiana planu: ${profile.icon} ${profile.label}. ${profile.desc}`, 'good');
  renderRpgBoard();
  renderActionPanel();
  updateRpgTools();
}

function showTacticalDecision(situation, band) {
  const panel = el('rpg-action-panel');
  if (!panel) return;
  state.rpgTacticalPending = true;
  const diff = scoreDiff();
  const optionIds = tacticalCore.decisionSet({ minute: situation.minute, scoreDiff: diff });
  const score = `${state.rpgPlayerGoals || 0}:${state.rpgOpponentGoals || 0}`;
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="tactical-decision-card">
      <div class="tactical-decision-kicker">📋 NARADA TAKTYCZNA · ${situation.minute}’ · ${score}</div>
      <h3>${tacticalCore.decisionHeadline({ minute: situation.minute, scoreDiff: diff })}</h3>
      <p>Plan obowiązuje do następnej narady. Zmienia szanse wykonania akcji oraz trudność części testów wiedzy.</p>
      <div class="tactical-options"></div>
    </div>`;
  const grid = panel.querySelector('.tactical-options');
  optionIds.forEach(profileId => {
    const profile = tacticalCore.PROFILES[profileId];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tactical-option ${profileId === state.rpgTacticalProfile ? 'current' : ''}`;
    button.innerHTML = `
      <span class="tactical-option-icon">${profile.icon}</span>
      <span><strong>${profile.label}</strong><small>${profile.desc}</small><em>${tacticalImpactText(profileId)}</em></span>`;
    button.addEventListener('click', () => chooseTacticalProfile(profileId, band));
    grid.appendChild(button);
  });
  updateRpgTools();
}

function maybeOfferTacticalDecision() {
  if (!rpgActive() || state.rpgEnded || state.current || state.rpgTacticalPending) return false;
  const situation = state.rpgScenarioCurrent;
  if (!situation) return false;
  const band = tacticalCore.decisionBand(Number(situation.minute || 0));
  if (!band || state.rpgTacticalBands.has(band)) return false;
  showTacticalDecision(situation, band);
  return true;
}

showRpgDecisionStage = function tacticalShowRpgDecisionStage() {
  const result = tacticalBaseShowRpgDecisionStage();
  if (!rpgActive() || state.rpgEnded) return result;
  maybeOfferTacticalDecision();
  renderTacticalHud();
  return result;
};

finishGame = function tacticalFinishGame() {
  const result = tacticalBaseFinishGame();
  if (!rpgActive()) return result;
  const history = state.rpgTacticalHistory || [];
  if (history.length && el('result-details')) {
    el('result-details').textContent += ` · decyzje taktyczne: ${history.length}`;
  }
  return result;
};
