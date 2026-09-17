// Local-media arcade events inspired by the Myślenice football ecosystem.
// These are fictional/random gameplay events. They do NOT assert that a given outlet
// actually covered the specific match currently being simulated.

const LOCAL_MEDIA_INMATCH_CHANCE = 0.20;
const LOCAL_MEDIA_INMATCH_CHAOS_CHANCE = 0.30;
const LOCAL_MEDIA_PREMATCH_FUTMAL_CHANCE = 0.42;
const LOCAL_MEDIA_MAX_EVENTS = 2;
const LOCAL_MEDIA_MIN_SPACING = 3;

const LOCAL_MEDIA_SOURCES = Object.freeze({
  koneserzy: { icon:'🎥', label:'Koneserzy Życia' },
  fotopstryki: { icon:'📸', label:'Fotopstryki' },
  zatrzymaj: { icon:'📷', label:'ZatrzymajCzas photography' },
  futmal: { icon:'📰', label:'Futmal.pl' },
});

const LOCAL_MEDIA_EFFECTS = Object.freeze({
  koneserzy: Object.freeze([
    {
      id:'kamera', tone:'good', playerMomentum:12,
      copy:'Kamera pojawia się przy linii. Każdy chce trafić do relacji — +12% ognia.',
    },
    {
      id:'showtime', tone:'good', attackDc:-1,
      copy:'Koneserzy odpalają relację. Gramy pod kamerę — następna akcja ofensywna jest łatwiejsza o 1 poziom.',
    },
    {
      id:'pod_publike', tone:'bad', playerMomentum:8, attackDc:1,
      copy:'Za dużo grania pod publikę. +8% ognia, ale następna akcja ofensywna jest trudniejsza o 1 poziom.',
    },
  ]),
  fotopstryki: Object.freeze([
    {
      id:'obiektyw', tone:'good', shotDc:-1,
      copy:'Fotopstryki ustawiają obiektyw za bramką. Następny strzał ma być zdjęciem kolejki — test strzału łatwiejszy o 1.',
    },
    {
      id:'murarka', tone:'good', defenseDc:-1,
      copy:'Fotograf łapie idealny kadr całej defensywy. Następna akcja obronna jest łatwiejsza o 1 poziom.',
    },
    {
      id:'flesz', tone:'bad', playerMomentum:10, shotDc:1,
      copy:'Flesz, poza, fryzura poprawiona. +10% ognia, ale następny strzał jest trudniejszy o 1 poziom.',
    },
  ]),
  zatrzymaj: Object.freeze([
    {
      id:'zamrozenie', tone:'good', defenseDc:-1,
      copy:'ZatrzymajCzas łapie moment przed interwencją. Następny test obronny jest łatwiejszy o 1 poziom.',
    },
    {
      id:'kadr', tone:'good', attackDc:-1,
      copy:'Szykuje się kadr meczu. Następna akcja ofensywna jest łatwiejsza o 1 poziom.',
    },
    {
      id:'pauza', tone:'good', playerMomentum:6, opponentMomentum:-8,
      copy:'Krótka fotograficzna pauza wybija rywala z rytmu. +6% ognia dla ciebie, −8% momentum rywala.',
    },
  ]),
  futmal: Object.freeze([
    {
      id:'faworyt', tone:'bad', playerMomentum:8, attackDc:1,
      copy:'Futmal.pl robi z was faworyta meczu. +8% ognia, ale presja rośnie — pierwsza akcja ofensywna jest trudniejsza o 1.',
    },
    {
      id:'underdog', tone:'good', playerMomentum:15,
      copy:'Zapowiedź na Futmalu stawia was w roli skazywanych na porażkę. Szatnia się gotuje — +15% ognia.',
    },
    {
      id:'analiza', tone:'good', attackDc:-1, defenseDc:-1,
      copy:'Futmal rozkłada rywala na czynniki pierwsze. Następna akcja ofensywna i defensywna są łatwiejsze o 1 poziom.',
    },
    {
      id:'mecz_kolejki', tone:'', playerMomentum:10, opponentMomentum:10,
      copy:'Futmal zapowiada „mecz kolejki”. Obie strony są nakręcone — +10% ognia dla obu ekip.',
    },
  ]),
});

