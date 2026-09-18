// President mode v4: manage the club around football; matches are simulated in the background.
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
    <span><strong>Kariera prezesa</strong><small>Prowadź klub przez wiele sezonów. Strategia zarządu, budżet, kadra ŁNP, inwestycje, sponsorzy, akademia i obiekt przechodzą z roku na rok.</small></span>
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
    description.textContent = 'Wieloletnia kariera prezesa: budżet, inwestycje, umowy i reputacja przechodzą między sezonami. Co roku wybierasz plan zarządu, a mecze są automatycznie symulowane w tle.';
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

function presidentBoardContext(profile, career) {
  const teamCount = Math.max(2, Object.keys(career?.table || {}).length || 14);
  const target = presidentModeCore.boardTargetPosition(profile, teamCount);
  const actualPosition = seasonCareerCore.position(career?.table, career?.club) || teamCount;
  const position = Number(career?.roundIndex || 0) === 0 ? target : actualPosition;
  const confidence = presidentModeCore.boardConfidence(profile, { position, teamCount });
  return { teamCount, position, actualPosition, target, confidence };
}

function presidentStrategy(profile) {
  return presidentModeCore.strategyById(profile?.strategy);
}

function presidentSquadProfiles(career) {
  const sourceSeason = career?.sourceSeason || career?.season;
  return (state.playerCharacters || [])
    .filter(player => player?.club === career?.club && player?.season === sourceSeason)
    .sort((a, b) =>
      Number(b?.ratings?.game_rating || 0) - Number(a?.ratings?.game_rating || 0) ||
      Number(b?.stats?.appearances || 0) - Number(a?.stats?.appearances || 0) ||
      String(a?.player || '').localeCompare(String(b?.player || ''), 'pl')
    );
}

function presidentSquadHtml(career) {
  const players = presidentSquadProfiles(career);
  if (!players.length) {
    return `<details class="president-squad-details"><summary><span><strong>👥 Kadra ŁNP</strong><small>Brak pełnych kart zawodników w bieżącym pakiecie dla tego sezonu</small></span><em>Pokaż</em></summary><p class="president-empty-copy">Tryb nadal korzysta z profilu siły klubu, ale nie pokazuje indywidualnych kart zawodników.</p></details>`;
  }
  const leaders = players.slice(0, 6).map(player => {
    const stats = player.stats || {};
    const rating = Number(player?.ratings?.game_rating || 0);
    return `<div class="president-squad-player"><span><strong>${presidentEscape(player.player)}</strong><small>${presidentEscape(player.archetype || 'Zawodnik')} · ${Number(stats.appearances || 0)} mecz. · ${Number(stats.goals || 0)} goli</small></span><b>${rating || '—'}</b></div>`;
  }).join('');
  const careerSignings = (state.presidentMode?.transferRoster || []).map(item => `
    <div class="president-squad-player president-career-signing">
      <span><strong>${presidentEscape(item.player)}</strong><small>Wzmocnienie kariery · z ${presidentEscape(item.sourceClub || 'innego klubu')} · profil ŁNP ${presidentEscape(item.sourceSeason || '')}</small></span>
      <b>${Number(item?.ratings?.game_rating || 0) || '—'}</b>
    </div>`).join('');
  const sourceCopy = career?.presidentSimulatedSeason && career?.sourceSeason
    ? `Ostatnia dostępna baza ŁNP: ${presidentEscape(career.sourceSeason)}. W kolejnych latach służy jako punkt odniesienia kariery.`
    : 'Nazwiska i statystyki pochodzą z protokołów ŁNP; ocena gry jest wskaźnikiem mechaniki, nie oficjalną oceną zawodnika.';
  return `<details class="president-squad-details"><summary><span><strong>👥 Kadra ŁNP</strong><small>${players.length} profili źródłowych${careerSignings ? ' · wzmocnienia kariery poniżej' : ''}</small></span><em>Pokaż</em></summary><div class="president-squad-list">${careerSignings}${leaders}</div><small class="president-data-note">${sourceCopy}${careerSignings ? ' Transfery wykonane przez gracza są alternatywną historią tej kariery.' : ''}</small></details>`;
}

function presidentWarningsHtml(profile, career) {
  const board = presidentBoardContext(profile, career);
  const warnings = presidentModeCore.managementWarnings(profile, {
    position:board.position,
    teamCount:board.teamCount,
  });
  if (!warnings.length) return '';
  return `<div class="president-warnings"><strong>⚠️ Sygnały dla zarządu</strong>${warnings.map(item => `<span>${presidentEscape(item)}</span>`).join('')}</div>`;
}

