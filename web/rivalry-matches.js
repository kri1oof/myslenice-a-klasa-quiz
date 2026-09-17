// Derby and H2H rivalry layer for Match RPG.
// Loaded after the A-class event layer. Opponents come from real season club pools;
// derby/rivalry labels are derived from club city metadata and recorded H2H results.
const rivalryMatchCore = globalThis.RivalryMatchCore;
const rivalryBaseResetRpgState = resetRpgState;
const rivalryBaseEnsureRpgUi = ensureRpgUi;
const rivalryBaseRenderRpgBoard = renderRpgBoard;
const rivalryBaseRenderActionPanel = renderActionPanel;
const rivalryBaseScenarioOdds = scenarioOdds;
const rivalryBaseChoosePlayerCharacter = choosePlayerCharacter;
const rivalryBaseAnswer = answer;
const rivalryBaseFinishGame = finishGame;

resetRpgState = function rivalryResetRpgState() {
  rivalryBaseResetRpgState();
  state.rpgOpponentClub = null;
  state.rpgRivalryProfile = null;
  state.rpgRivalryPressure = 35;
  state.rpgRivalryMoment = null;
  state.rpgRivalryMomentHistory = [];
  state.rpgRivalryMomentUsedIds = new Set();
  state.rpgRivalryLastMomentAction = -10;
};

function rivalryShortName(club) {
  if (!club) return 'RYWAL';
  const short = state.clubMeta?.[club]?.short_name;
  if (short) return String(short).toUpperCase();
  const words = String(club).split(/\s+/).filter(Boolean);
  if (words.length <= 2) return String(club).toUpperCase();
  return words.slice(0, 2).join(' ').toUpperCase();
}

function rivalryClassification() {
  return state.rpgRivalryProfile?.classification || {
    id: 'normal', label: 'MECZ LIGOWY', icon: '🏟️', pressure: 35, description: 'Zwykły mecz ligowy.',
  };
}

function rivalryEffectivePressure() {
  const classification = rivalryClassification();
  return rivalryMatchCore.pressureForContext(state.rpgRivalryPressure, {
    minute: Number(state.rpgScenarioCurrent?.minute || state.rpgMinute || 0),
    scoreDiff: Number(state.rpgPlayerGoals || 0) - Number(state.rpgOpponentGoals || 0),
    level: classification.id,
  });
}

function prepareRivalryMatch(character) {
  const profiles = rivalryMatchCore.opponentProfiles(
    state.all || [],
    state.playerCharacters || [],
    state.clubMeta || {},
    character,
  );
  const selected = rivalryMatchCore.pickOpponent(profiles);
  state.rpgOpponentClub = selected?.opponent || null;
  state.rpgRivalryProfile = selected || null;
  state.rpgRivalryPressure = Number(selected?.classification?.pressure || 35);
  state.rpgRivalryMoment = null;
  state.rpgRivalryMomentHistory = [];
  state.rpgRivalryMomentUsedIds = new Set();
  state.rpgRivalryLastMomentAction = -10;
}

function ensureRivalryHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-rivalry-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-rivalry-hud';
  hud.className = 'rpg-rivalry-hud';
  hud.innerHTML = `
    <span class="rivalry-hud-icon" id="rpg-rivalry-icon">🏟️</span>
    <span class="rivalry-hud-copy">
      <small id="rpg-rivalry-label">MECZ LIGOWY</small>
      <strong id="rpg-rivalry-fixture">Rywal do ustalenia</strong>
      <em id="rpg-rivalry-history">Historia H2H ładuje się wraz z wyborem postaci.</em>
    </span>
    <span class="rivalry-pressure">
      <small>PRESJA</small>
      <strong id="rpg-rivalry-pressure">35</strong>
      <span class="rivalry-pressure-track"><i id="rpg-rivalry-pressure-bar"></i></span>
    </span>`;
  const aClassHud = el('rpg-a-class-event-hud');
  if (aClassHud) aClassHud.insertAdjacentElement('afterend', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

ensureRpgUi = function rivalryEnsureRpgUi() {
  rivalryBaseEnsureRpgUi();
  ensureRivalryHud();
};

function renderRivalryHud() {
  ensureRivalryHud();
  if (!rpgActive()) return;
  const character = state.rpgCharacter;
  const opponent = state.rpgOpponentClub;
  const classification = rivalryClassification();
  const h2h = state.rpgRivalryProfile?.h2h;
  const pressure = rivalryEffectivePressure();
  const ownClub = character?.club || 'Twoja drużyna';

  if (el('rpg-rivalry-icon')) el('rpg-rivalry-icon').textContent = classification.icon;
  if (el('rpg-rivalry-label')) el('rpg-rivalry-label').textContent = classification.label;
  if (el('rpg-rivalry-fixture')) {
    el('rpg-rivalry-fixture').textContent = opponent ? `${ownClub} — ${opponent}` : 'Rywal do ustalenia';
  }
  if (el('rpg-rivalry-history')) {
    if (!opponent) {
      el('rpg-rivalry-history').textContent = 'Przeciwnik zostanie dobrany po wyborze postaci.';
    } else if (h2h?.matches) {
      el('rpg-rivalry-history').textContent = `${classification.description} H2H: ${h2h.matches} · bliskie ${h2h.closeMatches} · remisy ${h2h.draws}.`;
    } else {
      el('rpg-rivalry-history').textContent = classification.description;
    }
  }
  if (el('rpg-rivalry-pressure')) el('rpg-rivalry-pressure').textContent = String(Math.round(pressure));
  if (el('rpg-rivalry-pressure-bar')) el('rpg-rivalry-pressure-bar').style.width = `${pressure}%`;

  const hud = el('rpg-rivalry-hud');
  hud?.classList.toggle('special', classification.id !== 'normal');
  hud?.classList.toggle('derby', classification.id === 'derby');

  const teams = document.querySelectorAll('#rpg-board .rpg-score-row .rpg-team small');
  if (teams[0]) teams[0].textContent = rivalryShortName(character?.club || 'TY');
  if (teams[1]) teams[1].textContent = rivalryShortName(opponent);
}

renderRpgBoard = function rivalryRenderRpgBoard() {
  const result = rivalryBaseRenderRpgBoard();
  renderRivalryHud();
  return result;
};

function rivalryOddsContext(action, knowledgeCorrect) {
  const classification = rivalryClassification();
  return {
    pressure: state.rpgRivalryPressure,
    minute: Number(state.rpgScenarioCurrent?.minute || state.rpgMinute || 0),
    scoreDiff: Number(state.rpgPlayerGoals || 0) - Number(state.rpgOpponentGoals || 0),
    level: classification.id,
    action,
    knowledgeCorrect,
    moment: state.rpgRivalryMoment,
    possession: state.rpgPossession || 'player',
  };
}

scenarioOdds = function rivalryScenarioOdds(action, knowledgeCorrect) {
  const base = rivalryBaseScenarioOdds(action, knowledgeCorrect);
  return rivalryMatchCore.adjustedChance(base, rivalryOddsContext(action, knowledgeCorrect));
};

renderActionPanel = function rivalryRenderActionPanel() {
  const result = rivalryBaseRenderActionPanel();
  if (!rpgActive()) return result;
  const heading = el('rpg-action-panel')?.querySelector('.rpg-action-heading');
  const classification = rivalryClassification();
  if (heading && classification.id !== 'normal' && !heading.querySelector('.rivalry-pressure-chip')) {
    const chip = document.createElement('span');
    chip.className = `rivalry-pressure-chip ${classification.id}`;
    chip.textContent = `${classification.icon} ${classification.label} · presja ${Math.round(rivalryEffectivePressure())}`;
    heading.appendChild(chip);
  }
  if (heading && state.rpgRivalryMoment && !heading.querySelector('.rivalry-moment-chip')) {
    const moment = document.createElement('span');
    moment.className = 'rivalry-moment-chip';
    moment.textContent = `${state.rpgRivalryMoment.icon} ${state.rpgRivalryMoment.label}`;
    heading.appendChild(moment);
  }
  return result;
};

choosePlayerCharacter = function rivalryChoosePlayerCharacter(character) {
  prepareRivalryMatch(character);
  const result = rivalryBaseChoosePlayerCharacter(character);
  const classification = rivalryClassification();
  if (state.rpgOpponentClub) {
    const tone = classification.id === 'normal' ? '' : 'good';
    addRpgLog(`${classification.icon} ${character.club} — ${state.rpgOpponentClub}. ${classification.label}.`, tone);
    renderRpgBoard();
    renderActionPanel();
  }
  return result;
};

function rivalryMomentChance(level) {
  if (level === 'derby') return 0.42;
  if (level === 'rivalry') return 0.34;
  if (level === 'high_stakes') return 0.26;
  return 0;
}

function maybeTriggerRivalryMoment() {
  const classification = rivalryClassification();
  if (classification.id === 'normal' || state.rpgRivalryMoment) return false;
  if (Number(state.rpgRivalryMomentHistory?.length || 0) >= 2) return false;
  const actionNo = Number(state.rpgActionsPlayed || 0);
  if (actionNo < 2 || actionNo - Number(state.rpgRivalryLastMomentAction || -10) < 2) return false;

  const context = {
    minute: Number(state.rpgScenarioCurrent?.minute || state.rpgMinute || 0),
    scoreDiff: Number(state.rpgPlayerGoals || 0) - Number(state.rpgOpponentGoals || 0),
  };
  const candidates = rivalryMatchCore.momentCandidates(context, state.rpgRivalryMomentUsedIds || new Set());
  if (!candidates.length) return false;
  const guaranteed = Number(state.rpgRivalryMomentHistory?.length || 0) === 0 && actionNo >= 5;
  if (!guaranteed && Math.random() > rivalryMomentChance(classification.id)) return false;

  const moment = rivalryMatchCore.pickMoment(context, state.rpgRivalryMomentUsedIds || new Set());
  if (!moment) return false;
  state.rpgRivalryMoment = moment;
  state.rpgRivalryMomentUsedIds.add(moment.id);
  state.rpgRivalryLastMomentAction = actionNo;
  state.rpgRivalryMomentHistory.push({
    minute: context.minute,
    id: moment.id,
    label: moment.label,
    icon: moment.icon,
  });
  addRpgLog(`${moment.icon} ${moment.label}. Atmosfera rywalizacji wpływa na najbliższe akcje.`, '');
  return true;
}

answer = function rivalryAnswer(button, option) {
  if (!rpgActive()) return rivalryBaseAnswer(button, option);
  const resolvingAction = Boolean(state.current && state.rpgCurrentAction && !state.rpgAwaitingAction);
  const beforePlayer = Number(state.rpgPlayerGoals || 0);
  const beforeOpponent = Number(state.rpgOpponentGoals || 0);
  const previousMoment = state.rpgRivalryMoment ? { ...state.rpgRivalryMoment } : null;
  const result = rivalryBaseAnswer(button, option);

  if (!resolvingAction) return result;
  const afterPlayer = Number(state.rpgPlayerGoals || 0);
  const afterOpponent = Number(state.rpgOpponentGoals || 0);
  const outcome = state.rpgScenarioLastOutcome || {};
  const minute = Number(state.rpgMinute || 0);
  const scoreDiff = afterPlayer - afterOpponent;
  state.rpgRivalryPressure = rivalryMatchCore.updatePressure(state.rpgRivalryPressure, {
    scored: afterPlayer > beforePlayer,
    conceded: afterOpponent > beforeOpponent,
    actionSucceeded: outcome.success === true,
    actionFailed: outcome.success === false,
    minute,
    scoreDiff,
  });

  if (previousMoment) {
    state.rpgRivalryMoment = rivalryMatchCore.tickMoment(previousMoment);
    if (!state.rpgRivalryMoment) addRpgLog(`${previousMoment.icon} Moment „${previousMoment.label}” wygasa.`, '');
  }
  maybeTriggerRivalryMoment();
  renderRpgBoard();
  if (!state.rpgEnded && !state.current) renderActionPanel();
  return result;
};

finishGame = function rivalryFinishGame() {
  const opponent = state.rpgOpponentClub;
  const classification = rivalryClassification();
  const moments = [...(state.rpgRivalryMomentHistory || [])];
  const finalPressure = Math.round(rivalryEffectivePressure());
  const result = rivalryBaseFinishGame();
  if (!rpgActive() || !opponent || !el('result-details')) return result;
  el('result-details').textContent += ` · rywal: ${opponent} · ${classification.label.toLowerCase()} · presja końcowa ${finalPressure}`;
  if (moments.length) {
    el('result-details').textContent += ` · momenty rywalizacji: ${moments.map(item => `${item.icon} ${item.label}`).join(', ')}`;
  }
  return result;
};
