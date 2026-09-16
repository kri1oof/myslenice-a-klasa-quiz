// Final UI controller: title screen, canonical clubs and cinematic RPG resolutions.
// Loaded last so it can gate the automatic start performed by app.js.

const frontBaseStartGame = startGame;
const frontBaseAnswer = answer;
const frontBaseRefreshClubOptions = refreshClubOptions;

let frontModeChosen = false;
let frontSelectedMode = null;
let frontGameStarted = false;

function frontClubKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FRONT_CLUB_ALIASES = new Map([
  ['clavia', 'Clavia Świątniki Górne'],
  ['clavia swiatniki', 'Clavia Świątniki Górne'],
  ['clavia swiatniki gorne', 'Clavia Świątniki Górne'],
  ['zielonka', 'Zielonka Wrząsowice'],
  ['zielonka gamar', 'Zielonka Wrząsowice'],
  ['zielonka gamar wrzasowice', 'Zielonka Wrząsowice'],
  ['zielonka wrzasowice', 'Zielonka Wrząsowice'],
  ['wroblowianka', 'Wróblowianka Wróblowice (Kraków)'],
  ['wroblowianka wroblowice', 'Wróblowianka Wróblowice (Kraków)'],
  ['wroblowianka wroblowice krakow', 'Wróblowianka Wróblowice (Kraków)'],
  ['opatkowianka', 'Opatkowianka'],
  ['opatkowianka opatkowice', 'Opatkowianka'],
]);

const FRONT_INVALID_CLUBS = new Set(['za artyzm nie ma punktow']);

function frontClubValue(value) {
  if (typeof value !== 'string') return { value, known: false, invalid: false };
  const key = frontClubKey(value);
  if (FRONT_INVALID_CLUBS.has(key)) return { value: null, known: true, invalid: true };
  if (FRONT_CLUB_ALIASES.has(key)) return { value: FRONT_CLUB_ALIASES.get(key), known: true, invalid: false };
  return { value, known: false, invalid: false };
}

function sanitizeFrontClubData() {
  if (!Array.isArray(state.all)) return;

  state.all = state.all.filter(q => {
    if (Array.isArray(q.clubs)) {
      q.clubs = [...new Set(q.clubs.map(name => frontClubValue(name).value).filter(Boolean))];
    }

    const answer = frontClubValue(q.answer);
    if (answer.invalid) return false;
    if (answer.known) q.answer = answer.value;

    if (Array.isArray(q.options)) {
      const cleaned = q.options
        .map(option => frontClubValue(option))
        .filter(item => !item.invalid)
        .map(item => item.value);
      q.options = [...new Set(cleaned)];
      if (q.options.length < 2) return false;
    }
    return true;
  });

  const mergedMeta = {};
  Object.entries(state.clubMeta || {}).forEach(([name, meta]) => {
    const clean = frontClubValue(name);
    if (clean.invalid || !clean.value) return;
    const canonical = clean.value;
    if (!mergedMeta[canonical]) mergedMeta[canonical] = { ...(meta || {}) };
    else {
      Object.entries(meta || {}).forEach(([key, value]) => {
        if (value && !mergedMeta[canonical][key]) mergedMeta[canonical][key] = value;
      });
    }
  });
  state.clubMeta = mergedMeta;
}

refreshClubOptions = function frontRefreshClubOptions() {
  sanitizeFrontClubData();
  return frontBaseRefreshClubOptions();
};

