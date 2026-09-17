// Arcade layer for Match RPG v0.3.
// Loaded after match-rpg.js and before front-controller.js.
// Keeps the knowledge-as-dice-roll core, but adds momentum, combos, opponent styles,
// special moves and random match events/set pieces.

const arcadeBaseEnsureRpgUi = ensureRpgUi;
const arcadeBaseResetRpgState = resetRpgState;
const arcadeBaseRenderRpgBoard = renderRpgBoard;
const arcadeBasePlayerActions = playerActions;
const arcadeBaseOpponentActions = opponentActions;
const arcadeBaseChooseRpgAction = chooseRpgAction;
const arcadeBaseResolvePlayerAction = resolvePlayerAction;
const arcadeBaseResolveOpponentAction = resolveOpponentAction;
const arcadeBaseAnswer = answer;

const ARCADE_STYLES = Object.freeze([
  {
    id: 'high_press',
    icon: '🟥',
    name: 'Wysoki pressing',
    desc: 'Krótka gra od tyłu jest trudniejsza, ale długa piłka częściej omija pierwszy pressing.',
  },
  {
    id: 'counter',
    icon: '⚡',
    name: 'Szybka kontra',
    desc: 'Strata boli bardziej — rywal natychmiast atakuje wolną przestrzeń.',
  },
  {
    id: 'compact',
    icon: '🧱',
    name: 'Niski blok',
    desc: 'Wejście w pole karne jest trudniejsze. Strzały z dystansu zyskują na znaczeniu.',
  },
  {
    id: 'chaos',
    icon: '🎲',
    name: 'A-klasowy chaos',
    desc: 'Więcej stałych fragmentów, kartek i niespodziewanych zwrotów akcji.',
  },
]);

const ARCADE_UNLOCKS = Object.freeze([
  { value: 25, label: '⚡ Szybka kontra' },
  { value: 50, label: '🎯 Laser / Gegenpress' },
  { value: 75, label: '💣 Bomba z dystansu' },
  { value: 100, label: '⭐ Złota akcja' },
]);

function arcadeClamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function arcadeStyle() {
  return ARCADE_STYLES.find(item => item.id === state.rpgOpponentStyle) || ARCADE_STYLES[0];
}

function arcadeMomentum(delta, opponent = false) {
  const key = opponent ? 'rpgOpponentMomentum' : 'rpgMomentum';
  const previous = Number(state[key] || 0);
  const next = arcadeClamp(previous + delta);
  state[key] = next;
  if (!opponent && next > previous) {
    ARCADE_UNLOCKS.forEach(unlock => {
      if (previous < unlock.value && next >= unlock.value && !state.rpgArcadeUnlocks.has(unlock.value)) {
        state.rpgArcadeUnlocks.add(unlock.value);
        addRpgLog(`🔥 FORMA ${unlock.value}% — odblokowano: ${unlock.label}.`, 'good');
      }
    });
  }
  return next;
}

function resetArcadeCombo(startWith = null) {
  state.rpgCombo = startWith ? [startWith] : [];
  state.rpgComboRewarded = false;
}

function addArcadeCombo(label) {
  if (!Array.isArray(state.rpgCombo)) state.rpgCombo = [];
  state.rpgCombo.push(label);
  state.rpgCombo = state.rpgCombo.slice(-3);
  if (state.rpgCombo.length >= 3 && !state.rpgComboRewarded) {
    state.rpgComboRewarded = true;
    state.rpgClearChance = true;
    arcadeMomentum(15);
    addRpgLog('🔥 PERFECT BUILD-UP! Trzy udane elementy akcji — wykreowana stuprocentowa sytuacja.', 'goal');
  }
}

