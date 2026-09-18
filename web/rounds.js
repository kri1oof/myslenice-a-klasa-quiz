// Round layer: a small set of game themes plus genuinely different special rounds.
// Loaded after app.js and quality.js so it can reuse all filtering, safety and UI logic.

const roundDefinitions = {
  mix: ['Szybki miks', 'Najciekawsze pytania z różnych tematów. Dobry tryb na start.'],
  matchday: ['Meczowa sobota', 'Wyniki, rywale, kolejki, daty i wydarzenia z boiska.'],
  heroes: ['Strzelcy i bohaterowie', 'Gole, dublety, hat-tricki, MVP i nazwiska, które robiły różnicę.'],
  table: ['Tabela nie kłamie', 'Punkty, miejsca, bilanse i sezonowe liczby.'],
  locker: ['Szatnia i ławka', 'Składy, kapitanowie, rezerwowi, zmiany i role zawodników.'],
  chronicle: ['Kronika A-klasy', 'Lokalne smaczki, comebacki, karne, wolne i nietypowe historie.'],
  records: ['Serie i rekordy', 'Najwyższe wygrane, serie, czyste konta i rekordowe mecze.'],
  truth: ['Prawda czy A-klasowa legenda?', 'Stwierdzenie może być prawdą albo piękną historią dopisaną przy barze.'],
  hints: ['Rozpoznaj mecz po 3 wskazówkach', 'Odkrywaj wskazówki po kolei. Im szybciej trafisz wynik, tym więcej punktów bonusowych.'],
  earlier: ['Co było najpierw?', 'Dwa mecze z kroniki ligi. Wskaż ten rozegrany wcześniej.'],
  fake: ['Jeden wynik jest zmyślony', 'Trzy wyniki wydarzyły się naprawdę. Jeden został podrzucony.'],
  overtime: ['Dogrywka: tylko ciekawostki', 'Pięć pytań bez tabelkowej rutyny — same lokalne smaczki.'],
};

function currentRound() {
  return el('round')?.value || 'mix';
}

function currentRoundLabel() {
  return roundDefinitions[currentRound()]?.[0] || 'Szybki miks';
}

function updateRoundDescription() {
  const [, description] = roundDefinitions[currentRound()] || roundDefinitions.mix;
  if (el('round-description')) el('round-description').textContent = description;
  const special = ['truth', 'hints', 'earlier', 'fake', 'overtime'].includes(currentRound());
  el('difficulty-control')?.classList.toggle('round-filter-secondary', special);
  el('question-count-control')?.classList.toggle('round-filter-secondary', currentRound() === 'overtime');
}

function questionFitsRound(q, round) {
  const category = categoryForType(q.type);
  if (round === 'mix') return true;
  if (round === 'matchday') return category === 'mecze' || category === 'terminarz';
  if (round === 'heroes') {
    return category === 'zawodnicy' ||
      (String(q.type).startsWith('social_') && /scorer|mvp|standout|assist|captain|goalkeeper/.test(q.type));
  }
  if (round === 'table') return category === 'sezon';
  if (round === 'locker') return category === 'sklady';
  if (round === 'chronicle') return category === 'ciekawostki';
  if (round === 'records') return category === 'rekordy';
  return true;
}

