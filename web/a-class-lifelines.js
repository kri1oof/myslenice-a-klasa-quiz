// A-klasa themed lifelines + runtime sanity pass for squad-count questions.
const aClassLifelinesCore = globalThis.QuestionSanityCore;

function normalizeLoadedQuestions() {
  if (!aClassLifelinesCore || state.aClassQuestionSanityApplied || !Array.isArray(state.all) || !state.all.length) return;
  state.all = aClassLifelinesCore.normalizeQuestions(state.all);
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
    head.innerHTML = '<span>🛟</span><div><strong>A-klasowe koła ratunkowe</strong><small>Po jednym użyciu na mecz</small></div>';
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
    ? '<span class="rpg-lifeline-icon">📣</span><span><strong>Kibic za bramką</strong><small>Podpowiada i odrzuca 2 błędne odpowiedzi</small></span>'
    : '<span class="rpg-lifeline-icon">📣</span><span><strong>Kibic już pomógł</strong><small>To koło zostało wykorzystane</small></span>';
  swap.innerHTML = state.rpgSwapAvailable
    ? '<span class="rpg-lifeline-icon">🧢</span><span><strong>Kierownik drużyny</strong><small>Wyciąga inne pytanie do tej samej akcji</small></span>'
    : '<span class="rpg-lifeline-icon">🧢</span><span><strong>Kierownik już interweniował</strong><small>To koło zostało wykorzystane</small></span>';
}

function rewriteLatestRpgLog(text) {
  if (!Array.isArray(state.rpgLogs) || !state.rpgLogs.length) return;
  const latest = state.rpgLogs[0];
  const minute = String(latest.text || '').match(/^\S+\s/)?.[0] || '';
  latest.text = `${minute}${text}`;
  if (typeof renderRpgLog === 'function') renderRpgLog();
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
    const wasAvailable = Boolean(state.rpgHintAvailable);
    const result = aClassBaseUseRpgHint();
    if (wasAvailable && !state.rpgHintAvailable) {
      rewriteLatestRpgLog('📣 Kibic za bramką podpowiada: dwie błędne odpowiedzi odpadają.');
    }
    renderAClassLifelineButtons();
    return result;
  };
}

if (typeof useRpgQuestionSwap === 'function') {
  const aClassBaseUseRpgQuestionSwap = useRpgQuestionSwap;
  useRpgQuestionSwap = function aClassUseRpgQuestionSwap() {
    const wasAvailable = Boolean(state.rpgSwapAvailable);
    const result = aClassBaseUseRpgQuestionSwap();
    if (wasAvailable && !state.rpgSwapAvailable) {
      rewriteLatestRpgLog('🧢 Kierownik drużyny wyciąga inny protokół: dostajesz nowe pytanie do tej samej akcji.');
    }
    renderAClassLifelineButtons();
    return result;
  };
}

normalizeLoadedQuestions();