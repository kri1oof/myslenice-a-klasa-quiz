// President mode v4: manage the club around football; matches are simulated in the background.
// Financial values, trust and department ratings are fictional game systems, not real club data.
const presidentModeCore = globalThis.PresidentModeCore;
const presidentBaseStartGame = startGame;
state.presidentUiTab = state.presidentUiTab || 'overview';

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
  if (career.competitionLevel === undefined || career.competitionLevel === null) {
    career.competitionLevel = 1;
    career.competitionLabel = presidentModeCore.competitionByLevel(1).label;
  }
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
  const departed = new Set(state.presidentMode?.departedPlayerKeys || []);
  return (state.playerCharacters || [])
    .filter(player =>
      player?.club === career?.club &&
      player?.season === sourceSeason &&
      !departed.has(presidentStablePlayerKey(player))
    )
    .sort((a, b) =>
      Number(b?.ratings?.game_rating || 0) - Number(a?.ratings?.game_rating || 0) ||
      Number(b?.stats?.appearances || 0) - Number(a?.stats?.appearances || 0) ||
      String(a?.player || '').localeCompare(String(b?.player || ''), 'pl')
    );
}

function presidentCareerDevelopmentText(item) {
  const seasons = Number(item?.careerSeasons || 0);
  const delta = Number(item?.lastDevelopmentDelta || 0);
  const age = Number(item?.careerAge || item?.age || 0);
  const parts = [];
  if (age > 0) parts.push('wiek kariery ' + age);
  if (seasons > 0) parts.push(seasons + (seasons === 1 ? ' pełny sezon' : ' pełne sezony'));
  if (seasons > 0) parts.push('ostatni rozwój ' + (delta > 0 ? '↑ +' + delta : delta < 0 ? '↓ ' + delta : '→ 0'));
  return parts.join(' · ');
}

function presidentCareerContractText(item, kind = 'transfer') {
  const normalized = presidentModeCore.normalizeCareerPlayerContract(item, kind);
  const remaining = Math.max(0, Number(normalized?.contractRemaining || 0));
  const years = Math.max(1, Number(normalized?.contractYears || 1));
  return remaining > 0
    ? `umowa kariery ${remaining} sez. (z ${years})`
    : 'umowa kariery wygasła';
}

function presidentLatestDevelopmentHtml(profile) {
  const latest = [...(profile?.playerDevelopmentHistory || [])].at(-1);
  if (!latest?.changes?.length) return '';
  const improved = latest.changes.filter(item => Number(item.delta || 0) > 0).length;
  const declined = latest.changes.filter(item => Number(item.delta || 0) < 0).length;
  const stable = latest.changes.length - improved - declined;
  return `<div class="president-development-summary">
    <span><small>📈 ROZWÓJ KADRY PRZED SEZONEM ${latest.targetCareerYear}</small><strong>${latest.changes.length} zawodników ocenionych w warstwie kariery</strong></span>
    <div><b>↑ ${improved}</b><b>→ ${stable}</b><b>↓ ${declined}</b></div>
  </div>`;
}

function presidentSquadHtml(career) {
  const players = presidentSquadProfiles(career);
  const academyPlayers = state.presidentMode?.academyRoster || [];
  const leaders = players.slice(0, 6).map(player => {
    const stats = player.stats || {};
    const rating = Number(player?.ratings?.game_rating || 0);
    return `<div class="president-squad-player"><span><strong>${presidentEscape(player.player)}</strong><small>${presidentEscape(player.archetype || 'Zawodnik')} · ${Number(stats.appearances || 0)} mecz. · ${Number(stats.goals || 0)} goli · profil ŁNP</small></span><b>${rating || '—'}</b></div>`;
  }).join('');
  const currentKeys = new Set(players.map(player => presidentStablePlayerKey(player)));
  const careerSignings = (state.presidentMode?.transferRoster || []).map(item => {
    const development = presidentCareerDevelopmentText(item);
    const contract = presidentCareerContractText(item, 'transfer');
    return `
    <div class="president-squad-player president-career-signing">
      <span><strong>${presidentEscape(item.player)}</strong><small>Wzmocnienie kariery · źródło ŁNP: ${presidentEscape(item.sourceClub || 'inny klub')} / ${presidentEscape(item.sourceSeason || '')} · ${presidentEscape(contract)}${development ? ' · ' + presidentEscape(development) : ''}</small></span>
      <b>${Number(item?.ratings?.game_rating || 0) || '—'}</b>
    </div>`;
  }).join('');
  const careerAcademy = academyPlayers.map(item => {
    const development = presidentCareerDevelopmentText(item);
    const contract = presidentCareerContractText(item, 'academy');
    return `
    <div class="president-squad-player president-career-academy">
      <span><strong>${presidentEscape(item.player)}</strong><small>🌱 Fikcyjny wychowanek kariery · ${presidentEscape(item.role || item.archetype || 'Zawodnik')} · potencjał ${Number(item?.ratings?.potential || 0) || '—'} · ${presidentEscape(contract)}${development ? ' · ' + presidentEscape(development) : ''}</small></span>
      <b>${Number(item?.ratings?.game_rating || 0) || '—'}</b>
    </div>`;
  }).join('');
  const retainedRoster = state.presidentMode?.retainedRoster || [];
  const retainedKeys = new Set(retainedRoster.map(item => item.playerKey || item.id));
  const activeRetentions = retainedRoster.map(item => {
    const development = presidentCareerDevelopmentText(item);
    const contract = presidentCareerContractText(item, 'retained');
    return `
      <div class="president-squad-player president-career-retention">
        <span><strong>${presidentEscape(item.player)}</strong><small>Zatrzymany w alternatywnej karierze · profil ŁNP ${presidentEscape(item.sourceSeason || '')} · ${presidentEscape(contract)}${development ? ' · ' + presidentEscape(development) : ''}</small></span>
        <b>${Number(item?.ratings?.game_rating || 0) || '—'}</b>
      </div>`;
  }).join('');
  const legacyRetentions = (state.presidentMode?.departureHistory || [])
    .filter(item => item.outcome === 'retain' && !currentKeys.has(item.playerKey) && !retainedKeys.has(item.playerKey))
    .filter((item, index, list) => list.findIndex(other => other.playerKey === item.playerKey) === index)
    .map(item => `
      <div class="president-squad-player president-career-retention">
        <span><strong>${presidentEscape(item.player)}</strong><small>Zatrzymany w starszym zapisie kariery · profil ŁNP ${presidentEscape(item.sourceSeason || '')}</small></span>
        <b>${Number(item?.ratings?.game_rating || 0) || '—'}</b>
      </div>`).join('');
  const careerRetentions = activeRetentions + legacyRetentions;

  const extras = careerAcademy + careerRetentions + careerSignings;
  if (!players.length && !extras) {
    return `<details class="president-squad-details"><summary><span><strong>👥 Kadra</strong><small>Brak indywidualnych kart zawodników dla tego sezonu</small></span><em>Pokaż</em></summary><p class="president-empty-copy">Tryb nadal korzysta z profilu siły klubu. Wychowankowie i transfery kariery pojawią się tutaj po wykonaniu takich ruchów.</p></details>`;
  }

  const sourceCopy = career?.presidentSimulatedSeason && career?.sourceSeason
    ? `Ostatnia dostępna baza ŁNP: ${presidentEscape(career.sourceSeason)}. Profile ŁNP są punktem odniesienia, natomiast wychowankowie są fikcyjnymi zawodnikami tej kariery.`
    : 'Nazwiska i statystyki oznaczone jako ŁNP pochodzą z danych źródłowych. Wychowankowie kariery są jawnie fikcyjnymi postaciami gry.';
  const summaryParts = [];
  if (players.length) summaryParts.push(`${players.length} profili ŁNP`);
  if (academyPlayers.length) summaryParts.push(`${academyPlayers.length} wychowanków kariery`);
  if (state.presidentMode?.transferRoster?.length) summaryParts.push(`${state.presidentMode.transferRoster.length} transferów kariery`);
  if (retainedRoster.length) summaryParts.push(`${retainedRoster.length} zatrzymanych w karierze`);
  return `<details class="president-squad-details"><summary><span><strong>👥 Kadra</strong><small>${summaryParts.join(' · ') || 'kadra kariery'}</small></span><em>Pokaż</em></summary>${presidentLatestDevelopmentHtml(state.presidentMode)}<div class="president-squad-list">${careerAcademy}${careerRetentions}${careerSignings}${leaders}</div><small class="president-data-note">${sourceCopy} Rozwój ocen i umowy między sezonami dotyczą wyłącznie alternatywnej warstwy kariery i nie zmieniają danych ŁNP ani nie opisują realnych kontraktów.</small></details>`;
}

