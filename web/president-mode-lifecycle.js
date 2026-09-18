// President career lifecycle: new-career reset plus durable local save/resume.
const PRESIDENT_SAVE_KEY = 'myslenice-president-career-v1';
const PRESIDENT_SAVE_VERSION = 1;

function presidentStorage() {
  try { return window.localStorage; } catch (_) { return null; }
}

function presidentReadSave() {
  const storage = presidentStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PRESIDENT_SAVE_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (
      Number(snapshot?.version) !== PRESIDENT_SAVE_VERSION ||
      !snapshot?.presidentMode?.active ||
      !snapshot?.seasonCareer?.active
    ) return null;
    return snapshot;
  } catch (_) {
    return null;
  }
}

function presidentPersistCareer() {
  const storage = presidentStorage();
  const profile = state.presidentMode;
  const career = state.seasonCareer;
  if (!storage || !profile?.active || !career?.active) return false;
  try {
    storage.setItem(PRESIDENT_SAVE_KEY, JSON.stringify({
      version:PRESIDENT_SAVE_VERSION,
      savedAt:new Date().toISOString(),
      presidentMode:profile,
      seasonCareer:career,
      uiTab:state.presidentUiTab || 'overview',
    }));
    refreshPresidentResumeCard();
    return true;
  } catch (_) {
    return false;
  }
}

function presidentClearSave() {
  const storage = presidentStorage();
  try { storage?.removeItem(PRESIDENT_SAVE_KEY); } catch (_) {}
  refreshPresidentResumeCard();
}

function presidentSaveDescription(snapshot) {
  if (!snapshot) return null;
  const career = snapshot.seasonCareer || {};
  const profile = snapshot.presidentMode || {};
  const round = Math.max(0, Number(career.roundIndex || 0));
  const totalRounds = Array.isArray(career.rounds) ? career.rounds.length : Number(profile.totalRounds || 0);
  return {
    club:String(career.club || 'Klub'),
    season:String(career.season || '—'),
    competition:String(career.competitionLabel || 'A klasa Myślenice'),
    careerYear:Math.max(1, Number(profile.careerYear || 1)),
    round,
    totalRounds,
    savedAt:snapshot.savedAt || null,
  };
}

function presidentFormatSavedAt(value) {
  if (!value) return 'zapis lokalny';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'zapis lokalny';
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit',
    }).format(date);
  } catch (_) {
    return 'zapis lokalny';
  }
}

function ensurePresidentResumeCard() {
  const picker = document.querySelector('#landing-screen .mode-picker');
  const modeGrid = picker?.querySelector('.mode-grid');
  if (!picker || !modeGrid) return null;
  let card = picker.querySelector('.president-resume-card');
  if (card) return card;
  card = document.createElement('section');
  card.className = 'president-resume-card hidden';
  card.innerHTML = `
    <div class="president-resume-copy">
      <small>💾 ZAPISANA KARIERA PREZESA</small>
      <strong data-president-save-title></strong>
      <span data-president-save-meta></span>
    </div>
    <div class="president-resume-actions">
      <button type="button" class="president-resume-button">Wznów karierę →</button>
      <button type="button" class="president-delete-save">Usuń zapis</button>
    </div>`;
  modeGrid.insertAdjacentElement('afterend', card);
  card.querySelector('.president-resume-button')?.addEventListener('click', resumePresidentCareer);
  card.querySelector('.president-delete-save')?.addEventListener('click', () => {
    presidentClearSave();
    const note = document.getElementById('landing-note');
    if (note) note.textContent = 'Zapis kariery prezesa został usunięty z tego urządzenia.';
  });
  return card;
}

function refreshPresidentResumeCard() {
  const card = ensurePresidentResumeCard();
  if (!card) return false;
  const snapshot = presidentReadSave();
  const meta = presidentSaveDescription(snapshot);
  if (!meta) {
    card.classList.add('hidden');
    return false;
  }
  card.classList.remove('hidden');
  const title = card.querySelector('[data-president-save-title]');
  const detail = card.querySelector('[data-president-save-meta]');
  if (title) title.textContent = `${meta.club} · sezon ${meta.season}`;
  if (detail) {
    const progress = meta.totalRounds
      ? `kolejka ${Math.min(meta.round + 1, meta.totalRounds)}/${meta.totalRounds}`
      : 'między sezonami';
    detail.textContent = `Rok kariery ${meta.careerYear} · ${meta.competition} · ${progress} · zapis ${presidentFormatSavedAt(meta.savedAt)}`;
  }
  return true;
}

