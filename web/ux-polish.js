// Focused UX layer: keep every mechanic, show only what matters at the current step.
const UX_SEASON_MODES = new Set(['career', 'president']);

function uxMode() {
  return el('game-format')?.value || null;
}

function uxModeMeta(mode = uxMode()) {
  const map = {
    career: { label:'Kariera — cały sezon', settings:'Ustawienia kariery', instruction:'Wybierz klub i sezon. Zakres ligi ustawiamy automatycznie.' },
    president: { label:'Tryb prezesa', settings:'Ustawienia prezesa', instruction:'Wybierz klub i sezon. Budżet i decyzje pojawią się w trakcie kariery.' },
    match90: { label:'Symulowany mecz RPG', settings:'Ustawienia meczu', instruction:'Ustaw zakres, klub i sezon, a potem rozpocznij mecz.' },
    special: { label:'Runda specjalna', settings:'Ustawienia rundy', instruction:'Wybierz typ rundy i zakres pytań.' },
    quick: { label:'Szybki quiz', settings:'Ustawienia quizu', instruction:'Ustaw zakres i długość serii pytań.' },
  };
  return map[mode] || map.match90;
}

function uxGroupLandingModes() {
  const grid = document.querySelector('#landing-screen .mode-grid');
  if (!grid) return;

  let seasonGroup = grid.querySelector('.ux-mode-group[data-group="season"]');
  let singleGroup = grid.querySelector('.ux-mode-group[data-group="single"]');
  if (!seasonGroup) {
    seasonGroup = document.createElement('section');
    seasonGroup.className = 'ux-mode-group';
    seasonGroup.dataset.group = 'season';
    seasonGroup.innerHTML = '<div class="ux-mode-heading"><strong>Sezon i klub</strong><small>Dłuższa rozgrywka</small></div><div class="ux-mode-cards"></div>';
    grid.prepend(seasonGroup);
  }
  if (!singleGroup) {
    singleGroup = document.createElement('section');
    singleGroup.className = 'ux-mode-group';
    singleGroup.dataset.group = 'single';
    singleGroup.innerHTML = '<div class="ux-mode-heading"><strong>Jedna rozgrywka</strong><small>Mecz albo quiz</small></div><div class="ux-mode-cards"></div>';
    grid.append(singleGroup);
  }

  [...grid.querySelectorAll('.mode-card')].forEach(card => {
    const mode = card.dataset.mode;
    const target = UX_SEASON_MODES.has(mode) ? seasonGroup.querySelector('.ux-mode-cards') : singleGroup.querySelector('.ux-mode-cards');
    if (card.parentElement !== target) target.appendChild(card);
  });
}

function uxSetupSummary() {
  const mode = uxMode();
  if (!UX_SEASON_MODES.has(mode)) {
    return typeof setupSummaryText === 'function' ? setupSummaryText() : '';
  }
  const club = el('club')?.selectedOptions?.[0]?.textContent?.trim() || 'wybierz klub';
  const season = el('season-from')?.selectedOptions?.[0]?.textContent?.trim() || 'wybierz sezon';
  const style = el('game-style')?.selectedOptions?.[0]?.textContent?.trim() || 'Stadionowa';
  return `${club} · ${season} · ${style}`;
}

function uxEnsureSetupGuide() {
  const settings = el('match-settings');
  if (!settings) return null;
  let guide = el('ux-setup-guide');
  if (!guide) {
    guide = document.createElement('div');
    guide.id = 'ux-setup-guide';
    guide.className = 'ux-setup-guide';
    settings.insertAdjacentElement('beforebegin', guide);
  }
  return guide;
}

