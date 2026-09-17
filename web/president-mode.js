// President mode: organizational decisions layered on top of the full-season career.
// Financial values and trust meters are game abstractions, not real club accounting or assessments.
const presidentModeCore = globalThis.PresidentModeCore;
const presidentBaseEnsureRpgUi = ensureRpgUi;
const presidentBaseRenderRpgBoard = renderRpgBoard;
const presidentBaseRenderActionPanel = renderActionPanel;
const presidentBaseScenarioOdds = scenarioOdds;
const presidentBaseFinishGame = finishGame;
const presidentBaseStartSeasonCareerMatch = startSeasonCareerMatch;

function presidentSelected() {
  return el('game-format')?.value === 'president';
}

function presidentActive() {
  return Boolean(presidentSelected() && careerActive() && state.presidentMode?.active);
}

function presidentEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensurePresidentFormatOption() {
  const select = el('game-format');
  if (!select || select.querySelector('option[value="president"]')) return;
  const option = document.createElement('option');
  option.value = 'president';
  option.textContent = '👔 Tryb prezesa';
  const career = select.querySelector('option[value="career"]');
  if (career) career.insertAdjacentElement('afterend', option);
  else select.insertBefore(option, select.firstChild);
}

function installPresidentLandingCard() {
  const grid = document.querySelector('#landing-screen .mode-grid');
  if (!grid || grid.querySelector('[data-mode="president"]')) return false;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mode-card president-mode-card';
  button.dataset.mode = 'president';
  button.innerHTML = `
    <span class="mode-icon">👔</span>
    <span><strong>Tryb prezesa</strong><small>Prowadź pełny sezon, pilnuj budżetu, szatni, trenera, kibiców i sponsorów. Przed meczami podejmuj decyzje organizacyjne.</small></span>
    <span class="mode-check">✓</span>`;
  button.addEventListener('click', () => {
    frontSelectedMode = 'president';
    grid.querySelectorAll('.mode-card').forEach(item => item.classList.toggle('selected', item === button));
    const next = document.getElementById('landing-continue');
    if (next) {
      next.disabled = false;
      next.textContent = 'Dalej — ustawienia klubu';
    }
    const note = document.getElementById('landing-note');
    if (note) note.textContent = 'Wybrano: Tryb prezesa';
  });
  const career = grid.querySelector('[data-mode="career"]');
  if (career) career.insertAdjacentElement('afterend', button);
  else grid.prepend(button);
  return true;
}

function watchPresidentLanding() {
  installPresidentLandingCard();
  const observer = new MutationObserver(() => installPresidentLandingCard());
  observer.observe(document.body, { childList:true, subtree:true });
}

function syncPresidentSetup() {
  if (!presidentSelected()) return;
  const scope = el('scope-mode');
  if (scope) {
    scope.value = 'club';
    if (typeof updateScopeControls === 'function') updateScopeControls();
  }
  const seasonMode = el('season-mode');
  if (seasonMode) {
    seasonMode.value = 'single';
    if (typeof updateSeasonControls === 'function') updateSeasonControls();
  }
  const description = el('format-description');
  if (description) {
    description.textContent = 'Pełny sezon kariery + decyzje prezesa: budżet, zaufanie czterech grup i konsekwencje organizacyjne przed kolejnymi meczami.';
  }
}

function initializePresidentMode() {
  if (!careerActive()) return null;
  if (!state.presidentMode?.active) {
    state.presidentMode = presidentModeCore.initialState(careerState()?.rounds?.length || 0);
  }
  return state.presidentMode;
}

function ensurePresidentDecisionPanel() {
  let panel = el('president-decision-panel');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'president-decision-panel';
  panel.className = 'president-decision-panel hidden';
  panel.setAttribute('aria-live', 'polite');
  const status = el('status');
  if (status) status.insertAdjacentElement('afterend', panel);
  else document.querySelector('.shell')?.prepend(panel);
  return panel;
}

function presidentTrustRows(trust = {}) {
  const rows = [
    ['players', 'Szatnia', '👥'],
    ['coach', 'Trener', '📋'],
    ['supporters', 'Kibice', '📣'],
    ['sponsors', 'Sponsorzy', '🤝'],
  ];
  return rows.map(([key, label, icon]) => {
    const value = Number(trust[key] ?? 50);
    return `<div class="president-trust-row"><span>${icon} ${label}</span><div class="president-trust-track"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div><strong>${value}</strong></div>`;
  }).join('');
}

