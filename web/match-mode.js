// Match mode turns the question bank into an actual game flow.
// It loads last and deliberately overrides the simpler round wrappers.

const matchLegacyStartGame = startGame;
const matchLegacyShowQuestion = showQuestion;
const matchLegacyAnswer = answer;
const matchLegacyFinishGame = finishGame;
const matchLegacyUpdateScore = updateScore;

const formatDescriptions = {
  match90: '11 pytań jak mecz: pierwsza połowa, przerwa, druga połowa, karta specjalna i 90+.',
  special: 'Jedna nietypowa mechanika bez zwykłej quizowej rutyny.',
  quick: 'Krótka seria najlepszych pytań z różnych tematów.',
};

function currentFormat() {
  return el('game-format')?.value || 'match90';
}

function updateFormatControls() {
  const format = currentFormat();
  if (el('format-description')) el('format-description').textContent = formatDescriptions[format];
  el('special-round-control')?.classList.toggle('hidden', format !== 'special');
  el('advanced-options')?.classList.toggle('hidden', format === 'match90');
  if (format === 'special' && el('round') && el('special-round')) {
    el('round').value = el('special-round').value;
  }
}

function baseFilteredQuestions() {
  return state.all.filter(q => questionMatchesScope(q) && questionMatchesSeason(q));
}

function unusedQuestions(values, used) {
  return values.filter(q => !used.has(q.id));
}

function takeBalanced(values, count, used, predicate = () => true) {
  const candidates = shuffle(unusedQuestions(values, used).filter(predicate));
  const chosen = [];
  const seenCategories = new Set();

  // First pass: variety before repetition.
  for (const q of candidates) {
    const category = categoryForType(q.type);
    if (seenCategories.has(category)) continue;
    chosen.push(q);
    seenCategories.add(category);
    used.add(q.id);
    if (chosen.length >= count) return chosen;
  }
  // Second pass: fill remaining slots with the strongest shuffled pool.
  for (const q of candidates) {
    if (used.has(q.id)) continue;
    chosen.push(q);
    used.add(q.id);
    if (chosen.length >= count) break;
  }
  return chosen;
}

function chooseOneSpecial(builder, values, used) {
  const remaining = unusedQuestions(values, used);
  const built = builder(remaining);
  return built.length ? built[0] : null;
}

function cloneWithMatchMeta(q, meta) {
  return {
    ...q,
    gameMeta: meta,
  };
}

function buildMatch90(values) {
  const used = new Set();
  const pool = [];

  const firstHalf = takeBalanced(values, 4, used, q => (q.difficulty || 3) <= 3 && !String(q.type).startsWith('social_'));
  const truth = chooseOneSpecial(buildTruthRound, values, used);
  const secondHalf = takeBalanced(values, 4, used, q =>
    (q.difficulty || 3) >= 3 || ['zawodnicy', 'ciekawostki', 'rekordy', 'sklady'].includes(categoryForType(q.type))
  );

  // 88th minute: one of the genuinely different mechanics.
  const lateBuilders = specialHash(String(Date.now())) % 2 === 0
    ? [buildHintsRound, buildEarlierRound]
    : [buildEarlierRound, buildHintsRound];
  let lateSpecial = null;
  for (const builder of lateBuilders) {
    lateSpecial = chooseOneSpecial(builder, values, used);
    if (lateSpecial) break;
  }
  const stoppage = chooseOneSpecial(buildFakeRound, values, used);

  const timeline = [
    { phase: '1. POŁOWA', minute: '7’', points: 1, intro: 'Pierwszy gwizdek. Wchodzimy w mecz.' },
    { phase: '1. POŁOWA', minute: '18’', points: 1 },
    { phase: '1. POŁOWA', minute: '31’', points: 1 },
    { phase: '1. POŁOWA', minute: '44’', points: 1 },
    { phase: 'PRZERWA', minute: '45’', points: 2, intro: 'PRZERWA · Prawda czy A-klasowa legenda?' },
    { phase: '2. POŁOWA', minute: '53’', points: 2, intro: 'DRUGA POŁOWA · Pytania robią się trudniejsze.' },
    { phase: '2. POŁOWA', minute: '64’', points: 2 },
    { phase: '2. POŁOWA', minute: '73’', points: 2 },
    { phase: '2. POŁOWA', minute: '82’', points: 2 },
    { phase: 'KARTA SPECJALNA', minute: '88’', points: 3, intro: '88’ · KARTA SPECJALNA' },
    { phase: 'DOLICZONY CZAS', minute: '90+3’', points: 4, intro: '90+3’ · Ostatnia akcja meczu. Za cztery punkty.' },
  ];

  const sequence = [
    ...firstHalf,
    truth,
    ...secondHalf,
    lateSpecial,
    stoppage,
  ].filter(Boolean);

  // If one special mechanic cannot be built for a narrow club/season filter,
  // fill the gap with a normal question rather than ending the match early.
  while (sequence.length < 11) {
    const filler = takeBalanced(values, 1, used)[0];
    if (!filler) break;
    sequence.push(filler);
  }

  sequence.slice(0, 11).forEach((q, index) => {
    pool.push(cloneWithMatchMeta(q, {
      ...(timeline[index] || { phase: 'DOGRYWKA', minute: '90+’', points: 2 }),
      position: index + 1,
    }));
  });
  return pool;
}