function uxSyncSetup() {
  const mode = uxMode();
  const meta = uxModeMeta(mode);
  const seasonMode = UX_SEASON_MODES.has(mode);
  document.body.classList.toggle('ux-season-mode', seasonMode);
  document.body.classList.toggle('ux-president-mode', mode === 'president');
  document.body.classList.toggle('ux-career-mode', mode === 'career');

  const scopeLabel = el('scope-mode')?.closest('label');
  const seasonModeLabel = el('season-mode')?.closest('label');
  scopeLabel?.classList.toggle('ux-auto-hidden', seasonMode);
  seasonModeLabel?.classList.toggle('ux-auto-hidden', seasonMode);

  const settings = el('match-settings');
  const title = settings?.querySelector('summary strong');
  if (title) title.textContent = `⚙️ ${meta.settings}`;
  const summary = el('match-settings-summary');
  if (summary) summary.textContent = uxSetupSummary();

  const guide = uxEnsureSetupGuide();
  if (guide) {
    guide.innerHTML = `<span>TERAZ</span><div><strong>${meta.label}</strong><small>${meta.instruction}</small></div>`;
  }

  if (seasonMode && !frontGameStarted && settings) settings.open = true;
  const advanced = el('advanced-options');
  if (advanced && seasonMode) advanced.open = false;
}

function uxCareerHudPlacement() {
  const hud = el('rpg-season-career-hud');
  const scenario = el('rpg-scenario-hud');
  const drawer = el('rpg-context-drawer');
  if (!hud || hud.classList.contains('hidden') || !scenario) return;
  scenario.insertAdjacentElement('afterend', hud);
  if (drawer) hud.insertAdjacentElement('afterend', drawer);
}

function uxRefreshContextCount() {
  const content = el('rpg-context-content');
  const count = el('rpg-context-count');
  const drawer = el('rpg-context-drawer');
  if (!content || !count || !drawer) return;
  const visible = [...content.children].filter(node => !node.classList.contains('hidden'));
  count.textContent = visible.length ? `${visible.length}` : '—';
  drawer.classList.toggle('empty', visible.length === 0);
}

function uxCollapseCareerTables(root = document) {
  root.querySelectorAll?.('.career-table-wrap:not([data-ux-collapsed])').forEach(tableWrap => {
    tableWrap.dataset.uxCollapsed = '1';
    const details = document.createElement('details');
    details.className = 'career-table-details';
    const own = tableWrap.querySelector('.career-own-row');
    const pos = own?.querySelector('td:first-child')?.textContent?.trim();
    const pts = own?.querySelector('td:last-child')?.textContent?.trim();
    details.innerHTML = `<summary><span><strong>📊 Tabela ligi</strong><small>${pos ? `${pos}. miejsce` : 'Pozycja klubu'}${pts ? ` · ${pts} pkt` : ''}</small></span><em>Pokaż</em></summary>`;
    tableWrap.parentNode.insertBefore(details, tableWrap);
    details.appendChild(tableWrap);
    details.addEventListener('toggle', () => {
      const toggle = details.querySelector('summary em');
      if (toggle) toggle.textContent = details.open ? 'Ukryj' : 'Pokaż';
    });
  });
}

