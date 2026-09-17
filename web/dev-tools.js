// Developer-only controls for deterministic testing of random arcade events.
// Enable with ?dev=1. Normal players do not see or execute any dev controls.

const RPG_DEV_PARAMS = new URLSearchParams(window.location.search);
const RPG_DEV_ENABLED = ['1', 'true', 'yes', 'on', ''].includes(
  RPG_DEV_PARAMS.has('dev') ? String(RPG_DEV_PARAMS.get('dev') ?? '').toLowerCase() : '__off__',
);
const RPG_DEV_INITIAL_EVENT = String(RPG_DEV_PARAMS.get('event') || '').trim();

const RPG_DEV_EVENTS = Object.freeze({
  penalty: { icon:'🥅', label:'Karny', possession:'player', zone:4, type:'penalty', desc:'DEV: wymuszony rzut karny.' },
  corner: { icon:'🚩', label:'Rzut rożny', possession:'player', zone:4, type:'corner', desc:'DEV: wymuszony rzut rożny.' },
  free_kick: { icon:'🎯', label:'Rzut wolny', possession:'player', zone:3, type:'free_kick', desc:'DEV: wymuszony rzut wolny.' },
  counter_3v2: { icon:'⚡', label:'Kontra 3 na 2', possession:'player', zone:2, type:'counter_3v2', desc:'DEV: wymuszona kontra 3 na 2.' },
  opponent_corner: { icon:'🚩', label:'Róg dla rywala', possession:'opponent', zone:0, type:'opponent_corner', desc:'DEV: rywal ma rzut rożny.' },
  opponent_free_kick: { icon:'🎯', label:'Wolny dla rywala', possession:'opponent', zone:1, type:'opponent_free_kick', desc:'DEV: rywal ma groźny rzut wolny.' },
});

const RPG_DEV_MEDIA_EVENTS = Object.freeze({
  media_koneserzy: 'koneserzy',
  media_fotopstryki: 'fotopstryki',
  media_zatrzymaj: 'zatrzymaj',
  media_futmal: 'futmal',
});

function rpgDevStatus(text) {
  if (!RPG_DEV_ENABLED) return;
  const box = document.getElementById('rpg-dev-status');
  if (box) box.textContent = text;
}

function rpgDevCanMutateNow() {
  return typeof rpgActive === 'function' && rpgActive() && !state.rpgEnded && state.rpgAwaitingAction;
}

function rpgDevApplySetPiece(key, render = true) {
  const def = RPG_DEV_EVENTS[key];
  if (!def) return false;
  state.rpgPossession = def.possession;
  state.rpgZone = def.zone;
  state.rpgClearChance = false;
  state.rpgSetPiece = typeof arcadeEvent === 'function'
    ? arcadeEvent(def.icon, def.label, def.desc, def.type)
    : { icon:def.icon, label:def.label, desc:def.desc, type:def.type };
  if (typeof resetArcadeCombo === 'function') resetArcadeCombo();
  addRpgLog(`🧪 DEV: wymuszono — ${def.label}.`, '');
  if (render) {
    renderRpgBoard();
    hideQuestionUi(true);
    renderActionPanel();
  }
  rpgDevStatus(`Aktywne: ${def.label}`);
  return true;
}

function rpgDevForceAmbient() {
  if (!Array.isArray(LOCAL_MATCH_AMBIENT) || !LOCAL_MATCH_AMBIENT.length) return;
  const [source, text] = LOCAL_MATCH_AMBIENT[Math.floor(Math.random() * LOCAL_MATCH_AMBIENT.length)];
  addRpgLog(`${source}: „${text}”`, '');
  rpgDevStatus(`Ambient: ${source}`);
}

function rpgDevApply(key, render = true) {
  if (!RPG_DEV_ENABLED) return false;
  if (RPG_DEV_EVENTS[key]) return rpgDevApplySetPiece(key, render);

  if (RPG_DEV_MEDIA_EVENTS[key]) {
    if (typeof localMediaForce !== 'function') return false;
    const sourceId = RPG_DEV_MEDIA_EVENTS[key];
    const result = localMediaForce(sourceId);
    if (!result) return false;
    rpgDevStatus(`Media: ${sourceId} · efekt ${result.effect}`);
    if (render) {
      renderRpgBoard();
      renderActionPanel();
    }
    return true;
  }

  if (key === 'robbery') {
    state.rpgDevForceRefereeRobbery = true;
    addRpgLog('🧪 DEV: następna kwalifikująca się poprawna odpowiedź zostanie skasowana przez sędziego.', 'bad');
    rpgDevStatus('WAŁEK przy następnej poprawnej odpowiedzi');
    return true;
  }
  if (key === 'fire') {
    const current = Number(state.rpgMomentum || 0);
    if (typeof arcadeMomentum === 'function') arcadeMomentum(100 - current);
    else state.rpgMomentum = 100;
    if (render && typeof renderArcadeHud === 'function') renderArcadeHud();
    addRpgLog('🧪 DEV: ogień ustawiony na 100%.', 'good');
    rpgDevStatus('Ogień 100%');
    return true;
  }
  if (key === 'ambient') {
    rpgDevForceAmbient();
    return true;
  }
  return false;
}