function ensureArcadeHud() {
  const board = el('rpg-board');
  if (!board || el('rpg-arcade-hud')) return;
  const scoreRow = board.querySelector('.rpg-score-row');
  const hud = document.createElement('div');
  hud.id = 'rpg-arcade-hud';
  hud.className = 'rpg-arcade-hud';
  hud.innerHTML = `
    <div class="arcade-style-card">
      <span id="arcade-style-icon" class="arcade-style-icon">⚽</span>
      <span><small>PROFIL RYWALA</small><strong id="arcade-style-name">—</strong><em id="arcade-style-desc"></em></span>
    </div>
    <div class="arcade-meter-card">
      <div class="arcade-meter-head"><span>🔥 FORMA</span><strong id="arcade-momentum-value">0%</strong></div>
      <div class="arcade-meter"><div id="arcade-momentum-fill"></div></div>
      <div id="arcade-unlocks" class="arcade-unlocks"></div>
    </div>
    <div class="arcade-combo-card">
      <div class="arcade-meter-head"><span>⚽ SEKWENCJA</span><strong id="arcade-combo-value">0/3</strong></div>
      <div id="arcade-combo-dots" class="arcade-combo-dots"><i></i><i></i><i></i></div>
      <small id="arcade-combo-copy">Zbuduj akcję trzema udanymi zagraniami.</small>
    </div>`;
  scoreRow?.insertAdjacentElement('afterend', hud);

  const event = document.createElement('div');
  event.id = 'arcade-event-banner';
  event.className = 'arcade-event-banner hidden';
  board.querySelector('.rpg-pitch-shell')?.insertAdjacentElement('afterend', event);
}

ensureRpgUi = function arcadeEnsureRpgUi() {
  arcadeBaseEnsureRpgUi();
  ensureArcadeHud();
};

resetRpgState = function arcadeResetRpgState() {
  arcadeBaseResetRpgState();
  state.rpgMomentum = 0;
  state.rpgOpponentMomentum = 0;
  state.rpgCombo = [];
  state.rpgComboRewarded = false;
  state.rpgArcadeUnlocks = new Set();
  state.rpgOpponentStyle = ARCADE_STYLES[Math.floor(Math.random() * ARCADE_STYLES.length)].id;
  state.rpgSetPiece = null;
  state.rpgArcadeEventCount = 0;
  state.rpgLastEventAction = -3;
  state.rpgYellowCard = false;
  state.rpgArcadeLastResolved = -1;
};

function renderArcadeHud() {
  ensureArcadeHud();
  if (!rpgActive()) return;
  const style = arcadeStyle();
  if (el('arcade-style-icon')) el('arcade-style-icon').textContent = style.icon;
  if (el('arcade-style-name')) el('arcade-style-name').textContent = style.name;
  if (el('arcade-style-desc')) el('arcade-style-desc').textContent = style.desc;

  const momentum = Number(state.rpgMomentum || 0);
  if (el('arcade-momentum-value')) el('arcade-momentum-value').textContent = `${momentum}%`;
  if (el('arcade-momentum-fill')) el('arcade-momentum-fill').style.width = `${momentum}%`;
  if (el('arcade-unlocks')) {
    el('arcade-unlocks').innerHTML = ARCADE_UNLOCKS.map(unlock =>
      `<span class="${momentum >= unlock.value ? 'active' : ''}">${unlock.value}% ${unlock.label}</span>`
    ).join('');
  }

  const combo = Array.isArray(state.rpgCombo) ? state.rpgCombo : [];
  if (el('arcade-combo-value')) el('arcade-combo-value').textContent = `${Math.min(3, combo.length)}/3`;
  const dots = [...(el('arcade-combo-dots')?.querySelectorAll('i') || [])];
  dots.forEach((dot, idx) => dot.classList.toggle('active', idx < combo.length));
  if (el('arcade-combo-copy')) {
    el('arcade-combo-copy').textContent = combo.length
      ? combo.slice(-3).join(' → ')
      : 'Zbuduj akcję trzema udanymi zagraniami.';
  }

  const banner = el('arcade-event-banner');
  if (banner) {
    if (state.rpgSetPiece) {
      banner.classList.remove('hidden');
      banner.innerHTML = `<strong>${state.rpgSetPiece.icon} ${state.rpgSetPiece.label}</strong><span>${state.rpgSetPiece.desc}</span>`;
    } else if (state.rpgYellowCard) {
      banner.classList.remove('hidden');
      banner.innerHTML = '<strong>🟨 Grasz z kartką</strong><span>Agresywne interwencje są teraz o poziom trudniejsze.</span>';
    } else {
      banner.classList.add('hidden');
      banner.innerHTML = '';
    }
  }
}