function resetMatchState() {
  state.gamePoints = 0;
  state.gameBonus = 0;
  state.gameMaxPoints = 0;
  state.varAvailable = true;
  state.varUsed = false;
  state.hintsShown = 0;
  state.hintPoints = 0;
  state.hintMax = 0;
}

function updateMatchHud() {
  if (currentFormat() !== 'match90') return;
  const q = state.current;
  if (q?.gameMeta) {
    el('match-phase').textContent = q.gameMeta.phase;
    el('match-minute').textContent = q.gameMeta.minute;
  }
  el('match-points').textContent = String(state.gamePoints || 0);
  el('match-streak').textContent = String(state.streak || 0);
  const total = Math.max(1, state.pool.length - 1);
  const progress = Math.min(100, Math.round((state.index / total) * 100));
  el('match-progress').style.width = `${progress}%`;
  const varButton = el('var-button');
  if (varButton) {
    varButton.disabled = !state.varAvailable;
    varButton.textContent = state.varAvailable ? 'VAR 50/50' : 'VAR wykorzystany';
  }
}

function setupVarButton(q) {
  const button = el('var-button');
  if (!button) return;
  const canUse = currentFormat() === 'match90' && state.varAvailable &&
    Array.isArray(q?.options) && q.options.length >= 4 && q?.special?.kind !== 'truth';
  button.disabled = !canUse;
  button.onclick = null;
  if (!canUse) return;

  button.onclick = () => {
    const answerButtons = [...document.querySelectorAll('.answer')];
    const wrong = shuffle(answerButtons.filter(b => b.textContent !== q.answer && !b.classList.contains('var-eliminated')));
    wrong.slice(0, 2).forEach(b => {
      b.classList.add('var-eliminated');
      b.disabled = true;
    });
    state.varAvailable = false;
    state.varUsed = true;
    button.disabled = true;
    button.textContent = 'VAR wykorzystany';
    const phase = el('phase-card');
    if (phase) {
      phase.textContent = '📺 VAR: dwóch błędnych odpowiedzi już nie ma.';
      phase.classList.remove('hidden');
    }
  };
}

function rankForMatch() {
  const total = state.pool.length || 1;
  const ratio = state.correct / total;
  if (ratio >= 0.91) return ['🏆 MVP MECZU', 'Kierownik oddaje Ci segregator. Dzisiaj wszystko się zgadzało.'];
  if (ratio >= 0.73) return ['⭐ PIERWSZY SKŁAD', 'Bardzo mocny występ. Trener nie widzi powodu do zmiany.'];
  if (ratio >= 0.55) return ['💪 PEWNY LIGOWIEC', 'Są punkty, jest forma. Kilka akcji można było rozegrać lepiej.'];
  if (ratio >= 0.36) return ['🪑 ŁAWKA REZERWOWYCH', 'Wejście było ambitne, ale przed następnym meczem przyda się analiza wideo.'];
  return ['🏃 TRENING INDYWIDUALNY', 'Murawa ciężka, rywal wymagający. Rewanż jest obowiązkowy.'];
}

updateScore = function matchUpdateScore() {
  if (currentFormat() === 'match90') {
    el('score-label').textContent = 'Punkty';
    el('score').textContent = `${state.gamePoints || 0} pkt`;
    updateMatchHud();
    return;
  }
  el('score-label').textContent = 'Wynik';
  matchLegacyUpdateScore();
};

showQuestion = function matchShowQuestion() {
  matchLegacyShowQuestion();
  if (currentFormat() !== 'match90' || !state.current || state.index >= state.pool.length) {
    el('match-hud')?.classList.add('hidden');
    el('phase-card')?.classList.add('hidden');
    return;
  }

  const q = state.current;
  const meta = q.gameMeta || {};
  el('match-hud')?.classList.remove('hidden');
  updateMatchHud();
  setupVarButton(q);

  const phaseCard = el('phase-card');
  if (phaseCard) {
    if (meta.intro) {
      phaseCard.textContent = meta.intro;
      phaseCard.classList.remove('hidden');
    } else {
      phaseCard.classList.add('hidden');
    }
  }

  if (q.special) {
    el('question-type-label').textContent = `Za ${meta.points || 1} pkt · runda specjalna`;
  } else {
    el('question-type-label').textContent = `Za ${meta.points || 1} pkt · ${labelType(q.type)}`;
  }
};