function ensureLandingScreen() {
  let screen = document.getElementById('landing-screen');
  if (screen) return screen;

  screen = document.createElement('section');
  screen.id = 'landing-screen';
  screen.className = 'landing-screen';
  if (window.QUIZ_TITLE_ART) screen.style.backgroundImage = `url("${window.QUIZ_TITLE_ART}")`;
  screen.innerHTML = `
    <div class="landing-inner">
      <div class="landing-copy">
        <p class="landing-kicker">MYŚLENICKA A-KLASA · QUIZ × TAKTYKA</p>
        <h1>Quiz A-klasy<br>Myślenice</h1>
        <p class="landing-subtitle">Wiedza nie daje gola sama z siebie. W trybie RPG wybierasz prawdziwe zagrania, a poprawna odpowiedź zastępuje rzut kością i rozstrzyga, czy akcja się uda.</p>
        <div class="landing-rule">⚽ Najpierw wybierz tryb gry</div>
      </div>
      <div class="mode-picker" aria-label="Wybór trybu gry">
        <h2>Wybierz tryb gry</h2>
        <p>Rozgrywka nie wystartuje, dopóki sam nie wybierzesz formatu i nie ustawisz parametrów.</p>
        <div class="mode-grid">
          <button type="button" class="mode-card" data-mode="match90">
            <span class="mode-icon">⚽</span>
            <span><strong>Symulowany mecz RPG</strong><small>Wybierasz zagrania. Pytania zastępują kości, a piłka przesuwa się po boisku.</small></span>
            <span class="mode-check">✓</span>
          </button>
          <button type="button" class="mode-card" data-mode="special">
            <span class="mode-icon">🎲</span>
            <span><strong>Runda specjalna</strong><small>Prawda czy legenda, trzy wskazówki, fałszywy wynik i inne nietypowe mechaniki.</small></span>
            <span class="mode-check">✓</span>
          </button>
          <button type="button" class="mode-card" data-mode="quick">
            <span class="mode-icon">⚡</span>
            <span><strong>Szybki quiz</strong><small>Klasyczna, krótka seria pytań bez symulowania meczu.</small></span>
            <span class="mode-check">✓</span>
          </button>
        </div>
        <button id="landing-continue" class="landing-continue" type="button" disabled>Wybierz tryb, aby przejść dalej</button>
        <p id="landing-note" class="landing-note">Gra jeszcze się nie rozpoczęła.</p>
      </div>
    </div>`;
  document.body.prepend(screen);

  screen.querySelectorAll('.mode-card').forEach(button => {
    button.addEventListener('click', () => {
      frontSelectedMode = button.dataset.mode;
      screen.querySelectorAll('.mode-card').forEach(item => item.classList.toggle('selected', item === button));
      const next = document.getElementById('landing-continue');
      next.disabled = false;
      next.textContent = 'Dalej — ustawienia rozgrywki';
      document.getElementById('landing-note').textContent = `Wybrano: ${button.querySelector('strong').textContent}`;
    });
  });

  document.getElementById('landing-continue').addEventListener('click', () => {
    if (!frontSelectedMode) return;
    const format = el('game-format');
    if (format) {
      format.value = frontSelectedMode;
      format.dispatchEvent(new Event('change', { bubbles: true }));
    }
    frontModeChosen = true;
    frontGameStarted = false;
    hideLandingForSetup();
  });

  return screen;
}

function showLanding() {
  const screen = ensureLandingScreen();
  frontModeChosen = false;
  frontGameStarted = false;
  frontSelectedMode = null;
  screen.querySelectorAll('.mode-card').forEach(item => item.classList.remove('selected'));
  const next = document.getElementById('landing-continue');
  if (next) {
    next.disabled = true;
    next.textContent = 'Wybierz tryb, aby przejść dalej';
  }
  const note = document.getElementById('landing-note');
  if (note) note.textContent = 'Gra jeszcze się nie rozpoczęła.';
  screen.classList.remove('hidden');
  document.body.classList.add('landing-active');
}

