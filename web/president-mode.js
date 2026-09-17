// President mode v2: manage the club around football; matches are simulated in the background.
// Financial values, trust and department ratings are fictional game systems, not real club data.
const presidentModeCore = globalThis.PresidentModeCore;
const presidentBaseStartGame = startGame;

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
    <span><strong>Tryb prezesa</strong><small>Zarządzaj całym klubem poza boiskiem. Finanse, trener, kadra, akademia, obiekt, formalności, sponsorzy i kibice. Mecze rozgrywają się w tle.</small></span>
    <span class="mode-check">✓</span>`;
  button.addEventListener('click', () => {
    frontSelectedMode = 'president';
    grid.querySelectorAll('.mode-card').forEach(item => item.classList.toggle('selected', item === button));
    const next = document.getElementById('landing-continue');
    if (next) {
      next.disabled = false;
      next.textContent = 'Dalej — wybierz klub';
    }
    const note = document.getElementById('landing-note');
    if (note) note.textContent = 'Wybrano: Tryb prezesa · mecze będą symulowane w tle';
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
    description.textContent = 'Zarządzasz klubem przez cały sezon. Podejmujesz wyłącznie decyzje prezesowskie; mecze są automatycznie symulowane w tle i wpływają na tabelę oraz otoczenie klubu.';
  }
  window.setTimeout(() => {
    if (presidentSelected() && el('new-game')) el('new-game').textContent = '👔 Rozpocznij sezon prezesa';
  }, 0);
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

function hidePresidentGameSurfaces() {
  el('quiz')?.classList.add('hidden');
  el('result')?.classList.add('hidden');
  el('match-hud')?.classList.add('hidden');
  document.body.classList.remove('rpg-match-active', 'rpg-question-stage');
}

function initializePresidentMode() {
  const career = careerState();
  if (!career?.active) return null;
  if (!state.presidentMode?.active) {
    state.presidentMode = presidentModeCore.initialState(career.rounds?.length || 0);
  }
  return state.presidentMode;
}

const PRESIDENT_AREA_META = Object.freeze([
  ['squad','Kadra','👥'], ['staff','Sztab','📋'], ['academy','Akademia','🧒'],
  ['facilities','Obiekt','🏟️'], ['organization','Organizacja','🗂️'], ['community','Społeczność','📣'],
]);
const PRESIDENT_TRUST_META = Object.freeze([
  ['players','Szatnia','👕'], ['coach','Trener','🧠'], ['supporters','Kibice','📣'], ['sponsors','Sponsorzy','🤝'],
]);

function presidentMetricRows(values = {}, meta = [], type = 'area') {
  return meta.map(([key, label, icon]) => {
    const value = Math.max(0, Math.min(100, Number(values[key] ?? 50)));
    const className = type === 'trust' ? 'president-trust-row' : 'president-area-row';
    return `<div class="${className}"><span>${icon} ${label}</span><div class="president-metric-track"><i style="width:${value}%"></i></div><strong>${value}</strong></div>`;
  }).join('');
}

function presidentTrustRows(trust = {}) {
  return presidentMetricRows(trust, PRESIDENT_TRUST_META, 'trust');
}

function presidentAreaRows(areas = {}) {
  return presidentMetricRows(areas, PRESIDENT_AREA_META, 'area');
}

function deltaText(delta = {}, labels = {}) {
  const parts = Object.entries(delta)
    .filter(([, value]) => Number(value) !== 0)
    .map(([key, value]) => `${labels[key] || key} ${Number(value) > 0 ? '+' : ''}${Number(value)}`);
  return parts.join(' · ');
}

function presidentChoicePreview(choice) {
  const budget = Number(choice.effect?.budget || 0);
  const recurring = Number(choice.effect?.recurring || 0);
  const areaLabels = { squad:'kadra', staff:'sztab', academy:'akademia', facilities:'obiekt', organization:'organizacja', community:'społeczność' };
  const trustLabels = { players:'szatnia', coach:'trener', supporters:'kibice', sponsors:'sponsorzy' };
  const parts = [];
  parts.push(budget === 0 ? 'budżet ±0 zł' : `budżet ${budget > 0 ? '+' : ''}${presidentModeCore.money(budget)}`);
  if (recurring) parts.push(`stały bilans ${recurring > 0 ? '+' : ''}${presidentModeCore.money(recurring)}/kolejkę`);
  const areas = deltaText(choice.effect?.areas, areaLabels);
  const trust = deltaText(choice.effect?.trust, trustLabels);
  if (areas) parts.push(areas);
  if (trust) parts.push(trust);
  return parts.join(' · ');
}

function presidentPositionSummary(career) {
  if (!career) return { position:'—', points:0 };
  return {
    position:seasonCareerCore.position(career.table, career.club) || 1,
    points:Number(career.table?.[career.club]?.points || 0),
  };
}

function presidentDashboardHtml(profile, career) {
  const standing = presidentPositionSummary(career);
  const avgAreas = presidentModeCore.averageAreas(profile);
  const avgTrust = presidentModeCore.averageTrust(profile);
  const recurring = Number(profile.recurring || 0);
  return `
    <div class="president-dashboard">
      <div><small>BUDŻET GRY</small><strong>${presidentModeCore.money(profile.budget)}</strong><span>${presidentModeCore.financeLabel(profile)}</span></div>
      <div><small>STAŁY BILANS / KOLEJKĘ</small><strong>${recurring >= 0 ? '+' : ''}${presidentModeCore.money(recurring)}</strong><span>umowy i stałe zobowiązania</span></div>
      <div><small>TABELA</small><strong>${standing.position}. miejsce</strong><span>${standing.points} pkt</span></div>
      <div><small>KONDYCJA KLUBU</small><strong>${avgAreas}/100</strong><span>${presidentModeCore.areaLabel(avgAreas)} · zaufanie ${avgTrust}/100</span></div>
    </div>
    <details class="president-club-details">
      <summary><span><strong>🏢 Stan klubu</strong><small>kadra · sztab · akademia · obiekt · organizacja · społeczność</small></span><em>Pokaż</em></summary>
      <div class="president-area-grid">${presidentAreaRows(profile.areas)}</div>
      <div class="president-trust-grid">${presidentTrustRows(profile.trust)}</div>
    </details>`;
}

function currentPresidentFixture() {
  const career = careerState();
  if (!career) return null;
  return currentSeasonCareerFixture();
}

function renderPresidentDecision(decision) {
  const profile = initializePresidentMode();
  const career = careerState();
  const panel = ensurePresidentDecisionPanel();
  if (!profile || !career || !decision || !panel) return false;
  hidePresidentGameSurfaces();
  profile.currentDecision = decision.id;
  const fixture = currentPresidentFixture();
  const round = career.roundIndex + 1;
  const opponent = fixture ? careerOpponent(fixture) : 'pauza';
  const category = presidentModeCore.CATEGORY_LABELS[decision.category] || 'Sprawy klubowe';
  panel.innerHTML = `
    <div class="president-decision-card">
      <div class="president-decision-head">
        <span><small>👔 BIURKO PREZESA · KOLEJKA ${round}/${career.rounds.length}</small><strong>${presidentEscape(career.club)}</strong><em>Mecz w tle po decyzji: ${fixture ? `${presidentEscape(careerVenue(fixture))} · ${presidentEscape(opponent)}` : 'brak meczu'}</em></span>
        <span class="president-background-match"><small>⚽ MECZ</small><strong>automatycznie</strong><em>bez pytań i decyzji boiskowych</em></span>
      </div>
      ${presidentDashboardHtml(profile, career)}
      <div class="president-case">
        <span class="president-case-icon">${decision.icon}</span>
        <div><small>${presidentEscape(category).toUpperCase()}</small><h2>${presidentEscape(decision.title)}</h2><p>${presidentEscape(decision.copy)}</p></div>
      </div>
      <div class="president-options"></div>
      <small class="president-disclaimer">Kwoty, wskaźniki, scenariusze i wpływ zarządzania są mechaniką gry. Nie opisują rzeczywistych finansów ani sytuacji wybranego klubu.</small>
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
  panel.classList.remove('hidden');
  if (el('status')) {
    el('status').textContent = `Tryb prezesa · kolejka ${round}/${career.rounds.length} · decyzja klubowa`;
    el('status').classList.remove('hidden');
  }
  window.scrollTo({ top:0, behavior:'smooth' });
  return true;
}

