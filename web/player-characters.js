// Real-player character layer for Match RPG.
// Uses derived GAME metrics from official ŁNP/PZPN match data; they are not official skill ratings.
const playerCharacterCore = globalThis.PlayerCharacterCore;
const playerCharacterBaseResetRpgState = resetRpgState;
const playerCharacterBaseEnsureRpgUi = ensureRpgUi;
const playerCharacterBaseRenderRpgBoard = renderRpgBoard;
const playerCharacterBaseRenderActionPanel = renderActionPanel;
const playerCharacterBaseScenarioOdds = scenarioOdds;
const playerCharacterBaseShowRpgDecisionStage = showRpgDecisionStage;
const playerCharacterBaseStartGame = startGame;
const playerCharacterBaseFinishGame = finishGame;

state.playerCharacters = [];
state.playerCharactersLoaded = false;
state.playerCharactersLoadError = null;
state.playerCharactersStartToken = 0;
state.playerCharactersReady = fetch('data/player-characters.json')
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(data => {
    state.playerCharacters = Array.isArray(data.players) ? data.players : [];
    state.playerCharactersRatingNote = data.rating_note || '';
    state.playerCharactersLoaded = true;
    return state.playerCharacters;
  })
  .catch(error => {
    state.playerCharacters = [];
    state.playerCharactersLoaded = true;
    state.playerCharactersLoadError = error;
    console.warn('Nie udało się wczytać kart zawodników ŁNP:', error);
    return [];
  });

function escapeCharacterHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function characterInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || '?';
}

function characterSelectedSeasons() {
  const mode = el('season-mode')?.value || 'all';
  if (mode === 'all') return [];
  const from = el('season-from')?.value;
  if (mode === 'single') return from ? [from] : [];
  const to = el('season-to')?.value;
  const fromIndex = state.seasons.indexOf(from);
  const toIndex = state.seasons.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return [];
  const low = Math.min(fromIndex, toIndex);
  const high = Math.max(fromIndex, toIndex);
  return state.seasons.slice(low, high + 1);
}

function eligiblePlayerCharacters() {
  const club = el('scope-mode')?.value === 'club' ? el('club')?.value : null;
  return playerCharacterCore.filterProfiles(state.playerCharacters, {
    club: club || null,
    seasons: characterSelectedSeasons(),
  });
}

resetRpgState = function playerCharacterResetRpgState() {
  playerCharacterBaseResetRpgState();
  state.rpgCharacter = null;
  state.rpgCharacterSelected = false;
  state.rpgCharacterPending = false;
  state.rpgCharacterCandidates = [];
};

function ensureCharacterHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-character-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-character-hud';
  hud.className = 'rpg-character-hud';
  hud.innerHTML = `
    <div class="character-hud-avatar" id="rpg-character-avatar">?</div>
    <div class="character-hud-copy">
      <small>POSTAĆ MECZU · DANE ŁNP</small>
      <strong id="rpg-character-name">Wybierz zawodnika</strong>
      <span id="rpg-character-meta">Profil wpływa na wykonanie akcji.</span>
    </div>
    <div class="character-hud-rating"><small>RPG</small><strong id="rpg-character-rating">—</strong></div>`;
  const tacticalHud = el('rpg-tactical-hud');
  const scenarioHud = el('rpg-scenario-hud');
  if (tacticalHud) tacticalHud.insertAdjacentElement('afterend', hud);
  else if (scenarioHud) scenarioHud.insertAdjacentElement('afterend', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

ensureRpgUi = function playerCharacterEnsureRpgUi() {
  playerCharacterBaseEnsureRpgUi();
  ensureCharacterHud();
};

function renderCharacterHud() {
  ensureCharacterHud();
  if (!rpgActive()) return;
  const character = state.rpgCharacter;
  if (!character) {
    if (el('rpg-character-avatar')) el('rpg-character-avatar').textContent = '?';
    if (el('rpg-character-name')) el('rpg-character-name').textContent = 'Wybierz zawodnika';
    if (el('rpg-character-meta')) el('rpg-character-meta').textContent = 'Profil wpływa na wykonanie akcji.';
    if (el('rpg-character-rating')) el('rpg-character-rating').textContent = '—';
    return;
  }
  if (el('rpg-character-avatar')) el('rpg-character-avatar').textContent = characterInitials(character.player);
  if (el('rpg-character-name')) el('rpg-character-name').textContent = character.player;
  if (el('rpg-character-meta')) {
    el('rpg-character-meta').textContent = `${character.archetype} · ${character.club} · ${character.season}`;
  }
  if (el('rpg-character-rating')) el('rpg-character-rating').textContent = String(character.ratings?.game_rating || '—');
}

renderRpgBoard = function playerCharacterRenderRpgBoard() {
  playerCharacterBaseRenderRpgBoard();
  renderCharacterHud();
};

function characterActionContext(action) {
  return {
    kind: action?.kind || '',
    dc: Number(action?.dc || 3),
    possession: state.rpgPossession || 'player',
  };
}

scenarioOdds = function playerCharacterScenarioOdds(action, knowledgeCorrect) {
  const base = playerCharacterBaseScenarioOdds(action, knowledgeCorrect);
  return playerCharacterCore.adjustedChance(base, state.rpgCharacter, characterActionContext(action));
};

renderActionPanel = function playerCharacterRenderActionPanel() {
  playerCharacterBaseRenderActionPanel();
  if (!rpgActive() || state.rpgCharacterPending || !state.rpgCharacter) return;
  const actions = availableRpgActions();
  const buttons = [...(el('rpg-action-panel')?.querySelectorAll('.rpg-action') || [])];
  buttons.forEach((button, index) => {
    if (button.querySelector('.character-impact')) return;
    const action = actions[index];
    if (!action) return;
    const modifier = playerCharacterCore.actionModifier(state.rpgCharacter, characterActionContext(action));
    const impact = document.createElement('div');
    impact.className = `character-impact ${modifier > 0.004 ? 'positive' : modifier < -0.004 ? 'negative' : ''}`;
    impact.textContent = `Wpływ ${state.rpgCharacter.player}: ${playerCharacterCore.impactLabel(modifier)}`;
    button.appendChild(impact);
  });
};

function ratingBar(label, value) {
  const safe = Math.max(35, Math.min(95, Number(value || 35)));
  const width = Math.round(((safe - 35) / 60) * 100);
  return `
    <div class="character-rating-row">
      <span>${escapeCharacterHtml(label)}</span>
      <div class="character-rating-track"><i style="width:${width}%"></i></div>
      <strong>${safe}</strong>
    </div>`;
}

function characterCardHtml(character) {
  const stats = character.stats || {};
  const ratings = character.ratings || {};
  const cards = Number(stats.yellow_cards || 0) + Number(stats.red_cards || 0);
  const reliability = character.sample_reliable
    ? '<span class="character-sample reliable">próba stabilna</span>'
    : '<span class="character-sample small">mała próba</span>';
  return `
    <span class="character-header">
      <span class="character-avatar">${escapeCharacterHtml(characterInitials(character.player))}</span>
      <span class="character-title">
        <strong>${escapeCharacterHtml(character.player)}</strong>
        <small>${escapeCharacterHtml(character.club)} · ${escapeCharacterHtml(character.season)}</small>
        <em>${escapeCharacterHtml(character.archetype)} ${reliability}</em>
      </span>
      <span class="character-overall"><small>RPG</small><strong>${Number(ratings.game_rating || 0)}</strong></span>
    </span>
    <span class="character-raw-stats">
      <span><small>Mecze</small><strong>${Number(stats.appearances || 0)}</strong></span>
      <span><small>Starty</small><strong>${Number(stats.starts || 0)}</strong></span>
      <span><small>Minuty</small><strong>${Number(stats.minutes || 0)}</strong></span>
      <span><small>Gole</small><strong>${Number(stats.goals || 0)}</strong></span>
      <span><small>Kartki</small><strong>${cards}</strong></span>
    </span>
    <span class="character-ratings">
      ${ratingBar('Ogranie', ratings.experience)}
      ${ratingBar('Rytm', ratings.rhythm)}
      ${ratingBar('Wykończenie', ratings.finishing)}
      ${ratingBar('Dyscyplina', ratings.discipline)}
    </span>`;
}

function choosePlayerCharacter(character) {
  state.rpgCharacter = character;
  state.rpgCharacterSelected = true;
  state.rpgCharacterPending = false;
  addRpgLog(`⭐ Postać meczu: ${character.player} · ${character.archetype} (${character.club}, ${character.season}).`, 'good');
  renderRpgBoard();
  playerCharacterBaseShowRpgDecisionStage();
}

function showPlayerCharacterSelection() {
  const panel = el('rpg-action-panel');
  if (!panel) return false;
  const eligible = eligiblePlayerCharacters();
  const candidates = playerCharacterCore.pickCandidates(eligible, 3);
  state.rpgCharacterCandidates = candidates;
  if (!candidates.length) {
    state.rpgCharacterSelected = true;
    state.rpgCharacterPending = false;
    return false;
  }

  state.rpgCharacterPending = true;
  hideQuestionUi(true);
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="character-selection-card">
      <div class="character-selection-kicker">⭐ WYBIERZ POSTAĆ MECZU</div>
      <h3>Prawdziwi zawodnicy, prawdziwe protokoły ŁNP</h3>
      <p>Wybierz jednego zawodnika. Jego profil delikatnie zmienia szanse wykonania konkretnych zagrań. Surowe statystyki pochodzą z protokołów, a oceny RPG są wyliczone wyłącznie na potrzeby gry.</p>
      <div class="character-options"></div>
      <small class="character-disclaimer">Oceny RPG nie są oficjalnymi ocenami umiejętności PZPN ani Łączy Nas Piłka.</small>
    </div>`;
  const grid = panel.querySelector('.character-options');
  candidates.forEach(character => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'character-option';
    button.innerHTML = characterCardHtml(character);
    button.addEventListener('click', () => choosePlayerCharacter(character));
    grid.appendChild(button);
  });
  renderCharacterHud();
  updateRpgTools();
  return true;
}

showRpgDecisionStage = function playerCharacterShowRpgDecisionStage() {
  if (rpgActive() && !state.rpgEnded && !state.rpgCharacterSelected) {
    ensureRpgUi();
    renderRpgBoard();
    if (showPlayerCharacterSelection()) return;
  }
  const result = playerCharacterBaseShowRpgDecisionStage();
  renderCharacterHud();
  return result;
};

finishGame = function playerCharacterFinishGame() {
  const character = state.rpgCharacter;
  const result = playerCharacterBaseFinishGame();
  if (!rpgActive() || !character) return result;
  if (el('result-details')) {
    el('result-details').textContent += ` · postać: ${character.player} (${character.archetype}, RPG ${character.ratings?.game_rating || '—'})`;
  }
  return result;
};

startGame = function playerCharacterStartGame() {
  const token = ++state.playerCharactersStartToken;
  if (!rpgActive() || state.playerCharactersLoaded) {
    return playerCharacterBaseStartGame();
  }
  if (el('status')) {
    el('status').textContent = 'Ładowanie kart prawdziwych zawodników z danych ŁNP…';
    el('status').classList.remove('hidden');
  }
  return state.playerCharactersReady.then(() => {
    if (token !== state.playerCharactersStartToken || !rpgActive()) return;
    playerCharacterBaseStartGame();
  });
};

el('game-format')?.addEventListener('change', () => {
  if (currentFormat() === 'match90' && el('format-description')) {
    el('format-description').textContent = 'Wybierasz prawdziwego zawodnika z danych ŁNP, plan taktyczny i zagrania. Wiedza oraz profil postaci wspólnie wpływają na wykonanie.';
  }
});

if (currentFormat() === 'match90' && el('format-description')) {
  el('format-description').textContent = 'Wybierasz prawdziwego zawodnika z danych ŁNP, plan taktyczny i zagrania. Wiedza oraz profil postaci wspólnie wpływają na wykonanie.';
}