answer = function matchAnswer(button, option) {
  const q = state.current;
  const isMatch = currentFormat() === 'match90' && q?.gameMeta;
  const correct = Boolean(q && option === q.answer);
  const hintsUsed = state.hintsShown || 0;
  const result = matchLegacyAnswer(button, option);

  if (!isMatch) return result;

  let awarded = 0;
  if (correct) {
    awarded = q.gameMeta.points || 1;
    if (q.special?.kind === 'hints') {
      awarded = Math.min(awarded, Math.max(1, 4 - Math.max(1, hintsUsed)));
    }
    state.gamePoints += awarded;

    if ([3, 5, 7, 9, 11].includes(state.streak)) {
      state.gamePoints += 1;
      state.gameBonus += 1;
      const bonus = document.createElement('div');
      bonus.className = 'momentum-bonus';
      bonus.textContent = '🔥 +1 pkt za serię — złapałeś momentum.';
      el('feedback')?.appendChild(bonus);
    }
  }

  const pointsLine = document.createElement('div');
  pointsLine.className = 'match-points-line';
  pointsLine.textContent = correct ? `+${awarded} pkt za tę akcję.` : '0 pkt za tę akcję.';
  el('feedback')?.appendChild(pointsLine);
  updateScore();
  setupVarButton(null);
  return result;
};

finishGame = function matchFinishGame() {
  const format = currentFormat();
  matchLegacyFinishGame();
  el('match-hud')?.classList.add('hidden');
  el('phase-card')?.classList.add('hidden');

  if (format !== 'match90') {
    el('result-rank')?.classList.add('hidden');
    return;
  }

  const total = state.pool.length || 1;
  const percent = Math.round((state.correct / total) * 100);
  const [rank, description] = rankForMatch();
  el('result-title').textContent = 'Koniec meczu';
  el('result-score').textContent = `${state.gamePoints || 0} pkt`;
  el('result-percent').textContent = `${percent}%`;
  el('result-details').textContent = `Poprawne: ${state.correct}/${total} · Najlepsza seria: ${state.bestStreak} · VAR: ${state.varUsed ? 'wykorzystany' : 'niewykorzystany'}${state.gameBonus ? ` · Bonus za serię: +${state.gameBonus}` : ''}`;
  const rankBox = el('result-rank');
  if (rankBox) {
    rankBox.innerHTML = `<strong>${rank}</strong><span>${description}</span>`;
    rankBox.classList.remove('hidden');
  }
  el('status').textContent = `90+3’ · Końcowy gwizdek · ${state.gamePoints || 0} punktów.`;
};

startGame = function matchStartGame() {
  const format = currentFormat();
  resetMatchState();
  el('result-rank')?.classList.add('hidden');
  el('result-title').textContent = 'Twój wynik';

  if (format === 'special') {
    if (el('round') && el('special-round')) el('round').value = el('special-round').value;
    el('match-hud')?.classList.add('hidden');
    matchLegacyStartGame();
    return;
  }

  if (format === 'quick') {
    if (el('round')) el('round').value = 'mix';
    el('match-hud')?.classList.add('hidden');
    matchLegacyStartGame();
    return;
  }

  const selectedClub = el('scope-mode').value === 'club' ? el('club').value : null;
  const base = baseFilteredQuestions();
  const pool = buildMatch90(base);
  state.availableCount = base.length;
  state.pool = pool;
  state.index = 0;
  state.correct = 0;
  state.answered = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.current = null;
  state.gameMaxPoints = pool.reduce((sum, q) => sum + (q.gameMeta?.points || 1), 0);
  updateScore();
  el('result').classList.add('hidden');

  if (!pool.length) {
    el('status').textContent = selectedClub
      ? `Za mało pytań, żeby rozegrać mecz dla ${selectedClub} przy tym zakresie sezonów.`
      : 'Za mało pytań, żeby rozegrać mecz przy tym zakresie sezonów.';
    el('status').classList.remove('hidden');
    el('quiz').classList.add('hidden');
    return;
  }

  const scopeLabel = selectedClub ? selectedClub : 'cała A-klasa Myślenice';
  el('status').textContent = `Mecz 90’ · ${scopeLabel} · ${selectedSeasonLabel()} · ${pool.length} akcji do rozegrania`;
  el('status').classList.remove('hidden');
  el('quiz').classList.remove('hidden');
  el('match-hud').classList.remove('hidden');
  showQuestion();
};

el('game-format')?.addEventListener('change', updateFormatControls);
el('special-round')?.addEventListener('change', () => {
  if (el('round')) el('round').value = el('special-round').value;
});
updateFormatControls();
