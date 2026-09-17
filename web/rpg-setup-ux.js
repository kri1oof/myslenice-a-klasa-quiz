// RPG pre-match setup: club first, chosen seasons second, full league as an explicit option.
const RPG_SETUP_MODE = 'match90';
let rpgSetupDefaultsApplied = false;
let rpgSetupWasVisible = false;
let rpgSetupNonRpgSnapshot = null;
let rpgSetupPreferences = null;

function rpgSetupModeActive() {
  return el('game-format')?.value === RPG_SETUP_MODE;
}

function rpgSetupVisible() {
  const chosen = typeof frontModeChosen === 'undefined' ? true : Boolean(frontModeChosen);
  return rpgSetupModeActive() && chosen;
}

function rpgSetupLatestSeason() {
  if (Array.isArray(state.seasons) && state.seasons.length) return state.seasons[state.seasons.length - 1];
  const values = [...(el('season-from')?.options || [])].map(option => option.value).filter(Boolean);
  return values.length ? values[values.length - 1] : '';
}

function rpgSetupCaptureValues() {
  return {
    scope: el('scope-mode')?.value || 'league',
    club: el('club')?.value || '',
    seasonMode: el('season-mode')?.value || 'all',
    seasonFrom: el('season-from')?.value || '',
    seasonTo: el('season-to')?.value || '',
    style: el('game-style')?.value || 'stadium',
    settingsOpen: Boolean(el('match-settings')?.open),
  };
}

function rpgSetupOptionExists(select, value) {
  return Boolean(select && [...select.options].some(option => option.value === value));
}

function rpgSetupApplyValues(values) {
  if (!values) return;
  const scope = el('scope-mode');
  const club = el('club');
  const seasonMode = el('season-mode');
  const seasonFrom = el('season-from');
  const seasonTo = el('season-to');
  const style = el('game-style');

  if (rpgSetupOptionExists(scope, values.scope)) scope.value = values.scope;
  if (rpgSetupOptionExists(club, values.club)) club.value = values.club;
  else if (values.club === '' && club?.querySelector('option[value=""]')) club.value = '';
  if (rpgSetupOptionExists(seasonMode, values.seasonMode)) seasonMode.value = values.seasonMode;
  if (rpgSetupOptionExists(seasonFrom, values.seasonFrom)) seasonFrom.value = values.seasonFrom;
  if (rpgSetupOptionExists(seasonTo, values.seasonTo)) seasonTo.value = values.seasonTo;
  if (rpgSetupOptionExists(style, values.style)) style.value = values.style;
  if (typeof updateScopeControls === 'function') updateScopeControls();
  if (typeof updateSeasonControls === 'function') updateSeasonControls();
}

function rpgSetupSetLabelTitle(label, text) {
  if (!label) return;
  const node = [...label.childNodes].find(item => item.nodeType === Node.TEXT_NODE && item.textContent.trim());
  if (node) node.textContent = `${text}\n`;
}

function rpgSetupRestoreGenericLabels() {
  rpgSetupSetLabelTitle(el('club-label'), 'Drużyna');
  rpgSetupSetLabelTitle(el('season-mode')?.closest('label'), 'Sezony');
  rpgSetupSetLabelTitle(el('season-from-label'), 'Od sezonu');
  rpgSetupSetLabelTitle(el('season-to-label'), 'Do sezonu');
  rpgSetupSetLabelTitle(el('scope-mode')?.closest('label'), 'Zakres gry');
  rpgSetupSetLabelTitle(el('game-style')?.closest('label'), 'Oprawa');

  const scope = el('scope-mode');
  const seasonMode = el('season-mode');
  const league = scope?.querySelector('option[value="league"]');
  const club = scope?.querySelector('option[value="club"]');
  if (league) league.textContent = 'Cała liga';
  if (club) club.textContent = 'Tylko mój klub';
  if (league && club) {
    scope.appendChild(league);
    scope.appendChild(club);
  }
  const all = seasonMode?.querySelector('option[value="all"]');
  const single = seasonMode?.querySelector('option[value="single"]');
  const range = seasonMode?.querySelector('option[value="range"]');
  if (all) all.textContent = 'Wszystkie sezony';
  if (single) single.textContent = 'Jeden sezon';
  if (range) range.textContent = 'Przedział sezonów';
  [all, single, range].filter(Boolean).forEach(option => seasonMode.appendChild(option));
}

function rpgSetupEnsureClubPlaceholder(selectBlank = false) {
  const club = el('club');
  if (!club) return;
  let placeholder = club.querySelector('option[data-rpg-placeholder="1"]');
  if (!placeholder) {
    placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.dataset.rpgPlaceholder = '1';
    placeholder.textContent = 'Wybierz swoją drużynę';
    club.prepend(placeholder);
  }
  if (selectBlank) club.value = '';
}