function specialHash(value) {
  let hash = 2166136261;
  for (const ch of String(value || '')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function matchTitleFromQuestion(q) {
  const text = String(q.question || '');
  const found = text.match(/mecz(?:u)?\s+(.+?)\s+[–-]\s+(.+?)\s+w sezonie/i);
  if (found) return `${found[1]} – ${found[2]}`;
  if (Array.isArray(q.clubs) && q.clubs.length >= 2) return `${q.clubs[0]} – ${q.clubs[1]}`;
  return text.replace(/\?$/, '');
}

function scoreTotal(value) {
  const found = String(value || '').match(/^(\d+)\s*:\s*(\d+)$/);
  return found ? Number(found[1]) + Number(found[2]) : null;
}

function polishDateValue(value) {
  const found = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!found) return null;
  return new Date(Number(found[3]), Number(found[2]) - 1, Number(found[1])).getTime();
}

function truthStatement(q, candidate) {
  if (q.type === 'match_score') return `${matchTitleFromQuestion(q)} zakończył się wynikiem ${candidate}.`;
  if (q.type === 'match_winner') {
    return candidate === 'Remis'
      ? `Mecz ${matchTitleFromQuestion(q)} zakończył się remisem.`
      : `Mecz ${matchTitleFromQuestion(q)} wygrał ${candidate}.`;
  }
  if (q.type === 'final_position' || q.type === 'standing_position') {
    return `${q.question.replace(/\?$/, '')} Odpowiedź: ${candidate}. miejsce.`;
  }
  if (/points/.test(q.type)) return `${q.question.replace(/\?$/, '')} Odpowiedź: ${candidate} punktów.`;
  if (q.type === 'social_attendance') return `${q.question.replace(/\?$/, '')} Odpowiedź: ${candidate} widzów.`;
  return `${q.question.replace(/\?$/, '')} Odpowiedź: ${candidate}.`;
}

function buildTruthRound(base) {
  const allowed = new Set([
    'match_score', 'match_winner', 'final_position', 'standing_position',
    'season_points', 'standing_points', 'social_attendance',
  ]);
  return shuffle(base.filter(q => allowed.has(q.type) && Array.isArray(q.options) && q.options.some(x => x !== q.answer)))
    .map((q, index) => {
      const isTrue = specialHash(`${q.id}:${index}`) % 2 === 0;
      const wrongs = q.options.filter(x => x !== q.answer);
      const candidate = isTrue ? q.answer : wrongs[specialHash(q.id) % wrongs.length];
      return {
        ...q,
        id: `special-truth:${q.id}`,
        type: 'special_truth',
        question: truthStatement(q, candidate),
        answer: isTrue ? 'Prawda' : 'Legenda',
        options: ['Prawda', 'Legenda'],
        explanation: `${isTrue ? 'To prawda.' : 'To legenda.'} ${q.explanation || `Poprawna informacja: ${q.answer}.`}`,
        special: { kind: 'truth' },
      };
    });
}

function buildHintsRound(base) {
  return shuffle(base.filter(q => q.type === 'match_score' && scoreTotal(q.answer) !== null)).map(q => ({
    ...q,
    id: `special-hints:${q.id}`,
    type: 'special_hints',
    question: 'Jaki był wynik tego meczu?',
    special: {
      kind: 'hints',
      hints: [
        `Sezon ${q.season}.`,
        `Na boisku: ${matchTitleFromQuestion(q)}.`,
        `W meczu padło łącznie ${scoreTotal(q.answer)} bramek.`,
      ],
    },
  }));
}

function buildEarlierRound(base) {
  const dated = shuffle(base.filter(q => q.type === 'match_date' && polishDateValue(q.answer) !== null));
  const result = [];
  for (let i = 0; i + 1 < dated.length; i += 2) {
    const first = dated[i];
    const second = dated[i + 1];
    const firstDate = polishDateValue(first.answer);
    const secondDate = polishDateValue(second.answer);
    if (firstDate === secondDate) continue;
    const firstTitle = matchTitleFromQuestion(first);
    const secondTitle = matchTitleFromQuestion(second);
    if (!firstTitle || !secondTitle || firstTitle === secondTitle) continue;
    const earlier = firstDate < secondDate ? first : second;
    const later = firstDate < secondDate ? second : first;
    result.push({
      id: `special-earlier:${first.id}:${second.id}`,
      type: 'special_earlier',
      difficulty: Math.max(first.difficulty || 1, second.difficulty || 1),
      question: 'Który z tych meczów rozegrano wcześniej?',
      answer: matchTitleFromQuestion(earlier),
      options: shuffle([firstTitle, secondTitle]),
      explanation: `${matchTitleFromQuestion(earlier)} rozegrano ${earlier.answer}, a ${matchTitleFromQuestion(later)} — ${later.answer}.`,
      season: earlier.season,
      confidence: Math.min(first.confidence || 1, second.confidence || 1),
      clubs: [...new Set([...(first.clubs || []), ...(second.clubs || [])])],
      sources: [...new Set([...(first.sources || []), ...(second.sources || [])])],
      special: { kind: 'earlier' },
    });
  }
  return result;
}

function buildFakeRound(base) {
  const matches = shuffle(base.filter(q => q.type === 'match_score' && Array.isArray(q.options) && q.options.some(x => x !== q.answer)));
  const result = [];
  for (let i = 0; i + 3 < matches.length; i += 4) {
    const group = matches.slice(i, i + 4);
    const target = group[3];
    const fakeScore = target.options.find(x => x !== target.answer);
    if (!fakeScore) continue;
    const trueLines = group.slice(0, 3).map(q => `${matchTitleFromQuestion(q)} — ${q.answer}`);
    const fakeLine = `${matchTitleFromQuestion(target)} — ${fakeScore}`;
    result.push({
      id: `special-fake:${group.map(q => q.id).join(':')}`,
      type: 'special_fake',
      difficulty: 4,
      question: 'Jeden z tych wyników jest zmyślony. Który?',
      answer: fakeLine,
      options: shuffle([...trueLines, fakeLine]),
      explanation: `${matchTitleFromQuestion(target)} naprawdę zakończył się wynikiem ${target.answer}. Pozostałe trzy wyniki są prawdziwe.`,
      season: target.season,
      confidence: Math.min(...group.map(q => q.confidence || 1)),
      clubs: [...new Set(group.flatMap(q => q.clubs || []))],
      sources: [...new Set(group.flatMap(q => q.sources || []))],
      special: { kind: 'fake' },
    });
  }
  return result;
}

function buildSpecialRound(base, round) {
  if (round === 'truth') return buildTruthRound(base);
  if (round === 'hints') return buildHintsRound(base);
  if (round === 'earlier') return buildEarlierRound(base);
  if (round === 'fake') return buildFakeRound(base);
  if (round === 'overtime') return shuffle(base.filter(q => String(q.type).startsWith('social_')));
  return base;
}

function roundQuestionCount(available, round) {
  if (round === 'overtime') return Math.min(5, available);
  return getRequestedQuestionCount(available);
}

const roundBaseShowQuestion = showQuestion;
showQuestion = function roundShowQuestion() {
  roundBaseShowQuestion();
  const q = state.current;
  if (!q || state.index >= state.pool.length) return;
  if (q.special) {
    el('question-type-label').textContent = 'Runda specjalna';
    const names = {
      truth: 'PRAWDA CZY LEGENDA?',
      hints: 'TRZY WSKAZÓWKI',
      earlier: 'CO BYŁO NAJPIERW?',
      fake: 'ZNAJDŹ FAŁSZYWKĘ',
    };
    el('question-style').textContent = names[q.special.kind] || 'RUNDA SPECJALNA';
  }
  renderRoundHints(q);
};

function renderRoundHints(q) {
  const box = el('hints-box');
  const button = el('reveal-hint');
  if (!box || !button) return;
  box.innerHTML = '';
  box.classList.add('hidden');
  button.classList.add('hidden');
  button.onclick = null;
  if (q?.special?.kind !== 'hints') return;

  state.hintsShown = 1;
  const draw = () => {
    box.innerHTML = q.special.hints.slice(0, state.hintsShown).map((hint, index) =>
      `<div class="round-hint"><strong>Wskazówka ${index + 1}</strong><span>${hint}</span></div>`
    ).join('');
    box.classList.remove('hidden');
    if (state.hintsShown < q.special.hints.length) {
      button.textContent = `Pokaż wskazówkę ${state.hintsShown + 1}`;
      button.classList.remove('hidden');
    } else {
      button.classList.add('hidden');
    }
  };
  button.onclick = () => {
    state.hintsShown += 1;
    draw();
  };
  draw();
}

const roundBaseAnswer = answer;
answer = function roundAnswer(button, option) {
  const q = state.current;
  const correct = q && option === q.answer;
  const hintsUsed = state.hintsShown || 0;
  const result = roundBaseAnswer(button, option);
  el('reveal-hint')?.classList.add('hidden');
  if (q?.special?.kind === 'hints' && correct) {
    const gained = Math.max(1, 4 - Math.max(1, hintsUsed));
    state.hintPoints = (state.hintPoints || 0) + gained;
    state.hintMax = (state.hintMax || 0) + 3;
    const bonus = document.createElement('div');
    bonus.className = 'round-bonus';
    bonus.textContent = `+${gained} pkt za odgadnięcie po ${Math.max(1, hintsUsed)} wskazówce${hintsUsed === 1 ? '' : 'ach'}.`;
    el('feedback')?.appendChild(bonus);
  } else if (q?.special?.kind === 'hints') {
    state.hintMax = (state.hintMax || 0) + 3;
  }
  return result;
};

const roundBaseFinishGame = finishGame;
finishGame = function roundFinishGame() {
  roundBaseFinishGame();
  if (currentRound() === 'hints' && state.hintMax) {
    el('result-details').textContent += ` · Punkty za wskazówki: ${state.hintPoints || 0}/${state.hintMax}`;
  }
  el('status').textContent = `${currentRoundLabel()} — końcowy gwizdek.`;
};

startGame = function roundStartGame() {
  const difficulty = el('difficulty').value;
  const round = currentRound();
  const selectedClub = el('scope-mode').value === 'club' ? el('club').value : null;

  let base = state.all.filter(q =>
    questionMatchesScope(q) &&
    questionMatchesSeason(q) &&
    (difficulty === 'all' || String(q.difficulty) === difficulty)
  );

  let matching;
  if (['truth', 'hints', 'earlier', 'fake', 'overtime'].includes(round)) {
    matching = buildSpecialRound(base, round);
  } else {
    matching = base.filter(q => questionFitsRound(q, round));
  }

  state.availableCount = matching.length;
  const requestedCount = roundQuestionCount(matching.length, round);
  if (difficulty === 'all' && adaptiveDifficultyCore) {
    configureAdaptiveDynamicPool(matching, requestedCount);
  } else {
    resetAdaptiveDifficulty(false);
    state.pool = smartPick(matching, requestedCount);
  }
  state.index = 0;
  state.correct = 0;
  state.answered = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.current = null;
  state.hintsShown = 0;
  state.hintPoints = 0;
  state.hintMax = 0;
  updateScore();
  el('result').classList.add('hidden');

  if (!state.pool.length) {
    el('status').textContent = selectedClub
      ? `Brak pytań dla ${selectedClub} w rundzie „${currentRoundLabel()}” przy tych filtrach.`
      : `Brak pytań w rundzie „${currentRoundLabel()}” przy tych filtrach.`;
    el('status').classList.remove('hidden');
    el('quiz').classList.add('hidden');
    return;
  }

  const scopeLabel = selectedClub ? `Tryb klubowy: ${selectedClub}` : 'Cała A-klasa Myślenice';
  const lengthLabel = round === 'overtime' ? `${state.pool.length} pytań — dogrywka` : `${state.pool.length} pytań`;
  el('status').textContent = `${currentRoundLabel()} · ${scopeLabel} · ${selectedSeasonLabel()} · ${lengthLabel}`;
  el('status').classList.remove('hidden');
  el('quiz').classList.remove('hidden');
  showQuestion();
};

function rebindRoundButton(id, handler) {
  const oldButton = el(id);
  if (!oldButton) return;
  const newButton = oldButton.cloneNode(true);
  oldButton.replaceWith(newButton);
  newButton.addEventListener('click', handler);
}

// The original app bound these handlers before this enhancement loaded.
// Clone the buttons once to remove those old listeners and bind the round-aware version.
rebindRoundButton('new-game', () => startGame());
rebindRoundButton('play-again', () => startGame());

el('round')?.addEventListener('change', updateRoundDescription);
updateRoundDescription();