function localMediaClampDc(value) {
  return Math.max(1, Math.min(5, Number(value || 1)));
}

function localMediaLooksLikeShot(action) {
  if (typeof localActionLooksLikeShot === 'function') return localActionLooksLikeShot(action);
  const kind = String(action?.kind || '');
  const id = String(action?.id || '');
  return kind.includes('shot') || kind.includes('finish') || kind.includes('penalty') ||
    ['long_shot','placed_shot','power_shot','arcade_bomb','counter_finish'].includes(id);
}

function localMediaSetModifier(key, value) {
  if (!value) return;
  state[key] = Number(value);
}

function localMediaApplyEffect(effect) {
  if (!effect) return;
  if (effect.playerMomentum && typeof arcadeMomentum === 'function') arcadeMomentum(effect.playerMomentum);
  if (effect.opponentMomentum && typeof arcadeMomentum === 'function') arcadeMomentum(effect.opponentMomentum, true);
  localMediaSetModifier('rpgMediaNextAttackDc', effect.attackDc);
  localMediaSetModifier('rpgMediaNextDefenseDc', effect.defenseDc);
  localMediaSetModifier('rpgMediaNextShotDc', effect.shotDc);
}

function localMediaForce(sourceId, effectId = null, countEvent = true) {
  const source = LOCAL_MEDIA_SOURCES[sourceId];
  const pool = LOCAL_MEDIA_EFFECTS[sourceId];
  if (!source || !Array.isArray(pool) || !pool.length) return false;

  const effect = effectId
    ? pool.find(item => item.id === effectId)
    : pool[Math.floor(Math.random() * pool.length)];
  if (!effect) return false;

  localMediaApplyEffect(effect);
  if (!(state.rpgMediaUsedSources instanceof Set)) state.rpgMediaUsedSources = new Set();
  state.rpgMediaUsedSources.add(sourceId);
  if (countEvent) {
    state.rpgMediaEventCount = Number(state.rpgMediaEventCount || 0) + 1;
    state.rpgMediaLastEventAction = Number(state.rpgActionsPlayed || 0);
  }

  state.rpgMediaNarration = `${source.icon} ${source.label}: ${effect.copy}`;
  state.rpgMediaNarrationUntilAction = Number(state.rpgActionsPlayed || 0) + 1;
  addRpgLog(`${source.icon} ${source.label}: ${effect.copy}`, effect.tone || '');
  if (typeof renderArcadeHud === 'function') renderArcadeHud();
  return { source: sourceId, effect: effect.id };
}

function maybeTriggerLocalMediaEvent() {
  if (!rpgActive() || state.rpgEnded || state.rpgHalftimePending || state.rpgSetPiece) return false;
  if (Number(state.rpgMediaEventCount || 0) >= LOCAL_MEDIA_MAX_EVENTS) return false;
  const actionNo = Number(state.rpgActionsPlayed || 0);
  if (actionNo < 2) return false;
  if (actionNo - Number(state.rpgMediaLastEventAction ?? -4) < LOCAL_MEDIA_MIN_SPACING) return false;

  const style = typeof arcadeStyle === 'function' ? arcadeStyle() : null;
  const chance = style?.id === 'chaos' ? LOCAL_MEDIA_INMATCH_CHAOS_CHANCE : LOCAL_MEDIA_INMATCH_CHANCE;
  if (Math.random() > chance) return false;

  if (!(state.rpgMediaUsedSources instanceof Set)) state.rpgMediaUsedSources = new Set();
  const candidates = ['koneserzy','fotopstryki','zatrzymaj']
    .filter(key => !state.rpgMediaUsedSources.has(key));
  if (!candidates.length) return false;
  const sourceId = candidates[Math.floor(Math.random() * candidates.length)];
  return Boolean(localMediaForce(sourceId));
}