renderRpgBoard = function arcadeRenderRpgBoard() {
  arcadeBaseRenderRpgBoard();
  renderArcadeHud();
};

function arcadeTuneAction(original, possession) {
  const action = { ...original };
  const style = arcadeStyle();

  if (style.id === 'high_press' && possession === 'player' && state.rpgZone <= 1) {
    if (['short_build', 'carry'].includes(action.id)) action.dc += 1;
    if (action.id === 'long_ball') action.dc -= 1;
  }
  if (style.id === 'compact' && possession === 'player' && state.rpgZone >= 3) {
    if (['combination', 'killer_pass', 'cutback', 'placed_shot', 'power_shot'].includes(action.id)) action.dc += 1;
    if (action.id === 'long_shot') action.dc -= 1;
  }
  if (style.id === 'counter' && possession === 'opponent' && action.failAdvance) {
    action.failAdvance += 1;
  }
  if (state.rpgYellowCard && possession === 'opponent' && ['tackle', 'last_tackle'].includes(action.id)) {
    action.dc += 1;
    action.desc += ' Masz już żółtą kartkę.';
  }
  if (state.rpgOpponentMomentum >= 75 && possession === 'opponent') action.dc += 1;
  if (state.rpgMomentum >= 75 && possession === 'player' && !action.special) action.dc -= 1;
  action.dc = arcadeClamp(action.dc, 1, 5);
  return action;
}

function playerSetPieceActions(event) {
  if (!event) return [];
  if (event.type === 'penalty') return [
    { id:'penalty_placed', label:'🎯 Technicznie w róg', desc:'Najbezpieczniejszy wariant karnego.', dc:2, kind:'arcade_penalty', special:true, setPiece:true },
    { id:'penalty_power', label:'💥 Mocno pod poprzeczkę', desc:'Więcej ryzyka, brak półśrodków.', dc:3, kind:'arcade_penalty', special:true, setPiece:true },
    { id:'penalty_panenka', label:'😎 Panenka', desc:'Arcade pełną gębą. Trudny test albo wielki moment.', dc:4, kind:'arcade_penalty', special:true, setPiece:true },
  ];
  if (event.type === 'corner') return [
    { id:'corner_short', label:'🔁 Krótki róg', desc:'Zachowujesz piłkę i budujesz czystą pozycję.', dc:2, kind:'arcade_corner_setup', special:true, setPiece:true },
    { id:'corner_near', label:'🎯 Na bliższy słupek', desc:'Bezpośrednie zagrożenie bramki.', dc:3, kind:'arcade_corner_header', special:true, setPiece:true },
    { id:'corner_far', label:'🛰️ Na dalszy słupek', desc:'Trudniejsze, ale może otworzyć drugą piłkę.', dc:4, kind:'arcade_corner_far', special:true, setPiece:true },
  ];
  if (event.type === 'free_kick') return [
    { id:'fk_cross', label:'📡 Dośrodkowanie', desc:'Zamiast strzelać, wykreuj okazję w polu karnym.', dc:3, kind:'arcade_free_kick_cross', special:true, setPiece:true },
    { id:'fk_curl', label:'🎯 Nad murem', desc:'Techniczna próba bezpośrednio na bramkę.', dc:4, kind:'arcade_free_kick_shot', special:true, setPiece:true },
    { id:'fk_power', label:'💣 Bomba', desc:'Pełna moc. Najtrudniejsza wersja wolnego.', dc:5, kind:'arcade_free_kick_shot', special:true, setPiece:true },
  ];
  if (event.type === 'counter_3v2') return [
    { id:'counter_wing', label:'⚡ Wypuść skrzydło', desc:'Bezpieczniejsza droga do pola karnego.', dc:2, kind:'arcade_counter_event', special:true, setPiece:true },
    { id:'counter_striker', label:'🎯 Do napastnika', desc:'Podanie między obrońców na czystą pozycję.', dc:3, kind:'arcade_counter_event', special:true, setPiece:true },
    { id:'counter_finish', label:'💥 Kończ kontrę teraz', desc:'Ryzykowny strzał zanim obrona wróci.', dc:4, kind:'arcade_counter_finish', special:true, setPiece:true },
  ];
  return [];
}