function hideLandingForSetup() {
  ensureLandingScreen().classList.add('hidden');
  document.body.classList.remove('landing-active');
  el('quiz')?.classList.add('hidden');
  el('result')?.classList.add('hidden');
  el('match-hud')?.classList.add('hidden');
  if (el('status')) {
    el('status').textContent = 'Tryb wybrany. Ustaw zakres gry i sezony, a potem kliknij „Pierwszy gwizdek”.';
    el('status').classList.remove('hidden');
    el('status').classList.add('pregame-note');
  }
  ensureMenuButton();
  const kickoff = el('new-game');
  if (kickoff) kickoff.textContent = frontSelectedMode === 'match90' ? '⚽ Pierwszy gwizdek' : 'Rozpocznij rozgrywkę';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function ensureMenuButton() {
  if (document.getElementById('menu-return')) return;
  const kickoff = el('new-game');
  if (!kickoff) return;
  const button = document.createElement('button');
  button.id = 'menu-return';
  button.type = 'button';
  button.className = 'menu-return';
  button.textContent = '← Menu główne';
  button.addEventListener('click', showLanding);
  kickoff.parentNode.insertBefore(button, kickoff);
}

startGame = function frontGatedStartGame() {
  // app.js calls startGame() automatically after loading questions. Until a
  // player deliberately chooses a mode, that call only reveals the title page.
  if (!frontModeChosen) {
    showLanding();
    return;
  }
  frontGameStarted = true;
  document.body.classList.remove('landing-active');
  ensureLandingScreen().classList.add('hidden');
  el('status')?.classList.remove('pregame-note');
  return frontBaseStartGame();
};

function ensureActionSplash() {
  let splash = document.getElementById('action-splash');
  if (splash) return splash;
  splash = document.createElement('section');
  splash.id = 'action-splash';
  splash.className = 'action-splash hidden';
  splash.setAttribute('role', 'dialog');
  splash.setAttribute('aria-modal', 'true');
  splash.setAttribute('aria-live', 'polite');
  splash.innerHTML = `
    <div class="action-splash-card">
      <span id="action-splash-tag" class="action-splash-tag">TEST AKCJI</span>
      <h2 id="action-splash-title">Udana akcja!</h2>
      <p id="action-splash-copy"></p>
      <p id="action-splash-summary" class="action-splash-summary"></p>
      <button id="action-splash-close" type="button">Wracamy na boisko</button>
    </div>`;
  document.body.appendChild(splash);
  document.getElementById('action-splash-close').addEventListener('click', () => {
    splash.classList.add('hidden');
    el('next')?.focus();
  });
  return splash;
}

function showActionSplash(correct, action, possessionBefore) {
  const splash = ensureActionSplash();
  const art = correct ? window.QUIZ_ACTION_ART?.success : window.QUIZ_ACTION_ART?.failure;
  splash.style.backgroundImage = art ? `url("${art}")` : '';
  splash.classList.remove('hidden', 'success', 'failure');
  splash.classList.add(correct ? 'success' : 'failure');

  const defending = possessionBefore === 'opponent';
  document.getElementById('action-splash-title').textContent = correct ? 'Udana akcja!' : 'Nieudana akcja!';
  document.getElementById('action-splash-tag').textContent = `${defending ? 'OBRONA' : 'ATAK'} · ${action?.label || 'Test akcji'}`;
  document.getElementById('action-splash-copy').textContent = correct
    ? (defending ? 'Dobra odpowiedź oznacza skuteczną interwencję. Sytuacja na boisku zmienia się na Twoją korzyść.' : 'Test wiedzy zdany. Wybrane zagranie dochodzi do skutku i akcja może być kontynuowana.')
    : (defending ? 'Test niezdany. Rywal przechodzi przez wybraną próbę obrony i rozwija akcję.' : 'Test niezdany. Wybrane zagranie się nie udało i rywal może przejąć inicjatywę.');
  const minute = state.rpgInAddedTime ? '90+3’' : `${state.rpgMinute || 0}’`;
  document.getElementById('action-splash-summary').textContent = `${minute} · wynik ${state.rpgPlayerGoals || 0}:${state.rpgOpponentGoals || 0} · ${state.rpgPossession === 'player' ? 'Twoje posiadanie' : 'piłka rywala'} · ${zoneName(state.rpgZone)}`;
  document.getElementById('action-splash-close').focus();
}

answer = function frontAnswerWithSplash(button, option) {
  const q = state.current;
  const action = state.rpgCurrentAction;
  const isRpgAction = typeof rpgActive === 'function' && rpgActive() && q && action;
  const correct = Boolean(q && option === q.answer);
  const possessionBefore = state.rpgPossession;
  const result = frontBaseAnswer(button, option);
  if (isRpgAction) showActionSplash(correct, action, possessionBefore);
  return result;
};

// Render the title page immediately. The automatic start after questions.json
// finishes loading is intercepted by the gated startGame() above.
ensureLandingScreen();
ensureActionSplash();
ensureMenuButton();
showLanding();