function rpgSetupRemoveClubPlaceholder() {
  const club = el('club');
  if (!club) return;
  club.querySelector('option[data-rpg-placeholder="1"]')?.remove();
  if (!club.value && club.options.length) club.selectedIndex = 0;
}

function rpgSetupPolishOptions() {
  const scope = el('scope-mode');
  const seasonMode = el('season-mode');
  if (scope) {
    const clubOption = scope.querySelector('option[value="club"]');
    const leagueOption = scope.querySelector('option[value="league"]');
    if (clubOption) clubOption.textContent = 'Moja drużyna';
    if (leagueOption) leagueOption.textContent = 'Cała A-klasa Myślenice';
    if (clubOption && leagueOption && clubOption.nextElementSibling !== leagueOption) {
      scope.insertBefore(clubOption, leagueOption);
    }
  }
  if (seasonMode) {
    const single = seasonMode.querySelector('option[value="single"]');
    const range = seasonMode.querySelector('option[value="range"]');
    const all = seasonMode.querySelector('option[value="all"]');
    if (single) single.textContent = 'Jeden wybrany sezon';
    if (range) range.textContent = 'Zakres sezonów';
    if (all) all.textContent = 'Wszystkie dostępne sezony';
    [single, range, all].filter(Boolean).forEach(option => seasonMode.appendChild(option));
  }
}

function rpgSetupEnsureHeading() {
  const grid = el('match-settings')?.querySelector('.match-settings-grid');
  if (!grid) return null;
  let heading = el('rpg-setup-heading');
  if (!heading) {
    heading = document.createElement('div');
    heading.id = 'rpg-setup-heading';
    heading.className = 'rpg-setup-heading';
    heading.innerHTML = `
      <div>
        <span>USTAW MECZ</span>
        <strong>Najpierw drużyna i sezon</strong>
        <small>Domyślnie grasz pytaniami swojej drużyny. Całą ligę możesz wybrać jako opcję.</small>
      </div>
      <em id="rpg-setup-ready">Wybierz drużynę</em>`;
    grid.prepend(heading);
  }
  return heading;
}

function rpgSetupDecorateControls() {
  const scopeLabel = el('scope-mode')?.closest('label');
  const clubLabel = el('club-label');
  const seasonModeLabel = el('season-mode')?.closest('label');
  const seasonFromLabel = el('season-from-label');
  const seasonToLabel = el('season-to-label');
  const styleLabel = el('game-style')?.closest('label');

  scopeLabel?.classList.add('rpg-setup-scope');
  clubLabel?.classList.add('rpg-setup-club');
  seasonModeLabel?.classList.add('rpg-setup-season-mode');
  seasonFromLabel?.classList.add('rpg-setup-season-from');
  seasonToLabel?.classList.add('rpg-setup-season-to');
  styleLabel?.classList.add('rpg-setup-style');

  rpgSetupSetLabelTitle(clubLabel, '1. Twoja drużyna');
  rpgSetupSetLabelTitle(seasonModeLabel, '2. Sezony w pytaniach');
  rpgSetupSetLabelTitle(seasonFromLabel, el('season-mode')?.value === 'range' ? '3. Sezon od' : '3. Sezon');
  rpgSetupSetLabelTitle(seasonToLabel, '4. Sezon do');
  rpgSetupSetLabelTitle(scopeLabel, 'Pytania z');
  rpgSetupSetLabelTitle(styleLabel, 'Oprawa');
}

function rpgSetupSeasonText() {
  const mode = el('season-mode')?.value || 'all';
  if (mode === 'all') return 'wszystkie sezony';
  const from = el('season-from')?.selectedOptions?.[0]?.textContent?.trim() || 'wybierz sezon';
  if (mode === 'single') return from;
  const to = el('season-to')?.selectedOptions?.[0]?.textContent?.trim() || 'wybierz sezon';
  return `${from}–${to}`;
}

function rpgSetupSummaryText() {
  const scope = el('scope-mode')?.value;
  const club = el('club')?.selectedOptions?.[0]?.textContent?.trim();
  const source = scope === 'league' ? 'Cała A-klasa' : (club && el('club')?.value ? club : 'Wybierz drużynę');
  const style = el('game-style')?.selectedOptions?.[0]?.textContent?.trim() || 'Stadionowa';
  return `${source} · ${rpgSetupSeasonText()} · ${style}`;
}

