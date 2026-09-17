// Focused UX layer: keep every mechanic, show only what matters at the current step.
const UX_SEASON_MODES = new Set(['career', 'president']);

function uxMode() { return el('game-format')?.value || null; }
function uxModeMeta(mode = uxMode()) {
  return ({
    career:{ label:'Kariera — cały sezon', settings:'Ustawienia kariery', instruction:'Wybierz klub i sezon. Zakres ligi ustawiamy automatycznie.' },
    president:{ label:'Tryb prezesa', settings:'Ustawienia prezesa', instruction:'Wybierz klub i sezon. Budżet i decyzje pojawią się w trakcie kariery.' },
    match90:{ label:'Symulowany mecz RPG', settings:'Ustawienia meczu', instruction:'Ustaw zakres, klub i sezon, a potem rozpocznij mecz.' },
    special:{ label:'Runda specjalna', settings:'Ustawienia rundy', instruction:'Wybierz typ rundy i zakres pytań.' },
    quick:{ label:'Szybki quiz', settings:'Ustawienia quizu', instruction:'Ustaw zakres i długość serii pytań.' },
  })[mode] || { label:'Rozgrywka', settings:'Ustawienia gry', instruction:'Ustaw parametry i rozpocznij grę.' };
}

function uxGroupLandingModes() {
  const grid = document.querySelector('#landing-screen .mode-grid');
  if (!grid) return;
  let season = grid.querySelector('.ux-mode-group[data-group="season"]');
  let single = grid.querySelector('.ux-mode-group[data-group="single"]');
  if (!season) {
    season = document.createElement('section');
    season.className = 'ux-mode-group';
    season.dataset.group = 'season';
    season.innerHTML = '<div class="ux-mode-heading"><strong>Sezon i klub</strong><small>Dłuższa rozgrywka</small></div><div class="ux-mode-cards"></div>';
    grid.prepend(season);
  }
  if (!single) {
    single = document.createElement('section');
    single.className = 'ux-mode-group';
    single.dataset.group = 'single';
    single.innerHTML = '<div class="ux-mode-heading"><strong>Jedna rozgrywka</strong><small>Mecz albo quiz</small></div><div class="ux-mode-cards"></div>';
    grid.append(single);
  }
  [...grid.querySelectorAll('.mode-card')].forEach(card => {
    const group = UX_SEASON_MODES.has(card.dataset.mode) ? season : single;
    const target = group.querySelector('.ux-mode-cards');
    if (card.parentElement !== target) target.appendChild(card);
  });
}

function uxSetupSummary() {
  if (!UX_SEASON_MODES.has(uxMode())) return typeof setupSummaryText === 'function' ? setupSummaryText() : '';
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
  el('scope-mode')?.closest('label')?.classList.toggle('ux-auto-hidden', seasonMode);
  el('season-mode')?.closest('label')?.classList.toggle('ux-auto-hidden', seasonMode);

  const settings = el('match-settings');
  const title = settings?.querySelector('summary strong');
  const titleText = `⚙️ ${meta.settings}`;
  if (title && title.textContent !== titleText) title.textContent = titleText;
  const summary = el('match-settings-summary');
  const summaryText = uxSetupSummary();
  if (summary && summary.textContent !== summaryText) summary.textContent = summaryText;

  const guide = uxEnsureSetupGuide();
  const guideKey = `${mode}|${meta.label}|${meta.instruction}`;
  if (guide && guide.dataset.uxKey !== guideKey) {
    guide.dataset.uxKey = guideKey;
    guide.innerHTML = `<span>TERAZ</span><div><strong>${meta.label}</strong><small>${meta.instruction}</small></div>`;
  }
  if (seasonMode && !frontGameStarted && settings) settings.open = true;
  if (seasonMode && el('advanced-options')) el('advanced-options').open = false;
}

function uxCareerHudPlacement() {
  const hud = el('rpg-season-career-hud');
  const scenario = el('rpg-scenario-hud');
  const drawer = el('rpg-context-drawer');
  if (!hud || hud.classList.contains('hidden') || !scenario) return;
  if (scenario.nextElementSibling !== hud) scenario.insertAdjacentElement('afterend', hud);
  if (drawer && hud.nextElementSibling !== drawer) hud.insertAdjacentElement('afterend', drawer);
}

function uxRefreshContextCount() {
  const content = el('rpg-context-content');
  const count = el('rpg-context-count');
  const drawer = el('rpg-context-drawer');
  if (!content || !count || !drawer) return;
  const visible = [...content.children].filter(node => !node.classList.contains('hidden'));
  const text = visible.length ? `${visible.length}` : '—';
  if (count.textContent !== text) count.textContent = text;
  const empty = visible.length === 0;
  if (drawer.classList.contains('empty') !== empty) drawer.classList.toggle('empty', empty);
}