function presidentInvestmentsHtml(profile, career) {
  const roundIndex = Number(career?.roundIndex || 0);
  const areas = Object.entries(presidentModeCore.UPGRADE_META || {}).map(([key, meta]) => {
    const level = presidentModeCore.upgradeLevel(profile, key);
    const cost = presidentModeCore.upgradeCost(profile, key);
    const available = presidentModeCore.canUpgrade(profile, key, roundIndex);
    const cta = cost === null ? 'MAX' : presidentModeCore.money(cost);
    return `<button type="button" class="president-upgrade" data-area="${key}" ${available ? '' : 'disabled'}><span>${meta.icon} ${presidentEscape(meta.label)}</span><strong>Poziom ${level}/3</strong><small>${cost === null ? 'Maksymalny poziom' : `Rozwój: ${cta}`}</small></button>`;
  }).join('');
  const cooldown = roundIndex - Number(profile?.lastUpgradeRound ?? -99) < 3;
  return `
    <details class="president-investments">
      <summary><span><strong>🏗️ Plan rozwoju klubu</strong><small>Stałe inwestycje niezależne od sprawy kolejki</small></span><em>Pokaż</em></summary>
      <div class="president-upgrade-grid">${areas}</div>
      <small class="president-investment-note">${cooldown ? 'Po inwestycji zarząd musi odczekać 3 kolejki przed następną.' : 'Możesz zatwierdzić jedną inwestycję. Kolejna będzie możliwa po 3 kolejkach.'}</small>
    </details>`;
}

function renderPresidentStrategySelection() {
  const profile = initializePresidentMode();
  const career = careerState();
  const panel = ensurePresidentDecisionPanel();
  if (!profile || !career || !panel) return false;
  hidePresidentGameSurfaces();
  panel.innerHTML = `
    <div class="president-strategy-card">
      <div class="president-report-kicker">👔 SEZON ${Number(profile.careerYear || 1)} · POSIEDZENIE ZARZĄDU</div>
      <h2>${presidentEscape(career.club)} · ${presidentEscape(career.season)}${career.presidentSimulatedSeason ? " · SYMULACJA KARIERY" : ""}</h2>
      <p class="president-strategy-intro">Wybierz kierunek na ten sezon. Stan klubu z poprzednich lat pozostaje, a nowy plan zmienia oczekiwania zarządu i bieżące priorytety.</p>
      <div class="president-strategy-grid">
        ${presidentModeCore.STRATEGIES.map(strategy => {
          const effect = strategy.effect || {};
          const budget = Number(effect.budget || 0);
          return `<button type="button" class="president-strategy-option" data-strategy="${strategy.id}">
            <span class="president-strategy-icon">${strategy.icon}</span>
            <strong>${presidentEscape(strategy.label)}</strong>
            <span>${presidentEscape(strategy.copy)}</span>
            <small>Budżet ${budget >= 0 ? '+' : ''}${presidentModeCore.money(budget)} · stały bilans ${Number(effect.recurring || 0) >= 0 ? '+' : ''}${presidentModeCore.money(effect.recurring || 0)}/kolejkę</small>
          </button>`;
        }).join('')}
      </div>
      ${presidentSquadHtml(career)}
      <small class="president-disclaimer">Strategia, budżet i wymagania zarządu są elementem symulacji. Dane kadrowe ŁNP pozostają danymi źródłowymi.</small>
    </div>`;
  panel.classList.remove('hidden');
  panel.querySelectorAll('.president-strategy-option').forEach(button => {
    button.addEventListener('click', () => {
      const applied = presidentModeCore.chooseStrategy(state.presidentMode, button.dataset.strategy);
      if (!applied.ok) return;
      state.presidentMode = applied.profile;
      showPresidentRound();
    });
  });
  if (el('status')) el('status').textContent = `Kariera prezesa · sezon ${Number(profile.careerYear || 1)} · wybierz strategię zarządu`;
  window.scrollTo({ top:0, behavior:'smooth' });
  return true;
}