function simulatePresidentRound() {
  const career = careerState();
  const profile = state.presidentMode;
  const fixture = currentPresidentFixture();
  if (!career || !profile || !fixture) return null;
  career.currentFixture = { ...fixture };
  career.matchResolved = false;

  const baseStrength = Number(career.strengths?.[career.club] ?? 65);
  const strengths = {
    ...(career.strengths || {}),
    [career.club]:presidentModeCore.adjustedClubStrength(baseStrength, profile),
  };
  const match = seasonCareerCore.simulateFixture(
    fixture,
    strengths,
    `${career.season}|president|round-${fixture.round}`,
  );
  let nextTable = seasonCareerCore.applyResult(career.table, fixture, match.homeGoals, match.awayGoals);
  const other = simulateCareerRoundWithoutUser(currentSeasonCareerRound(), nextTable);
  nextTable = other.table;

  const home = fixture.home === career.club;
  const userGoals = home ? match.homeGoals : match.awayGoals;
  const opponentGoals = home ? match.awayGoals : match.homeGoals;
  const resultCode = seasonCareerCore.resultCode(userGoals, opponentGoals);
  const venue = careerVenue(fixture);

  career.table = nextTable;
  career.history.push({
    round:career.roundIndex + 1,
    fixture:{ ...fixture },
    userResult:{ ...match, simulated:true, president:true },
    otherResults:other.results,
    president:true,
  });
  career.matchResolved = true;
  career.roundIndex += 1;
  career.currentFixture = null;

  state.presidentMode = presidentModeCore.applyPostRound(profile, {
    venue,
    result:resultCode,
    match:{ ...match, userGoals, opponentGoals, opponent:careerOpponent(fixture), venue },
  });

  advanceCareerByes();
  career.completed = career.roundIndex >= career.rounds.length;
  return { fixture, match, userGoals, opponentGoals, resultCode, venue, otherResults:other.results };
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
  const round = simulatePresidentRound();
  if (!round) return;
  if (careerState()?.completed) renderPresidentSeasonFinal(round);
  else renderPresidentRoundOutcome(round);
}