function opponentSetPieceActions(event) {
  if (!event) return [];
  const corner = event.type === 'opponent_corner';
  return [
    { id:'setpiece_safe', label: corner ? '🧱 Kryj strefą' : '🧱 Ustaw mur', desc:'Najbezpieczniejsza organizacja defensywy.', dc:2, kind:'arcade_defend_setpiece_safe', special:true, setPiece:true },
    { id:'setpiece_claim', label: corner ? '🧤 Wyjdź bramkarzem' : '🧤 Zaufaj bramkarzowi', desc:'Odważniejsza interwencja i szansa na przejęcie.', dc:3, kind:'arcade_defend_setpiece_claim', special:true, setPiece:true },
    { id:'setpiece_counter', label:'⚡ Broń i ruszaj z kontrą', desc:'Największe ryzyko, ale udany test od razu uruchamia kontrę.', dc:4, kind:'arcade_defend_setpiece_counter', special:true, setPiece:true },
  ];
}

playerActions = function arcadePlayerActions() {
  if (state.rpgSetPiece && state.rpgPossession === 'player') return playerSetPieceActions(state.rpgSetPiece);
  const base = arcadeBasePlayerActions().map(action => arcadeTuneAction(action, 'player'));
  const momentum = Number(state.rpgMomentum || 0);
  const specials = [];

  if (momentum >= 25 && state.rpgZone <= 2) specials.push({
    id:'arcade_quick_counter', label:'⚡ Szybka kontra', desc:'Koszt 25% formy. Przeskocz dwie strefy i zaatakuj zanim rywal się ustawi.',
    dc:3, kind:'arcade_quick_counter', move:2, special:true, costMomentum:25,
  });
  if (momentum >= 50 && state.rpgZone >= 2) specials.push({
    id:'arcade_laser', label:'🎯 Laserowe podanie', desc:'Koszt 30% formy. Jedno podanie może rozciąć dwie linie.',
    dc:4, kind:'arcade_laser', move:2, special:true, costMomentum:30,
  });
  if (momentum >= 75 && state.rpgZone >= 2) specials.push({
    id:'arcade_bomb', label:'💣 Bomba z dystansu', desc:'Koszt 35% formy. Bez wejścia w pole karne — test bezpośrednio o gola.',
    dc:4, kind:'arcade_bomb', special:true, costMomentum:35,
  });
  if (momentum >= 100) specials.push({
    id:'arcade_golden', label:'⭐ ZŁOTA AKCJA', desc:'Koszt całej formy. Sukces daje sytuację sam na sam, ale nadal trzeba ją wykończyć.',
    dc:4, kind:'arcade_golden', special:true, costMomentum:100,
  });
  return [...base, ...specials];
};

opponentActions = function arcadeOpponentActions() {
  if (state.rpgSetPiece && state.rpgPossession === 'opponent') return opponentSetPieceActions(state.rpgSetPiece);
  const base = arcadeBaseOpponentActions().map(action => arcadeTuneAction(action, 'opponent'));
  const momentum = Number(state.rpgMomentum || 0);
  const specials = [];
  if (momentum >= 25 && state.rpgZone <= 1) specials.push({
    id:'arcade_bus', label:'🧱 Autobus', desc:'Koszt 20% formy. Zacieśnij pole karne i wypchnij rywala od bramki.',
    dc:2, kind:'arcade_bus', special:true, costMomentum:20,
  });
  if (momentum >= 50 && state.rpgZone >= 2) specials.push({
    id:'arcade_gegenpress', label:'🔥 Gegenpress', desc:'Koszt 30% formy. Spróbuj odzyskać piłkę natychmiast i wysoko.',
    dc:4, kind:'arcade_gegenpress', special:true, costMomentum:30,
  });
  return [...base, ...specials];
};

function arcadeRiskLabel(dc) {
  if (dc <= 2) return ['risk-low', 'bezpieczne'];
  if (dc >= 4) return ['risk-high', 'ryzykowne'];
  return ['', 'umiarkowane'];
}