function trustEffectText(delta = {}) {
  const labels = { players:'szatnia', coach:'trener', supporters:'kibice', sponsors:'sponsorzy' };
  const parts = Object.entries(delta)
    .filter(([, value]) => Number(value) !== 0)
    .map(([key, value]) => `${labels[key] || key} ${Number(value) > 0 ? '+' : ''}${Number(value)}`);
  return parts.length ? parts.join(' · ') : 'zaufanie bez zmian';
}

function matchEffectText(effect = null) {
  if (!effect) return 'bez premii meczowej';
  const parts = [];
  if (effect.all) parts.push(`${effect.all > 0 ? '+' : ''}${Math.round(effect.all * 100)} pp wszystkie akcje`);
  if (effect.attack) parts.push(`${effect.attack > 0 ? '+' : ''}${Math.round(effect.attack * 100)} pp atak`);
  if (effect.defence) parts.push(`${effect.defence > 0 ? '+' : ''}${Math.round(effect.defence * 100)} pp obrona`);
  return parts.length ? parts.join(' · ') : 'bez premii meczowej';
}

function presidentChoicePreview(choice) {
  const budget = Number(choice.effect?.budget || 0);
  const budgetText = budget === 0 ? 'budżet ±0 zł' : `budżet ${budget > 0 ? '+' : ''}${presidentModeCore.money(budget)}`;
  return `${budgetText} · ${trustEffectText(choice.effect?.trust)} · ${matchEffectText(choice.effect?.match)}`;
}

function renderPresidentDecision(decision) {
  const profile = initializePresidentMode();
  const career = careerState();
  const panel = ensurePresidentDecisionPanel();
  if (!profile || !career || !decision || !panel) return false;
  profile.currentDecision = decision.id;
  const round = career.roundIndex + 1;
  const opponent = careerOpponent(currentSeasonCareerFixture()) || 'rywal do ustalenia';
  panel.innerHTML = `
    <div class="president-decision-card">
      <div class="president-decision-head">
        <span><small>👔 BIURKO PREZESA · KOLEJKA ${round}/${career.rounds.length}</small><strong>${presidentEscape(career.club)}</strong><em>Następny rywal: ${presidentEscape(opponent)}</em></span>
        <div class="president-budget"><small>BUDŻET GRY</small><strong>${presidentModeCore.money(profile.budget)}</strong></div>
      </div>
      <div class="president-trust-grid">${presidentTrustRows(profile.trust)}</div>
      <div class="president-case">
        <span class="president-case-icon">${decision.icon}</span>
        <div><small>DECYZJA ORGANIZACYJNA</small><h2>${presidentEscape(decision.title)}</h2><p>${presidentEscape(decision.copy)}</p></div>
      </div>
      <div class="president-options"></div>
      <small class="president-disclaimer">Kwoty, zaufanie i efekty są umowną mechaniką gry. Nie przedstawiają realnych finansów ani sytuacji wybranego klubu.</small>
    </div>`;
  const grid = panel.querySelector('.president-options');
  decision.choices.forEach((choice, index) => {
    const affordable = presidentModeCore.canChoose(profile, choice);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'president-option';
    button.disabled = !affordable;
    button.innerHTML = `
      <strong>${presidentEscape(choice.label)}</strong>
      <span>${presidentEscape(choice.desc)}</span>
      <small>${presidentEscape(presidentChoicePreview(choice))}</small>
      ${affordable ? '' : '<em>Brak środków na tę decyzję.</em>'}`;
    button.addEventListener('click', () => choosePresidentDecision(decision, index));
    grid.appendChild(button);
  });
  el('quiz')?.classList.add('hidden');
  el('result')?.classList.add('hidden');
  panel.classList.remove('hidden');
  if (el('status')) {
    el('status').textContent = `Tryb prezesa · decyzja przed kolejką ${round}`;
    el('status').classList.remove('hidden');
  }
  window.scrollTo({ top:0, behavior:'smooth' });
  return true;
}

function hidePresidentDecision() {
  el('president-decision-panel')?.classList.add('hidden');
}

function lastPresidentDecision() {
  const history = state.presidentMode?.history || [];
  return history.length ? history[history.length - 1] : null;
}