function uxCollapseCareerTables(root = document) {
  root.querySelectorAll?.('.career-table-wrap:not([data-ux-collapsed])').forEach(table => {
    table.dataset.uxCollapsed = '1';
    const own = table.querySelector('.career-own-row');
    const pos = own?.querySelector('td:first-child')?.textContent?.trim();
    const pts = own?.querySelector('td:last-child')?.textContent?.trim();
    const details = document.createElement('details');
    details.className = 'career-table-details';
    details.innerHTML = `<summary><span><strong>📊 Tabela ligi</strong><small>${pos ? `${pos}. miejsce` : 'Pozycja klubu'}${pts ? ` · ${pts} pkt` : ''}</small></span><em>Pokaż</em></summary>`;
    table.parentNode.insertBefore(details, table);
    details.appendChild(table);
    details.addEventListener('toggle', () => {
      const toggle = details.querySelector('summary em');
      const text = details.open ? 'Ukryj' : 'Pokaż';
      if (toggle && toggle.textContent !== text) toggle.textContent = text;
    });
  });
}

function uxAverageTrust(grid) {
  const values = [...grid.querySelectorAll('.president-trust-row > strong')].map(n => Number(n.textContent)).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((a,b) => a + b, 0) / values.length) : null;
}

function uxCollapsePresidentTrust(root = document) {
  root.querySelectorAll?.('.president-trust-grid:not([data-ux-collapsed]), .president-report-trust:not([data-ux-collapsed])').forEach(grid => {
    grid.dataset.uxCollapsed = '1';
    const avg = uxAverageTrust(grid);
    const details = document.createElement('details');
    details.className = 'president-trust-details';
    details.innerHTML = `<summary><span><strong>👥 Zaufanie grup</strong><small>${avg == null ? 'Szatnia · trener · kibice · sponsorzy' : `średnio ${avg}/100`}</small></span><em>Pokaż</em></summary>`;
    grid.parentNode.insertBefore(details, grid);
    details.appendChild(grid);
    details.addEventListener('toggle', () => {
      const toggle = details.querySelector('summary em');
      const text = details.open ? 'Ukryj' : 'Pokaż';
      if (toggle && toggle.textContent !== text) toggle.textContent = text;
    });
  });
}

function uxPolishPresidentOptions(root = document) {
  const grid = root.querySelector?.('.president-options');
  if (!grid || grid.dataset.uxPolished === '1') return;
  grid.dataset.uxPolished = '1';
  const heading = document.createElement('div');
  heading.className = 'president-options-heading';
  heading.innerHTML = '<strong>Wybierz jedną decyzję</strong><small>Najpierw decyzja. Szczegółowy wpływ możesz rozwinąć osobno.</small>';
  grid.insertAdjacentElement('beforebegin', heading);

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
    unavailable?.classList.add('president-option-unavailable');
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
  const base = renderPresidentDecision;
  renderPresidentDecision = function(decision) { const result = base(decision); uxPolishPresidentDecision(); return result; };
}
if (typeof renderPresidentRoundOutcome === 'function') {
  const base = renderPresidentRoundOutcome;
  renderPresidentRoundOutcome = function(context) { const result = base(context); uxPolishPresidentReports(); return result; };
}
if (typeof renderPresidentSeasonFinal === 'function') {
  const base = renderPresidentSeasonFinal;
  renderPresidentSeasonFinal = function() { const result = base(); uxPolishPresidentReports(); return result; };
}
if (typeof renderCareerRoundResult === 'function') {
  const base = renderCareerRoundResult;
  renderCareerRoundResult = function(...args) { const result = base(...args); uxCollapseCareerTables(el('career-round-summary') || document); return result; };
}
if (typeof renderSeasonCareerFinal === 'function') {
  const base = renderSeasonCareerFinal;
  renderSeasonCareerFinal = function() { const result = base(); uxCollapseCareerTables(el('career-round-summary') || document); uxPolishPresidentReports(); return result; };
}

const uxBaseRenderRpgBoard = renderRpgBoard;
renderRpgBoard = function() { const result = uxBaseRenderRpgBoard(); uxPolishRpgBoard(); return result; };

['game-format','scope-mode','club','season-mode','season-from','season-to','game-style'].forEach(id => {
  el(id)?.addEventListener('change', () => requestAnimationFrame(uxSyncSetup));
});

uxSyncSetup();
uxGroupLandingModes();
let uxObserverBusy = false;
const uxObserver = new MutationObserver(() => {
  if (uxObserverBusy) return;
  uxObserverBusy = true;
  try {
    uxGroupLandingModes();
    uxPolishPresidentDecision();
    uxPolishPresidentReports();
    uxCollapseCareerTables(document);
    uxPolishRpgBoard();
  } finally {
    queueMicrotask(() => { uxObserverBusy = false; });
  }
});
uxObserver.observe(document.body, { childList:true, subtree:true });
