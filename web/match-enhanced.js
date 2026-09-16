// Extra game layer for Match 90': live score, pressure, tactical risk and a decider.
// Loaded after match-mode.js and intentionally wraps its public game functions.

const enhancedBaseStartGame = startGame;
const enhancedBaseShowQuestion = showQuestion;
const enhancedBaseAnswer = answer;
const enhancedBaseFinishGame = finishGame;
const enhancedBaseUpdateScore = updateScore;

function ensureEnhancedMatchUi() {
  const hud = el('match-hud');
  if (hud && !el('live-scoreboard')) {
    const score = document.createElement('div');
    score.id = 'live-scoreboard';
    score.className = 'live-scoreboard';
    score.innerHTML = `
      <span class="score-side"><small>TY</small><strong id="player-goals">0</strong></span>
      <span class="score-colon">:</span>
      <span class="score-side"><small>RYWAL</small><strong id="opponent-goals">0</strong></span>
      <span id="match-mood" class="match-mood">Mecz się rozkręca</span>`;
    const clock = hud.querySelector('.match-clock');
    if (clock?.nextSibling) hud.insertBefore(score, clock.nextSibling);
    else hud.appendChild(score);
  }

  if (hud && !el('pressure-panel')) {
    const panel = document.createElement('div');
    panel.id = 'pressure-panel';
    panel.className = 'pressure-panel';
    panel.innerHTML = `
      <div><span>Twoja presja</span><div class="pressure-track"><i id="player-pressure"></i></div></div>
      <div><span>Presja rywala</span><div class="pressure-track"><i id="opponent-pressure"></i></div></div>`;
    hud.appendChild(panel);
  }

  const stats = hud?.querySelector('.match-stats');
  if (stats && !el('sub-button')) {
    const sub = document.createElement('button');
    sub.id = 'sub-button';
    sub.type = 'button';
    sub.className = 'sub-button';
    sub.textContent = '🔁 Zmiana pytania';
    stats.appendChild(sub);
  }

  const answers = el('answers');
  if (answers && !el('tactic-box')) {
    const tactic = document.createElement('div');
    tactic.id = 'tactic-box';
    tactic.className = 'tactic-box hidden';
    tactic.innerHTML = `
      <div class="tactic-copy"><strong>Decyzja trenera</strong><span>Jak grasz tę akcję?</span></div>
      <div class="tactic-buttons">
        <button id="tactic-control" type="button" class="tactic-choice active">🧠 Kontrola</button>
        <button id="tactic-risk" type="button" class="tactic-choice risk">🔥 Va banque</button>
      </div>
      <small id="tactic-help">Kontrola: bez dodatkowego ryzyka.</small>`;
    answers.parentNode.insertBefore(tactic, answers);
  }

  const quiz = el('quiz');
  if (quiz && !el('match-feed')) {
    const feed = document.createElement('div');
    feed.id = 'match-feed';
    feed.className = 'match-feed hidden';
    quiz.insertBefore(feed, quiz.firstChild);
  }
}

function resetEnhancedMatchState() {
  state.playerGoals = 0;
  state.opponentGoals = 0;
  state.playerPressure = 0;
  state.opponentPressure = 0;
  state.substitutionAvailable = true;
  state.reserveQuestions = [];
  state.deciderAdded = false;
  state.currentTactic = 'control';
  state.tacticQuestionId = null;
  state.matchEvents = [];
  state.enhancedResolved = new Set();
}

function addMatchEvent(text, tone = '') {
  state.matchEvents = state.matchEvents || [];
  state.matchEvents.unshift({ text, tone });
  state.matchEvents = state.matchEvents.slice(0, 4);
  const feed = el('match-feed');
  if (!feed) return;
  feed.innerHTML = state.matchEvents.map(event =>
    `<div class="match-event ${event.tone || ''}">${event.text}</div>`
  ).join('');
  feed.classList.toggle('hidden', currentFormat() !== 'match90' || state.matchEvents.length === 0);
}

function matchMoodText() {
  const diff = (state.playerGoals || 0) - (state.opponentGoals || 0);
  const minute = state.current?.gameMeta?.minute || '';
  if (minute.includes('90') && diff === 0) return 'Wszystko wisi na włosku';
  if (diff >= 2) return 'Kontrolujesz spotkanie';
  if (diff === 1) return 'Masz przewagę';
  if (diff === 0 && (state.playerPressure || 0) > (state.opponentPressure || 0)) return 'Dociskasz rywala';
  if (diff === 0) return 'Mecz na styku';
  if (diff === -1) return 'Trzeba odrabiać';
  return 'Potrzebny wielki comeback';
}

