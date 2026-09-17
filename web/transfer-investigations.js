// Transfer investigation special round.
// Detects only club changes that can be tied to the same stable ŁNP player id
// in consecutive seasons. It does not claim a specific legal transfer type.
const transferInvestigationCore = globalThis.TransferInvestigationCore;
const transferInvestigationBaseStartGame = startGame;
const transferInvestigationBaseShowQuestion = showQuestion;
const transferInvestigationBaseFinishGame = finishGame;

state.transferInvestigationTransitions = [];
state.transferInvestigationQuestions = [];
state.transferInvestigationStartToken = 0;

function transferInvestigationActive() {
  return currentFormat() === 'special' && el('special-round')?.value === 'transfer';
}

function transferSelectedSeasons() {
  const mode = el('season-mode')?.value || 'all';
  if (mode === 'all') return [];
  const from = el('season-from')?.value;
  if (mode === 'single') return from ? [from] : [];
  const to = el('season-to')?.value;
  const fromIndex = state.seasons.indexOf(from);
  const toIndex = state.seasons.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return [];
  return state.seasons.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
}

function prepareTransferInvestigations() {
  const club = el('scope-mode')?.value === 'club' ? el('club')?.value : null;
  const seasons = transferSelectedSeasons();
  state.transferInvestigationTransitions = transferInvestigationCore.filterTransitions(
    transferInvestigationCore.detectTransitions(state.playerCharacters || []),
    { club: club || null, seasons },
  );
  state.transferInvestigationQuestions = transferInvestigationCore.buildQuestions(
    state.playerCharacters || [],
    { club: club || null, seasons },
  );
  return state.transferInvestigationQuestions;
}

function ensureTransferRoundOption() {
  const special = el('special-round');
  if (special && !special.querySelector('option[value="transfer"]')) {
    const option = document.createElement('option');
    option.value = 'transfer';
    option.textContent = '🕵️ Śledztwo transferowe';
    special.appendChild(option);
  }
}

function transferDescription() {
  return 'Śledź zmiany klubów między sezonami na podstawie stabilnych identyfikatorów zawodników w oficjalnych protokołach ŁNP. Gra pokazuje przynależność klubową w danych, nie rodzaj formalnego transferu.';
}

function updateTransferRoundDescription() {
  if (!transferInvestigationActive()) return;
  if (el('format-description')) el('format-description').textContent = transferDescription();
}

function resetTransferQuiz(questions) {
  const matching = shuffle(questions || []);
  state.availableCount = matching.length;
  state.pool = matching.slice(0, getRequestedQuestionCount(matching.length));
  state.index = 0;
  state.correct = 0;
  state.answered = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.current = null;
  updateScore();
  document.body.classList.remove('rpg-match-active');
  document.body.classList.add('transfer-investigation-active');
  el('match-hud')?.classList.add('hidden');
  el('rpg-board')?.classList.add('hidden');
  el('result')?.classList.add('hidden');
  document.getElementById('transfer-case-file')?.remove();
}

function launchTransferInvestigation() {
  const selectedClub = el('scope-mode')?.value === 'club' ? el('club')?.value : null;
  const questions = prepareTransferInvestigations();
  resetTransferQuiz(questions);

  if (!state.pool.length) {
    el('quiz')?.classList.add('hidden');
    if (el('status')) {
      el('status').textContent = selectedClub
        ? `Brak pewnych zmian klubowych dla ${selectedClub} przy wybranym zakresie sezonów.`
        : 'Brak pewnych zmian klubowych przy wybranym zakresie sezonów. Śledztwa wymagają tego samego identyfikatora ŁNP w dwóch kolejnych sezonach.';
      el('status').classList.remove('hidden');
    }
    return;
  }

  const transitionCount = state.transferInvestigationTransitions.length;
  const scope = selectedClub ? selectedClub : 'cała A-klasa Myślenice';
  if (el('status')) {
    el('status').textContent = `🕵️ Śledztwo transferowe · ${scope} · ${transitionCount} pewnych zmian klubowych · ${state.pool.length} spraw do rozwiązania.`;
    el('status').classList.remove('hidden');
  }
  el('quiz')?.classList.remove('hidden');
  showQuestion();
}

