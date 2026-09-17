// Real-player substitution layer for Match RPG.
// Loaded after player-characters.js so a substitute immediately becomes the active RPG character.
const substitutionCore = globalThis.SubstitutionCore;
const substitutionBaseResetRpgState = resetRpgState;
const substitutionBaseEnsureRpgUi = ensureRpgUi;
const substitutionBaseRenderRpgBoard = renderRpgBoard;
const substitutionBaseScenarioOdds = scenarioOdds;
const substitutionBaseRenderActionPanel = renderActionPanel;
const substitutionBaseShowRpgDecisionStage = showRpgDecisionStage;
const substitutionBaseAnswer = answer;
const substitutionBaseFinishGame = finishGame;

resetRpgState = function substitutionResetRpgState() {
  substitutionBaseResetRpgState();
  state.rpgSubstitutionResolvedBands = new Set();
  state.rpgSubstitutionHistory = [];
  state.rpgSubstitutionPending = false;
  state.rpgSubstitutionCurrentBand = null;
  state.rpgSubstitutionEffect = null;
  state.rpgSubstitutionUsedIds = new Set();
  state.rpgSubstitutionQuizAnswered = 0;
  state.rpgSubstitutionQuizCorrect = 0;
};

function ensureSubstitutionHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-substitution-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'rpg-substitution-hud';
  hud.className = 'rpg-substitution-hud';
  hud.innerHTML = `
    <span class="substitution-hud-icon">🔁</span>
    <span class="substitution-hud-copy">
      <small>ZMIANY</small>
      <strong id="rpg-substitution-count">0/2</strong>
      <em id="rpg-substitution-effect">Pierwsze okno od 55’</em>
    </span>`;
  const characterHud = el('rpg-character-hud');
  if (characterHud) characterHud.insertAdjacentElement('afterend', hud);
  else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', hud);
}

ensureRpgUi = function substitutionEnsureRpgUi() {
  substitutionBaseEnsureRpgUi();
  ensureSubstitutionHud();
};

function renderSubstitutionHud() {
  ensureSubstitutionHud();
  if (!rpgActive()) return;
  const used = Number(state.rpgSubstitutionHistory?.length || 0);
  if (el('rpg-substitution-count')) el('rpg-substitution-count').textContent = `${used}/2`;
  const effect = state.rpgSubstitutionEffect;
  const effectNode = el('rpg-substitution-effect');
  if (!effectNode) return;
  if (effect) {
    effectNode.textContent = `${effect.label}: ${substitutionCore.effectLabel(effect)}`;
    effectNode.classList.toggle('positive', Number(effect.bonus || 0) > 0);
    effectNode.classList.toggle('negative', Number(effect.bonus || 0) < 0);
    return;
  }
  effectNode.classList.remove('positive', 'negative');
  if (used >= 2) effectNode.textContent = 'Limit zmian wykorzystany';
  else if (Number(state.rpgMinute || 0) < 55) effectNode.textContent = 'Pierwsze okno od 55’';
  else effectNode.textContent = 'Bez aktywnego efektu zmiany';
}

renderRpgBoard = function substitutionRenderRpgBoard() {
  substitutionBaseRenderRpgBoard();
  renderSubstitutionHud();
};

scenarioOdds = function substitutionScenarioOdds(action, knowledgeCorrect) {
  const base = substitutionBaseScenarioOdds(action, knowledgeCorrect);
  return substitutionCore.adjustedChance(base, state.rpgSubstitutionEffect);
};

renderActionPanel = function substitutionRenderActionPanel() {
  substitutionBaseRenderActionPanel();
  if (!rpgActive() || state.rpgSubstitutionPending) return;
  const effect = state.rpgSubstitutionEffect;
  const heading = el('rpg-action-panel')?.querySelector('.rpg-action-heading');
  if (!heading || !effect || heading.querySelector('.substitution-effect-chip')) return;
  const chip = document.createElement('span');
  chip.className = `substitution-effect-chip ${Number(effect.bonus || 0) >= 0 ? 'positive' : 'negative'}`;
  chip.textContent = `🔁 ${substitutionCore.effectLabel(effect)}`;
  heading.appendChild(chip);
};