function presidentResultLabel(code) {
  if (code === 'W') return 'wygrana';
  if (code === 'L') return 'porażka';
  return 'remis';
}

function presidentMatchScore(round) {
  return `${presidentEscape(round.fixture.home)} ${round.match.homeGoals}:${round.match.awayGoals} ${presidentEscape(round.fixture.away)}`;
}

function renderPresidentRoundOutcome(context = {}) {
  const profile = state.presidentMode;
  const career = careerState();
  const panel = ensurePresidentDecisionPanel();
  if (!profile || !career || !panel || !context.fixture) return false;
  hidePresidentGameSurfaces();
  const decision = lastPresidentDecision();
  const position = seasonCareerCore.position(career.table, career.club) || 1;
  const points = career.table?.[career.club]?.points || 0;
  const finance = Number(profile.lastFinance || 0);
  const management = presidentModeCore.managementStrengthModifier(profile);
  panel.innerHTML = `
    <div class="president-round-report">
      <div class="president-report-kicker">👔 RAPORT PO KOLEJCE ${context.fixture.round}</div>
      <h2>${presidentEscape(career.club)}</h2>
      ${presidentDashboardHtml(profile, career)}
      <div class="president-background-result">
        <span><small>⚽ MECZ W TLE</small><strong>${presidentMatchScore(context)}</strong><em>${presidentResultLabel(context.resultCode)} · bez udziału gracza</em></span>
        <span><small>PO KOLEJCE</small><strong>${position}. miejsce · ${points} pkt</strong><em>wpływ długofalowego zarządzania na siłę drużyny: ${management >= 0 ? '+' : ''}${management.toFixed(1)}</em></span>
      </div>
      <div class="president-decision-result">
        <strong>${decision ? `${presidentEscape(decision.title)} → ${presidentEscape(decision.choice)}` : 'Decyzja klubowa zakończona'}</strong>
        <span>${decision ? presidentEscape(decision.result) : ''}</span>
      </div>
      <div class="president-finance-result ${finance < 0 ? 'negative' : 'positive'}">
        <span>Bilans tej kolejki</span><strong>${finance >= 0 ? '+' : ''}${presidentModeCore.money(finance)}</strong><small>obejmuje stałe umowy, organizację oraz automatyczne przychody/koszty związane z kolejką</small>
      </div>
      <details class="president-table-details"><summary><span><strong>📊 Tabela ligi</strong><small>${position}. miejsce · ${points} pkt</small></span><em>Pokaż</em></summary>${typeof renderCareerTableHtml === 'function' ? renderCareerTableHtml() : ''}</details>
      <button type="button" class="president-next-round">Następna sprawa prezesa →</button>
    </div>`;
  panel.classList.remove('hidden');
  panel.querySelector('.president-next-round')?.addEventListener('click', () => showPresidentRound());
  if (el('status')) el('status').textContent = `Tryb prezesa · kolejka ${context.fixture.round} zakończona w tle`;
  window.scrollTo({ top:0, behavior:'smooth' });
  return true;
}