function renderEnhancedHud() {
  if (currentFormat() !== 'match90') return;
  if (el('player-goals')) el('player-goals').textContent = String(state.playerGoals || 0);
  if (el('opponent-goals')) el('opponent-goals').textContent = String(state.opponentGoals || 0);
  if (el('player-pressure')) el('player-pressure').style.width = `${Math.min(100, (state.playerPressure || 0) * 50)}%`;
  if (el('opponent-pressure')) el('opponent-pressure').style.width = `${Math.min(100, (state.opponentPressure || 0) * 50)}%`;
  if (el('match-mood')) el('match-mood').textContent = matchMoodText();
  const sub = el('sub-button');
  if (sub) {
    sub.disabled = !state.substitutionAvailable || !state.reserveQuestions?.length || Boolean(state.current?.special);
    sub.textContent = state.substitutionAvailable ? '🔁 Zmiana pytania' : '🔁 Zmiana wykorzystana';
  }
}

function setupReserveBench() {
  if (currentFormat() !== 'match90') return;
  const usedIds = new Set((state.pool || []).map(q => q.id));
  state.reserveQuestions = shuffle(baseFilteredQuestions().filter(q =>
    !usedIds.has(q.id) && !String(q.type || '').startsWith('special_')
  ));
  renderEnhancedHud();
}

function useQuestionSubstitution() {
  if (currentFormat() !== 'match90' || !state.substitutionAvailable || !state.current || state.current.special) return;
  const current = state.current;
  const category = categoryForType(current.type);
  let index = state.reserveQuestions.findIndex(q => categoryForType(q.type) === category);
  if (index < 0) index = 0;
  const replacement = state.reserveQuestions.splice(index, 1)[0];
  if (!replacement) return;
  state.pool[state.index] = cloneWithMatchMeta(replacement, current.gameMeta || {});
  state.current = null;
  state.substitutionAvailable = false;
  addMatchEvent('🔁 Zmiana! Trener zdejmuje pytanie i wpuszcza świeże z ławki.', 'event-neutral');
  showQuestion();
}

function tacticMoment(q) {
  if (!q?.gameMeta) return false;
  return q.gameMeta.position === 8 || q.gameMeta.position === 11 || q.gameMeta.directDecider;
}

function setupTacticChoice(q) {
  const box = el('tactic-box');
  if (!box) return;
  if (currentFormat() !== 'match90' || !tacticMoment(q)) {
    box.classList.add('hidden');
    return;
  }

  if (state.tacticQuestionId !== q.id) {
    state.tacticQuestionId = q.id;
    state.currentTactic = 'control';
  }
  box.classList.remove('hidden');
  const control = el('tactic-control');
  const risk = el('tactic-risk');
  const help = el('tactic-help');

  const refresh = () => {
    control?.classList.toggle('active', state.currentTactic === 'control');
    risk?.classList.toggle('active', state.currentTactic === 'risk');
    if (help) {
      help.textContent = state.currentTactic === 'risk'
        ? 'Va banque: dobra odpowiedź daje dodatkowego gola, zła może dać gola rywalowi.'
        : 'Kontrola: grasz bez dodatkowego ryzyka.';
    }
  };
  if (control) control.onclick = () => { state.currentTactic = 'control'; refresh(); };
  if (risk) risk.onclick = () => { state.currentTactic = 'risk'; refresh(); };
  refresh();
}

function goalForPlayer(text) {
  state.playerGoals = (state.playerGoals || 0) + 1;
  state.playerPressure = 0;
  addMatchEvent(`⚽ GOOOL! ${text}`, 'event-goal');
}

function goalForOpponent(text) {
  state.opponentGoals = (state.opponentGoals || 0) + 1;
  state.opponentPressure = 0;
  addMatchEvent(`🥅 Gol dla rywala. ${text}`, 'event-danger');
}

function resolveLiveScore(q, correct) {
  if (!q?.gameMeta || state.enhancedResolved?.has(q.id)) return;
  state.enhancedResolved.add(q.id);
  const meta = q.gameMeta;
  const risk = state.currentTactic === 'risk' && tacticMoment(q);
  const isDecider = Boolean(meta.directDecider);
  const isBigChance = meta.position === 10 || meta.position === 11 || isDecider;

  if (correct) {
    state.opponentPressure = Math.max(0, (state.opponentPressure || 0) - 1);
    if (isBigChance) {
      goalForPlayer(isDecider ? 'Decydująca piłka trafia do siatki!' : 'Wykorzystujesz wielką sytuację.');
    } else {
      state.playerPressure = (state.playerPressure || 0) + 1;
      addMatchEvent('✅ Dobra odpowiedź. Budujesz przewagę i zamykasz rywala.', 'event-good');
      if (state.playerPressure >= 2) goalForPlayer('Dwie dobre akcje z rzędu kończą się bramką.');
    }
    if (risk && !isDecider) goalForPlayer('Va banque się opłaciło — dokładamy gola!');
  } else {
    state.playerPressure = Math.max(0, (state.playerPressure || 0) - 1);
    if (isDecider || meta.position === 11) {
      goalForOpponent('Błąd w ostatniej akcji został bezlitośnie wykorzystany.');
    } else {
      state.opponentPressure = (state.opponentPressure || 0) + 1;
      addMatchEvent('❌ Strata. Rywal rusza z kontrą.', 'event-danger');
      if (state.opponentPressure >= 2) goalForOpponent('Druga strata z rzędu kończy się kontrą i golem.');
    }
    if (risk && !isDecider) goalForOpponent('Va banque nie wyszło — rywal trafia z kontry.');
  }
  renderEnhancedHud();
}