function choosePresidentDecision(decision, choiceIndex) {
  const profile = initializePresidentMode();
  const career = careerState();
  if (!profile || !career) return;
  const applied = presidentModeCore.applyChoice(profile, decision, choiceIndex, career.roundIndex);
  if (!applied.ok) {
    if (applied.reason === 'budget') renderPresidentDecision(decision);
    return;
  }
  state.presidentMode = applied.profile;
  hidePresidentDecision();
  const result = presidentBaseStartSeasonCareerMatch();
  const picked = lastPresidentDecision();
  if (picked && typeof addRpgLog === 'function') {
    addRpgLog(`👔 PREZES: ${picked.title} → ${picked.choice}.`, 'good');
  }
  renderPresidentHud();
  return result;
}

startSeasonCareerMatch = function presidentStartSeasonCareerMatch() {
  if (!presidentSelected() || !careerActive()) return presidentBaseStartSeasonCareerMatch();
  advanceCareerByes();
  const career = careerState();
  if (!career || career.roundIndex >= career.rounds.length) return presidentBaseStartSeasonCareerMatch();
  const profile = initializePresidentMode();
  if (!profile) return presidentBaseStartSeasonCareerMatch();
  const roundIndex = Number(career.roundIndex || 0);
  if (Number(profile.decidedRound) === roundIndex) return presidentBaseStartSeasonCareerMatch();
  const existing = presidentModeCore.decisionById(profile.currentDecision);
  const decision = existing || presidentModeCore.pickDecision(profile, roundIndex);
  if (!decision) {
    profile.decidedRound = roundIndex;
    profile.currentMatchEffect = null;
    return presidentBaseStartSeasonCareerMatch();
  }
  renderPresidentDecision(decision);
  return false;
};

function ensurePresidentHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-president-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-president-hud';
  hud.className = 'rpg-president-hud hidden';
  hud.innerHTML = `
    <div class="president-hud-main"><small>👔 TRYB PREZESA</small><strong id="president-hud-budget">0 zł</strong><span id="president-hud-effect">Bez dodatkowego efektu</span></div>
    <div class="president-hud-trust" id="president-hud-trust"></div>`;
  const careerHud = el('rpg-season-career-hud');
  if (careerHud) careerHud.insertAdjacentElement('afterend', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

ensureRpgUi = function presidentEnsureRpgUi() {
  presidentBaseEnsureRpgUi();
  ensurePresidentHud();
};

function renderPresidentHud() {
  ensurePresidentHud();
  const hud = el('rpg-president-hud');
  if (!hud) return;
  hud.classList.toggle('hidden', !presidentActive());
  if (!presidentActive()) return;
  const profile = state.presidentMode;
  if (el('president-hud-budget')) el('president-hud-budget').textContent = presidentModeCore.money(profile.budget);
  if (el('president-hud-effect')) el('president-hud-effect').textContent = matchEffectText(profile.currentMatchEffect);
  const trust = el('president-hud-trust');
  if (trust) trust.innerHTML = presidentTrustRows(profile.trust);
}

renderRpgBoard = function presidentRenderRpgBoard() {
  const result = presidentBaseRenderRpgBoard();
  renderPresidentHud();
  return result;
};

scenarioOdds = function presidentScenarioOdds(action, knowledgeCorrect) {
  const base = presidentBaseScenarioOdds(action, knowledgeCorrect);
  if (!presidentActive()) return base;
  return presidentModeCore.adjustedChance(base, state.presidentMode.currentMatchEffect, state.rpgPossession || 'player');
};

renderActionPanel = function presidentRenderActionPanel() {
  const result = presidentBaseRenderActionPanel();
  if (!presidentActive()) return result;
  const modifier = presidentModeCore.chanceModifier(state.presidentMode.currentMatchEffect, state.rpgPossession || 'player');
  const heading = el('rpg-action-panel')?.querySelector('.rpg-action-heading');
  if (heading && Math.abs(modifier) >= 0.004 && !heading.querySelector('.president-match-chip')) {
    const chip = document.createElement('span');
    chip.className = `president-match-chip ${modifier > 0 ? 'positive' : 'negative'}`;
    chip.textContent = `👔 Decyzja prezesa ${modifier > 0 ? '+' : ''}${Math.round(modifier * 100)} pp`;
    heading.appendChild(chip);
  }
  return result;
};

function presidentResultCode(playerGoals, opponentGoals) {
  if (playerGoals > opponentGoals) return 'W';
  if (playerGoals < opponentGoals) return 'L';
  return 'D';
}

function ensurePresidentRoundCard() {
  const box = el('career-round-summary') || (typeof ensureCareerRoundSummary === 'function' ? ensureCareerRoundSummary() : null);
  if (!box) return null;
  box.querySelector('.president-round-card')?.remove();
  const card = document.createElement('div');
  card.className = 'president-round-card';
  box.prepend(card);
  return card;
}

function renderPresidentRoundOutcome(context = {}) {
  const profile = state.presidentMode;
  const card = ensurePresidentRoundCard();
  if (!profile || !card) return;
  const avg = presidentModeCore.averageTrust(profile);
  const decision = lastPresidentDecision();
  const finance = Number(profile.lastFinance || 0);
  card.innerHTML = `
    <div class="president-report-head">
      <span><small>👔 RAPORT PREZESA</small><strong>${presidentModeCore.money(profile.budget)}</strong></span>
      <span><small>ŚREDNIE ZAUFANIE</small><strong>${avg}/100</strong><em>${presidentModeCore.trustLabel(avg)}</em></span>
    </div>
    <div class="president-report-trust">${presidentTrustRows(profile.trust)}</div>
    <p><strong>Bilans dnia meczowego:</strong> ${finance >= 0 ? '+' : ''}${presidentModeCore.money(finance)}. ${decision ? `Ostatnia decyzja: ${presidentEscape(decision.title)} → ${presidentEscape(decision.choice)}.` : ''}</p>
    <small>Finanse i wskaźniki są symulacją stworzoną wyłącznie na potrzeby gry.</small>`;
}

function renderPresidentSeasonFinal() {
  const profile = state.presidentMode;
  const career = careerState();
  if (!profile || !career?.completed) return;
  const card = ensurePresidentRoundCard();
  if (!card) return;
  const avg = presidentModeCore.averageTrust(profile);
  const position = seasonCareerCore.position(career.table, career.club);
  const row = career.table[career.club] || {};
  card.classList.add('season-final');
  card.innerHTML = `
    <div class="president-finale-kicker">👔 KOŃCOWY RAPORT PREZESA</div>
    <h3>${presidentEscape(career.club)} · sezon ${presidentEscape(career.season)}</h3>
    <div class="president-finale-grid">
      <span><small>MIEJSCE</small><strong>${position || '—'}.</strong></span>
      <span><small>PUNKTY</small><strong>${row.points || 0}</strong></span>
      <span><small>BUDŻET GRY</small><strong>${presidentModeCore.money(profile.budget)}</strong></span>
      <span><small>DECYZJE</small><strong>${profile.history?.length || 0}/${presidentModeCore.DECISIONS.length}</strong></span>
      <span><small>ZAUFANIE</small><strong>${avg}/100</strong><em>${presidentModeCore.trustLabel(avg)}</em></span>
    </div>
    <div class="president-report-trust">${presidentTrustRows(profile.trust)}</div>
    <small>Raport jest wynikiem mechaniki gry i nie opisuje realnej kondycji finansowej ani organizacyjnej klubu.</small>`;
}

finishGame = function presidentFinishGame() {
  const career = careerState();
  const profile = state.presidentMode;
  const resolving = Boolean(presidentSelected() && career?.active && profile?.active && !career.matchResolved && career.currentFixture);
  const fixture = resolving ? { ...career.currentFixture } : null;
  const venue = resolving ? careerVenue(fixture) : null;
  const playerGoals = Number(state.rpgPlayerGoals || 0);
  const opponentGoals = Number(state.rpgOpponentGoals || 0);
  const resultCode = presidentResultCode(playerGoals, opponentGoals);
  const result = presidentBaseFinishGame();
  if (!resolving) return result;

  state.presidentMode = presidentModeCore.applyPostMatch(profile, { venue, result:resultCode });
  renderPresidentRoundOutcome({ venue, result:resultCode });
  if (careerState()?.completed) renderPresidentSeasonFinal();
  renderPresidentHud();
  return result;
};

ensurePresidentFormatOption();
ensurePresidentDecisionPanel();
el('game-format')?.addEventListener('change', syncPresidentSetup);
watchPresidentLanding();