renderActionPanel = function arcadeRenderActionPanel() {
  const panel = el('rpg-action-panel');
  if (!panel) return;
  const actions = availableRpgActions();
  const setPiece = state.rpgSetPiece;
  const role = setPiece
    ? setPiece.label
    : (state.rpgPossession === 'player' ? 'Wybierz zagranie' : 'Wybierz sposób obrony');
  const subtitle = setPiece
    ? setPiece.desc
    : 'Buduj sekwencję, zarządzaj formą i reaguj na styl rywala.';
  panel.innerHTML = `
    <div class="rpg-action-heading arcade-heading">
      <div><strong>${role}</strong><span>${subtitle}</span></div>
      <span>${state.rpgPossession === 'player' ? '⚽ Masz piłkę' : '🛡️ Bronisz'} · 🔥 ${state.rpgMomentum || 0}%</span>
    </div>
    <div class="rpg-actions arcade-actions"></div>`;
  const grid = panel.querySelector('.rpg-actions');
  actions.forEach(action => {
    const [riskClass, riskText] = arcadeRiskLabel(action.dc);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `rpg-action ${riskClass} ${action.special ? 'arcade-special' : ''}`;
    const cost = action.costMomentum ? `<span class="arcade-cost">−${action.costMomentum}% formy</span>` : '';
    button.innerHTML = `<strong>${action.label}</strong><p>${action.desc}</p><div class="rpg-action-meta"><span class="rpg-dc">Test ${action.dc}/5</span><span class="rpg-risk">${riskText}</span>${cost}</div>`;
    button.addEventListener('click', () => chooseRpgAction(action));
    grid.appendChild(button);
  });
};

chooseRpgAction = function arcadeChooseRpgAction(action) {
  if (action.costMomentum && Number(state.rpgMomentum || 0) < action.costMomentum) return;
  arcadeBaseChooseRpgAction(action);
  if (!state.rpgAwaitingAction && state.rpgCurrentAction === action && action.costMomentum) {
    arcadeMomentum(-action.costMomentum);
    addRpgLog(`${action.label}: wykorzystano ${action.costMomentum}% formy.`, '');
    renderArcadeHud();
  }
};

function clearSetPiece() {
  state.rpgSetPiece = null;
}

