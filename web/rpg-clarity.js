// Final Match RPG UX layer: keep the current decision prominent and secondary systems out of the way.
const clarityBaseEnsureRpgUi = ensureRpgUi;
const clarityBaseRenderRpgBoard = renderRpgBoard;
const clarityBaseRenderRpgLog = renderRpgLog;
const clarityBaseShowQuestion = showQuestion;

function ensureRpgLogDrawer() {
  const board = el('rpg-board');
  const log = el('rpg-log');
  if (!board || !log) return null;

  let drawer = el('rpg-log-drawer');
  if (!drawer) {
    drawer = document.createElement('details');
    drawer.id = 'rpg-log-drawer';
    drawer.className = 'rpg-log-drawer hidden';
    drawer.innerHTML = '<summary><strong>📝 Ostatnie akcje</strong><span id="rpg-log-count">0 wpisów</span></summary>';
    log.parentNode.insertBefore(drawer, log);
    drawer.appendChild(log);
  }
  return drawer;
}

function updateRpgLogDrawer() {
  const drawer = ensureRpgLogDrawer();
  const log = el('rpg-log');
  if (!drawer || !log) return;
  const count = log.children.length;
  const label = el('rpg-log-count');
  if (label) label.textContent = count === 1 ? '1 wpis' : `${count} wpisów`;
  drawer.classList.toggle('hidden', count === 0);
  if (count === 0) drawer.open = false;
}

function ensureRpgQuestionFocusNote() {
  const question = el('question');
  if (!question || el('rpg-question-focus-note')) return;
  const note = document.createElement('div');
  note.id = 'rpg-question-focus-note';
  note.className = 'rpg-question-focus-note';
  note.innerHTML = '<strong>TEST AKCJI</strong><span>Odpowiedź rozstrzyga powodzenie wybranego zagrania.</span>';
  question.insertAdjacentElement('beforebegin', note);
}

function organizeRpgClarityLayout() {
  const board = el('rpg-board');
  if (!board || !rpgActive()) return;

  ensureRpgLogDrawer();
  ensureRpgQuestionFocusNote();

  const narratorLabel = el('rpg-narrator')?.querySelector('small');
  if (narratorLabel) narratorLabel.textContent = 'Sytuacja na boisku';

  // History and system context are useful, but never more important than the next decision.
  const logDrawer = el('rpg-log-drawer');
  const contextDrawer = el('rpg-context-drawer');
  if (logDrawer) board.appendChild(logDrawer);
  if (contextDrawer) board.appendChild(contextDrawer);
}

ensureRpgUi = function clarityEnsureRpgUi() {
  const result = clarityBaseEnsureRpgUi();
  organizeRpgClarityLayout();
  return result;
};

renderRpgLog = function clarityRenderRpgLog() {
  const result = clarityBaseRenderRpgLog();
  updateRpgLogDrawer();
  return result;
};

renderRpgBoard = function clarityRenderRpgBoard() {
  const result = clarityBaseRenderRpgBoard();
  organizeRpgClarityLayout();
  updateRpgLogDrawer();
  return result;
};

showQuestion = function clarityShowQuestion() {
  const result = clarityBaseShowQuestion();
  if (rpgActive()) {
    organizeRpgClarityLayout();
    requestAnimationFrame(() => {
      const question = el('question');
      if (!question || question.classList.contains('hidden')) return;
      question.setAttribute('tabindex', '-1');
      question.focus({ preventScroll: true });
      question.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }
  return result;
};

requestAnimationFrame(() => {
  if (rpgActive()) organizeRpgClarityLayout();
});