function uxAverageTrust(grid) {
  const values = [...grid.querySelectorAll('.president-trust-row > strong')]
    .map(node => Number(node.textContent))
    .filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function uxCollapsePresidentTrust(root = document) {
  root.querySelectorAll?.('.president-trust-grid:not([data-ux-collapsed]), .president-report-trust:not([data-ux-collapsed])').forEach(grid => {
    grid.dataset.uxCollapsed = '1';
    const details = document.createElement('details');
    details.className = 'president-trust-details';
    const average = uxAverageTrust(grid);
    details.innerHTML = `<summary><span><strong>👥 Zaufanie grup</strong><small>${average == null ? 'Szatnia · trener · kibice · sponsorzy' : `średnio ${average}/100`}</small></span><em>Pokaż</em></summary>`;
    grid.parentNode.insertBefore(details, grid);
    details.appendChild(grid);
    details.addEventListener('toggle', () => {
      const toggle = details.querySelector('summary em');
      if (toggle) toggle.textContent = details.open ? 'Ukryj' : 'Pokaż';
    });
  });
}

function uxPolishPresidentOptions(root = document) {
  const grid = root.querySelector?.('.president-options');
  if (!grid || grid.dataset.uxPolished === '1') return;
  grid.dataset.uxPolished = '1';
  if (!grid.previousElementSibling?.classList?.contains('president-options-heading')) {
    const heading = document.createElement('div');
    heading.className = 'president-options-heading';
    heading.innerHTML = '<strong>Wybierz jedną decyzję</strong><small>Najpierw decyzja. Szczegółowy wpływ możesz rozwinąć osobno.</small>';
    grid.insertAdjacentElement('beforebegin', heading);
  }

  [...grid.querySelectorAll(':scope > .president-option')].forEach(button => {
    const preview = button.querySelector('small');
    const unavailable = button.querySelector('em');
    const wrap = document.createElement('div');
    wrap.className = 'president-option-wrap';
    button.parentNode.insertBefore(wrap, button);
    wrap.appendChild(button);

    if (!button.disabled) {
      const cta = document.createElement('b');
      cta.className = 'president-option-cta';
      cta.textContent = 'Wybierz →';
      button.appendChild(cta);
    }
    if (unavailable) unavailable.classList.add('president-option-unavailable');
    if (preview) {
      const details = document.createElement('details');
      details.className = 'president-option-details';
      details.innerHTML = '<summary>Skutki decyzji</summary>';
      details.appendChild(preview);
      wrap.appendChild(details);
    }
  });
}

function uxPolishPresidentDecision() {
  const panel = el('president-decision-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  uxCollapsePresidentTrust(panel);
  uxPolishPresidentOptions(panel);
}

function uxPolishPresidentReports() {
  const box = el('career-round-summary');
  if (!box) return;
  uxCollapsePresidentTrust(box);
  uxCollapseCareerTables(box);
}

function uxPolishRpgBoard() {
  uxCareerHudPlacement();
  uxRefreshContextCount();
  const drawer = el('rpg-context-drawer');
  if (drawer && !drawer.dataset.uxHinted) {
    drawer.dataset.uxHinted = '1';
    const helper = drawer.querySelector('summary small');
    if (helper) helper.textContent = 'dodatkowe informacje — otwórz tylko gdy potrzebujesz';
  }
}

if (typeof renderPresidentDecision === 'function') {
  const uxBaseRenderPresidentDecision = renderPresidentDecision;
  renderPresidentDecision = function uxRenderPresidentDecision(decision) {
    const result = uxBaseRenderPresidentDecision(decision);
    uxPolishPresidentDecision();
    return result;
  };
}

if (typeof renderPresidentRoundOutcome === 'function') {
  const uxBasePresidentRoundOutcome = renderPresidentRoundOutcome;
  renderPresidentRoundOutcome = function uxPresidentRoundOutcome(context) {
    const result = uxBasePresidentRoundOutcome(context);
    uxPolishPresidentReports();
    return result;
  };
}

if (typeof renderPresidentSeasonFinal === 'function') {
  const uxBasePresidentSeasonFinal = renderPresidentSeasonFinal;
  renderPresidentSeasonFinal = function uxPresidentSeasonFinal() {
    const result = uxBasePresidentSeasonFinal();
    uxPolishPresidentReports();
    return result;
  };
}

if (typeof renderCareerRoundResult === 'function') {
  const uxBaseCareerRoundResult = renderCareerRoundResult;
  renderCareerRoundResult = function uxCareerRoundResult(...args) {
    const result = uxBaseCareerRoundResult(...args);
    uxCollapseCareerTables(el('career-round-summary') || document);
    return result;
  };
}

if (typeof renderSeasonCareerFinal === 'function') {
  const uxBaseCareerFinal = renderSeasonCareerFinal;
  renderSeasonCareerFinal = function uxCareerFinal() {
    const result = uxBaseCareerFinal();
    uxCollapseCareerTables(el('career-round-summary') || document);
    uxPolishPresidentReports();
    return result;
  };
}

const uxBaseRenderRpgBoard = renderRpgBoard;
renderRpgBoard = function uxRenderRpgBoard() {
  const result = uxBaseRenderRpgBoard();
  uxPolishRpgBoard();
  return result;
};

['game-format', 'scope-mode', 'club', 'season-mode', 'season-from', 'season-to', 'game-style'].forEach(id => {
  el(id)?.addEventListener('change', () => requestAnimationFrame(uxSyncSetup));
});

uxSyncSetup();
uxGroupLandingModes();
const uxObserver = new MutationObserver(() => {
  uxGroupLandingModes();
  uxPolishPresidentDecision();
  uxPolishPresidentReports();
  uxCollapseCareerTables(document);
  uxPolishRpgBoard();
});
uxObserver.observe(document.body, { childList:true, subtree:true });