function presidentEmploymentHtml(profile, career) {
  const job = presidentModeCore.normalizedJobSecurity(profile?.jobSecurity);
  if (job.status === 'secure' && !job.fired) return '';
  const board = presidentBoardContext(profile, career);
  const title = job.fired
    ? 'Zarząd zakończył współpracę'
    : job.status === 'ultimatum'
      ? `Ultimatum: ${job.ultimatumRoundsLeft} kolejki na poprawę`
      : 'Ostrzeżenie zarządu';
  const copy = job.fired
    ? 'Kariera w tym klubie dobiegła końca.'
    : job.status === 'ultimatum'
      ? 'Podnieś poparcie zarządu do bezpiecznego poziomu. Liczą się wyniki, finanse, kondycja klubu i relacje.'
      : 'Sytuacja nie jest jeszcze krytyczna, ale kolejny słaby okres może uruchomić ultimatum.';
  return `<div class="president-employment-alert ${job.status}">
    <span>${job.fired ? '🚪' : job.status === 'ultimatum' ? '⏳' : '⚠️'}</span>
    <div><small>STANOWISKO PREZESA · POPARCIE ${board.confidence}/100</small><strong>${presidentEscape(title)}</strong><p>${presidentEscape(copy)}</p></div>
  </div>`;
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
      <h2>${presidentEscape(career.club)} · ${presidentEscape(career.season)}</h2>
      <div class="president-competition-chip">${presidentEscape(career.competitionLabel || presidentModeCore.competitionByLevel(career.competitionLevel ?? 1).label)}${career.presidentSimulatedSeason ? ' · SYMULACJA KARIERY' : ' · baza ŁNP'}</div>
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
      <div><small>TABELA / CEL</small><strong>${standing.position === "—" ? "—" : standing.position + "."} / TOP ${board.target}</strong><span>${presidentEscape(career.competitionLabel || presidentModeCore.competitionByLevel(career.competitionLevel ?? 1).short)} · ${standing.points} pkt</span></div>
      <div><small>POPARCIE ZARZĄDU</small><strong>${board.confidence}/100</strong><span>${presidentModeCore.boardLabel(board.confidence)} · ${presidentModeCore.employmentLabel(profile)}</span></div>
      <div><small>REPUTACJA PREZESA</small><strong>${presidentModeCore.reputationScore(profile)}/100</strong><span>${presidentEscape(presidentModeCore.reputationLabel(presidentModeCore.reputationScore(profile)))}</span></div>
      <div><small>PLAN SEZONU</small><strong>${strategy ? strategy.icon + ' ' + presidentEscape(strategy.label) : '—'}</strong><span>kondycja ${avgAreas}/100 · zaufanie ${avgTrust}/100</span></div>
    </div>`;
}



function presidentContractsSummaryHtml(profile) {
  const contracts = profile?.contracts || [];
  const recentEnded = [...(profile?.contractHistory || [])]
    .filter(item => item.endReason)
    .slice(-3)
    .reverse();
  return `
    <div class="president-contract-summary">
      <div class="president-contract-summary-head"><strong>📄 Aktywne umowy wielosezonowe</strong><span>${contracts.length}/2 miejsc</span></div>
      ${contracts.length ? contracts.map(contract => `
        <div class="president-contract-row">
          <span><strong>${contract.icon || '🤝'} ${presidentEscape(contract.label)}</strong><small>jeszcze ${Number(contract.remainingSeasons || 0)} sez. · ${contract.condition?.label ? 'warunek: ' + presidentEscape(contract.condition.label) : 'bez warunku sportowego'}</small></span>
          <b>+${presidentModeCore.money(contract.recurring || 0)}/kolejkę</b>
        </div>`).join('') : '<small class="president-contract-empty">Brak aktywnych umów wielosezonowych.</small>'}
      ${recentEnded.length ? `<details class="president-contract-ended"><summary>Ostatnio zakończone</summary>${recentEnded.map(item => `<div><span>${presidentEscape(item.label)}</span><small>${item.endReason === 'condition' ? 'warunek niespełniony' : 'koniec okresu umowy'}</small></div>`).join('')}</details>` : ''}
    </div>`;
}

function presidentFinanceTabHtml(profile) {
  const recurring = Number(profile?.recurring || 0);
  const lastFinance = Number(profile?.lastFinance || 0);
  const year = Number(profile?.careerYear || 1);
  const summary = presidentModeCore.financeCategorySummary(profile, year);
  const categoryRows = Object.entries(presidentModeCore.FINANCE_CATEGORIES || {}).map(([key, label]) => {
    const amount = Number(summary[key] || 0);
    return `<div class="president-finance-category ${amount < 0 ? 'negative' : amount > 0 ? 'positive' : ''}"><span>${presidentEscape(label)}</span><strong>${amount >= 0 ? '+' : ''}${presidentModeCore.money(amount)}</strong></div>`;
  }).join('');
  const ledger = [...(profile?.financeLedger || [])]
    .filter(entry => Number(entry.careerYear || 0) === year)
    .slice(-10)
    .reverse();
  const seasonNet = Object.values(summary).reduce((sum, value) => sum + Number(value || 0), 0);
  return `
    <div class="president-finance-tab">
      <div class="president-tab-stat-grid">
        <div><small>BUDŻET</small><strong>${presidentModeCore.money(profile.budget)}</strong><span>${presidentModeCore.financeLabel(profile)}</span></div>
        <div><small>STAŁY BILANS</small><strong>${recurring >= 0 ? '+' : ''}${presidentModeCore.money(recurring)}</strong><span>na kolejkę</span></div>
        <div><small>BILANS SEZONU</small><strong>${seasonNet >= 0 ? '+' : ''}${presidentModeCore.money(seasonNet)}</strong><span>zarejestrowane przepływy</span></div>
        <div><small>OSTATNIA KOLEJKA</small><strong>${lastFinance >= 0 ? '+' : ''}${presidentModeCore.money(lastFinance)}</strong><span>mecz + umowy + partnerzy</span></div>
      </div>
      <div class="president-finance-categories">${categoryRows}</div>
      ${presidentContractsSummaryHtml(profile)}
      <div class="president-tab-list president-ledger-list">
        <strong>Ostatnie operacje</strong>
        ${ledger.length ? ledger.map(entry => `<div><span><small>${entry.round ? 'kolejka ' + entry.round : 'poza kolejką'} · ${presidentEscape(presidentModeCore.FINANCE_CATEGORIES?.[entry.category] || 'Pozostałe')}</small>${presidentEscape(entry.label)}</span><b class="${Number(entry.amount || 0) < 0 ? 'negative' : 'positive'}">${Number(entry.amount || 0) >= 0 ? '+' : ''}${presidentModeCore.money(entry.amount || 0)}</b></div>`).join('') : '<small>Brak zarejestrowanych przepływów w tym sezonie.</small>'}
      </div>
      <small class="president-data-note">Wszystkie kwoty są elementem ekonomii gry i nie odwzorowują rzeczywistych finansów klubu.</small>
    </div>`;
}
function presidentClubTabHtml(profile, career) {
  return `
    <div class="president-club-tab">
      <div class="president-area-grid">${presidentAreaRows(profile.areas)}</div>
      <div class="president-trust-grid">${presidentTrustRows(profile.trust)}</div>
      ${presidentInvestmentsHtml(profile, career).replace('<details class="president-investments">', '<details class="president-investments" open>')}
    </div>`;
}

function presidentManagementHubHtml(profile, career) {
  const active = state.presidentUiTab || 'overview';
  const tabs = [
    ['overview','🏠','Pulpit'],
    ['squad','👥','Kadra'],
    ['finance','💰','Finanse'],
    ['club','🏢','Klub'],
    ['history','📚','Historia'],
  ];
  const pane = (id, html) => `<section class="president-hub-pane ${active === id ? 'active' : ''}" data-president-pane="${id}">${html}</section>`;
  return `
    <div class="president-management-hub">
      <nav class="president-hub-tabs" aria-label="Panel prezesa">
        ${tabs.map(([id,icon,label]) => `<button type="button" class="${active === id ? 'active' : ''}" data-president-tab="${id}"><span>${icon}</span><strong>${label}</strong></button>`).join('')}
      </nav>
      <div class="president-hub-content">
        ${pane('overview', presidentDashboardHtml(profile, career) + presidentEmploymentHtml(profile, career) + presidentWarningsHtml(profile, career))}
        ${pane('squad', presidentSquadHtml(career).replace('<details class="president-squad-details">', '<details class="president-squad-details" open>'))}
        ${pane('finance', presidentFinanceTabHtml(profile))}
        ${pane('club', presidentClubTabHtml(profile, career))}
        ${pane('history', presidentCareerHistoryHtml(profile) || '<p class="president-empty-copy">Historia kariery pojawi się po zakończeniu pierwszego sezonu.</p>')}
      </div>
    </div>`;
}

function bindPresidentManagementTabs(panel) {
  if (!panel) return;
  panel.querySelectorAll('[data-president-tab]').forEach(button => {
    button.addEventListener('click', () => {
      state.presidentUiTab = button.dataset.presidentTab || 'overview';
      panel.querySelectorAll('[data-president-tab]').forEach(item => {
        item.classList.toggle('active', item.dataset.presidentTab === state.presidentUiTab);
      });
      panel.querySelectorAll('[data-president-pane]').forEach(item => {
        item.classList.toggle('active', item.dataset.presidentPane === state.presidentUiTab);
      });
    });
  });
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
  const trigger = presidentModeCore.decisionTrigger(profile, decision);
  panel.innerHTML = `
    <div class="president-decision-card">
      <div class="president-decision-head">
        <span><small>👔 BIURKO PREZESA · KOLEJKA ${round}/${career.rounds.length}</small><strong>${presidentEscape(career.club)}</strong><em>Mecz w tle po decyzji: ${fixture ? `${presidentEscape(careerVenue(fixture))} · ${presidentEscape(opponent)}` : 'brak meczu'}</em></span>
        <span class="president-background-match"><small>⚽ MECZ</small><strong>automatycznie</strong><em>bez pytań i decyzji boiskowych</em></span>
      </div>
      ${presidentManagementHubHtml(profile, career)}
      <div class="president-case-trigger"><span>🧭 DLACZEGO TERAZ?</span><strong>${presidentEscape(trigger.label)}</strong></div>
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
  bindPresidentManagementTabs(panel);
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
  state.presidentMode = presidentModeCore.reviewEmployment(state.presidentMode, {
    position:seasonCareerCore.position(career.table, career.club) || Object.keys(career.table || {}).length || 14,
    teamCount:Object.keys(career.table || {}).length || career.clubs?.length || 14,
    round:career.roundIndex,
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
  if (state.presidentMode?.jobSecurity?.fired) renderPresidentDismissal(round);
  else if (careerState()?.completed) renderPresidentSeasonFinal(round);
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
      ${presidentManagementHubHtml(profile, career)}
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
  bindPresidentManagementTabs(panel);
  panel.classList.remove('hidden');
  panel.querySelector('.president-next-round')?.addEventListener('click', () => showPresidentRound());
  if (el('status')) el('status').textContent = `Tryb prezesa · kolejka ${context.fixture.round} zakończona w tle`;
  window.scrollTo({ top:0, behavior:'smooth' });
  return true;
}



function presidentBuildJobOffers(profile, career, reason = 'career') {
  if (!profile || !career) return [];
  const reputation = presidentModeCore.reputationScore(profile);
  const key = `${profile.careerYear}|${career.club}|${career.season}|${reason}|rep-${reputation}`;
  if (profile.jobMarket?.key === key && Array.isArray(profile.jobMarket.offers)) {
    return profile.jobMarket.offers;
  }

  const nextSeason = presidentNextSeasonLabel(career.season);
  const currentLevel = Number(career.competitionLevel ?? 1);
  const market = presidentModeCore.jobMarketSummary(profile, currentLevel, reason);
  const allowedLevels = new Set(market.levels);
  const offers = [];
  const addOffer = (club, level, simulated, sourceSeason = null) => {
    if (!club || club === career.club || offers.some(item => item.club === club) || offers.length >= 3) return;
    const competition = presidentModeCore.competitionByLevel(level);
    const kind = competition.level > currentLevel ? 'higher' : competition.level < currentLevel ? 'lower' : 'same';
    const offer = {
      id:`${reason}|${nextSeason}|${competition.level}|${club}`,
      club,
      fromClub:career.club,
      season:nextSeason,
      competitionLevel:competition.level,
      competitionLabel:competition.label,
      simulated:Boolean(simulated),
      sourceSeason,
      reason,
      kind,
      reputationAtOffer:reputation,
    };
    offer.terms = presidentModeCore.jobOfferTerms(offer);
    offers.push(offer);
  };

  let officialSameLevel = [];
  if (
    currentLevel === 1 &&
    allowedLevels.has(1) &&
    Array.isArray(state.seasons) &&
    state.seasons.includes(nextSeason)
  ) {
    officialSameLevel = seasonCareerCore.clubsForSeason(
      state.playerCharacters || [],
      state.all || [],
      nextSeason,
    ).filter(club =>
      club !== career.club &&
      (state.playerCharacters || []).some(player => player?.season === nextSeason && player?.club === club)
    );
    const random = seasonCareerCore.seededRandom(`${key}|official-offers`);
    officialSameLevel = officialSameLevel
      .map(club => ({ club, sort:random() }))
      .sort((a,b) => a.sort - b.sort)
      .map(row => row.club);
    officialSameLevel.slice(0, reason === 'dismissal' ? 1 : 2).forEach(club => addOffer(club, 1, false, nextSeason));
  }

  market.levels
    .filter(level => level !== currentLevel)
    .forEach(level => {
      const competition = presidentModeCore.competitionByLevel(level);
      addOffer(`Nowy klub · ${competition.short}`, level, true, career.sourceSeason || null);
    });

  if (offers.length < 3 && currentLevel === 1) {
    officialSameLevel.slice(reason === 'dismissal' ? 1 : 2).forEach(club => addOffer(club, 1, false, nextSeason));
  }

  let filler = 1;
  while (offers.length < 3) {
    const fallbackLevel = market.levels[Math.min(filler - 1, market.levels.length - 1)] ?? currentLevel;
    const competition = presidentModeCore.competitionByLevel(fallbackLevel);
    addOffer(`Nowy klub · ${competition.short} ${filler}`, fallbackLevel, true, career.sourceSeason || null);
    filler += 1;
    if (filler > 8) break;
  }

  profile.jobMarket = {
    key,
    reason,
    season:nextSeason,
    reputation,
    reputationLabel:market.label,
    levels:[...market.levels],
    offers,
    declined:false,
  };
  return offers;
}

function presidentPlanForJobOffer(previousCareer, offer) {
  const nextSeason = offer.season || presidentNextSeasonLabel(previousCareer.season);
  if (!offer.simulated && Number(offer.competitionLevel) === 1) {
    const clubs = seasonCareerCore.clubsForSeason(
      state.playerCharacters || [],
      state.all || [],
      nextSeason,
    );
    if (clubs.includes(offer.club)) {
      return {
        season:nextSeason,
        club:offer.club,
        clubs,
        strengths:seasonCareerCore.strengthMap(state.playerCharacters || [], clubs, nextSeason),
        simulated:false,
        sourceSeason:nextSeason,
        competitionLevel:1,
        competitionLabel:presidentModeCore.competitionByLevel(1).label,
        movement:null,
      };
    }
  }
  return presidentSimulatedCompetitionPlan(
    {
      ...previousCareer,
      club:offer.club,
      competitionLevel:Number(offer.competitionLevel ?? previousCareer.competitionLevel ?? 1),
      competitionLabel:offer.competitionLabel,
    },
    nextSeason,
    Number(offer.competitionLevel ?? previousCareer.competitionLevel ?? 1),
  );
}

function acceptPresidentJobOffer(offerId) {
  const profile = state.presidentMode;
  const previousCareer = careerState();
  const offer = profile?.jobMarket?.offers?.find(item => item.id === offerId);
  if (!profile || !previousCareer || !offer) return false;

  const accepted = presidentModeCore.acceptJobOffer(profile, offer);
  if (!accepted.ok) return false;
  const plan = presidentPlanForJobOffer(previousCareer, offer);
  const nextCareer = presidentCareerFromPlan(plan);
  state.presidentMode = presidentModeCore.prepareNextSeason(accepted.profile, nextCareer.rounds.length);
  state.seasonCareer = nextCareer;

  const from = el('season-from');
  const to = el('season-to');
  if (!plan.simulated && from?.querySelector(`option[value="${plan.season}"]`)) {
    from.value = plan.season;
    if (to) to.value = plan.season;
  }

  if (el('status')) {
    el('status').textContent = `Kariera prezesa · nowy klub: ${offer.club} · ${offer.competitionLabel}`;
  }
  return renderPresidentStrategySelection();
}

function declinePresidentJobOffers() {
  if (!state.presidentMode?.jobMarket) return false;
  state.presidentMode.jobMarket.declined = true;
  return renderPresidentOffseason();
}


function presidentJobOffersHtml(profile, career, reason = 'career') {
  const offers = presidentBuildJobOffers(profile, career, reason);
  if (!offers.length) return '';
  const market = presidentModeCore.jobMarketSummary(profile, Number(career?.competitionLevel ?? 1), reason);
  const availableLevels = market.levels.map(level => presidentModeCore.competitionByLevel(level).short).join(' · ');
  return `
    <section class="president-job-market ${reason}">
      <div class="president-job-market-head">
        <span><small>${reason === 'dismissal' ? 'RYNEK PRACY · PO ZWOLNIENIU' : 'OFERTY DLA PREZESA'}</small><strong>${reason === 'dismissal' ? 'Kariera może trwać w innym klubie' : 'Możesz zmienić klub przed kolejnym sezonem'}</strong></span>
        <em>${offers.length} oferty</em>
      </div>
      <p class="president-job-market-note">${reason === 'dismissal'
        ? 'Nowy klub oznacza nowy budżet, zaufanie i infrastrukturę. Historia Twojej kariery pozostaje.'
        : 'Zmiana klubu jest dobrowolna. Majątek obecnego klubu nie przechodzi razem z prezesem.'}</p>
      <div class="president-reputation-market">
        <span><small>REPUTACJA</small><strong>${market.reputation}/100 · ${presidentEscape(market.label)}</strong></span>
        <span><small>RYNEK DOSTĘPNY NA POZIOMACH</small><strong>${presidentEscape(availableLevels)}</strong></span>
      </div>
      <div class="president-job-offers">
        ${offers.map(offer => `
          <article class="president-job-offer ${offer.simulated ? 'simulated' : 'official'}">
            <div><small>${offer.simulated ? 'SYMULACJA KARIERY' : 'KLUB Z BAZY ŁNP'} · ${offer.kind === 'higher' ? 'KROK WYŻEJ' : offer.kind === 'lower' ? 'POZIOM NIŻEJ' : 'TEN SAM POZIOM'}</small><strong>${presidentEscape(offer.club)}</strong><span>${presidentEscape(offer.competitionLabel)} · ${presidentEscape(offer.season)}</span></div>
            <div class="president-job-offer-terms"><span>Budżet startowy</span><strong>${presidentModeCore.money(offer.terms?.budget || 0)}</strong></div>
            <button type="button" data-president-job-offer="${presidentEscape(offer.id)}">Przyjmij ofertę</button>
          </article>`).join('')}
      </div>
      ${reason === 'career' ? '<button type="button" class="president-decline-job-offers">Zostaję w obecnym klubie</button>' : ''}
    </section>`;
}

function renderPresidentDismissal(lastRound = null) {
  const profile = state.presidentMode;
  const career = careerState();
  const panel = ensurePresidentDecisionPanel();
  if (!profile || !career || !panel) return false;
  hidePresidentGameSurfaces();
  const board = presidentBoardContext(profile, career);
  const job = presidentModeCore.normalizedJobSecurity(profile.jobSecurity);
  const position = seasonCareerCore.position(career.table, career.club) || '—';
  const row = career.table?.[career.club] || {};
  panel.innerHTML = `
    <div class="president-dismissal">
      <section class="president-dismissal-hero">
        <span>🚪</span>
        <div><small>DECYZJA ZARZĄDU</small><h2>Kończy się Twoja praca w ${presidentEscape(career.club)}</h2><p>Poparcie zarządu spadło do ${board.confidence}/100 i ultimatum nie przyniosło wystarczającej poprawy.</p></div>
      </section>
      ${lastRound?.fixture ? `<div class="president-last-match compact"><small>OSTATNI MECZ</small><strong>${presidentMatchScore(lastRound)}</strong></div>` : ''}
      <section class="president-dismissal-summary">
        <div><small>SEZON</small><strong>${presidentEscape(career.season)}</strong><span>${presidentEscape(career.competitionLabel || 'A klasa Myślenice')}</span></div>
        <div><small>TABELA</small><strong>${position}.</strong><span>${Number(row.points || 0)} pkt</span></div>
        <div><small>BUDŻET</small><strong>${presidentModeCore.money(profile.budget)}</strong><span>${presidentModeCore.financeLabel(profile)}</span></div>
        <div><small>POPARCIE</small><strong>${board.confidence}/100</strong><span>${presidentEscape(job.reason || 'wyniki i kondycja klubu')}</span></div>
        <div><small>REPUTACJA</small><strong>${presidentModeCore.reputationScore(profile)}/100</strong><span>${presidentEscape(presidentModeCore.reputationLabel(presidentModeCore.reputationScore(profile)))}</span></div>
      </section>
      ${presidentCareerHistoryHtml(profile)}
      ${presidentJobOffersHtml(profile, career, 'dismissal')}
      <div class="president-dismissal-actions">
        <p>Możesz przyjąć ofertę i rozpocząć kolejny sezon w innym klubie albo zakończyć karierę.</p>
        <button type="button" class="president-end-career">Zakończ karierę</button>
      </div>
      <small class="president-disclaimer">Zwolnienie i kryteria oceny są mechaniką gry, nie informacją o realnych władzach ani sytuacji klubu.</small>
    </div>`;
  panel.classList.remove('hidden');
  panel.querySelectorAll('[data-president-job-offer]').forEach(button => {
    button.addEventListener('click', () => acceptPresidentJobOffer(button.dataset.presidentJobOffer));
  });
  panel.querySelector('.president-end-career')?.addEventListener('click', finishPresidentCareer);
  if (el('status')) el('status').textContent = `Kariera prezesa · zwolnienie po kolejce ${career.roundIndex}`;
  window.scrollTo({ top:0, behavior:'smooth' });
  return true;
}

function presidentNextSeasonLabel(label) {
  const match = String(label || '').match(/^(\d{4})\/(\d{2})/);
  if (!match) return 'kolejny sezon';
  const start = Number(match[1]) + 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function presidentCompetitionMovement(career) {
  const teamCount = Math.max(2, Object.keys(career?.table || {}).length || career?.clubs?.length || 14);
  const position = seasonCareerCore.position(career?.table, career?.club) || teamCount;
  return presidentModeCore.competitionMovement({
    level:Number(career?.competitionLevel ?? 1),
    position,
    teamCount,
  });
}

function presidentSimulatedCompetitionPlan(previousCareer, nextSeason, level) {
  const competition = presidentModeCore.competitionByLevel(level);
  const teamCount = Math.max(8, previousCareer?.clubs?.length || 14);
  const ownClub = previousCareer.club;
  const previousStrengths = Object.values(previousCareer?.strengths || {}).map(Number).filter(Number.isFinite);
  const previousAverage = previousStrengths.length
    ? previousStrengths.reduce((sum, value) => sum + value, 0) / previousStrengths.length
    : 65;
  const previousCompetition = presidentModeCore.competitionByLevel(previousCareer?.competitionLevel ?? 1);
  const levelDelta = competition.strengthOffset - previousCompetition.strengthOffset;
  const baseStrength = Math.max(48, Math.min(86, previousAverage + levelDelta));
  const random = seasonCareerCore.seededRandom(`${nextSeason}|${ownClub}|competition-${level}`);
  const rivals = Array.from({ length:teamCount - 1 }, (_, index) =>
    `${competition.short} · Rywal ${String(index + 1).padStart(2, '0')}`
  );
  const clubs = [ownClub, ...rivals];
  const strengths = { [ownClub]:Math.max(45, Math.min(90, Number(previousCareer?.strengths?.[ownClub] ?? 65))) };
  rivals.forEach((club, index) => {
    const variation = (random() - .5) * 12 + ((index % 5) - 2) * .7;
    strengths[club] = Math.max(45, Math.min(90, baseStrength + variation));
  });
  return {
    season:nextSeason,
    club:ownClub,
    clubs,
    strengths,
    simulated:true,
    sourceSeason:previousCareer?.sourceSeason || previousCareer?.season || null,
    competitionLevel:competition.level,
    competitionLabel:competition.label,
  };
}

function presidentNextSeasonPlan(previousCareer) {
  const nextSeason = presidentNextSeasonLabel(previousCareer?.season);
  const movement = presidentCompetitionMovement(previousCareer);
  const nextCompetition = presidentModeCore.competitionByLevel(movement.toLevel);
  const hasOfficialSeason = Array.isArray(state.seasons) && state.seasons.includes(nextSeason);
  const hasClubProfile = (state.playerCharacters || []).some(
    player => player?.season === nextSeason && player?.club === previousCareer?.club
  );

  if (nextCompetition.level === 1 && hasOfficialSeason && hasClubProfile) {
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
        competitionLevel:1,
        competitionLabel:nextCompetition.label,
        movement,
      };
    }
  }

  const plan = presidentSimulatedCompetitionPlan(previousCareer, nextSeason, nextCompetition.level);
  return { ...plan, movement };
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
    competitionLevel:Number(plan.competitionLevel ?? 1),
    competitionLabel:plan.competitionLabel || presidentModeCore.competitionByLevel(plan.competitionLevel ?? 1).label,
    entryMovement:plan.movement || null,
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
            <span><strong>Sezon ${item.careerYear} · ${presidentEscape(item.season)} · ${presidentEscape(item.club || '')}</strong><small>${presidentEscape(item.competitionLabel || 'A klasa Myślenice')} · ${item.simulated ? 'symulacja kariery' : 'baza ŁNP'}${item.movement?.code && item.movement.code !== 'stay' ? ' · ' + presidentEscape(presidentModeCore.competitionMovementLabel(item.movement)) : ''}</small></span>
            <span><b>${item.position}.</b><small>${item.points} pkt · ${item.wins}-${item.draws}-${item.losses} · reputacja ${Number(item.reputationDelta || 0) >= 0 ? '+' : ''}${Number(item.reputationDelta || 0)}</small></span>
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
    competitionLevel:Number(career.competitionLevel ?? 1),
    competitionLabel:career.competitionLabel || presidentModeCore.competitionByLevel(career.competitionLevel ?? 1).label,
    teamCount:Object.keys(career.table || {}).length || career.clubs?.length || 14,
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



function acceptPresidentSponsorContract(templateId) {
  const accepted = presidentModeCore.acceptSponsorContract(state.presidentMode, templateId);
  if (!accepted.ok) return false;
  state.presidentMode = accepted.profile;
  return renderPresidentOffseason();
}

function skipPresidentSponsorContract() {
  const skipped = presidentModeCore.skipSponsorContract(state.presidentMode);
  if (!skipped.ok) return false;
  state.presidentMode = skipped.profile;
  return renderPresidentOffseason();
}

function presidentSponsorContractsHtml(profile) {
  if (!profile?.offseason?.planId || !profile.offseason.competitionReadinessResolved) return '';
  const resolved = Boolean(profile.offseason.sponsorDecisionResolved);
  const active = profile.contracts || [];
  const available = presidentModeCore.availableContractTemplates(profile);

  if (resolved) {
    return `
      <section class="president-sponsor-window resolved">
        <div class="president-sponsor-window-head">
          <span><small>UMOWY WIELOSEZONOWE</small><strong>Partnerzy na kolejny sezon</strong></span><em>✓ rozstrzygnięte</em>
        </div>
        ${presidentContractsSummaryHtml(profile)}
      </section>`;
  }

  return `
    <section class="president-sponsor-window">
      <div class="president-sponsor-window-head">
        <span><small>UMOWY WIELOSEZONOWE · MECHANIKA GRY</small><strong>Wybierz jednego partnera albo pozostaw wolne miejsce</strong></span>
        <em>${active.length}/2 aktywne</em>
      </div>
      <p class="president-sponsor-note">Pakiety są fikcyjne i nie opisują żadnych realnych firm ani sponsorów. Warunki są oceniane po każdym sezonie.</p>
      ${active.length ? presidentContractsSummaryHtml(profile) : ''}
      <div class="president-sponsor-offers">
        ${available.map(template => `
          <article class="president-sponsor-offer">
            <span class="president-sponsor-icon">${template.icon}</span>
            <div><strong>${presidentEscape(template.label)}</strong><p>${presidentEscape(template.copy)}</p></div>
            <div class="president-sponsor-terms">
              <span><small>PREMIA</small><b>+${presidentModeCore.money(template.signingBonus)}</b></span>
              <span><small>CO KOLEJKĘ</small><b>+${presidentModeCore.money(template.recurring)}</b></span>
              <span><small>CZAS</small><b>${template.duration} sez.</b></span>
              <span><small>WARUNEK</small><b>${template.condition?.label ? presidentEscape(template.condition.label) : 'brak'}</b></span>
            </div>
            <button type="button" data-sponsor-contract="${template.id}">Podpisz umowę</button>
          </article>`).join('')}
      </div>
      <button type="button" class="president-skip-sponsor-contract">Nie podpisuję nowej umowy tego lata</button>
    </section>`;
}


function resolvePresidentCareerContract(caseId, outcome) {
  const resolved = presidentModeCore.resolveCareerPlayerContract(state.presidentMode, caseId, outcome);
  if (!resolved.ok) return false;
  state.presidentMode = resolved.profile;
  return renderPresidentOffseason();
}

function presidentCareerContractsHtml(profile) {
  const offseason = profile?.offseason;
  if (!offseason?.planId || !offseason.sponsorDecisionResolved) return '';
  const cases = offseason.playerContractCases || [];
  const retirements = offseason.retirementNotices || [];
  const unresolved = cases.filter(item => !item.resolved);
  const current = unresolved[0] || null;
  const resolvedCount = cases.length - unresolved.length;

  if (!current) {
    const retirementRows = retirements.map(item => `
      <div class="president-player-contract-retirement">
        <span><strong>${presidentEscape(item.player)}</strong><small>fikcyjny koniec kariery · wiek ${item.age || '—'} · RPG ${item.rating || '—'}</small></span>
        <em>zakończył karierę</em>
      </div>`).join('');
    return `
      <section class="president-player-contracts resolved">
        <div class="president-player-contracts-head">
          <span><small>📄 UMOWY KADRY KARIERY</small><strong>${cases.length ? 'Wszystkie wygasające umowy rozstrzygnięte' : 'Brak umów wymagających decyzji'}</strong></span>
          <em>✓ gotowe</em>
        </div>
        ${retirementRows ? `<div class="president-player-contract-retirements">${retirementRows}</div>` : ''}
      </section>`;
  }

  const kindLabel = current.kind === 'academy'
    ? 'wychowanek kariery'
    : current.kind === 'retained'
      ? 'zatrzymany zawodnik kariery'
      : 'transfer kariery';
  const canRenew = presidentModeCore.canResolveCareerPlayerContract(profile, current.id, 'renew');
  return `
    <section class="president-player-contracts">
      <div class="president-player-contracts-head">
        <span><small>📄 UMOWY KADRY KARIERY · MECHANIKA GRY</small><strong>Wygasa umowa: ${presidentEscape(current.player)}</strong></span>
        <em>${resolvedCount + 1}/${cases.length}</em>
      </div>
      <p class="president-player-contract-note">To <strong>fikcyjna umowa w alternatywnej karierze</strong>. Nie opisuje rzeczywistego kontraktu, statusu ani planów zawodnika.</p>
      <div class="president-player-contract-card">
        <div class="president-player-contract-player">
          <span><small>${presidentEscape(kindLabel)}</small><strong>${presidentEscape(current.player)}</strong><em>${current.age ? 'wiek kariery ' + current.age + ' · ' : ''}RPG ${current.rating}</em></span>
          <b>${current.rating}</b>
        </div>
        <div class="president-player-contract-terms">
          <span><small>NOWA UMOWA</small><strong>${current.renewalYears} sez.</strong></span>
          <span><small>PREMIA</small><strong>${presidentModeCore.money(current.renewalBonus)}</strong></span>
          <span><small>STAŁY KOSZT</small><strong>−${presidentModeCore.money(current.renewalRecurring)}/kol.</strong></span>
          <span><small>DOTYCHCZAS</small><strong>−${presidentModeCore.money(current.currentRecurring)}/kol.</strong></span>
        </div>
        <div class="president-player-contract-actions">
          <button type="button" data-career-contract-id="${presidentEscape(current.id)}" data-career-contract-outcome="renew" ${canRenew ? '' : 'disabled'}>
            <strong>🤝 Odnów umowę</strong>
            <span>${current.renewalYears} sez. · premia ${presidentModeCore.money(current.renewalBonus)}</span>
            ${canRenew ? '' : '<em>Brak środków na premię</em>'}
          </button>
          <button type="button" data-career-contract-id="${presidentEscape(current.id)}" data-career-contract-outcome="release">
            <strong>➡️ Pozwól odejść</strong>
            <span>Stały koszt zawodnika znika z budżetu kariery.</span>
          </button>
        </div>
      </div>
    </section>`;
}

function promotePresidentAcademyProspect(prospectId) {
  const promoted = presidentModeCore.promoteAcademyProspect(state.presidentMode, prospectId);
  if (!promoted.ok) return false;
  state.presidentMode = promoted.profile;
  return renderPresidentOffseason();
}

function skipPresidentAcademyIntake() {
  const skipped = presidentModeCore.skipAcademyIntake(state.presidentMode);
  if (!skipped.ok) return false;
  state.presidentMode = skipped.profile;
  return renderPresidentOffseason();
}

function presidentAcademyIntakeHtml(profile) {
  if (
    !profile?.offseason?.planId ||
    !profile.offseason.sponsorDecisionResolved ||
    !profile.offseason.playerContractsResolved
  ) return '';
  const prospects = profile.offseason.academyProspects || [];
  const resolved = Boolean(profile.offseason.academyDecisionResolved);
  const selected = profile.offseason.academySelectedId
    ? (profile.academyRoster || []).find(item => item.id === profile.offseason.academySelectedId)
    : null;

  if (resolved) {
    return `
      <section class="president-academy-intake resolved">
        <div class="president-academy-head">
          <span><small>🌱 NABÓR Z AKADEMII</small><strong>${selected ? presidentEscape(selected.player) + ' dołącza do seniorów' : 'Tego lata bez awansu wychowanka'}</strong></span>
          <em>✓ rozstrzygnięte</em>
        </div>
        ${selected ? `
          <div class="president-academy-selected">
            <span><strong>${presidentEscape(selected.player)}</strong><small>Fikcyjny wychowanek kariery · ${presidentEscape(selected.role)} · wiek ${selected.age} · umowa kariery ${Number(selected.contractRemaining || 3)} sez.</small></span>
            <b>RPG ${Number(selected?.ratings?.game_rating || 0)} · potencjał ${Number(selected?.ratings?.potential || 0)}</b>
          </div>` : ''}
      </section>`;
  }

  return `
    <section class="president-academy-intake">
      <div class="president-academy-head">
        <span><small>🌱 NABÓR Z AKADEMII · MECHANIKA GRY</small><strong>Wybierz jednego wychowanka do pierwszej drużyny</strong></span>
        <em>akademia ${Number(profile?.areas?.academy || 0)}/100</em>
      </div>
      <p class="president-academy-note">To <strong>fikcyjni zawodnicy wygenerowani wyłącznie dla tej kariery</strong>. Nie pochodzą z ŁNP i nie są używani jako fakty ani pytania quizowe.</p>
      <div class="president-academy-grid">
        ${prospects.map(prospect => {
          const affordable = presidentModeCore.canPromoteAcademyProspect(profile, prospect.id);
          return `
            <article class="president-academy-card">
              <div class="president-academy-player">
                <span><small>FIKCYJNY WYCHOWANEK</small><strong>${presidentEscape(prospect.player)}</strong><em>${presidentEscape(prospect.role)} · ${presidentEscape(prospect.archetype)} · ${prospect.age} lat</em></span>
                <b>${Number(prospect?.ratings?.game_rating || 0)}</b>
              </div>
              <div class="president-academy-stats">
                <span><small>RPG</small><strong>${Number(prospect?.ratings?.game_rating || 0)}</strong></span>
                <span><small>POTENCJAŁ</small><strong>${Number(prospect?.ratings?.potential || 0)}</strong></span>
                <span><small>WDROŻENIE</small><strong>${presidentModeCore.money(prospect.developmentCost)}</strong></span>
                <span><small>STAŁY KOSZT</small><strong>−${presidentModeCore.money(prospect.recurring)}/kol.</strong></span>
                <span><small>UMOWA KARIERY</small><strong>3 sez.</strong></span>
              </div>
              <button type="button" data-academy-prospect="${prospect.id}" ${affordable ? '' : 'disabled'}>
                ${affordable ? 'Włącz do kadry seniorów' : 'Brak środków na wdrożenie'}
              </button>
            </article>`;
        }).join('')}
      </div>
      <button type="button" class="president-skip-academy-intake">Nie włączam wychowanka tego lata</button>
    </section>`;
}

function presidentDepartureCandidate(profile, career) {
  if (!profile?.offseason || !career) return null;
  const stored = profile.offseason.departureCase;
  const sourceSeason = career?.sourceSeason || career?.season;
  const departed = new Set(profile.departedPlayerKeys || []);

  if (stored?.playerId) {
    const source = (state.playerCharacters || []).find(player => player?.id === stored.playerId);
    if (source) {
      return {
        ...source,
        playerKey:stored.playerKey || presidentStablePlayerKey(source),
        factualTransition:Boolean(stored.factualTransition),
        observedNextClub:stored.observedNextClub || null,
        observedNextSeason:stored.observedNextSeason || null,
      };
    }
  }

  const ownProfiles = (state.playerCharacters || [])
    .filter(player =>
      player?.club === career.club &&
      player?.season === sourceSeason &&
      player?.id &&
      !departed.has(presidentStablePlayerKey(player))
    )
    .sort((a, b) =>
      Number(b?.ratings?.game_rating || 0) - Number(a?.ratings?.game_rating || 0) ||
      Number(b?.stats?.appearances || 0) - Number(a?.stats?.appearances || 0)
    );

  if (!ownProfiles.length) {
    profile.offseason.departureResolved = true;
    return null;
  }

  let candidate = null;
  if (sourceSeason === career.season && globalThis.TransferInvestigationCore) {
    const nextSeason = presidentNextSeasonLabel(career.season);
    const transitions = globalThis.TransferInvestigationCore.detectTransitions(state.playerCharacters || [])
      .filter(item =>
        item.fromSeason === career.season &&
        item.toSeason === nextSeason &&
        item.fromClub === career.club &&
        !departed.has(item.playerKey)
      );
    if (transitions.length) {
      const byKey = new Map(ownProfiles.map(player => [presidentStablePlayerKey(player), player]));
      const factual = transitions
        .map(item => ({ item, profile:byKey.get(item.playerKey) }))
        .filter(row => row.profile)
        .sort((a, b) => Number(b.profile?.ratings?.game_rating || 0) - Number(a.profile?.ratings?.game_rating || 0))[0];
      if (factual) {
        candidate = {
          ...factual.profile,
          playerKey:factual.item.playerKey,
          factualTransition:true,
          observedNextClub:factual.item.toClub,
          observedNextSeason:factual.item.toSeason,
        };
      }
    }
  }

  if (!candidate) {
    const source = ownProfiles[0];
    candidate = {
      ...source,
      playerKey:presidentStablePlayerKey(source),
      factualTransition:false,
      observedNextClub:null,
      observedNextSeason:null,
    };
  }

  profile.offseason.departureCase = {
    playerId:candidate.id,
    playerKey:candidate.playerKey,
    factualTransition:Boolean(candidate.factualTransition),
    observedNextClub:candidate.observedNextClub || null,
    observedNextSeason:candidate.observedNextSeason || null,
  };
  return candidate;
}

function presidentDepartureHtml(profile, career) {
  if (
    !profile?.offseason?.planId ||
    !profile.offseason.sponsorDecisionResolved ||
    !profile.offseason.academyDecisionResolved
  ) return '';
  const year = Number(profile.offseason.careerYear || profile.careerYear || 1);
  const resolved = (profile.departureHistory || []).find(item => Number(item.careerYear) === year);
  if (profile.offseason.departureResolved) {
    if (!resolved) {
      return '<section class="president-departure-case resolved"><div class="president-departure-head"><span><small>RUCH WYCHODZĄCY</small><strong>Brak sprawy do rozstrzygnięcia</strong></span><em>✓</em></div></section>';
    }
    const outcome = resolved.outcome === 'retain'
      ? 'Zawodnik zostaje w alternatywnej karierze'
      : 'Zawodnik odchodzi z kadry kariery';
    return `<section class="president-departure-case resolved">
      <div class="president-departure-head"><span><small>RUCH WYCHODZĄCY</small><strong>${presidentEscape(resolved.player)}</strong></span><em>✓ rozstrzygnięte</em></div>
      <div class="president-departure-result"><strong>${presidentEscape(outcome)}</strong><span>${resolved.factualTransition && resolved.observedNextClub ? 'ŁNP pokazuje kolejny klub: ' + presidentEscape(resolved.observedNextClub) + ' (' + presidentEscape(resolved.observedNextSeason || '') + ').' : 'To rozstrzygnięcie jest elementem alternatywnej kariery.'}</span></div>
    </section>`;
  }

  const candidate = presidentDepartureCandidate(profile, career);
  if (!candidate) return presidentDepartureHtml(profile, career);
  const terms = presidentModeCore.departureGameTerms(candidate);
  const stats = candidate.stats || {};
  const retainAvailable = presidentModeCore.canResolveDeparture(profile, candidate, 'retain');
  const context = candidate.factualTransition
    ? `W oficjalnych profilach ŁNP ten sam identyfikator zawodnika pojawia się w ${presidentEscape(candidate.observedNextClub)} w sezonie ${presidentEscape(candidate.observedNextSeason)}. To potwierdza zmianę przynależności klubowej w danych, ale nie określa prawnej formy przejścia.`
    : 'To fikcyjne zainteresowanie innego klubu stworzone na potrzeby kariery. Nie jest informacją o realnej ofercie dla tego zawodnika.';

  return `
    <section class="president-departure-case">
      <div class="president-departure-head">
        <span><small>RUCH WYCHODZĄCY · ${candidate.factualTransition ? 'FAKT ŁNP + DECYZJA GRY' : 'SCENARIUSZ GRY'}</small><strong>${presidentEscape(candidate.player)}</strong></span>
        <em>decyzja prezesa</em>
      </div>
      <p class="president-departure-context">${context}</p>
      <div class="president-departure-player">
        <div><small>KLUB ŹRÓDŁOWY</small><strong>${presidentEscape(candidate.club)}</strong></div>
        <div><small>MECZE</small><strong>${Number(stats.appearances || 0)}</strong></div>
        <div><small>MINUTY</small><strong>${Number(stats.minutes || 0)}</strong></div>
        <div><small>GOLE</small><strong>${Number(stats.goals || 0)}</strong></div>
        <div><small>RPG</small><strong>${Number(candidate?.ratings?.game_rating || 0) || '—'}</strong></div>
      </div>
      <div class="president-departure-options">
        <button type="button" data-departure-outcome="retain" ${retainAvailable ? '' : 'disabled'}>
          <strong>🤝 Zatrzymaj zawodnika</strong>
          <span>Premia ${presidentModeCore.money(terms.retentionCost)} · stały koszt −${presidentModeCore.money(terms.retentionRecurring)}/kolejkę · umowa kariery 2 sez.</span>
          <small>Kariera odchodzi od rzeczywistej ścieżki danych, jeśli ŁNP pokazuje zmianę klubu.</small>
          ${retainAvailable ? '' : '<em>Brak środków na zatrzymanie</em>'}
        </button>
        <button type="button" data-departure-outcome="release">
          <strong>➡️ Nie blokuj odejścia</strong>
          <span>Fikcyjna rekompensata gry +${presidentModeCore.money(terms.compensation)}</span>
          <small>Siła kadry spadnie; w przypadku potwierdzonej zmiany zachowujemy kierunek widoczny w ŁNP.</small>
        </button>
      </div>
    </section>`;
}

function resolvePresidentDeparture(outcome) {
  const career = careerState();
  const candidate = presidentDepartureCandidate(state.presidentMode, career);
  if (!candidate) return false;
  const applied = presidentModeCore.resolveDeparture(state.presidentMode, candidate, outcome);
  if (!applied.ok) return false;
  state.presidentMode = applied.profile;
  return renderPresidentOffseason();
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
  if (!profile?.offseason?.planId || !profile.offseason.departureResolved) return '';
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
              <span>Umowa kariery <strong>2 sez.</strong></span>
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


function resolvePresidentCompetitionReadiness(method) {
  const resolved = presidentModeCore.resolveCompetitionReadiness(state.presidentMode, method);
  if (!resolved.ok) return false;
  state.presidentMode = resolved.profile;
  return renderPresidentOffseason();
}

function presidentCompetitionReadinessHtml(profile) {
  const offseason = profile?.offseason;
  if (!offseason) return '';
  const level = Number(offseason.competitionReadinessLevel ?? 1);
  const current = presidentModeCore.competitionReadiness(profile, level);
  const method = offseason.competitionReadinessMethod;
  const resolved = Boolean(offseason.competitionReadinessResolved);
  const competition = presidentModeCore.competitionByLevel(level);

  if (resolved) {
    const copy = method === 'temporary'
      ? 'Wybrano rozwiązanie tymczasowe na ten sezon. Stan obiektu nie został trwale podniesiony, więc temat może wrócić w kolejnych latach.'
      : method === 'upgrade'
        ? 'Klub został trwale przygotowany do wymagań tego poziomu w mechanice kariery.'
        : 'Klub już spełnia progi organizacyjne tej mechaniki gry.';
    return `
      <section class="president-readiness resolved ${method === 'temporary' ? 'temporary' : 'ready'}">
        <div class="president-readiness-head">
          <span><small>🏟️ GOTOWOŚĆ NA POZIOM LIGI</small><strong>${presidentEscape(competition.label)}</strong></span>
          <em>✓ ${method === 'temporary' ? 'plan tymczasowy' : 'gotowy'}</em>
        </div>
        <p>${presidentEscape(copy)}</p>
      </section>`;
  }

  return `
    <section class="president-readiness warning">
      <div class="president-readiness-head">
        <span><small>🏟️ GOTOWOŚĆ NA POZIOM LIGI · MECHANIKA GRY</small><strong>Przed sezonem w: ${presidentEscape(competition.label)}</strong></span>
        <em>wymaga decyzji</em>
      </div>
      <p class="president-readiness-note">To <strong>fikcyjne progi kariery</strong>, a nie regulamin licencyjny PZPN. Mają sprawić, że awans sportowy pociąga za sobą rozwój klubu.</p>
      <div class="president-readiness-metrics">
        <span><small>OBIEKT</small><strong>${current.current.facilities}/${current.requirements.facilities}</strong><em>brakuje ${current.gaps.facilities}</em></span>
        <span><small>ORGANIZACJA</small><strong>${current.current.organization}/${current.requirements.organization}</strong><em>brakuje ${current.gaps.organization}</em></span>
      </div>
      <div class="president-readiness-options">
        <button type="button" data-readiness-method="upgrade" ${Number(profile.budget || 0) >= current.upgradeCost ? '' : 'disabled'}>
          <strong>🔨 Trwałe przygotowanie</strong>
          <span>Podnosi obiekt i organizację do wymaganych progów.</span>
          <small>Koszt: ${presidentModeCore.money(current.upgradeCost)}</small>
          ${Number(profile.budget || 0) >= current.upgradeCost ? '' : '<em>Brak środków</em>'}
        </button>
        <button type="button" data-readiness-method="temporary" ${Number(profile.budget || 0) >= current.temporaryCost ? '' : 'disabled'}>
          <strong>🧾 Rozwiązanie tymczasowe</strong>
          <span>Tańszy plan na jeden sezon, bez trwałego podnoszenia infrastruktury.</span>
          <small>Koszt: ${presidentModeCore.money(current.temporaryCost)}</small>
          ${Number(profile.budget || 0) >= current.temporaryCost ? '' : '<em>Brak środków</em>'}
        </button>
      </div>
    </section>`;
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
  const careerOffersEligible = Number(profile.seasonsCompleted || 0) >= 2;
  const careerOffersDeclined = Boolean(profile.jobMarket?.declined);
  const waitingOnCareerOffers = careerOffersEligible && !careerOffersDeclined && !chosen;
  const nextSource = nextPlan.simulated
    ? `Kolejny sezon: ${nextPlan.competitionLabel}. Liga będzie symulacją kariery; nie przypisujemy fikcyjnych rywali do danych ŁNP.`
    : `Kolejny sezon ${nextPlan.season}: ${nextPlan.competitionLabel} z bazą ŁNP dla ${nextPlan.club}.`;

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

      ${waitingOnCareerOffers ? presidentJobOffersHtml(profile, career, 'career') : ''}

      <div class="president-offseason-next-source ${nextPlan.simulated ? 'simulated' : 'official'}">
        <strong>${nextPlan.movement?.code === 'promotion' ? '⬆️ AWANS' : nextPlan.movement?.code === 'relegation' ? '⬇️ SPADEK' : nextPlan.simulated ? '🧪 Dalsza symulacja kariery' : '✅ Kolejny sezon z bazą ŁNP'}</strong>
        <span>${presidentEscape(nextSource)}</span>
      </div>

      ${!waitingOnCareerOffers ? presidentCompetitionReadinessHtml(profile) : ''}

      <section class="president-offseason-choice ${waitingOnCareerOffers || !offseason?.competitionReadinessResolved ? 'hidden' : ''}">
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

      ${chosen && offseason?.competitionReadinessResolved ? presidentSponsorContractsHtml(profile) : ''}

      ${chosen && profile.offseason?.sponsorDecisionResolved ? presidentCareerContractsHtml(profile) : ''}

      ${chosen && profile.offseason?.sponsorDecisionResolved && profile.offseason?.playerContractsResolved ? presidentAcademyIntakeHtml(profile) : ''}

      ${chosen && profile.offseason?.sponsorDecisionResolved && profile.offseason?.playerContractsResolved && profile.offseason?.academyDecisionResolved ? presidentDepartureHtml(profile, career) : ''}

      ${chosen && profile.offseason?.departureResolved ? presidentTransferMarketHtml(profile, career) : ''}

      ${chosen && profile.offseason?.competitionReadinessResolved && profile.offseason?.sponsorDecisionResolved && profile.offseason?.playerContractsResolved && profile.offseason?.academyDecisionResolved && profile.offseason?.transferWindowClosed ? `
        <section class="president-offseason-continue">
          <span><small>NASTĘPNY KROK</small><strong>Sezon ${Number(profile.careerYear || 1) + 1} · ${presidentEscape(nextPlan.season)} · ${presidentEscape(nextPlan.competitionLabel)}</strong></span>
          <p>Stan klubu, decyzja letnia i ruchy kadrowe przechodzą dalej. Teraz zarząd ustali cel oraz strategię na nowy rok.</p>
          <button type="button" class="president-start-next-season">Przejdź do planowania sezonu →</button>
        </section>
      ` : ''}

      ${presidentCareerHistoryHtml(profile)}
      <small class="president-disclaimer">Rozliczenie finansowe, koszty i efekty decyzji letnich są mechaniką gry. Dane ŁNP są używane tylko tam, gdzie faktycznie mamy źródłowe profile i sezony.</small>
    </div>`;

  panel.classList.remove('hidden');
  panel.querySelectorAll('[data-president-job-offer]').forEach(button => {
    button.addEventListener('click', () => acceptPresidentJobOffer(button.dataset.presidentJobOffer));
  });
  panel.querySelector('.president-decline-job-offers')?.addEventListener('click', declinePresidentJobOffers);
  panel.querySelectorAll('[data-readiness-method]').forEach(button => {
    button.addEventListener('click', () => resolvePresidentCompetitionReadiness(button.dataset.readinessMethod));
  });
  panel.querySelectorAll('[data-offseason-plan]').forEach(button => {
    button.addEventListener('click', () => applyPresidentOffseasonPlan(button.dataset.offseasonPlan));
  });
  panel.querySelectorAll('[data-sponsor-contract]').forEach(button => {
    button.addEventListener('click', () => acceptPresidentSponsorContract(button.dataset.sponsorContract));
  });
  panel.querySelector('.president-skip-sponsor-contract')?.addEventListener('click', skipPresidentSponsorContract);
  panel.querySelectorAll('[data-career-contract-id]').forEach(button => {
    button.addEventListener('click', () => resolvePresidentCareerContract(
      button.dataset.careerContractId,
      button.dataset.careerContractOutcome,
    ));
  });
  panel.querySelectorAll('[data-academy-prospect]').forEach(button => {
    button.addEventListener('click', () => promotePresidentAcademyProspect(button.dataset.academyProspect));
  });
  panel.querySelector('.president-skip-academy-intake')?.addEventListener('click', skipPresidentAcademyIntake);
  panel.querySelectorAll('[data-departure-outcome]').forEach(button => {
    button.addEventListener('click', () => resolvePresidentDeparture(button.dataset.departureOutcome));
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
  if (
    !state.presidentMode.offseason?.competitionReadinessResolved ||
    !state.presidentMode.offseason?.planId ||
    !state.presidentMode.offseason?.sponsorDecisionResolved ||
    !state.presidentMode.offseason?.playerContractsResolved ||
    !state.presidentMode.offseason?.academyDecisionResolved ||
    !state.presidentMode.offseason?.departureResolved ||
    !state.presidentMode.offseason?.transferWindowClosed
  ) {
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
      ? `Kariera prezesa · sezon ${state.presidentMode.careerYear} · ${plan.season} · ${plan.competitionLabel} · symulacja`
      : `Kariera prezesa · sezon ${state.presidentMode.careerYear} · ${plan.season} · ${plan.competitionLabel} · baza ŁNP`;
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
  const movement = presidentCompetitionMovement(career);
  const movementLabel = presidentModeCore.competitionMovementLabel(movement);
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
          <small>SEZON ${profile.careerYear} ZAKOŃCZONY · ${presidentEscape(career.season)} · ${presidentEscape(career.competitionLabel || 'A klasa Myślenice')}</small>
          <h2>${presidentEscape(verdict.label)}</h2>
          <p>${presidentEscape(career.club)} kończy rozgrywki na <strong>${position}. miejscu</strong>. Cel zarządu: TOP ${board.target}. <strong>${presidentEscape(movementLabel)}</strong></p>
        </div>
      </section>

      ${lastRound?.fixture ? `<div class="president-last-match compact"><small>OSTATNI MECZ</small><strong>${presidentMatchScore(lastRound)}</strong></div>` : ''}

      <div class="president-league-movement ${movement.code}">
        <span>${movement.code === 'promotion' ? '⬆️' : movement.code === 'relegation' ? '⬇️' : '➡️'}</span>
        <div><small>STATUS LIGOWY</small><strong>${presidentEscape(movementLabel)}</strong><p>Zasada kariery: mistrz awansuje, dwa ostatnie miejsca spadają. To mechanika gry, nie odwzorowanie historycznego regulaminu sezonu.</p></div>
      </div>

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

      ${presidentEmploymentHtml(profile, career)}
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
        <span><small>KARIERA TRWA DALEJ</small><strong>Sezon ${Number(profile.careerYear || 1) + 1} · ${presidentEscape(nextSeason)} · ${presidentEscape(movement.toLabel)}</strong></span>
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