function rpgDevQueue(key) {
  if (!RPG_DEV_ENABLED) return;
  if (!rpgActive() || state.rpgEnded) {
    state.rpgDevQueuedEvent = key;
    rpgDevStatus(`W kolejce na start meczu: ${key}`);
    return;
  }
  if (!state.rpgAwaitingAction) {
    state.rpgDevQueuedEvent = key;
    rpgDevStatus(`W kolejce po bieżącym pytaniu: ${key}`);
    return;
  }
  rpgDevApply(key, true);
}

// Allow a forced referee mistake without changing the normal random probability.
const rpgDevBaseRefereeRobberyRoll = localRefereeRobberyRoll;
localRefereeRobberyRoll = function rpgDevRefereeRobberyRoll(action, correct) {
  if (RPG_DEV_ENABLED && correct && state.rpgDevForceRefereeRobbery) {
    state.rpgDevForceRefereeRobbery = false;
    return true;
  }
  return rpgDevBaseRefereeRobberyRoll(action, correct);
};

// Restore deterministic dev flags on every new match and honor ?event=...
const rpgDevBaseResetRpgState = resetRpgState;
resetRpgState = function rpgDevResetRpgState() {
  rpgDevBaseResetRpgState();
  state.rpgDevForceRefereeRobbery = false;
  state.rpgDevQueuedEvent = RPG_DEV_INITIAL_EVENT || null;
};

// If a forced event was queued during a question, inject it at the next action-selection screen.
const rpgDevBaseRenderActionPanel = renderActionPanel;
renderActionPanel = function rpgDevRenderActionPanel() {
  if (RPG_DEV_ENABLED && state.rpgAwaitingAction && state.rpgDevQueuedEvent) {
    const queued = state.rpgDevQueuedEvent;
    state.rpgDevQueuedEvent = null;
    rpgDevApply(queued, false);
  }
  return rpgDevBaseRenderActionPanel();
};

function ensureRpgDevPanel() {
  if (!RPG_DEV_ENABLED || document.getElementById('rpg-dev-panel')) return;
  const style = document.createElement('style');
  style.textContent = `
    #rpg-dev-panel{position:fixed;right:10px;bottom:10px;z-index:12000;width:min(460px,calc(100vw - 20px));padding:10px;border:1px solid #f6c344;border-radius:12px;background:rgba(8,10,12,.96);color:#fff;font:12px/1.25 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45)}
    #rpg-dev-panel .dev-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}#rpg-dev-panel .dev-head strong{color:#f6c344}#rpg-dev-panel .dev-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}#rpg-dev-panel button{min-height:34px;padding:6px;border:1px solid #3b4248;border-radius:8px;background:#171b1f;color:#fff;cursor:pointer;font-weight:700}#rpg-dev-panel button:hover{border-color:#f6c344}#rpg-dev-panel .dev-close{min-height:auto;border:0;background:transparent;font-size:18px;padding:0 4px}#rpg-dev-status{display:block;margin-top:8px;color:#bbc3ca}`;
  document.head.appendChild(style);

  const panel = document.createElement('aside');
  panel.id = 'rpg-dev-panel';
  panel.innerHTML = `
    <div class="dev-head"><strong>🧪 DEV · A-klasowy chaos</strong><button class="dev-close" type="button" title="Ukryj">×</button></div>
    <div class="dev-grid">
      <button data-dev-event="penalty">🥅 Karny</button>
      <button data-dev-event="corner">🚩 Róg</button>
      <button data-dev-event="free_kick">🎯 Wolny</button>
      <button data-dev-event="counter_3v2">⚡ 3 na 2</button>
      <button data-dev-event="opponent_corner">🛡️ Róg rywala</button>
      <button data-dev-event="opponent_free_kick">🛡️ Wolny rywala</button>
      <button data-dev-event="robbery">🧑‍⚖️ Wałek</button>
      <button data-dev-event="fire">🔥 Ogień 100%</button>
      <button data-dev-event="ambient">📣 Okrzyk</button>
      <button data-dev-event="media_koneserzy">🎥 Koneserzy</button>
      <button data-dev-event="media_fotopstryki">📸 Fotopstryki</button>
      <button data-dev-event="media_zatrzymaj">📷 ZatrzymajCzas</button>
      <button data-dev-event="media_futmal">📰 Futmal</button>
    </div>
    <small id="rpg-dev-status">Tryb testowy aktywny. Zdarzenia nie są zapisywane jako osobna wersja gry.</small>`;
  document.body.appendChild(panel);
  panel.querySelectorAll('[data-dev-event]').forEach(button => {
    button.addEventListener('click', () => rpgDevQueue(button.dataset.devEvent));
  });
  panel.querySelector('.dev-close')?.addEventListener('click', () => panel.remove());
}

if (RPG_DEV_ENABLED) {
  window.RPG_DEV = Object.freeze({
    force: rpgDevQueue,
    events: [
      ...Object.keys(RPG_DEV_EVENTS),
      ...Object.keys(RPG_DEV_MEDIA_EVENTS),
      'robbery', 'fire', 'ambient',
    ],
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureRpgDevPanel);
  else ensureRpgDevPanel();
}