function syncPresidentResumeSelectors(career) {
  const format = el('game-format');
  if (format) {
    if (typeof ensurePresidentFormatOption === 'function') ensurePresidentFormatOption();
    format.value = 'president';
    format.dispatchEvent(new Event('change', { bubbles:true }));
  }
  const club = el('club');
  if (club && career?.club) {
    const option = [...club.options].find(item => item.value === career.club);
    if (option) club.value = career.club;
  }
  const season = career?.sourceSeason || career?.season;
  const from = el('season-from');
  const to = el('season-to');
  if (season && from?.querySelector(`option[value="${season}"]`)) {
    from.value = season;
    if (to) to.value = season;
  }
}

function renderResumedPresidentCareer() {
  const profile = state.presidentMode;
  const career = state.seasonCareer;
  if (!profile?.active || !career?.active) return false;
  if (profile.jobSecurity?.fired) return renderPresidentDismissal();
  if (profile.offseason) return renderPresidentOffseason();
  if (career.completed) return renderPresidentSeasonFinal();
  if (!profile.strategy) return renderPresidentStrategySelection();
  return showPresidentRound();
}

async function resumePresidentCareer() {
  const snapshot = presidentReadSave();
  if (!snapshot) {
    refreshPresidentResumeCard();
    return false;
  }

  state.presidentMode = snapshot.presidentMode;
  state.seasonCareer = snapshot.seasonCareer;
  state.presidentUiTab = snapshot.uiTab || 'overview';
  syncPresidentResumeSelectors(state.seasonCareer);

  if (typeof frontSelectedMode !== 'undefined') frontSelectedMode = 'president';
  if (typeof frontModeChosen !== 'undefined') frontModeChosen = true;
  if (typeof frontGameStarted !== 'undefined') frontGameStarted = true;

  document.getElementById('landing-screen')?.classList.add('hidden');
  document.body.classList.remove('landing-active');
  if (typeof hidePresidentGameSurfaces === 'function') hidePresidentGameSurfaces();
  ensurePresidentDecisionPanel()?.classList.remove('hidden');

  if (!state.playerCharactersLoaded && state.playerCharactersReady) {
    if (el('status')) {
      el('status').textContent = 'Wczytywanie danych ŁNP do zapisanej kariery prezesa…';
      el('status').classList.remove('hidden');
    }
    try { await state.playerCharactersReady; } catch (_) {}
  }

  const rendered = renderResumedPresidentCareer();
  if (rendered !== false) {
    presidentPersistCareer();
    if (el('status')) el('status').classList.remove('pregame-note');
  }
  return rendered;
}

function wrapPresidentAutosave(functionName) {
  const original = globalThis[functionName];
  if (typeof original !== 'function' || original.__presidentAutosaveWrapped) return;
  const wrapped = function presidentAutosaveWrapper(...args) {
    const result = original.apply(this, args);
    if (result && typeof result.then === 'function') {
      return result.then(value => {
        if (value !== false) presidentPersistCareer();
        return value;
      });
    }
    if (result !== false) presidentPersistCareer();
    return result;
  };
  wrapped.__presidentAutosaveWrapped = true;
  globalThis[functionName] = wrapped;
}

[
  'renderPresidentDecision',
  'renderPresidentRoundOutcome',
  'renderPresidentSeasonFinal',
  'renderPresidentOffseason',
  'renderPresidentStrategySelection',
  'renderPresidentDismissal',
].forEach(wrapPresidentAutosave);

const presidentLifecycleFinishCareer = finishPresidentCareer;
finishPresidentCareer = function presidentFinishCareerAndDeleteSave(...args) {
  presidentClearSave();
  return presidentLifecycleFinishCareer.apply(this, args);
};

// Reset president bookkeeping only when a genuinely new career object starts.
const presidentLifecycleBaseStartSeasonCareerMatch = startSeasonCareerMatch;
startSeasonCareerMatch = function presidentLifecycleStartSeasonCareerMatch() {
  const career = typeof careerState === 'function' ? careerState() : null;
  const freshCareer = Boolean(
    typeof presidentSelected === 'function' && presidentSelected() &&
    career?.active && Number(career.roundIndex || 0) === 0 &&
    Array.isArray(career.history) && career.history.length === 0 &&
    Number(state.presidentMode?.matches || 0) > 0
  );
  if (freshCareer) state.presidentMode = null;
  return presidentLifecycleBaseStartSeasonCareerMatch();
};

function watchPresidentResumeCard() {
  refreshPresidentResumeCard();
  const observer = new MutationObserver(() => refreshPresidentResumeCard());
  observer.observe(document.body, { childList:true, subtree:true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchPresidentResumeCard, { once:true });
} else {
  watchPresidentResumeCard();
}
