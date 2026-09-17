// Final UI pass: reduce visual noise without removing mechanics.
// Loaded last so it can collect HUDs created by every Match RPG layer.
const readabilityBaseEnsureRpgUi = ensureRpgUi;
const readabilityBaseRenderRpgBoard = renderRpgBoard;
const readabilityBaseShowQuestion = showQuestion;
const readabilityBaseShowRpgDecisionStage = showRpgDecisionStage;

function secondaryHudNodes() {
  const board = el('rpg-board');
  if (!board) return [];
  return [...board.querySelectorAll(':scope > [id^="rpg-"][id$="-hud"]')]
    .filter(node => !['rpg-scenario-hud', 'rpg-context-drawer'].includes(node.id));
}

function ensureContextDrawer() {
  const board = el('rpg-board');
  if (!board) return null;
  let drawer = el('rpg-context-drawer');
  if (!drawer) {
    drawer = document.createElement('details');
    drawer.id = 'rpg-context-drawer';
    drawer.className = 'rpg-context-drawer';
    drawer.innerHTML = `
      <summary>
        <span><strong>⚙️ Kontekst meczu</strong><small>postać, forma, presja, taktyka, eventy i karty</small></span>
        <em id="rpg-context-count">0</em>
      </summary>
      <div id="rpg-context-content" class="rpg-context-content"></div>`;
    const scenario = el('rpg-scenario-hud');
    if (scenario) scenario.insertAdjacentElement('afterend', drawer);
    else board.querySelector('.rpg-score-row')?.insertAdjacentElement('afterend', drawer);
  }
  return drawer;
}

function organizeRpgContext() {
  if (!rpgActive()) return;
  const drawer = ensureContextDrawer();
  const content = el('rpg-context-content');
  if (!drawer || !content) return;

  secondaryHudNodes().forEach(node => content.appendChild(node));
  const panels = [...content.children].filter(node => !node.classList.contains('hidden'));
  const count = el('rpg-context-count');
  if (count) count.textContent = panels.length ? `${panels.length}` : '—';
  drawer.classList.toggle('empty', panels.length === 0);

  const urgent = Boolean(
    state.rpgSubstitutionPending ||
    state.rpgTacticalDecisionPending ||
    state.rpgAClassPrematchPending ||
    state.rpgPowerupPending
  );
  if (urgent) drawer.open = true;
}

function updateStageClass() {
  if (!rpgActive()) {
    document.body.classList.remove('rpg-decision-stage', 'rpg-question-stage');
    return;
  }
  document.body.classList.toggle('rpg-decision-stage', Boolean(state.rpgAwaitingAction));
  document.body.classList.toggle('rpg-question-stage', Boolean(!state.rpgAwaitingAction && state.current));
}

ensureRpgUi = function readabilityEnsureRpgUi() {
  readabilityBaseEnsureRpgUi();
  ensureContextDrawer();
  organizeRpgContext();
};

renderRpgBoard = function readabilityRenderRpgBoard() {
  readabilityBaseRenderRpgBoard();
  organizeRpgContext();
  updateStageClass();
};

showQuestion = function readabilityShowQuestion() {
  const result = readabilityBaseShowQuestion();
  organizeRpgContext();
  updateStageClass();
  return result;
};

showRpgDecisionStage = function readabilityShowRpgDecisionStage() {
  const result = readabilityBaseShowRpgDecisionStage();
  organizeRpgContext();
  updateStageClass();
  return result;
};

function setupSummaryText() {
  const scope = el('scope-mode')?.selectedOptions?.[0]?.textContent?.trim() || 'Cała liga';
  const seasonMode = el('season-mode')?.value || 'all';
  let season = 'wszystkie sezony';
  if (seasonMode === 'single') season = el('season-from')?.selectedOptions?.[0]?.textContent?.trim() || 'jeden sezon';
  if (seasonMode === 'range') {
    const from = el('season-from')?.selectedOptions?.[0]?.textContent?.trim() || '?';
    const to = el('season-to')?.selectedOptions?.[0]?.textContent?.trim() || '?';
    season = `${from}–${to}`;
  }
  const style = el('game-style')?.selectedOptions?.[0]?.textContent?.trim() || 'Stadionowa';
  return `${scope} · ${season} · ${style}`;
}

function updateSetupSummary() {
  const summary = el('match-settings-summary');
  if (summary) summary.textContent = setupSummaryText();
}

['scope-mode', 'club', 'season-mode', 'season-from', 'season-to', 'game-style'].forEach(id => {
  el(id)?.addEventListener('change', updateSetupSummary);
});
updateSetupSummary();