function resolveArcadePlayerAction(action, correct) {
  if (action.kind === 'arcade_penalty') {
    state.rpgShots += 1;
    if (correct) goalForPlayer('Rzut karny zamieniony na bramkę.');
    else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 1;
      state.rpgClearChance = false;
      addRpgLog('🧤 Karny zmarnowany — bramkarz ratuje rywala.', 'bad');
    }
    clearSetPiece();
    return true;
  }
  if (action.kind === 'arcade_corner_setup') {
    if (correct) {
      state.rpgZone = 4;
      state.rpgClearChance = true;
      addRpgLog('Krótki róg rozegrany idealnie. Masz czystą pozycję w szesnastce.', 'good');
    } else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 2;
      resetArcadeCombo();
      addRpgLog('Rywal czyta krótki róg i wychodzi z kontrą.', 'bad');
    }
    clearSetPiece();
    return true;
  }
  if (action.kind === 'arcade_corner_header') {
    state.rpgShots += 1;
    if (correct) goalForPlayer('Dośrodkowanie na bliższy słupek kończysz głową.');
    else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 1;
      addRpgLog('Główka mija bramkę. Rywal przejmuje piłkę.', 'bad');
    }
    clearSetPiece();
    return true;
  }
  if (action.kind === 'arcade_corner_far') {
    if (correct) {
      state.rpgZone = 4;
      state.rpgClearChance = true;
      addRpgLog('Druga piłka spada pod twoje nogi. Obrona jest kompletnie rozciągnięta.', 'good');
    } else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 2;
      addRpgLog('Za głębokie dośrodkowanie. Rywal wybija i przejmuje inicjatywę.', 'bad');
    }
    clearSetPiece();
    return true;
  }
  if (action.kind === 'arcade_free_kick_cross') {
    if (correct) {
      state.rpgZone = 4;
      state.rpgClearChance = true;
      addRpgLog('Idealna piłka z wolnego. Masz okazję na wykończenie.', 'good');
    } else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 2;
      addRpgLog('Dośrodkowanie z wolnego wybite przez pierwszego obrońcę.', 'bad');
    }
    clearSetPiece();
    return true;
  }
  if (action.kind === 'arcade_free_kick_shot') {
    state.rpgShots += 1;
    if (correct) goalForPlayer('Perfekcyjny rzut wolny wpada do siatki.');
    else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 1;
      addRpgLog('Wolny nie znajduje drogi do bramki.', 'bad');
    }
    clearSetPiece();
    return true;
  }
  if (action.kind === 'arcade_counter_event') {
    if (correct) {
      state.rpgZone = 4;
      state.rpgClearChance = true;
      addRpgLog('⚡ Kontra 3 na 2 rozegrana wzorowo — wychodzisz na czystą pozycję.', 'good');
    } else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 2;
      addRpgLog('Kontra zmarnowana przez niedokładne ostatnie podanie.', 'bad');
    }
    clearSetPiece();
    return true;
  }
  if (action.kind === 'arcade_counter_finish') {
    state.rpgShots += 1;
    if (correct) goalForPlayer('Kończysz kontrę zanim obrona zdąży wrócić.');
    else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 1;
      addRpgLog('Za szybka decyzja — strzał z kontry nie trafia do siatki.', 'bad');
    }
    clearSetPiece();
    return true;
  }
  if (action.kind === 'arcade_quick_counter') {
    if (correct) {
      state.rpgZone = Math.min(4, state.rpgZone + 2);
      if (state.rpgZone >= 4) state.rpgClearChance = true;
      addRpgLog('⚡ NITRO! Dwa sektory boiska minięte jednym atakiem.', 'good');
    } else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 2;
      addRpgLog('Rywal zatrzymuje kontrę i odzyskuje środek pola.', 'bad');
    }
    return true;
  }
  if (action.kind === 'arcade_laser') {
    if (correct) {
      state.rpgZone = Math.min(4, state.rpgZone + 2);
      state.rpgClearChance = state.rpgZone >= 4;
      addRpgLog('🎯 LASER! Podanie przecina dwie linie rywala.', 'good');
    } else {
      state.rpgPossession = 'opponent';
      state.rpgZone = Math.max(1, state.rpgZone - 1);
      addRpgLog('Laser przecięty. Rywal natychmiast przechodzi do ataku.', 'bad');
    }
    return true;
  }
  if (action.kind === 'arcade_bomb') {
    state.rpgShots += 1;
    if (correct) goalForPlayer('💣 BOMBA! Strzał z dystansu jest nie do obrony.');
    else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 2;
      addRpgLog('Bomba leci obok bramki. Rywal zaczyna od tyłu.', 'bad');
    }
    return true;
  }
  if (action.kind === 'arcade_golden') {
    if (correct) {
      state.rpgZone = 4;
      state.rpgClearChance = true;
      addRpgLog('⭐ ZŁOTA AKCJA! Jesteś sam na sam — następna decyzja może dać gola.', 'goal');
    } else {
      state.rpgPossession = 'opponent';
      state.rpgZone = 2;
      addRpgLog('Złota akcja zatrzymana w ostatnim momencie. Cała forma przepada.', 'bad');
    }
    return true;
  }
  return false;
}

resolvePlayerAction = function arcadeResolvePlayerAction(action, correct) {
  const style = arcadeStyle();
  const handled = resolveArcadePlayerAction(action, correct);
  if (!handled) arcadeBaseResolvePlayerAction(action, correct);

  if (!correct && style.id === 'counter' && state.rpgPossession === 'opponent') {
    state.rpgZone = Math.max(1, state.rpgZone - 1);
    addRpgLog('⚡ Styl rywala: natychmiastowa kontra po twojej stracie.', 'bad');
  }

  if (correct) {
    arcadeMomentum(9 + Number(action.dc || 3) * 2);
    arcadeMomentum(-6, true);
    if (state.rpgPossession === 'player' && action.kind !== 'shot' && !String(action.kind).includes('finish')) {
      addArcadeCombo(action.label.replace(/^[^A-Za-zĄĆĘŁŃÓŚŹŻ]+/u, '').trim());
    } else {
      resetArcadeCombo();
    }
  } else {
    arcadeMomentum(-14);
    arcadeMomentum(10, true);
    resetArcadeCombo();
  }
};