function substitutionCandidateNote(character) {
  const stats = character?.stats || {};
  const entries = Number(stats.sub_entries || 0);
  if (entries >= 10) return `Joker · ${entries} wejść z ławki w sezonie`;
  if (entries >= 4) return `${entries} wejść z ławki w sezonie`;
  if (entries > 0) return `${entries} wej. z ławki · profil sezonowy`;
  return 'Profil sezonowy · kandydat do zmiany';
}

function substitutionCandidates() {
  const active = state.rpgCharacter;
  return substitutionCore.pickCandidates(
    state.playerCharacters || [],
    active,
    state.rpgSubstitutionUsedIds || new Set(),
    3,
  );
}

function markSubstitutionBandResolved(band) {
  if (!state.rpgSubstitutionResolvedBands) state.rpgSubstitutionResolvedBands = new Set();
  state.rpgSubstitutionResolvedBands.add(band);
  state.rpgSubstitutionCurrentBand = null;
}

function continueAfterSubstitutionWindow() {
  state.rpgSubstitutionPending = false;
  state.rpgSubstitutionCurrentBand = null;
  hideQuestionUi(true);
  renderRpgBoard();
  substitutionBaseShowRpgDecisionStage();
}

function skipSubstitution(band) {
  markSubstitutionBandResolved(band);
  state.rpgSubstitutionPending = false;
  addRpgLog('🔁 Ławka gotowa, ale zostawiasz aktualnego zawodnika na boisku.', '');
  continueAfterSubstitutionWindow();
}

function chooseSubstitutionQuestion() {
  const previousPreference = state.rpgQuestionPreference;
  state.rpgQuestionPreference = 'player_decisions';
  try {
    return chooseRpgQuestion(3);
  } finally {
    state.rpgQuestionPreference = previousPreference || null;
  }
}

function substitutionResultCopy(correct, effect) {
  if (correct === true) {
    return `Dobra odpowiedź. Rezerwowy wchodzi przygotowany: ${substitutionCore.effectLabel(effect)}.`;
  }
  if (correct === false) {
    return `Błąd w teście. Zmiana dochodzi do skutku, ale wejście jest trudniejsze: ${substitutionCore.effectLabel(effect)}.`;
  }
  return 'Zmiana dochodzi do skutku bez dodatkowego efektu wiedzy.';
}

function completeSubstitution(candidate, band, correct, question = null) {
  const outgoing = state.rpgCharacter;
  const effect = typeof correct === 'boolean' ? substitutionCore.knowledgeEffect(correct) : null;
  if (outgoing?.id) state.rpgSubstitutionUsedIds.add(outgoing.id);
  if (candidate?.id) state.rpgSubstitutionUsedIds.add(candidate.id);

  state.rpgCharacter = candidate;
  state.rpgSubstitutionEffect = effect;
  state.rpgSubstitutionPending = false;
  markSubstitutionBandResolved(band);
  if (typeof correct === 'boolean') {
    state.rpgSubstitutionQuizAnswered += 1;
    if (correct) state.rpgSubstitutionQuizCorrect += 1;
  }
  state.rpgSubstitutionHistory.push({
    minute: Number(state.rpgMinute || 0),
    band,
    outgoingId: outgoing?.id || null,
    outgoing: outgoing?.player || null,
    incomingId: candidate?.id || null,
    incoming: candidate?.player || null,
    knowledgeCorrect: correct,
    questionId: question?.id || null,
    effect: effect ? { ...effect } : null,
  });

  const knowledgeText = correct === true
    ? `Test wiedzy zdany — ${substitutionCore.effectLabel(effect)}.`
    : correct === false
      ? `Test wiedzy niezdany — ${substitutionCore.effectLabel(effect)}.`
      : 'Brak testu wiedzy.';
  addRpgLog(`🔁 ZMIANA: ${outgoing?.player || 'zawodnik'} schodzi, ${candidate.player} wchodzi. ${knowledgeText}`, correct === false ? 'bad' : 'good');
  renderRpgBoard();
  return effect;
}

