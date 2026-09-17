// Full-season career layer. The season participants come from real ŁNP player profiles;
// fixture order is a game-generated double round-robin, not the official PZPN schedule.
const seasonCareerCore = globalThis.SeasonCareerCore;
const seasonCareerBaseCurrentFormat = currentFormat;
const seasonCareerBaseStartGame = startGame;
const seasonCareerBaseFinishGame = finishGame;
const seasonCareerBaseRenderRpgBoard = renderRpgBoard;
const seasonCareerBaseRenderActionPanel = renderActionPanel;
const seasonCareerBaseScenarioOdds = scenarioOdds;
const seasonCareerBaseChoosePlayerCharacter = choosePlayerCharacter;

function seasonCareerSelected() {
  return el('game-format')?.value === 'career';
}

currentFormat = function seasonCareerCompatibleFormat() {
  return seasonCareerSelected() ? 'match90' : seasonCareerBaseCurrentFormat();
};

function seasonCareerEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensureSeasonCareerStyles() {
  if (document.querySelector('link[data-season-career]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'season-career.css';
  link.dataset.seasonCareer = '1';
  document.head.appendChild(link);
}

function ensureSeasonCareerFormatOption() {
  const select = el('game-format');
  if (!select || select.querySelector('option[value="career"]')) return;
  const option = document.createElement('option');
  option.value = 'career';
  option.textContent = '🏆 Kariera — cały sezon';
  select.insertBefore(option, select.firstChild);
}

function installSeasonCareerLandingCard() {
  const grid = document.querySelector('#landing-screen .mode-grid');
  if (!grid || grid.querySelector('[data-mode="career"]')) return false;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mode-card career-mode-card';
  button.dataset.mode = 'career';
  button.innerHTML = `
    <span class="mode-icon">🏆</span>
    <span><strong>Kariera — cały sezon</strong><small>Wybierz klub, rozegraj pełną ligę mecz i rewanż, prowadź tabelę i rozwijaj zawodników.</small></span>
    <span class="mode-check">✓</span>`;
  button.addEventListener('click', () => {
    // frontSelectedMode is declared by front-controller.js after this layer loads.
    // The handler runs only after the landing screen exists, so the binding is ready.
    frontSelectedMode = 'career';
    grid.querySelectorAll('.mode-card').forEach(item => item.classList.toggle('selected', item === button));
    const next = document.getElementById('landing-continue');
    if (next) {
      next.disabled = false;
      next.textContent = 'Dalej — ustawienia kariery';
    }
    const note = document.getElementById('landing-note');
    if (note) note.textContent = 'Wybrano: Kariera — cały sezon';
  });
  grid.prepend(button);
  return true;
}

function watchSeasonCareerLanding() {
  installSeasonCareerLandingCard();
  const observer = new MutationObserver(() => {
    if (installSeasonCareerLandingCard()) syncSeasonCareerSetup();
  });
  observer.observe(document.body, { childList:true, subtree:true });
}

function syncSeasonCareerSetup() {
  if (!seasonCareerSelected()) return;
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
    description.textContent = 'Pełny sezon ligowy: realne kluby wybranego sezonu, symulowany terminarz mecz i rewanż, tabela, punkty i rozwój postaci.';
  }
}

function careerState() {
  return state.seasonCareer || null;
}

function careerActive() {
  return Boolean(seasonCareerSelected() && state.seasonCareer?.active);
}

function careerClubSeasonReady(club, season) {
  const profiles = (state.playerCharacters || []).filter(player => player?.club === club && player?.season === season);
  return profiles.length > 0;
}

function initializeSeasonCareer() {
  const club = el('club')?.value || null;
  const season = el('season-from')?.value || null;
  const clubs = seasonCareerCore.clubsForSeason(state.playerCharacters || [], state.all || [], season);
  if (!club || !season || clubs.length < 6 || !clubs.includes(club) || !careerClubSeasonReady(club, season)) {
    el('status').textContent = 'Tryb kariery wymaga jednego sezonu z pełnymi profilami zawodników ŁNP i wybranego klubu. Obecnie najlepiej działają sezony 2025/26 i 2026/27.';
    el('status').classList.remove('hidden');
    el('quiz').classList.add('hidden');
    return false;
  }

  const rounds = seasonCareerCore.roundRobin(clubs);
  const strengths = seasonCareerCore.strengthMap(state.playerCharacters || [], clubs, season);
  state.seasonCareer = {
    active: true,
    season,
    club,
    clubs,
    rounds,
    roundIndex: 0,
    table: seasonCareerCore.createTable(clubs),
    strengths,
    objective: seasonCareerCore.objective(clubs.length),
    development: {},
    history: [],
    currentFixture: null,
    matchResolved: false,
    completed: false,
  };
  return true;
}

function currentSeasonCareerRound() {
  const career = careerState();
  return career ? career.rounds[career.roundIndex] || [] : [];
}

function currentSeasonCareerFixture() {
  const career = careerState();
  if (!career) return null;
  return (career.rounds[career.roundIndex] || []).find(fixture => fixture.home === career.club || fixture.away === career.club) || null;
}

function careerOpponent(fixture = currentSeasonCareerFixture()) {
  const career = careerState();
  if (!career || !fixture) return null;
  return fixture.home === career.club ? fixture.away : fixture.home;
}

function careerVenue(fixture = currentSeasonCareerFixture()) {
  const career = careerState();
  if (!career || !fixture) return '';
  return fixture.home === career.club ? 'DOM' : 'WYJAZD';
}

function simulateCareerRoundWithoutUser(roundFixtures, table) {
  const career = careerState();
  let nextTable = table;
  const results = [];
  (roundFixtures || []).forEach(fixture => {
    if (fixture.home === career.club || fixture.away === career.club) return;
    const result = seasonCareerCore.simulateFixture(
      fixture,
      career.strengths,
      `${career.season}|career|round-${fixture.round}`,
    );
    nextTable = seasonCareerCore.applyResult(nextTable, fixture, result.homeGoals, result.awayGoals);
    results.push(result);
  });
  return { table:nextTable, results };
}

function advanceCareerByes() {
  const career = careerState();
  while (career && career.roundIndex < career.rounds.length && !currentSeasonCareerFixture()) {
    const round = currentSeasonCareerRound();
    const simulated = simulateCareerRoundWithoutUser(round, career.table);
    career.table = simulated.table;
    career.history.push({ round:career.roundIndex + 1, bye:true, results:simulated.results });
    career.roundIndex += 1;
  }
}

function careerDevelopmentRecord(character = state.rpgCharacter) {
  const career = careerState();
  if (!career || !character?.id) return null;
  return career.development?.[character.id] || { xp:0, matches:0, level:1 };
}

function ensureSeasonCareerHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-season-career-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-season-career-hud';
  hud.className = 'rpg-season-career-hud hidden';
  hud.innerHTML = `
    <div class="career-hud-main">
      <small>KARIERA · <span id="career-hud-season">—</span></small>
      <strong id="career-hud-round">Kolejka —</strong>
      <span id="career-hud-fixture">—</span>
    </div>
    <div class="career-hud-table">
      <small>TABELA</small>
      <strong id="career-hud-position">—</strong>
      <span id="career-hud-points">0 pkt</span>
    </div>
    <div class="career-hud-development">
      <small>ROZWÓJ</small>
      <strong id="career-hud-level">Poziom 1</strong>
      <span id="career-hud-xp">0 XP</span>
    </div>`;
  const rivalryHud = el('rpg-rivalry-hud');
  if (rivalryHud) rivalryHud.insertAdjacentElement('beforebegin', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

function renderSeasonCareerHud() {
  ensureSeasonCareerHud();
  const hud = el('rpg-season-career-hud');
  if (!hud) return;
  hud.classList.toggle('hidden', !careerActive());
  if (!careerActive()) return;
  const career = careerState();
  const fixture = career.currentFixture || currentSeasonCareerFixture();
  const position = seasonCareerCore.position(career.table, career.club) || 1;
  const row = career.table[career.club] || { points:0 };
  const development = careerDevelopmentRecord();
  if (el('career-hud-season')) el('career-hud-season').textContent = career.season;
  if (el('career-hud-round')) el('career-hud-round').textContent = `Kolejka ${Math.min(career.roundIndex + 1, career.rounds.length)}/${career.rounds.length}`;
  if (el('career-hud-fixture')) {
    el('career-hud-fixture').textContent = fixture
      ? `${careerVenue(fixture)} · ${career.club} — ${careerOpponent(fixture)}`
      : 'Sezon zakończony';
  }
  if (el('career-hud-position')) el('career-hud-position').textContent = `${position}. miejsce`;
  if (el('career-hud-points')) el('career-hud-points').textContent = `${row.points || 0} pkt · cel: TOP ${career.objective.targetPosition}`;
  if (el('career-hud-level')) el('career-hud-level').textContent = `Poziom ${development?.level || 1}`;
  if (el('career-hud-xp')) el('career-hud-xp').textContent = `${development?.xp || 0} XP`;
}

renderRpgBoard = function seasonCareerRenderRpgBoard() {
  const result = seasonCareerBaseRenderRpgBoard();
  renderSeasonCareerHud();
  return result;
};

scenarioOdds = function seasonCareerScenarioOdds(action, knowledgeCorrect) {
  const base = seasonCareerBaseScenarioOdds(action, knowledgeCorrect);
  if (!careerActive()) return base;
  return seasonCareerCore.adjustChance(base, careerDevelopmentRecord());
};

renderActionPanel = function seasonCareerRenderActionPanel() {
  const result = seasonCareerBaseRenderActionPanel();
  if (!careerActive()) return result;
  const development = careerDevelopmentRecord();
  const bonus = seasonCareerCore.developmentBonus(development);
  const heading = el('rpg-action-panel')?.querySelector('.rpg-action-heading');
  if (heading && bonus > 0 && !heading.querySelector('.career-development-chip')) {
    const chip = document.createElement('span');
    chip.className = 'career-development-chip';
    chip.textContent = `🏆 Rozwój poziom ${development.level} · +${Math.round(bonus * 100)} pp`;
    heading.appendChild(chip);
  }
  return result;
};

function forceCareerRivalryProfile(character) {
  const career = careerState();
  const fixture = career?.currentFixture || currentSeasonCareerFixture();
  const opponent = careerOpponent(fixture);
  if (!career || !character || !opponent || !globalThis.RivalryMatchCore) return;
  const h2h = globalThis.RivalryMatchCore.h2hProfile(state.all || [], career.club, opponent);
  const classification = globalThis.RivalryMatchCore.classify(h2h, state.clubMeta || {});
  state.rpgOpponentClub = opponent;
  state.rpgRivalryProfile = { opponent, h2h, classification };
  state.rpgRivalryPressure = Number(classification.pressure || 35);
  state.rpgRivalryMoment = null;
  state.rpgRivalryMomentHistory = [];
  state.rpgRivalryMomentUsedIds = new Set();
  state.rpgRivalryLastMomentAction = -10;
}

choosePlayerCharacter = function seasonCareerChoosePlayerCharacter(character) {
  if (!careerActive()) return seasonCareerBaseChoosePlayerCharacter(character);
  forceCareerRivalryProfile(character);
  // Bypass the rivalry wrapper's random opponent selection. Its base points to
  // the real-player layer and is available as a shared global lexical binding.
  const result = typeof rivalryBaseChoosePlayerCharacter === 'function'
    ? rivalryBaseChoosePlayerCharacter(character)
    : seasonCareerBaseChoosePlayerCharacter(character);
  forceCareerRivalryProfile(character);
  const classification = state.rpgRivalryProfile?.classification;
  addRpgLog(`🏆 KARIERA: kolejka ${careerState().roundIndex + 1}. ${careerVenue()} z ${state.rpgOpponentClub}. ${classification?.label || 'MECZ LIGOWY'}.`, 'good');
  renderRpgBoard();
  renderActionPanel();
  return result;
};

function startSeasonCareerMatch() {
  const career = careerState();
  if (!career?.active) return false;
  advanceCareerByes();
  if (career.roundIndex >= career.rounds.length) {
    career.completed = true;
    renderSeasonCareerFinal();
    return false;
  }
  career.currentFixture = currentSeasonCareerFixture();
  career.matchResolved = false;
  if (!career.currentFixture) return false;
  seasonCareerBaseStartGame();
  if (el('status')) {
    el('status').textContent = `Kariera ${career.season} · kolejka ${career.roundIndex + 1}/${career.rounds.length} · ${careerVenue()} · rywal: ${careerOpponent()}`;
  }
  renderSeasonCareerHud();
  return true;
}

startGame = function seasonCareerStartGame() {
  if (!seasonCareerSelected()) return seasonCareerBaseStartGame();
  syncSeasonCareerSetup();
  if (!state.seasonCareer?.active || state.seasonCareer.completed) {
    if (!initializeSeasonCareer()) return;
  }
  return startSeasonCareerMatch();
};

function careerParticipants() {
  const ids = [];
  if (state.rpgCharacter?.id) ids.push(state.rpgCharacter.id);
  (state.rpgSubstitutionHistory || []).forEach(item => {
    if (item.outgoingId) ids.push(item.outgoingId);
    if (item.incomingId) ids.push(item.incomingId);
  });
  return [...new Set(ids)];
}

function careerTableRows(limit = 6) {
  const career = careerState();
  if (!career) return [];
  const rows = seasonCareerCore.standings(career.table);
  const visible = rows.slice(0, limit);
  const own = rows.find(row => row.club === career.club);
  if (own && !visible.some(row => row.club === own.club)) visible.push(own);
  return visible;
}

function renderCareerTableHtml() {
  const career = careerState();
  const rows = careerTableRows();
  return `
    <div class="career-table-wrap">
      <div class="career-table-head"><strong>Tabela po kolejce ${Math.min(career.roundIndex, career.rounds.length)}</strong><span>cel: ${seasonCareerEscape(career.objective.label)}</span></div>
      <table class="career-table"><thead><tr><th>#</th><th>Klub</th><th>M</th><th>BR</th><th>PKT</th></tr></thead><tbody>
      ${rows.map(row => {
        const pos = seasonCareerCore.position(career.table, row.club);
        return `<tr class="${row.club === career.club ? 'career-own-row' : ''}"><td>${pos}</td><td>${seasonCareerEscape(row.club)}</td><td>${row.played}</td><td>${row.gf}:${row.ga}</td><td><strong>${row.points}</strong></td></tr>`;
      }).join('')}
      </tbody></table>
    </div>`;
}

function ensureCareerRoundSummary() {
  const result = el('result');
  if (!result) return null;
  let box = el('career-round-summary');
  if (!box) {
    box = document.createElement('div');
    box.id = 'career-round-summary';
    box.className = 'career-round-summary';
    const playAgain = el('play-again');
    if (playAgain) playAgain.insertAdjacentElement('beforebegin', box);
    else result.appendChild(box);
  }
  return box;
}

function renderSeasonCareerFinal() {
  const career = careerState();
  if (!career) return;
  career.completed = true;
  const position = seasonCareerCore.position(career.table, career.club);
  const row = career.table[career.club] || {};
  const achieved = position && position <= career.objective.targetPosition;
  const box = ensureCareerRoundSummary();
  if (el('result-title')) el('result-title').textContent = `Koniec sezonu · ${position}. miejsce`;
  if (el('result-score')) el('result-score').textContent = `${row.points || 0} pkt`;
  if (el('result-details')) {
    el('result-details').textContent += ` · sezon ${career.season} · bilans ${row.wins || 0}-${row.draws || 0}-${row.losses || 0} · bramki ${row.gf || 0}:${row.ga || 0} · cel ${achieved ? 'osiągnięty' : 'nieosiągnięty'}`;
  }
  if (box) {
    box.innerHTML = `
      <div class="career-season-finale ${achieved ? 'achieved' : ''}">
        <span>🏆 FINAŁ KARIERY</span>
        <h3>${seasonCareerEscape(career.club)} · ${position}. miejsce</h3>
        <p>${seasonCareerEscape(career.objective.label)} — <strong>${achieved ? 'cel osiągnięty' : 'cel nieosiągnięty'}</strong>.</p>
      </div>
      ${renderCareerTableHtml()}
      <button type="button" class="career-new-season">Nowa kariera</button>`;
    box.querySelector('.career-new-season')?.addEventListener('click', () => {
      state.seasonCareer = null;
      const result = el('result');
      result?.classList.add('hidden');
      const status = el('status');
      if (status) status.textContent = 'Ustaw klub i sezon, a następnie rozpocznij nową karierę.';
      document.querySelector('.game-setup')?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }
  el('play-again')?.classList.add('hidden');
  el('result')?.classList.remove('hidden');
  renderSeasonCareerHud();
}

function renderCareerRoundResult(match, xp, participantCount) {
  const career = careerState();
  const position = seasonCareerCore.position(career.table, career.club);
  const row = career.table[career.club] || {};
  const box = ensureCareerRoundSummary();
  if (!box) return;
  const completed = career.completed;
  box.innerHTML = `
    <div class="career-round-card">
      <span>🏆 KARIERA · ${seasonCareerEscape(career.season)}</span>
      <h3>${seasonCareerEscape(match.home)} ${match.homeGoals}:${match.awayGoals} ${seasonCareerEscape(match.away)}</h3>
      <p>Pozycja: <strong>${position}.</strong> · punkty: <strong>${row.points}</strong> · rozwój: <strong>+${xp} XP</strong> dla ${participantCount} ${participantCount === 1 ? 'zawodnika' : 'zawodników'}.</p>
      <small>Terminarz kariery jest symulowany; kluby i profile zawodników pochodzą z danych wybranego sezonu.</small>
    </div>
    ${renderCareerTableHtml()}
    ${completed ? '' : '<button type="button" class="career-next-match">Następna kolejka →</button>'}`;
  el('play-again')?.classList.add('hidden');
  box.querySelector('.career-next-match')?.addEventListener('click', () => {
    el('result')?.classList.add('hidden');
    box.innerHTML = '';
    startSeasonCareerMatch();
  });
}

finishGame = function seasonCareerFinishGame() {
  if (!careerActive() || careerState()?.matchResolved) return seasonCareerBaseFinishGame();
  const career = careerState();
  const fixture = career.currentFixture || currentSeasonCareerFixture();
  const userGoals = Number(state.rpgPlayerGoals || 0);
  const opponentGoals = Number(state.rpgOpponentGoals || 0);
  const correct = Number(state.correct || 0);
  const answered = Number(state.answered || 0);
  const participants = careerParticipants();
  const result = seasonCareerBaseFinishGame();

  if (!fixture) return result;
  const userMatch = seasonCareerCore.userResultForFixture(fixture, career.club, userGoals, opponentGoals);
  let nextTable = seasonCareerCore.applyResult(career.table, fixture, userMatch.homeGoals, userMatch.awayGoals);
  const simulated = simulateCareerRoundWithoutUser(currentSeasonCareerRound(), nextTable);
  nextTable = simulated.table;
  const resultCode = seasonCareerCore.resultCode(userGoals, opponentGoals);
  const xp = seasonCareerCore.developmentXp({ correct, answered, result:resultCode });
  career.development = seasonCareerCore.addDevelopment(career.development, participants, xp);
  career.table = nextTable;
  career.history.push({
    round:career.roundIndex + 1,
    fixture:{ ...fixture },
    userResult:userMatch,
    otherResults:simulated.results,
    correct,
    answered,
    xp,
  });
  career.matchResolved = true;
  career.roundIndex += 1;
  career.currentFixture = null;
  advanceCareerByes();
  career.completed = career.roundIndex >= career.rounds.length;

  if (el('result-title')) el('result-title').textContent = career.completed ? 'Końcowy gwizdek sezonu' : `Koniec kolejki ${fixture.round}`;
  if (el('result-details')) {
    el('result-details').textContent += ` · kariera: ${careerVenue(fixture)} · tabela: ${seasonCareerCore.position(career.table, career.club)}. miejsce · ${career.table[career.club]?.points || 0} pkt`;
  }
  renderCareerRoundResult(userMatch, xp, participants.length);
  if (career.completed) renderSeasonCareerFinal();
  renderSeasonCareerHud();
  return result;
};

ensureSeasonCareerStyles();
ensureSeasonCareerFormatOption();
el('game-format')?.addEventListener('change', syncSeasonCareerSetup);
watchSeasonCareerLanding();

// The original app registered an early click handler before the later game layers
// existed. In career mode capture the click first and route it through the final
// startGame wrapper; other modes remain untouched.
el('new-game')?.addEventListener('click', event => {
  if (!seasonCareerSelected()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  startGame();
}, true);