startGame = function transferInvestigationStartGame() {
  document.body.classList.remove('transfer-investigation-active');
  document.getElementById('transfer-case-file')?.remove();
  if (!transferInvestigationActive()) return transferInvestigationBaseStartGame();

  const token = ++state.transferInvestigationStartToken;
  updateTransferRoundDescription();
  if (state.playerCharactersLoaded) return launchTransferInvestigation();

  if (el('status')) {
    el('status').textContent = 'Ładowanie kart zawodników ŁNP i budowanie śledztw transferowych…';
    el('status').classList.remove('hidden');
  }
  return state.playerCharactersReady.then(() => {
    if (token !== state.transferInvestigationStartToken || !transferInvestigationActive()) return;
    launchTransferInvestigation();
  });
};

showQuestion = function transferInvestigationShowQuestion() {
  const result = transferInvestigationBaseShowQuestion();
  if (!transferInvestigationActive() || !state.current?.special || state.current.special.kind !== 'transfer') return result;
  const q = state.current;
  const meta = q.special;
  if (el('question-style')) el('question-style').textContent = '🕵️ AKTA ZAWODNIKA · ŚLEDZTWO TRANSFEROWE';
  if (el('question-type-label')) {
    const labels = {
      from: 'Skąd przyszedł?',
      to: 'Dokąd trafił?',
      route: 'Ścieżka klubowa',
    };
    el('question-type-label').textContent = labels[meta.subtype] || 'Śledztwo transferowe';
  }
  if (el('season')) el('season').textContent = `${meta.fromSeason} → ${meta.toSeason}`;

  const questionBox = el('question');
  if (questionBox) {
    let dossier = document.getElementById('transfer-case-file');
    if (!dossier) {
      dossier = document.createElement('div');
      dossier.id = 'transfer-case-file';
      dossier.className = 'transfer-case-file';
      questionBox.insertAdjacentElement('beforebegin', dossier);
    }
    dossier.innerHTML = `
      <span>SPRAWA ${state.index + 1}/${state.pool.length}</span>
      <strong>${escapeCharacterHtml(meta.player)}</strong>
      <small>${escapeCharacterHtml(meta.fromSeason)} → ${escapeCharacterHtml(meta.toSeason)} · identyfikacja po profilu ŁNP</small>`;
  }
  return result;
};

finishGame = function transferInvestigationFinishGame() {
  const wasTransfer = transferInvestigationActive();
  const transitions = state.transferInvestigationTransitions?.length || 0;
  const result = transferInvestigationBaseFinishGame();
  if (!wasTransfer) return result;
  document.body.classList.remove('transfer-investigation-active');
  document.getElementById('transfer-case-file')?.remove();
  if (el('result-title')) el('result-title').textContent = 'Śledztwo zakończone';
  if (el('result-rank')) {
    const percent = state.pool.length ? Math.round((state.correct / state.pool.length) * 100) : 0;
    const rank = percent >= 80 ? '🕵️ SKAUT Z NOTESEM' : percent >= 50 ? '📋 DOBRY TROP' : '🔎 AKTA DO PONOWNEJ ANALIZY';
    el('result-rank').textContent = rank;
    el('result-rank').classList.remove('hidden');
  }
  if (el('result-details')) {
    el('result-details').textContent += ` · pewne zmiany klubowe w wybranym zakresie: ${transitions}`;
  }
  if (el('status')) el('status').textContent = 'Śledztwo transferowe — akta zamknięte.';
  return result;
};

ensureTransferRoundOption();
el('special-round')?.addEventListener('change', () => {
  document.body.classList.remove('transfer-investigation-active');
  document.getElementById('transfer-case-file')?.remove();
  updateTransferRoundDescription();
});
el('game-format')?.addEventListener('change', () => {
  document.body.classList.remove('transfer-investigation-active');
  document.getElementById('transfer-case-file')?.remove();
  updateTransferRoundDescription();
});