function renderSubstitutionQuiz(candidate, band) {
  const panel = el('rpg-action-panel');
  const question = chooseSubstitutionQuestion();
  if (!question || !Array.isArray(question.options) || question.options.length < 2) {
    completeSubstitution(candidate, band, null, null);
    panel.innerHTML = `
      <div class="substitution-result-card">
        <div class="substitution-kicker">🔁 ZMIANA WYKONANA</div>
        <h3>${escapeCharacterHtml(candidate.player)} wchodzi na boisko</h3>
        <p>Nie udało się dobrać osobnego pytania o zawodnikach. Zmiana jest neutralna dla najbliższych akcji.</p>
        <button type="button" class="substitution-continue">Kontynuuj mecz</button>
      </div>`;
    panel.querySelector('.substitution-continue')?.addEventListener('click', continueAfterSubstitutionWindow);
    return;
  }

  state.rpgSubstitutionPending = true;
  const options = typeof shuffle === 'function' ? shuffle([...question.options]) : [...question.options];
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="substitution-quiz-card">
      <div class="substitution-kicker">🧠 TEST ZMIANY · ${state.rpgMinute}’</div>
      <h3>${escapeCharacterHtml(candidate.player)} jest gotowy przy linii</h3>
      <p class="substitution-quiz-explainer">Odpowiedz na pytanie z danych ŁNP. Wynik testu wpłynie na pierwsze akcje po wejściu rezerwowego.</p>
      <div class="substitution-question-type">${escapeCharacterHtml(labelType(question.type))}</div>
      <h4>${escapeCharacterHtml(question.question || 'Pytanie o zawodników')}</h4>
      <div class="substitution-quiz-answers"></div>
    </div>`;

  const answers = panel.querySelector('.substitution-quiz-answers');
  options.forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'substitution-quiz-answer';
    button.textContent = String(option);
    button.addEventListener('click', () => {
      const correct = String(option) === String(question.answer);
      [...answers.querySelectorAll('button')].forEach(answerButton => {
        answerButton.disabled = true;
        if (answerButton.textContent === String(question.answer)) answerButton.classList.add('correct');
      });
      if (!correct) button.classList.add('wrong');
      const effect = completeSubstitution(candidate, band, correct, question);
      const result = document.createElement('div');
      result.className = `substitution-quiz-result ${correct ? 'good' : 'bad'}`;
      result.innerHTML = `
        <strong>${correct ? '✓ Test zdany' : '✕ Test niezdany'}</strong>
        <span>${escapeCharacterHtml(substitutionResultCopy(correct, effect))}</span>
        <small>Poprawna odpowiedź: ${escapeCharacterHtml(question.answer)}</small>
        <button type="button" class="substitution-continue">Kontynuuj mecz</button>`;
      panel.querySelector('.substitution-quiz-card')?.appendChild(result);
      result.querySelector('.substitution-continue')?.addEventListener('click', continueAfterSubstitutionWindow);
    }, { once: true });
    answers.appendChild(button);
  });
}

function showSubstitutionDecision(band) {
  const panel = el('rpg-action-panel');
  const active = state.rpgCharacter;
  const candidates = substitutionCandidates();
  if (!panel || !active || !candidates.length) {
    markSubstitutionBandResolved(band);
    return false;
  }

  state.rpgSubstitutionPending = true;
  state.rpgSubstitutionCurrentBand = band;
  hideQuestionUi(true);
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="substitution-decision-card">
      <div class="substitution-kicker">🔁 OKNO ZMIAN · ${state.rpgMinute}’</div>
      <h3>${band === 'late' ? 'Końcówka meczu — wpuszczasz świeżego zawodnika?' : 'Czas spojrzeć na ławkę'}</h3>
      <p>Możesz zmienić aktywną postać. Kandydaci pochodzą z tego samego klubu i sezonu; preferowani są zawodnicy, którzy w danych ŁNP faktycznie notowali wejścia z ławki.</p>
      <div class="substitution-current">Na boisku: <strong>${escapeCharacterHtml(active.player)}</strong> · ${escapeCharacterHtml(active.archetype || 'profil RPG')}</div>
      <div class="substitution-options"></div>
      <button type="button" class="substitution-skip">Zostaw ${escapeCharacterHtml(active.player)} na boisku</button>
    </div>`;

  const grid = panel.querySelector('.substitution-options');
  candidates.forEach(candidate => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'substitution-option';
    button.innerHTML = `${characterCardHtml(candidate)}<span class="substitution-candidate-note">${escapeCharacterHtml(substitutionCandidateNote(candidate))}</span><span class="substitution-enter">Wpuść na boisko →</span>`;
    button.addEventListener('click', () => renderSubstitutionQuiz(candidate, band));
    grid.appendChild(button);
  });
  panel.querySelector('.substitution-skip')?.addEventListener('click', () => skipSubstitution(band));
  updateRpgTools();
  renderSubstitutionHud();
  return true;
}