const localMediaBaseResetRpgState = resetRpgState;
resetRpgState = function localMediaResetRpgState() {
  localMediaBaseResetRpgState();
  state.rpgMediaEventCount = 0;
  state.rpgMediaLastEventAction = -4;
  state.rpgMediaUsedSources = new Set();
  state.rpgMediaNextAttackDc = 0;
  state.rpgMediaNextDefenseDc = 0;
  state.rpgMediaNextShotDc = 0;
  state.rpgMediaNarration = '';
  state.rpgMediaNarrationUntilAction = -1;
  state.rpgMediaPrematchFutmalPending = Math.random() < LOCAL_MEDIA_PREMATCH_FUTMAL_CHANCE;
};

const localMediaBasePlayerActions = playerActions;
playerActions = function localMediaPlayerActions() {
  return localMediaBasePlayerActions().map(original => {
    const action = { ...original };
    const shot = localMediaLooksLikeShot(action);
    const delta = shot && Number(state.rpgMediaNextShotDc || 0)
      ? Number(state.rpgMediaNextShotDc)
      : Number(state.rpgMediaNextAttackDc || 0);
    if (delta) {
      action.dc = localMediaClampDc(action.dc + delta);
      action.desc = `${action.desc} ${delta < 0 ? '📸 Media pomagają: test −1.' : '🎥 Presja mediów: test +1.'}`;
      action.mediaDcModifier = delta;
      action.mediaModifierKind = shot && Number(state.rpgMediaNextShotDc || 0) ? 'shot' : 'attack';
    }
    return action;
  });
};

const localMediaBaseOpponentActions = opponentActions;
opponentActions = function localMediaOpponentActions() {
  return localMediaBaseOpponentActions().map(original => {
    const action = { ...original };
    const delta = Number(state.rpgMediaNextDefenseDc || 0);
    if (delta) {
      action.dc = localMediaClampDc(action.dc + delta);
      action.desc = `${action.desc} ${delta < 0 ? '📷 Dobry kadr defensywy: test −1.' : '📷 Zamieszanie przy linii: test +1.'}`;
      action.mediaDcModifier = delta;
      action.mediaModifierKind = 'defense';
    }
    return action;
  });
};

const localMediaBaseChooseRpgAction = chooseRpgAction;
chooseRpgAction = function localMediaChooseRpgAction(action) {
  if (action?.mediaModifierKind === 'shot') state.rpgMediaNextShotDc = 0;
  else if (action?.mediaModifierKind === 'attack') state.rpgMediaNextAttackDc = 0;
  else if (action?.mediaModifierKind === 'defense') state.rpgMediaNextDefenseDc = 0;
  return localMediaBaseChooseRpgAction(action);
};

const localMediaBaseNarratorText = narratorText;
narratorText = function localMediaNarratorText() {
  if (state.rpgMediaNarration && Number(state.rpgActionsPlayed || 0) <= Number(state.rpgMediaNarrationUntilAction ?? -1)) {
    return state.rpgMediaNarration;
  }
  return localMediaBaseNarratorText();
};

const localMediaBaseRenderActionPanel = renderActionPanel;
renderActionPanel = function localMediaRenderActionPanel() {
  if (rpgActive() && state.rpgAwaitingAction && state.rpgMediaPrematchFutmalPending && Number(state.rpgActionsPlayed || 0) === 0) {
    state.rpgMediaPrematchFutmalPending = false;
    localMediaForce('futmal', null, false);
  }
  return localMediaBaseRenderActionPanel();
};

const localMediaBaseAnswer = answer;
answer = function localMediaAnswer(button, option) {
  if (!rpgActive()) return localMediaBaseAnswer(button, option);
  const beforeAnswered = Number(state.answered || 0);
  const result = localMediaBaseAnswer(button, option);
  if (Number(state.answered || 0) > beforeAnswered) maybeTriggerLocalMediaEvent();
  return result;
};