function buyPresidentUpgrade(area, decision) {
  const career = careerState();
  const applied = presidentModeCore.buyUpgrade(state.presidentMode, area, Number(career?.roundIndex || 0));
  if (!applied.ok) return;
  state.presidentMode = applied.profile;
  renderPresidentDecision(decision);
}

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
  if (Number(career.roundIndex || 0) === 0) return { position:'—', points:0 };
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
  const board = presidentBoardContext(profile, career);
  const strategy = presidentStrategy(profile);
  return `
    <div class="president-dashboard">
      <div><small>BUDŻET GRY</small><strong>${presidentModeCore.money(profile.budget)}</strong><span>${presidentModeCore.financeLabel(profile)}</span></div>
      <div><small>STAŁY BILANS / KOLEJKĘ</small><strong>${recurring >= 0 ? '+' : ''}${presidentModeCore.money(recurring)}</strong><span>umowy i stałe zobowiązania</span></div>
      <div><small>TABELA / CEL</small><strong>${standing.position === "—" ? "—" : standing.position + "."} / TOP ${board.target}</strong><span>${standing.points} pkt</span></div>
      <div><small>POPARCIE ZARZĄDU</small><strong>${board.confidence}/100</strong><span>${presidentModeCore.boardLabel(board.confidence)}</span></div>
      <div><small>PLAN SEZONU</small><strong>${strategy ? strategy.icon + ' ' + presidentEscape(strategy.label) : '—'}</strong><span>kondycja ${avgAreas}/100 · zaufanie ${avgTrust}/100</span></div>
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
      ${presidentWarningsHtml(profile, career)}
      ${presidentInvestmentsHtml(profile, career)}
      ${presidentSquadHtml(career)}
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
  panel.querySelectorAll('.president-upgrade').forEach(button => {
    button.addEventListener('click', () => buyPresidentUpgrade(button.dataset.area, decision));
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
      ${presidentWarningsHtml(profile, career)}
      ${presidentSquadHtml(career)}
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


function presidentNextSeasonLabel(label) {
  const match = String(label || '').match(/^(\d{4})\/(\d{2})/);
  if (!match) return 'kolejny sezon';
  const start = Number(match[1]) + 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function presidentNextSeasonPlan(previousCareer) {
  const nextSeason = presidentNextSeasonLabel(previousCareer?.season);
  const hasOfficialSeason = Array.isArray(state.seasons) && state.seasons.includes(nextSeason);
  const hasClubProfile = (state.playerCharacters || []).some(
    player => player?.season === nextSeason && player?.club === previousCareer?.club
  );

  if (hasOfficialSeason && hasClubProfile) {
    const clubs = seasonCareerCore.clubsForSeason(
      state.playerCharacters || [],
      state.all || [],
      nextSeason,
    );
    if (clubs.length >= 6 && clubs.includes(previousCareer.club)) {
      return {
        season:nextSeason,
        club:previousCareer.club,
        clubs,
        strengths:seasonCareerCore.strengthMap(state.playerCharacters || [], clubs, nextSeason),
        simulated:false,
        sourceSeason:nextSeason,
      };
    }
  }

  return {
    season:nextSeason,
    club:previousCareer.club,
    clubs:[...(previousCareer?.clubs || [])],
    strengths:{ ...(previousCareer?.strengths || {}) },
    simulated:true,
    sourceSeason:previousCareer?.sourceSeason || previousCareer?.season || null,
  };
}

function presidentCareerFromPlan(plan) {
  const rounds = seasonCareerCore.roundRobin(plan.clubs);
  return {
    active:true,
    season:plan.season,
    club:plan.club,
    clubs:[...plan.clubs],
    rounds,
    roundIndex:0,
    table:seasonCareerCore.createTable(plan.clubs),
    strengths:{ ...plan.strengths },
    objective:seasonCareerCore.objective(plan.clubs.length),
    development:{},
    history:[],
    currentFixture:null,
    matchResolved:false,
    completed:false,
    presidentSimulatedSeason:Boolean(plan.simulated),
    sourceSeason:plan.sourceSeason || plan.season,
  };
}

function presidentCareerHistoryHtml(profile) {
  const seasons = [...(profile?.seasonHistory || [])].reverse();
  if (!seasons.length) return '';
  return `
    <details class="president-career-history">
      <summary><span><strong>📚 Historia kariery</strong><small>${seasons.length} zakończonych sezonów</small></span><em>Pokaż</em></summary>
      <div class="president-career-history-list">
        ${seasons.map(item => {
          const verdict = presidentModeCore.seasonVerdict({ position:item.position, target:item.target });
          return `<div class="president-career-history-row">
            <span><strong>Sezon ${item.careerYear} · ${presidentEscape(item.season)}</strong><small>${item.simulated ? 'symulowany sezon kariery' : 'sezon oparty na bazie ŁNP'}</small></span>
            <span><b>${item.position}.</b><small>${item.points} pkt · ${item.wins}-${item.draws}-${item.losses}</small></span>
            <span class="president-history-verdict ${verdict.tone}">${verdict.icon} ${presidentEscape(verdict.label)}</span>
          </div>`;
        }).join('')}
      </div>
    </details>`;
}

function finalizePresidentSeasonProfile(profile, career) {
  const year = Number(profile?.careerYear || 1);
  const existing = (profile?.seasonHistory || []).some(item => Number(item.careerYear) === year);
  if (existing) return profile;

  const position = seasonCareerCore.position(career.table, career.club) || Object.keys(career.table || {}).length || 1;
  const row = career.table?.[career.club] || {};
  const board = presidentBoardContext(profile, career);
  return presidentModeCore.completeSeason(profile, {
    season:career.season,
    club:career.club,
    simulated:Boolean(career.presidentSimulatedSeason),
    position,
    points:Number(row.points || 0),
    wins:Number(row.wins || 0),
    draws:Number(row.draws || 0),
    losses:Number(row.losses || 0),
    gf:Number(row.gf || 0),
    ga:Number(row.ga || 0),
    target:board.target,
    boardConfidence:board.confidence,
  });
}


function presidentOffseasonNeeds(profile, career) {
  const areas = presidentModeCore.normalizedAreas(profile?.areas);
  const trust = presidentModeCore.normalizedTrust(profile?.trust);
  const weakestAreaKey = Object.keys(areas).reduce((a, b) => areas[a] <= areas[b] ? a : b);
  const weakestTrustKey = Object.keys(trust).reduce((a, b) => trust[a] <= trust[b] ? a : b);
  const areaLabels = {
    squad:'Kadra', staff:'Sztab', academy:'Akademia',
    facilities:'Obiekt', organization:'Organizacja', community:'Społeczność',
  };
  const trustLabels = {
    players:'Szatnia', coach:'Trener', supporters:'Kibice', sponsors:'Sponsorzy',
  };
  const profiles = presidentSquadProfiles(career);
  return {
    weakestAreaKey,
    weakestAreaLabel:areaLabels[weakestAreaKey] || weakestAreaKey,
    weakestAreaValue:areas[weakestAreaKey],
    weakestTrustKey,
    weakestTrustLabel:trustLabels[weakestTrustKey] || weakestTrustKey,
    weakestTrustValue:trust[weakestTrustKey],
    playerProfiles:profiles.length,
  };
}


function presidentStablePlayerKey(profile) {
  return globalThis.TransferInvestigationCore?.stablePlayerKey(profile) || profile?.id || null;
}

function presidentTransferCandidates(profile, career) {
  if (!profile?.offseason || !career) return [];
  const sourceSeason = career?.sourceSeason || career?.season;
  const all = (state.playerCharacters || []).filter(player =>
    player?.season === sourceSeason &&
    player?.club &&
    player.club !== career.club &&
    player?.id
  );

  const byId = new Map(all.map(player => [player.id, player]));
  if (Array.isArray(profile.offseason.marketIds) && profile.offseason.marketIds.length) {
    return profile.offseason.marketIds.map(id => byId.get(id)).filter(Boolean);
  }

  const signedKeys = new Set((profile.transferRoster || []).map(item => item.playerKey || item.id));
  const eligible = all
    .filter(player => !signedKeys.has(presidentStablePlayerKey(player)))
    .sort((a, b) =>
      Number(b?.ratings?.game_rating || 0) - Number(a?.ratings?.game_rating || 0) ||
      Number(b?.stats?.appearances || 0) - Number(a?.stats?.appearances || 0) ||
      String(a?.player || '').localeCompare(String(b?.player || ''), 'pl')
    );

  const perClub = new Map();
  const selected = [];
  for (const player of eligible) {
    const count = perClub.get(player.club) || 0;
    if (count >= 2) continue;
    perClub.set(player.club, count + 1);
    selected.push(player);
    if (selected.length >= 8) break;
  }
  profile.offseason.marketIds = selected.map(player => player.id);
  return selected;
}

function presidentTransferSigningCount(profile) {
  const year = Number(profile?.offseason?.careerYear || profile?.careerYear || 1);
  return (profile?.transferHistory || []).filter(item => Number(item.careerYear) === year).length;
}

function presidentTransferMarketHtml(profile, career) {
  if (!profile?.offseason?.planId) return '';
  const signings = presidentTransferSigningCount(profile);
  const closed = Boolean(profile.offseason.transferWindowClosed);
  const candidates = presidentTransferCandidates(profile, career);

  if (closed) {
    const signed = (profile.transferHistory || []).filter(
      item => Number(item.careerYear) === Number(profile.offseason.careerYear)
    );
    return `
      <section class="president-transfer-market closed">
        <div class="president-transfer-head">
          <span><small>OKNO KADROWE</small><strong>Zamknięte · ${signed.length}/2 wzmocnień</strong></span>
          <em>✓ zakończone</em>
        </div>
        ${signed.length ? `<div class="president-transfer-signed-list">
          ${signed.map(item => `<div><span><strong>${presidentEscape(item.player)}</strong><small>z: ${presidentEscape(item.sourceClub || 'innego klubu')} · ${presidentEscape(item.sourceSeason || '')}</small></span><b>${presidentModeCore.money(item.fee)}</b></div>`).join('')}
        </div>` : '<p class="president-transfer-empty">Okno zamknięte bez transferów.</p>'}
      </section>`;
  }

  return `
    <section class="president-transfer-market">
      <div class="president-transfer-head">
        <span><small>OKNO KADROWE · PROFILE ŁNP</small><strong>Możesz sprowadzić maksymalnie 2 zawodników</strong></span>
        <em>${signings}/2</em>
      </div>
      <p class="president-transfer-note">Nazwiska, kluby i statystyki pochodzą z ŁNP. <strong>Dostępność zawodnika, koszt i warunki są fikcyjną mechaniką tej kariery</strong> — nie opisują realnego transferu ani umowy.</p>
      <div class="president-transfer-grid">
        ${candidates.map(player => {
          const terms = presidentModeCore.transferGameTerms(player);
          const key = presidentStablePlayerKey(player);
          const alreadySigned = (profile.transferRoster || []).some(item => (item.playerKey || item.id) === key);
          const canSign = presidentModeCore.canSignTransfer(profile, { ...player, playerKey:key });
          const stats = player.stats || {};
          return `<article class="president-transfer-card ${alreadySigned ? 'signed' : ''}">
            <div class="president-transfer-card-head">
              <span><strong>${presidentEscape(player.player)}</strong><small>${presidentEscape(player.club)} · ${presidentEscape(player.season)}</small></span>
              <b>RPG ${Number(player?.ratings?.game_rating || 0) || '—'}</b>
            </div>
            <div class="president-transfer-stats">
              <span><small>Mecze</small><strong>${Number(stats.appearances || 0)}</strong></span>
              <span><small>Minuty</small><strong>${Number(stats.minutes || 0)}</strong></span>
              <span><small>Gole</small><strong>${Number(stats.goals || 0)}</strong></span>
              <span><small>Profil</small><strong>${presidentEscape(player.archetype || '—')}</strong></span>
            </div>
            <div class="president-transfer-terms">
              <span>Jednorazowo <strong>${presidentModeCore.money(terms.fee)}</strong></span>
              <span>Stały koszt <strong>−${presidentModeCore.money(terms.recurring)}/kolejkę</strong></span>
            </div>
            <button type="button" data-transfer-player="${player.id}" ${canSign ? '' : 'disabled'}>
              ${alreadySigned ? '✓ Sprowadzony' : signings >= 2 ? 'Limit 2/2' : canSign ? 'Sprowadź zawodnika' : 'Brak środków'}
            </button>
          </article>`;
        }).join('')}
      </div>
      ${candidates.length ? '' : '<p class="president-transfer-empty">Brak kolejnych profili ŁNP spełniających warunki rynku dla tego sezonu.</p>'}
      <button type="button" class="president-close-transfer-window">${signings ? 'Zamknij okno transferowe →' : 'Pomiń transfery i zamknij okno →'}</button>
    </section>`;
}

function signPresidentTransfer(playerId) {
  const candidate = (state.playerCharacters || []).find(player => player?.id === playerId);
  if (!candidate) return false;
  const playerKey = presidentStablePlayerKey(candidate);
  const applied = presidentModeCore.signTransfer(state.presidentMode, { ...candidate, playerKey });
  if (!applied.ok) return false;
  state.presidentMode = applied.profile;
  return renderPresidentOffseason();
}

function closePresidentTransferMarket() {
  const closed = presidentModeCore.closeTransferWindow(state.presidentMode);
  if (!closed.ok) return false;
  state.presidentMode = closed.profile;
  return renderPresidentOffseason();
}

function applyPresidentOffseasonPlan(planId) {
  const applied = presidentModeCore.applyOffseasonPlan(state.presidentMode, planId);
  if (!applied.ok) return false;
  state.presidentMode = applied.profile;
  return renderPresidentOffseason();
}

function renderPresidentOffseason() {
  const career = careerState();
  const panel = ensurePresidentDecisionPanel();
  if (!career || !state.presidentMode || !panel) return false;

  hidePresidentGameSurfaces();
  state.presidentMode = finalizePresidentSeasonProfile(state.presidentMode, career);
  const begun = presidentModeCore.beginOffseason(state.presidentMode);
  if (!begun.ok) return false;
  state.presidentMode = begun.profile;

  const profile = state.presidentMode;
  const offseason = profile.offseason;
  const settlement = offseason?.settlement || {};
  const lastSeason = (profile.seasonHistory || []).at(-1) || {};
  const nextPlan = presidentNextSeasonPlan(career);
  const needs = presidentOffseasonNeeds(profile, career);
  const chosen = presidentModeCore.offseasonPlanById(offseason?.planId);
  const nextSource = nextPlan.simulated
    ? 'Dalszy sezon będzie symulacją kariery na bazie ostatnich dostępnych danych.'
    : `Kolejny sezon ${nextPlan.season} ma bazę ŁNP dla ${nextPlan.club}.`;

  panel.innerHTML = `
    <div class="president-offseason">
      <section class="president-offseason-hero">
        <span>☀️</span>
        <div>
          <small>MIĘDZY SEZONAMI · PO ROKU ${Number(profile.careerYear || 1)}</small>
          <h2>Lato prezesa</h2>
          <p>Najpierw zamykamy finanse i oceniamy stan klubu. Potem wybierasz jeden priorytet na lato przed kolejnym sezonem.</p>
        </div>
      </section>

      <section class="president-offseason-finance">
        <div><small>BUDŻET PO SEZONIE</small><strong>${presidentModeCore.money(settlement.budgetBefore)}</strong></div>
        <div class="positive"><small>PREMIA ZA WYNIK</small><strong>+${presidentModeCore.money(settlement.performanceBonus)}</strong></div>
        <div class="positive"><small>PARTNERZY I OTOCZENIE</small><strong>+${presidentModeCore.money(settlement.partnerBonus)}</strong></div>
        <div class="negative"><small>UTRZYMANIE / PRZEGLĄDY</small><strong>−${presidentModeCore.money(settlement.maintenanceCost)}</strong></div>
        <div class="total"><small>BUDŻET NA LATO</small><strong>${presidentModeCore.money(profile.budget)}</strong><span>${settlement.net >= 0 ? '+' : ''}${presidentModeCore.money(settlement.net)} po zamknięciu roku</span></div>
      </section>

      <section class="president-offseason-review">
        <div>
          <small>OCENA SEZONU</small>
          <strong>${Number(lastSeason.position || 0)}. miejsce · ${Number(lastSeason.points || 0)} pkt</strong>
          <span>cel TOP ${Number(lastSeason.target || 0)} · poparcie zarządu ${Number(lastSeason.boardConfidence || 0)}/100</span>
        </div>
        <div>
          <small>NAJSŁABSZY OBSZAR</small>
          <strong>${presidentEscape(needs.weakestAreaLabel)} · ${needs.weakestAreaValue}/100</strong>
          <span>to naturalny kandydat do wzmocnienia latem</span>
        </div>
        <div>
          <small>NAJNIŻSZE ZAUFANIE</small>
          <strong>${presidentEscape(needs.weakestTrustLabel)} · ${needs.weakestTrustValue}/100</strong>
          <span>warto uwzględnić przy wyborze priorytetu</span>
        </div>
        <div>
          <small>KADRA ŹRÓDŁOWA</small>
          <strong>${needs.playerProfiles || '—'} profili ŁNP</strong>
          <span>${needs.playerProfiles ? 'punkt wyjścia do okna kadrowego' : 'brak indywidualnych profili dla tego roku'}</span>
        </div>
      </section>

      <div class="president-offseason-next-source ${nextPlan.simulated ? 'simulated' : 'official'}">
        <strong>${nextPlan.simulated ? '🧪 Dalsza symulacja kariery' : '✅ Kolejny sezon z bazą ŁNP'}</strong>
        <span>${presidentEscape(nextSource)}</span>
      </div>

      <section class="president-offseason-choice">
        <div class="president-offseason-choice-head">
          <span><small>DECYZJA LETNIA</small><strong>${chosen ? presidentEscape(chosen.label) : 'Wybierz priorytet na lato'}</strong></span>
          ${chosen ? '<em>✓ zatwierdzone</em>' : '<em>1 decyzja</em>'}
        </div>
        ${chosen ? `
          <div class="president-offseason-selected">
            <span>${chosen.icon}</span>
            <div><strong>${presidentEscape(chosen.label)}</strong><p>${presidentEscape(chosen.copy)}</p></div>
          </div>
        ` : `
          <div class="president-offseason-options">
            ${presidentModeCore.OFFSEASON_PLANS.map(plan => {
              const affordable = presidentModeCore.canChooseOffseasonPlan(profile, plan);
              const cost = Number(plan.effect?.budget || 0);
              return `<button type="button" class="president-offseason-option" data-offseason-plan="${plan.id}" ${affordable ? '' : 'disabled'}>
                <span>${plan.icon}</span>
                <strong>${presidentEscape(plan.label)}</strong>
                <p>${presidentEscape(plan.copy)}</p>
                <small>${cost ? 'koszt ' + presidentModeCore.money(Math.abs(cost)) : 'bez dodatkowego kosztu'}</small>
                ${affordable ? '' : '<em>Brak środków</em>'}
              </button>`;
            }).join('')}
          </div>
        `}
      </section>

      ${chosen ? presidentTransferMarketHtml(profile, career) : ''}

      ${chosen && profile.offseason?.transferWindowClosed ? `
        <section class="president-offseason-continue">
          <span><small>NASTĘPNY KROK</small><strong>Sezon ${Number(profile.careerYear || 1) + 1} · ${presidentEscape(nextPlan.season)}</strong></span>
          <p>Stan klubu, decyzja letnia i ruchy kadrowe przechodzą dalej. Teraz zarząd ustali cel oraz strategię na nowy rok.</p>
          <button type="button" class="president-start-next-season">Przejdź do planowania sezonu →</button>
        </section>
      ` : ''}

      ${presidentCareerHistoryHtml(profile)}
      <small class="president-disclaimer">Rozliczenie finansowe, koszty i efekty decyzji letnich są mechaniką gry. Dane ŁNP są używane tylko tam, gdzie faktycznie mamy źródłowe profile i sezony.</small>
    </div>`;

  panel.classList.remove('hidden');
  panel.querySelectorAll('[data-offseason-plan]').forEach(button => {
    button.addEventListener('click', () => applyPresidentOffseasonPlan(button.dataset.offseasonPlan));
  });
  panel.querySelectorAll('[data-transfer-player]').forEach(button => {
    button.addEventListener('click', () => signPresidentTransfer(button.dataset.transferPlayer));
  });
  panel.querySelector('.president-close-transfer-window')?.addEventListener('click', closePresidentTransferMarket);
  panel.querySelector('.president-start-next-season')?.addEventListener('click', startNextPresidentSeason);

  if (el('status')) {
    el('status').textContent = chosen
      ? `Lato prezesa · priorytet zatwierdzony · budżet ${presidentModeCore.money(profile.budget)}`
      : 'Lato prezesa · zamknięcie sezonu · wybierz priorytet na lato';
  }
  window.scrollTo({ top:0, behavior:'smooth' });
  return true;
}

function startNextPresidentSeason() {
  const previousCareer = careerState();
  if (!previousCareer || !state.presidentMode) return false;
  state.presidentMode = finalizePresidentSeasonProfile(state.presidentMode, previousCareer);
  const begun = presidentModeCore.beginOffseason(state.presidentMode);
  if (!begun.ok) return false;
  state.presidentMode = begun.profile;
  if (!state.presidentMode.offseason?.planId || !state.presidentMode.offseason?.transferWindowClosed) {
    return renderPresidentOffseason();
  }
  const plan = presidentNextSeasonPlan(previousCareer);
  if (!plan.clubs.length || !plan.club) return false;

  const nextCareer = presidentCareerFromPlan(plan);
  state.seasonCareer = nextCareer;
  state.presidentMode = presidentModeCore.prepareNextSeason(
    state.presidentMode,
    nextCareer.rounds.length,
  );

  const from = el('season-from');
  const to = el('season-to');
  if (!plan.simulated && from?.querySelector(`option[value="${plan.season}"]`)) {
    from.value = plan.season;
    if (to) to.value = plan.season;
  }

  const panel = ensurePresidentDecisionPanel();
  panel?.classList.remove('hidden');
  if (el('status')) {
    el('status').textContent = plan.simulated
      ? `Kariera prezesa · sezon ${state.presidentMode.careerYear} · ${plan.season} (symulacja dalszej kariery)`
      : `Kariera prezesa · sezon ${state.presidentMode.careerYear} · ${plan.season} · baza ŁNP`;
  }
  return renderPresidentStrategySelection();
}

function finishPresidentCareer() {
  const panel = ensurePresidentDecisionPanel();
  panel?.classList.add('hidden');
  state.presidentMode = null;
  state.seasonCareer = null;
  if (typeof frontGameStarted !== 'undefined') frontGameStarted = false;
  if (typeof showLanding === 'function') {
    showLanding();
    return;
  }
  if (el('status')) {
    el('status').textContent = 'Kariera prezesa zakończona. Możesz rozpocząć nową.';
    el('status').classList.remove('hidden');
  }
}

function renderPresidentSeasonFinal(lastRound = null) {
  let profile = state.presidentMode;
  const career = careerState();
  const panel = ensurePresidentDecisionPanel();
  if (!profile || !career || !panel) return false;

  hidePresidentGameSurfaces();
  profile = finalizePresidentSeasonProfile(profile, career);
  state.presidentMode = profile;

  const position = seasonCareerCore.position(career.table, career.club) || '—';
  const row = career.table?.[career.club] || {};
  const board = presidentBoardContext(profile, career);
  const strategy = presidentStrategy(profile);
  const verdict = presidentModeCore.seasonVerdict({ position, target:board.target });
  const seasonDecisionCount = (profile.history || []).filter(
    item => item.decisionId && Number(item.careerYear || 1) === Number(profile.careerYear || 1)
  ).length;
  const nextSeason = presidentNextSeasonLabel(career.season);
  const sourceNote = career.presidentSimulatedSeason
    ? 'Ten sezon kariery był symulowany na bazie ostatniego dostępnego składu i profilu ligi.'
    : 'Kluby i profile tego sezonu pochodzą z dostępnej bazy ŁNP.';

  panel.innerHTML = `
    <div class="president-season-final">
      <section class="president-season-hero ${verdict.tone}">
        <div class="president-season-hero-icon">${verdict.icon}</div>
        <div>
          <small>SEZON ${profile.careerYear} ZAKOŃCZONY · ${presidentEscape(career.season)}</small>
          <h2>${presidentEscape(verdict.label)}</h2>
          <p>${presidentEscape(career.club)} kończy rozgrywki na <strong>${position}. miejscu</strong>. Cel zarządu: TOP ${board.target}.</p>
        </div>
      </section>

      ${lastRound?.fixture ? `<div class="president-last-match compact"><small>OSTATNI MECZ</small><strong>${presidentMatchScore(lastRound)}</strong></div>` : ''}

      <section class="president-final-primary" aria-label="Najważniejsze wyniki sezonu">
        <div><small>MIEJSCE</small><strong>${position}.</strong><span>cel TOP ${board.target}</span></div>
        <div><small>PUNKTY</small><strong>${Number(row.points || 0)}</strong><span>${Number(row.played || 0)} meczów</span></div>
        <div><small>BILANS</small><strong>${Number(row.wins || 0)}–${Number(row.draws || 0)}–${Number(row.losses || 0)}</strong><span>W–R–P</span></div>
        <div><small>BRAMKI</small><strong>${Number(row.gf || 0)}:${Number(row.ga || 0)}</strong><span>bilans ${Number(row.gf || 0) - Number(row.ga || 0) >= 0 ? '+' : ''}${Number(row.gf || 0) - Number(row.ga || 0)}</span></div>
      </section>

      <section class="president-board-summary">
        <div class="president-board-score">
          <small>POPARCIE ZARZĄDU</small>
          <strong>${board.confidence}/100</strong>
          <span>${presidentEscape(presidentModeCore.boardLabel(board.confidence))}</span>
        </div>
        <div class="president-board-copy">
          <strong>${strategy ? strategy.icon + ' ' + presidentEscape(strategy.label) : 'Plan sezonu zakończony'}</strong>
          <span>Budżet: ${presidentModeCore.money(profile.budget)} · decyzje w sezonie: ${seasonDecisionCount} · kondycja klubu: ${presidentModeCore.averageAreas(profile)}/100</span>
          <small>${presidentEscape(sourceNote)}</small>
        </div>
      </section>

      ${presidentWarningsHtml(profile, career)}
      ${presidentCareerHistoryHtml(profile)}

      <div class="president-final-details">
        <details class="president-club-details">
          <summary><span><strong>🏢 Kondycja klubu</strong><small>działy i zaufanie</small></span><em>Pokaż</em></summary>
          <div class="president-area-grid">${presidentAreaRows(profile.areas)}</div>
          <div class="president-trust-grid">${presidentTrustRows(profile.trust)}</div>
        </details>
        ${presidentSquadHtml(career)}
        <details class="president-table-details">
          <summary><span><strong>📊 Końcowa tabela</strong><small>${position}. miejsce · ${Number(row.points || 0)} pkt</small></span><em>Pokaż</em></summary>
          ${typeof renderCareerTableHtml === 'function' ? renderCareerTableHtml() : ''}
        </details>
      </div>

      <section class="president-next-season-box">
        <span><small>KARIERA TRWA DALEJ</small><strong>Sezon ${Number(profile.careerYear || 1) + 1} · ${presidentEscape(nextSeason)}</strong></span>
        <p>Budżet, inwestycje, stałe umowy i reputacja zostają w klubie. Zanim zacznie się kolejny rok, przejdziesz przez osobne lato prezesa.</p>
        <button type="button" class="president-continue-career">Przejdź do lata →</button>
        <button type="button" class="president-end-career">Zakończ karierę</button>
      </section>

      <small class="president-disclaimer">Finanse, strategie i wskaźniki są mechaniką gry. Po wyczerpaniu dostępnych sezonów ŁNP dalsze lata są wyraźnie oznaczoną symulacją kariery.</small>
    </div>`;

  panel.classList.remove('hidden');
  panel.querySelector('.president-continue-career')?.addEventListener('click', renderPresidentOffseason);
  panel.querySelector('.president-end-career')?.addEventListener('click', finishPresidentCareer);
  if (el('status')) {
    el('status').textContent = `Kariera prezesa · sezon ${profile.careerYear} zakończony · ${position}. miejsce · ${row.points || 0} pkt`;
  }
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
  } else if (!state.seasonCareer?.active) {
    state.seasonCareer = null;
    if (!initializeSeasonCareer()) return false;
  } else if (state.seasonCareer.completed) {
    return renderPresidentSeasonFinal();
  }

  if (!state.presidentMode?.strategy) return renderPresidentStrategySelection();
  return showPresidentRound();
};

ensurePresidentFormatOption();
ensurePresidentDecisionPanel();
el('game-format')?.addEventListener('change', syncPresidentSetup);
watchPresidentLanding();