function maybeOfferSubstitution() {
  if (!rpgActive() || state.rpgEnded || state.current || state.rpgSubstitutionPending) return false;
  if (!state.rpgCharacter || !state.rpgCharacterSelected || state.rpgCharacterPending || state.rpgTacticalPending) return false;
  const minute = Number(state.rpgScenarioCurrent?.minute || state.rpgMinute || 0);
  const band = substitutionCore.canOffer({
    minute,
    usedCount: Number(state.rpgSubstitutionHistory?.length || 0),
    resolvedBands: state.rpgSubstitutionResolvedBands || new Set(),
    maxChanges: 2,
  });
  if (!band) return false;
  return showSubstitutionDecision(band);
}

showRpgDecisionStage = function substitutionShowRpgDecisionStage() {
  const result = substitutionBaseShowRpgDecisionStage();
  if (!rpgActive() || state.rpgEnded) return result;
  maybeOfferSubstitution();
  renderSubstitutionHud();
  return result;
};

answer = function substitutionAnswer(button, option) {
  if (!rpgActive()) return substitutionBaseAnswer(button, option);
  const hadEffect = state.rpgSubstitutionEffect ? { ...state.rpgSubstitutionEffect } : null;
  const resolvingMatchAction = Boolean(state.current && state.rpgCurrentAction && !state.rpgAwaitingAction);
  const result = substitutionBaseAnswer(button, option);
  if (resolvingMatchAction && hadEffect) {
    state.rpgSubstitutionEffect = substitutionCore.tickEffect(hadEffect);
    if (!state.rpgSubstitutionEffect) addRpgLog('🔁 Efekt świeżej zmiany wygasa. Dalej liczy się profil zawodnika i taktyka.', '');
    renderSubstitutionHud();
  }
  return result;
};

finishGame = function substitutionFinishGame() {
  const result = substitutionBaseFinishGame();
  if (!rpgActive()) return result;
  const changes = state.rpgSubstitutionHistory || [];
  const answered = Number(state.rpgSubstitutionQuizAnswered || 0);
  const correct = Number(state.rpgSubstitutionQuizCorrect || 0);
  if (changes.length && el('result-details')) {
    el('result-details').textContent += ` · zmiany: ${changes.length}/2 · testy zmian: ${correct}/${answered}`;
  }
  return result;
};

el('game-format')?.addEventListener('change', () => {
  if (currentFormat() === 'match90' && el('format-description')) {
    el('format-description').textContent = 'Wybierasz prawdziwego zawodnika, podejmujesz decyzje taktyczne i możesz robić zmiany. Test wiedzy wpływa na wejście rezerwowego oraz wykonanie kolejnych akcji.';
  }
});

if (currentFormat() === 'match90' && el('format-description')) {
  el('format-description').textContent = 'Wybierasz prawdziwego zawodnika, podejmujesz decyzje taktyczne i możesz robić zmiany. Test wiedzy wpływa na wejście rezerwowego oraz wykonanie kolejnych akcji.';
}