function resolveArcadeOpponentAction(action, correct) {
  if (String(action.kind).startsWith('arcade_defend_setpiece')) {
    if (correct) {
      state.rpgPossession = 'player';
      state.rpgZone = action.kind === 'arcade_defend_setpiece_counter' ? 3 : 1;
      addRpgLog(action.kind === 'arcade_defend_setpiece_counter'
        ? '⚡ Bronisz stały fragment i od razu wyprowadzasz kontrę.'
        : 'Stały fragment rywala obroniony. Piłka jest twoja.', 'good');
      resetArcadeCombo(action.kind === 'arcade_defend_setpiece_counter' ? 'Odbiór' : null);
    } else if (action.kind === 'arcade_defend_setpiece_safe') {
      state.rpgZone = 0;
      addRpgLog('Pierwsza piłka wybita, ale rywal zbiera drugą w polu karnym.', 'bad');
    } else {
      goalForOpponent('Stały fragment został wykorzystany.');
      resetArcadeCombo();
    }
    clearSetPiece();
    return true;
  }
  if (action.kind === 'arcade_bus') {
    if (correct) {
      state.rpgZone = Math.min(2, state.rpgZone + 2);
      addRpgLog('🧱 AUTOBUS! Pole karne zamknięte, rywal musi wycofać akcję.', 'good');
    } else {
      goalForOpponent('Rywal znalazł lukę między obrońcami.');
    }
    return true;
  }
  if (action.kind === 'arcade_gegenpress') {
    if (correct) {
      state.rpgPossession = 'player';
      state.rpgZone = 3;
      resetArcadeCombo('Odbiór');
      addRpgLog('🔥 GEGENPRESS! Odbierasz piłkę wysoko i od razu atakujesz.', 'good');
    } else {
      state.rpgZone = Math.max(0, state.rpgZone - 1);
      addRpgLog('Rywal mija pressing. Zrobiło się niebezpiecznie.', 'bad');
    }
    return true;
  }
  return false;
}

resolveOpponentAction = function arcadeResolveOpponentAction(action, correct) {
  const handled = resolveArcadeOpponentAction(action, correct);
  if (!handled) arcadeBaseResolveOpponentAction(action, correct);

  if (correct) {
    arcadeMomentum(12);
    arcadeMomentum(-12, true);
    if (state.rpgPossession === 'player' && (!state.rpgCombo || !state.rpgCombo.length)) resetArcadeCombo('Odbiór');
  } else {
    arcadeMomentum(-8);
    arcadeMomentum(14, true);
    if (state.rpgPossession === 'opponent') resetArcadeCombo();
  }
};

function arcadeEvent(icon, label, desc, type) {
  return { icon, label, desc, type };
}