function rpgSetupReady() {
  if (!rpgSetupModeActive()) return true;
  const scope = el('scope-mode')?.value;
  const clubReady = scope === 'league' || Boolean(el('club')?.value);
  const seasonMode = el('season-mode')?.value || 'all';
  const seasonReady = seasonMode === 'all' || Boolean(el('season-from')?.value);
  const rangeReady = seasonMode !== 'range' || Boolean(el('season-to')?.value);
  return clubReady && seasonReady && rangeReady;
}

function rpgSetupRender() {
  if (!rpgSetupVisible()) return;
  document.body.classList.add('rpg-setup-mode');
  const settings = el('match-settings');
  if (settings) settings.open = true;
  rpgSetupEnsureHeading();
  rpgSetupDecorateControls();

  const summary = el('match-settings-summary');
  if (summary) summary.textContent = rpgSetupSummaryText();

  const ready = rpgSetupReady();
  const readyLabel = el('rpg-setup-ready');
  if (readyLabel) {
    readyLabel.textContent = ready ? 'Gotowe do gry ✓' : 'Wybierz drużynę';
    readyLabel.classList.toggle('ready', ready);
  }

  const kickoff = el('new-game');
  if (kickoff) {
    kickoff.disabled = !ready;
    kickoff.textContent = ready ? '⚽ Pierwszy gwizdek' : 'Najpierw wybierz drużynę';
  }

  const guide = el('ux-setup-guide');
  if (guide) {
    guide.innerHTML = '<span>TERAZ</span><div><strong>Symulowany mecz RPG</strong><small>Wybierz swoją drużynę i sezon. Jeśli chcesz szerszy zestaw pytań, przełącz „Pytania z” na całą ligę.</small></div>';
  }
}

function rpgSetupApplyDefaults() {
  if (!rpgSetupVisible() || rpgSetupDefaultsApplied) return;
  rpgSetupNonRpgSnapshot = rpgSetupCaptureValues();
  rpgSetupPolishOptions();
  if (el('scope-mode')) el('scope-mode').value = 'club';
  if (el('season-mode')) el('season-mode').value = 'single';
  const latest = rpgSetupLatestSeason();
  if (latest) {
    if (el('season-from')) el('season-from').value = latest;
    if (el('season-to')) el('season-to').value = latest;
  }
  rpgSetupEnsureClubPlaceholder(true);
  if (typeof updateScopeControls === 'function') updateScopeControls();
  if (typeof updateSeasonControls === 'function') updateSeasonControls();
  rpgSetupDefaultsApplied = true;
  rpgSetupPreferences = rpgSetupCaptureValues();
}

function rpgSetupRestorePreferences() {
  if (!rpgSetupPreferences) return;
  rpgSetupEnsureClubPlaceholder(false);
  rpgSetupApplyValues(rpgSetupPreferences);
}

function rpgSetupLeaveMode() {
  if (rpgSetupWasVisible) rpgSetupPreferences = rpgSetupCaptureValues();
  document.body.classList.remove('rpg-setup-mode');
  rpgSetupRemoveClubPlaceholder();
  rpgSetupRestoreGenericLabels();
  if (rpgSetupWasVisible && rpgSetupNonRpgSnapshot) {
    rpgSetupApplyValues(rpgSetupNonRpgSnapshot);
    const settings = el('match-settings');
    if (settings) settings.open = rpgSetupNonRpgSnapshot.settingsOpen;
  }
  const kickoff = el('new-game');
  if (kickoff) kickoff.disabled = false;
  rpgSetupWasVisible = false;
}

function rpgSetupSync() {
  if (!rpgSetupVisible()) {
    rpgSetupLeaveMode();
    return;
  }

  const entering = !rpgSetupWasVisible;
  if (!rpgSetupDefaultsApplied) rpgSetupApplyDefaults();
  else if (entering) rpgSetupRestorePreferences();
  rpgSetupWasVisible = true;

  rpgSetupPolishOptions();
  rpgSetupEnsureClubPlaceholder(false);
  rpgSetupRender();
  rpgSetupPreferences = rpgSetupCaptureValues();
}

const rpgSetupBaseRefreshClubOptions = refreshClubOptions;
refreshClubOptions = function rpgSetupRefreshClubOptions() {
  const result = rpgSetupBaseRefreshClubOptions();
  requestAnimationFrame(rpgSetupSync);
  return result;
};

['game-format','scope-mode','season-mode','season-from','season-to','game-style'].forEach(id => {
  el(id)?.addEventListener('change', () => requestAnimationFrame(rpgSetupSync));
});
el('club')?.addEventListener('change', () => requestAnimationFrame(rpgSetupSync));

// The title screen dispatches game-format change before it marks the mode as chosen,
// so the animation-frame sync intentionally runs after that click handler completes.
requestAnimationFrame(rpgSetupSync);