function renderPresidentSeasonFinal(lastRound = null) {
  const profile = state.presidentMode;
  const career = careerState();
  const panel = ensurePresidentDecisionPanel();
  if (!profile || !career || !panel) return false;
  hidePresidentGameSurfaces();
  const position = seasonCareerCore.position(career.table, career.club) || '—';
  const row = career.table?.[career.club] || {};
  const avgTrust = presidentModeCore.averageTrust(profile);
  const avgAreas = presidentModeCore.averageAreas(profile);
  panel.innerHTML = `
    <div class="president-season-final">
      <div class="president-finale-kicker">👔 KONIEC SEZONU PREZESA</div>
      <h2>${presidentEscape(career.club)} · ${presidentEscape(career.season)}</h2>
      ${lastRound?.fixture ? `<div class="president-last-match"><small>OSTATNI MECZ W TLE</small><strong>${presidentMatchScore(lastRound)}</strong></div>` : ''}
      <div class="president-finale-grid">
        <span><small>MIEJSCE</small><strong>${position}.</strong></span>
        <span><small>PUNKTY</small><strong>${row.points || 0}</strong></span>
        <span><small>BUDŻET GRY</small><strong>${presidentModeCore.money(profile.budget)}</strong></span>
        <span><small>KONDYCJA KLUBU</small><strong>${avgAreas}/100</strong><em>${presidentModeCore.areaLabel(avgAreas)}</em></span>
        <span><small>ZAUFANIE</small><strong>${avgTrust}/100</strong><em>${presidentModeCore.trustLabel(avgTrust)}</em></span>
        <span><small>DECYZJE</small><strong>${profile.history?.length || 0}</strong></span>
      </div>
      <details class="president-club-details" open>
        <summary><span><strong>🏢 Klub po sezonie</strong><small>pełne podsumowanie obszarów</small></span><em>Ukryj</em></summary>
        <div class="president-area-grid">${presidentAreaRows(profile.areas)}</div>
        <div class="president-trust-grid">${presidentTrustRows(profile.trust)}</div>
      </details>
      <details class="president-table-details"><summary><span><strong>📊 Końcowa tabela</strong><small>${position}. miejsce · ${row.points || 0} pkt</small></span><em>Pokaż</em></summary>${typeof renderCareerTableHtml === 'function' ? renderCareerTableHtml() : ''}</details>
      <small class="president-disclaimer">Cały tryb prezesa jest symulacją gry. Realne są nazwy klubów i bazowe profile sezonu; finanse, decyzje organizacyjne i wskaźniki klubu są fikcyjne.</small>
      <button type="button" class="president-new-season">Nowy sezon prezesa</button>
    </div>`;
  panel.classList.remove('hidden');
  panel.querySelector('.president-new-season')?.addEventListener('click', () => {
    state.presidentMode = null;
    state.seasonCareer = null;
    panel.classList.add('hidden');
    if (typeof frontGameStarted !== 'undefined') frontGameStarted = false;
    if (el('status')) {
      el('status').textContent = 'Wybierz klub i sezon, a następnie rozpocznij nowy sezon prezesa.';
      el('status').classList.remove('hidden');
    }
    syncPresidentSetup();
    document.querySelector('.game-setup')?.scrollIntoView({ behavior:'smooth', block:'start' });
  });
  if (el('status')) el('status').textContent = `Koniec sezonu prezesa · ${position}. miejsce · ${row.points || 0} pkt`;
  window.scrollTo({ top:0, behavior:'smooth' });
  return true;
}

function showPresidentRound() {
  const career = careerState();
  const profile = initializePresidentMode();
  if (!career || !profile) return false;
  hidePresidentGameSurfaces();
  advanceCareerByes();
  if (career.roundIndex >= career.rounds.length) {
    career.completed = true;
    return renderPresidentSeasonFinal();
  }
  career.currentFixture = currentSeasonCareerFixture();
  career.matchResolved = false;
  const roundIndex = Number(career.roundIndex || 0);
  const existing = presidentModeCore.decisionById(profile.currentDecision);
  const decision = existing || presidentModeCore.pickDecision(profile, roundIndex);
  if (!decision) return false;
  return renderPresidentDecision(decision);
}

startGame = function presidentStartGame() {
  if (!presidentSelected()) return presidentBaseStartGame();
  syncPresidentSetup();
  hidePresidentGameSurfaces();

  if (!state.playerCharactersLoaded && state.playerCharactersReady) {
    if (el('status')) {
      el('status').textContent = 'Ładowanie danych klubów i zawodników ŁNP do sezonu prezesa…';
      el('status').classList.remove('hidden');
    }
    return state.playerCharactersReady.then(() => {
      if (presidentSelected()) startGame();
    });
  }

  if (!state.presidentMode?.active) {
    state.seasonCareer = null;
    if (!initializeSeasonCareer()) return false;
    state.presidentMode = presidentModeCore.initialState(careerState()?.rounds?.length || 0);
  } else if (!state.seasonCareer?.active || state.seasonCareer.completed) {
    state.presidentMode = null;
    state.seasonCareer = null;
    if (!initializeSeasonCareer()) return false;
    state.presidentMode = presidentModeCore.initialState(careerState()?.rounds?.length || 0);
  }

  return showPresidentRound();
};

ensurePresidentFormatOption();
ensurePresidentDecisionPanel();
el('game-format')?.addEventListener('change', syncPresidentSetup);
watchPresidentLanding();