function prepareDeciderQuestion() {
  const poolIds = new Set((state.pool || []).map(q => q.id));
  let q = state.reserveQuestions?.find(item => !poolIds.has(item.id) && Array.isArray(item.options) && item.options.length >= 2);
  if (!q) q = baseFilteredQuestions().find(item => !poolIds.has(item.id) && Array.isArray(item.options) && item.options.length >= 2);
  if (!q) return null;
  return cloneWithMatchMeta(q, {
    phase: 'DECYDUJĄCA AKCJA',
    minute: '90+5’',
    points: 5,
    position: (state.pool?.length || 11) + 1,
    intro: 'REMIS! 90+5’ · OSTATNIA PIŁKA. Kto wygra mecz?',
    directDecider: true,
  });
}

updateScore = function enhancedUpdateScore() {
  enhancedBaseUpdateScore();
  if (currentFormat() === 'match90') {
    el('score-label').textContent = 'Mecz';
    el('score').textContent = `${state.playerGoals || 0} : ${state.opponentGoals || 0}`;
    renderEnhancedHud();
  }
};

showQuestion = function enhancedShowQuestion() {
  enhancedBaseShowQuestion();
  ensureEnhancedMatchUi();
  const q = state.current;
  if (currentFormat() !== 'match90' || !q || state.index >= state.pool.length) {
    el('tactic-box')?.classList.add('hidden');
    return;
  }

  setupTacticChoice(q);
  renderEnhancedHud();

  if (q.gameMeta?.position === 6) {
    const phase = el('phase-card');
    if (phase) {
      phase.textContent = `DRUGA POŁOWA · Do przerwy TY ${state.playerGoals || 0}:${state.opponentGoals || 0} RYWAL. Teraz robi się trudniej.`;
      phase.classList.remove('hidden');
    }
  }
  if (q.gameMeta?.directDecider) {
    el('question-type-label').textContent = '⚽ Decydująca akcja · za 5 pkt';
  }
};

answer = function enhancedAnswer(button, option) {
  const q = state.current;
  const isMatch = currentFormat() === 'match90' && Boolean(q?.gameMeta);
  const correct = Boolean(q && option === q.answer);
  const result = enhancedBaseAnswer(button, option);
  if (!isMatch) return result;

  resolveLiveScore(q, correct);
  el('tactic-box')?.classList.add('hidden');
  updateScore();
  return result;
};

finishGame = function enhancedFinishGame() {
  const isMatch = currentFormat() === 'match90';
  if (isMatch && (state.playerGoals || 0) === (state.opponentGoals || 0) && !state.deciderAdded) {
    const decider = prepareDeciderQuestion();
    if (decider) {
      state.deciderAdded = true;
      state.pool.push(decider);
      state.gameMaxPoints = (state.gameMaxPoints || 0) + 5;
      el('result')?.classList.add('hidden');
      el('quiz')?.classList.remove('hidden');
      el('match-hud')?.classList.remove('hidden');
      addMatchEvent('⏱️ Remis po 90 minutach. Jeszcze jedna, decydująca akcja!', 'event-neutral');
      showQuestion();
      return;
    }
  }

  enhancedBaseFinishGame();
  if (!isMatch) return;

  const pg = state.playerGoals || 0;
  const og = state.opponentGoals || 0;
  const outcome = pg > og ? 'WYGRYWASZ' : pg < og ? 'PRZEGRYWASZ' : 'REMIS';
  el('result-title').textContent = `${outcome} ${pg}:${og}`;
  el('result-details').textContent = `Wynik meczu: TY ${pg}:${og} RYWAL · ${el('result-details').textContent}`;
  const humor = el('result-humor');
  if (humor) {
    const lead = pg > og
      ? 'Trzy punkty zostają u Ciebie.'
      : pg < og
        ? 'Rywal zabiera punkty, ale rewanż jest od razu dostępny.'
        : 'Nikt nie odpuszczał do końca.';
    humor.textContent = `${lead} ${humor.textContent || ''}`.trim();
  }
  el('status').textContent = `Koniec meczu · TY ${pg}:${og} RYWAL · ${state.gamePoints || 0} pkt quizowych.`;
};

startGame = function enhancedStartGame() {
  resetEnhancedMatchState();
  ensureEnhancedMatchUi();
  const result = enhancedBaseStartGame();
  if (currentFormat() === 'match90') {
    setupReserveBench();
    addMatchEvent('📣 Pierwszy gwizdek! Zaczynamy od 0:0.', 'event-neutral');
    renderEnhancedHud();
    updateScore();
  } else {
    el('match-feed')?.classList.add('hidden');
    el('tactic-box')?.classList.add('hidden');
  }
  return result;
};

ensureEnhancedMatchUi();
el('sub-button')?.addEventListener('click', useQuestionSubstitution);
