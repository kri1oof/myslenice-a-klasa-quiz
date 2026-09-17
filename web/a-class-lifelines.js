// A-klasa themed lifelines + runtime sanity pass for squad-count questions.
const aClassLifelinesCore = globalThis.QuestionSanityCore;

function normalizeLoadedQuestions() {
  if (!aClassLifelinesCore || state.aClassQuestionSanityApplied) return;
  state.all = aClassLifelinesCore.normalizeQuestions(state.all || []);
  state.aClassQuestionSanityApplied = true;
}

if (typeof refreshTypeOptions === 'function') {
  const aClassBaseRefreshTypeOptions = refreshTypeOptions;
  refreshTypeOptions = function aClassRefreshTypeOptions() {
    normalizeLoadedQuestions();
    return aClassBaseRefreshTypeOptions();
  };
}

function ensureAClassLifelinesUi() {
  const tools = document.querySelector('.rpg-tools');
  const answers = el('answers');
  if (!tools || !answers) return null;

  tools.id = 'rpg-lifelines';
  tools.classList.add('rpg-lifelines');
  if (!tools.querySelector('.rpg-lifelines-head')) {
    const head = document.createElement('div');
    head.className = 'rpg-lifelines-head';
    head.innerHTML = '<span>🛟</span><div><strong>Koła ratunkowe</strong><small>Po jednym użyciu na mecz</small></div>';
    tools.prepend(head);
  }
  if (tools.parentElement !== answers.parentElement || tools.nextElementSibling !== answers) {
    answers.insertAdjacentElement('beforebegin', tools);
  }
  return tools;
}

function renderAClassLifelineButtons() {
  const tools = ensureAClassLifelinesUi();
  const hint = el('rpg-hint-btn');
  const swap = el('rpg-swap-btn');
  if (!tools || !hint || !swap) return;

  const inQuestion = Boolean(rpgActive() && !state.rpgAwaitingAction && state.current);
  tools.classList.toggle('hidden', !inQuestion);

  hint.classList.add('rpg-lifeline-card');
  swap.classList.add('rpg-lifeline-card');
  hint.innerHTML = state.rpgHintAvailable
    ? '<span class="rpg-lifeline-icon">📣</span><span><strong>Krzyk z ławki</strong><small>Odrzuć 2 błędne odpowiedzi</small></span>'
    : '<span class="rpg-lifeline-icon">📣</span><span><strong>Krzyk wykorzystany</strong><small>To koło już zagrało</small></span>';
  swap.innerHTML = state.rpgSwapAvailable
    ? '<span class="rpg-lifeline-icon">🔁</span><span><strong>Zmiana z ławki</strong><small>Nowe pytanie do tej samej akcji</small></span>'
    : '<span class="rpg-lifeline-icon">🔁</span><span><strong>Zmiana wykorzystana</strong><small>Ławka jest już zamknięta</small></span>';
}

if (typeof ensureRpgUi === 'function') {
  const aClassBaseEnsureRpgUi = ensureRpgUi;
  ensureRpgUi = function aClassEnsureRpgUi() {
    const result = aClassBaseEnsureRpgUi();
    ensureAClassLifelinesUi();
    renderAClassLifelineButtons();
    return result;
  };
}

if (typeof updateRpgTools === 'function') {
  const aClassBaseUpdateRpgTools = updateRpgTools;
  updateRpgTools = function aClassUpdateRpgTools() {
    const result = aClassBaseUpdateRpgTools();
    renderAClassLifelineButtons();
    return result;
  };
}

if (typeof useRpgHint === 'function') {
  const aClassBaseUseRpgHint = useRpgHint;
  useRpgHint = function aClassUseRpgHint() {
    const result = aClassBaseUseRpgHint();
    const phase = el('phase-card');
    if (phase && !phase.classList.contains('hidden')) {
      phase.textContent = '📣 Krzyk z ławki: dwie błędne odpowiedzi odpadają.';
    }
    renderAClassLifelineButtons();
    return result;
  };
}

if (typeof useRpgQuestionSwap === 'function') {
  const aClassBaseUseRpgQuestionSwap = useRpgQuestionSwap;
  useRpgQuestionSwap = function aClassUseRpgQuestionSwap() {
    const result = aClassBaseUseRpgQuestionSwap();
    renderAClassLifelineButtons();
    return result;
  };
}

normalizeLoadedQuestions();