// Personal form + morale layer for Match RPG.
// Loaded after substitutions.js. These are gameplay states, not real psychological assessments.
const playerFormMoraleCore = globalThis.PlayerFormMoraleCore;
const playerMentalBaseResetRpgState = resetRpgState;
const playerMentalBaseEnsureRpgUi = ensureRpgUi;
const playerMentalBaseRenderRpgBoard = renderRpgBoard;
const playerMentalBaseScenarioOdds = scenarioOdds;
const playerMentalBaseRenderActionPanel = renderActionPanel;
const playerMentalBaseAnswer = answer;
const playerMentalBaseFinishGame = finishGame;
const playerMentalBaseChoosePlayerCharacter = choosePlayerCharacter;
const playerMentalBaseCompleteSubstitution = completeSubstitution;

function playerMentalKey(character) {
  if (!character) return null;
  return String(character.id || `${character.season || ''}|${character.club || ''}|${character.player || ''}`);
}

function ensurePlayerMentalProfile(character) {
  const key = playerMentalKey(character);
  if (!key) return null;
  if (!state.rpgPlayerMentalProfiles) state.rpgPlayerMentalProfiles = Object.create(null);
  if (!state.rpgPlayerMentalProfiles[key]) {
    state.rpgPlayerMentalProfiles[key] = playerFormMoraleCore.initialState(character);
  }
  return state.rpgPlayerMentalProfiles[key];
}

function currentPlayerMentalProfile() {
  return ensurePlayerMentalProfile(state.rpgCharacter);
}

function savePlayerMentalProfile(character, profile) {
  const key = playerMentalKey(character);
  if (!key || !profile) return;
  if (!state.rpgPlayerMentalProfiles) state.rpgPlayerMentalProfiles = Object.create(null);
  state.rpgPlayerMentalProfiles[key] = profile;
}

resetRpgState = function playerMentalResetRpgState() {
  playerMentalBaseResetRpgState();
  state.rpgPlayerMentalProfiles = Object.create(null);
  state.rpgPlayerMentalEvents = [];
};

function ensurePlayerMentalHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-player-mental-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-player-mental-hud';
  hud.className = 'rpg-player-mental-hud';
  hud.innerHTML = `
    <div class="mental-hud-head">
      <span><small>STAN POSTACI · MECHANIKA GRY</small><strong id="rpg-mental-player">—</strong></span>
      <em id="rpg-mental-impact">0 pp</em>
    </div>
    <div class="mental-meters">
      <div class="mental-meter-row">
        <span><b>Forma</b><small id="rpg-form-label">stabilna</small></span>
        <div class="mental-meter-track"><i id="rpg-form-fill"></i></div>
        <strong id="rpg-form-value">50</strong>
      </div>
      <div class="mental-meter-row">
        <span><b>Morale</b><small id="rpg-morale-label">neutralne</small></span>
        <div class="mental-meter-track"><i id="rpg-morale-fill"></i></div>
        <strong id="rpg-morale-value">50</strong>
      </div>
    </div>
    <small class="mental-disclaimer">Forma reaguje na boiskowe wydarzenia; morale startuje neutralnie. To wyłącznie mechanika gry.</small>`;
  const substitutionHud = el('rpg-substitution-hud');
  const characterHud = el('rpg-character-hud');
  if (substitutionHud) substitutionHud.insertAdjacentElement('afterend', hud);
  else if (characterHud) characterHud.insertAdjacentElement('afterend', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

ensureRpgUi = function playerMentalEnsureRpgUi() {
  playerMentalBaseEnsureRpgUi();
  ensurePlayerMentalHud();
};

function renderPlayerMentalHud() {
  ensurePlayerMentalHud();
  if (!rpgActive()) return;
  const character = state.rpgCharacter;
  const profile = currentPlayerMentalProfile();
  const playerNode = el('rpg-mental-player');
  if (!character || !profile) {
    if (playerNode) playerNode.textContent = 'Wybierz zawodnika';
    return;
  }

  const modifier = playerFormMoraleCore.chanceModifier(profile);
  if (playerNode) playerNode.textContent = character.player;
  if (el('rpg-form-value')) el('rpg-form-value').textContent = String(profile.form);
  if (el('rpg-morale-value')) el('rpg-morale-value').textContent = String(profile.morale);
  if (el('rpg-form-fill')) el('rpg-form-fill').style.width = `${profile.form}%`;
  if (el('rpg-morale-fill')) el('rpg-morale-fill').style.width = `${profile.morale}%`;
  if (el('rpg-form-label')) el('rpg-form-label').textContent = playerFormMoraleCore.formLabel(profile.form);
  if (el('rpg-morale-label')) el('rpg-morale-label').textContent = playerFormMoraleCore.moraleLabel(profile.morale);
  const impact = el('rpg-mental-impact');
  if (impact) {
    impact.textContent = `wpływ ${playerFormMoraleCore.impactLabel(modifier)}`;
    impact.classList.toggle('positive', modifier > 0.004);
    impact.classList.toggle('negative', modifier < -0.004);
  }
}

renderRpgBoard = function playerMentalRenderRpgBoard() {
  playerMentalBaseRenderRpgBoard();
  renderPlayerMentalHud();
};

scenarioOdds = function playerMentalScenarioOdds(action, knowledgeCorrect) {
  const base = playerMentalBaseScenarioOdds(action, knowledgeCorrect);
  return playerFormMoraleCore.adjustedChance(base, currentPlayerMentalProfile());
};

renderActionPanel = function playerMentalRenderActionPanel() {
  playerMentalBaseRenderActionPanel();
  if (!rpgActive() || state.rpgCharacterPending || state.rpgSubstitutionPending || !state.rpgCharacter) return;
  const profile = currentPlayerMentalProfile();
  const modifier = playerFormMoraleCore.chanceModifier(profile);
  const buttons = [...(el('rpg-action-panel')?.querySelectorAll('.rpg-action') || [])];
  buttons.forEach(button => {
    if (button.querySelector('.mental-impact')) return;
    const row = document.createElement('div');
    row.className = `mental-impact ${modifier > 0.004 ? 'positive' : modifier < -0.004 ? 'negative' : ''}`;
    row.textContent = `Forma + morale: ${playerFormMoraleCore.impactLabel(modifier)}`;
    button.appendChild(row);
  });
};

choosePlayerCharacter = function playerMentalChoosePlayerCharacter(character) {
  const result = playerMentalBaseChoosePlayerCharacter(character);
  ensurePlayerMentalProfile(character);
  renderPlayerMentalHud();
  return result;
};

completeSubstitution = function playerMentalCompleteSubstitution(candidate, band, correct, question = null) {
  const result = playerMentalBaseCompleteSubstitution(candidate, band, correct, question);
  const current = ensurePlayerMentalProfile(candidate);
  if (current && typeof correct === 'boolean') {
    const entry = playerFormMoraleCore.applySubstitutionEntry(current, correct);
    savePlayerMentalProfile(candidate, entry.profile);
    state.rpgPlayerMentalEvents.push({
      minute: Number(state.rpgMinute || 0),
      player: candidate.player,
      type: 'substitution_entry',
      deltaForm: entry.deltaForm,
      deltaMorale: entry.deltaMorale,
    });
    addRpgLog(
      `🧠 ${candidate.player}: wejście zmienia formę ${entry.deltaForm >= 0 ? '+' : ''}${entry.deltaForm}, morale ${entry.deltaMorale >= 0 ? '+' : ''}${entry.deltaMorale}.`,
      correct ? 'good' : 'bad',
    );
  }
  renderRpgBoard();
  return result;
};

function mentalDeltaText(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? '+' : ''}${number}`;
}

function appendMentalResolution(character, update, scored, conceded) {
  const feedback = el('feedback');
  if (!feedback || !character || !update) return;
  const card = document.createElement('div');
  card.className = `player-mental-resolution ${update.deltaForm + update.deltaMorale >= 0 ? 'good' : 'bad'}`;
  const event = scored ? ' · ⚽ gol' : conceded ? ' · 🥅 stracony gol' : '';
  card.innerHTML = `<strong>${escapeCharacterHtml(character.player)} · stan postaci${event}</strong><span>Forma ${mentalDeltaText(update.deltaForm)} → ${update.profile.form} · morale ${mentalDeltaText(update.deltaMorale)} → ${update.profile.morale}</span>`;
  feedback.appendChild(card);
}

answer = function playerMentalAnswer(button, option) {
  if (!rpgActive()) return playerMentalBaseAnswer(button, option);
  const resolvingMatchAction = Boolean(state.current && state.rpgCurrentAction && !state.rpgAwaitingAction);
  const character = state.rpgCharacter;
  const beforePlayerGoals = Number(state.rpgPlayerGoals || 0);
  const beforeOpponentGoals = Number(state.rpgOpponentGoals || 0);
  const result = playerMentalBaseAnswer(button, option);

  if (resolvingMatchAction && character) {
    const outcome = state.rpgScenarioLastOutcome;
    if (outcome && typeof outcome.success === 'boolean') {
      const scored = Number(state.rpgPlayerGoals || 0) > beforePlayerGoals;
      const conceded = Number(state.rpgOpponentGoals || 0) > beforeOpponentGoals;
      const current = ensurePlayerMentalProfile(character);
      const update = playerFormMoraleCore.applyMatchOutcome(current, {
        success: outcome.success,
        knowledgeCorrect: Boolean(outcome.knowledgeCorrect),
        scored,
        conceded,
      });
      savePlayerMentalProfile(character, update.profile);
      state.rpgPlayerMentalEvents.push({
        minute: Number(state.rpgMinute || 0),
        player: character.player,
        type: scored ? 'goal' : conceded ? 'conceded' : outcome.success ? 'success' : 'failure',
        deltaForm: update.deltaForm,
        deltaMorale: update.deltaMorale,
      });
      appendMentalResolution(character, update, scored, conceded);
      renderPlayerMentalHud();
    }
  }
  return result;
};

finishGame = function playerMentalFinishGame() {
  const activeCharacter = state.rpgCharacter;
  const activeProfile = activeCharacter ? ensurePlayerMentalProfile(activeCharacter) : null;
  const result = playerMentalBaseFinishGame();
  if (!rpgActive() || !activeCharacter || !activeProfile || !el('result-details')) return result;

  const profiles = Object.values(state.rpgPlayerMentalProfiles || {});
  const peakForm = profiles.length ? Math.max(...profiles.map(profile => Number(profile.peakForm || 0))) : activeProfile.peakForm;
  const peakMorale = profiles.length ? Math.max(...profiles.map(profile => Number(profile.peakMorale || 0))) : activeProfile.peakMorale;
  el('result-details').textContent += ` · ${activeCharacter.player}: forma ${activeProfile.form}, morale ${activeProfile.morale} · szczyt meczu ${peakForm}/${peakMorale}`;
  return result;
};