function maybeTriggerArcadeEvent() {
  if (state.rpgEnded || state.rpgHalftimePending || state.rpgInAddedTime || state.rpgSetPiece) return;
  if ((state.rpgArcadeEventCount || 0) >= 3) return;
  const actionsSince = (state.rpgActionsPlayed || 0) - (state.rpgLastEventAction || -3);
  if (actionsSince < 3) return;

  const style = arcadeStyle();
  const chance = style.id === 'chaos' ? 0.48 : 0.30;
  if (Math.random() > chance && actionsSince < 5) return;

  const pool = [];
  if (state.rpgPossession === 'player') {
    if (state.rpgZone >= 3) {
      pool.push(arcadeEvent('🚩', 'Rzut rożny', 'Masz stały fragment. Wybierz sposób rozegrania.', 'corner'));
      pool.push(arcadeEvent('🎯', 'Rzut wolny 20–25 m', 'Możesz strzelać albo dograć w pole karne.', 'free_kick'));
      if (state.rpgZone >= 4) pool.push(arcadeEvent('🥅', 'Rzut karny!', 'Trzy warianty wykonania. Wiedza decyduje o jakości strzału.', 'penalty'));
    } else {
      pool.push(arcadeEvent('⚡', 'Kontra 3 na 2', 'Obrona rywala jest rozciągnięta. Wybierz drogę do bramki.', 'counter_3v2'));
    }
  } else if (state.rpgZone <= 1) {
    pool.push(arcadeEvent('🚩', 'Róg dla rywala', 'Musisz ustawić obronę stałego fragmentu.', 'opponent_corner'));
    pool.push(arcadeEvent('🎯', 'Wolny dla rywala', 'Rywal ma niebezpieczny stały fragment.', 'opponent_free_kick'));
  }

  // Immediate events do not depend on the answer that preceded them.
  const immediateRoll = Math.random();
  if (immediateRoll < 0.16 && !state.rpgYellowCard) {
    state.rpgYellowCard = true;
    state.rpgArcadeEventCount += 1;
    state.rpgLastEventAction = state.rpgActionsPlayed;
    addRpgLog('🟨 Żółta kartka. Od teraz agresywne interwencje są trudniejsze.', 'bad');
    renderArcadeHud();
    return;
  }
  if (immediateRoll > 0.84) {
    arcadeMomentum(-10);
    state.rpgArcadeEventCount += 1;
    state.rpgLastEventAction = state.rpgActionsPlayed;
    addRpgLog('🩹 Krótka przerwa przez uraz wybija z rytmu. −10% formy.', '');
    renderArcadeHud();
    return;
  }

  if (!pool.length) return;
  state.rpgSetPiece = pool[Math.floor(Math.random() * pool.length)];
  state.rpgArcadeEventCount += 1;
  state.rpgLastEventAction = state.rpgActionsPlayed;
  addRpgLog(`${state.rpgSetPiece.icon} ${state.rpgSetPiece.label}! ${state.rpgSetPiece.desc}`, 'goal');
  renderArcadeHud();
}

advanceRpgClock = function arcadeAdvanceRpgClock(action) {
  if (state.rpgInAddedTime) {
    state.rpgEnded = true;
    return;
  }
  const setPiece = Boolean(action?.setPiece);
  const delta = setPiece ? 3 : 4 + Math.ceil(Number(action?.dc || 3) / 3);
  state.rpgMinute += delta;
  if (!state.rpgHalftimeDone && state.rpgMinute >= 45) {
    state.rpgMinute = 45;
    state.rpgHalftimePending = true;
    return;
  }
  if (state.rpgHalftimeDone && state.rpgMinute >= 90) {
    const dangerous = state.rpgSetPiece ||
      (state.rpgPossession === 'player' && state.rpgZone >= 3) ||
      (state.rpgPossession === 'opponent' && state.rpgZone <= 1);
    if (dangerous && !state.rpgAddedTimePending) {
      state.rpgMinute = 90;
      state.rpgAddedTimePending = true;
    } else {
      state.rpgMinute = 90;
      state.rpgEnded = true;
    }
  }
};

const arcadeBaseNarratorText = narratorText;
narratorText = function arcadeNarratorText() {
  if (state.rpgSetPiece) return `${state.rpgSetPiece.icon} ${state.rpgSetPiece.label}: ${state.rpgSetPiece.desc}`;
  if ((state.rpgCombo || []).length === 2 && state.rpgPossession === 'player') return 'Jeszcze jedno udane zagranie i odpalasz PERFECT BUILD-UP.';
  if (state.rpgMomentum >= 100 && state.rpgPossession === 'player') return '🔥 Forma 100%! ZŁOTA AKCJA jest gotowa.';
  if (state.rpgOpponentMomentum >= 75 && state.rpgPossession === 'opponent') return 'Rywal złapał momentum. Teraz każdy test defensywny jest trudniejszy.';
  return arcadeBaseNarratorText();
};

answer = function arcadeAnswer(button, option) {
  if (!rpgActive()) return arcadeBaseAnswer(button, option);
  const beforeAnswered = Number(state.answered || 0);
  const result = arcadeBaseAnswer(button, option);
  if (Number(state.answered || 0) > beforeAnswered) {
    maybeTriggerArcadeEvent();
    renderArcadeHud();
  }
  return result;
};

// Refresh descriptions when the format is selected after the landing screen.
el('game-format')?.addEventListener('change', () => {
  if (currentFormat() === 'match90' && el('format-description')) {
    el('format-description').textContent = 'Arcade RPG: buduj sekwencje, ładuj formę, odpalaj zagrania specjalne i reaguj na styl rywala oraz wydarzenia meczowe.';
  }
});
