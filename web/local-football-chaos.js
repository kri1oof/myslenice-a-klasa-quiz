// Extra A-klasa match chaos: touchline/crowd ambience and one rare referee robbery.
// Loaded after local-football-flavour.js. It does not change whether a quiz answer
// is counted as correct; it may only cancel the on-pitch reward of a correct answer.

const LOCAL_REFEREE_ROBBERY_CHANCE = 0.07;
const LOCAL_REFEREE_ROBBERY_CHAOS_CHANCE = 0.11;

const LOCAL_MATCH_AMBIENT = Object.freeze([
  ['🗣️ ŁAWKA', 'PLECY! PLECY!'],
  ['🗣️ ŁAWKA', 'CZAS MASZ! ...nie, już nie masz.'],
  ['🗣️ ŁAWKA', 'GRAJ SWOJE!'],
  ['🗣️ ŁAWKA', 'ODWRÓĆ SIĘ!'],
  ['🗣️ ŁAWKA', 'WYBIJ TO, NIE KOMBINUJ!'],
  ['🗣️ ŁAWKA', 'OSTATNI!'],
  ['🗣️ ŁAWKA', 'SĘDZIA, ON GO TRZYMA OD PIĘCIU MINUT!'],
  ['📣 TRYBUNY', 'PANIE SĘDZIO, OKULARY!'],
  ['📣 TRYBUNY', 'NO STRZELAJ!'],
  ['📣 TRYBUNY', 'SAM JESTEŚ!'],
  ['📣 TRYBUNY', 'ILE JESZCZE?!'],
  ['📣 TRYBUNY', 'DOBRZE JEST, PANOWIE!'],
  ['🌳 ZZA PŁOTU', 'Za moich czasów to się grało bez tych wszystkich taktyk.'],
  ['🌳 ZZA PŁOTU', 'Ten szybki jest. Tylko piłka czasem szybsza.'],
  ['🌳 ZZA PŁOTU', 'Piłka za płotem. Kto najbliżej, ten idzie.'],
  ['🌳 ZZA PŁOTU', 'Jakby podał wcześniej, to by była bramka.'],
  ['🧑‍⚖️ SĘDZIA', 'GRAMY, GRAMY!'],
  ['🧑‍⚖️ SĘDZIA', 'BEZ GADANIA!'],
  ['🧑‍⚖️ SĘDZIA', 'KAPITAN DO MNIE, RESZTA ODEJŚĆ!'],
]);

const localChaosBaseResetRpgState = resetRpgState;
resetRpgState = function localChaosResetRpgState() {
  localChaosBaseResetRpgState();
  state.rpgRefereeRobberyUsed = false;
  state.rpgLastAmbientAction = -3;
  state.rpgLastAmbientText = '';
};

function maybeLocalMatchAmbient() {
  if (!rpgActive() || state.rpgEnded || state.rpgHalftimePending) return;
  const actionNo = Number(state.rpgActionsPlayed || 0);
  if (actionNo < 1) return;
  if (actionNo - Number(state.rpgLastAmbientAction ?? -3) < 2) return;

  const style = typeof arcadeStyle === 'function' ? arcadeStyle() : null;
  const chance = style?.id === 'chaos' ? 0.52 : 0.32;
  if (Math.random() > chance) return;

  let candidates = LOCAL_MATCH_AMBIENT.filter(([, text]) => text !== state.rpgLastAmbientText);
  if (!candidates.length) candidates = [...LOCAL_MATCH_AMBIENT];
  const [source, text] = candidates[Math.floor(Math.random() * candidates.length)];
  state.rpgLastAmbientAction = actionNo;
  state.rpgLastAmbientText = text;
  localChaosBaseAddRpgLog(`${source}: „${text}”`, '');
}

const localChaosBaseAddRpgLog = addRpgLog;
addRpgLog = function localChaosAddRpgLog(text, tone = '') {
  const result = localChaosBaseAddRpgLog(text, tone);
  const isAmbient = String(text).includes('ŁAWKA: „') ||
    String(text).includes('TRYBUNY: „') ||
    String(text).includes('ZZA PŁOTU: „') ||
    String(text).includes('SĘDZIA: „');
  const isRobbery = String(text).includes('WAŁEK SĘDZIOWSKI');
  if (!isAmbient && !isRobbery) maybeLocalMatchAmbient();
  return result;
};

function localRefereeRobberyRoll(action, correct) {
  if (!correct || !rpgActive() || state.rpgEnded || state.rpgHalftimePending) return false;
  if (state.rpgRefereeRobberyUsed) return false;
  if (Number(state.rpgActionsPlayed || 0) < 3) return false;
  // Do not stack the gag on top of an already-running set piece.
  if (action?.setPiece || state.rpgSetPiece) return false;

  const style = typeof arcadeStyle === 'function' ? arcadeStyle() : null;
  const chance = style?.id === 'chaos'
    ? LOCAL_REFEREE_ROBBERY_CHAOS_CHANCE
    : LOCAL_REFEREE_ROBBERY_CHANCE;
  return Math.random() < chance;
}

function localActionLooksLikeShot(action) {
  const kind = String(action?.kind || '');
  const id = String(action?.id || '');
  return kind.includes('shot') || kind.includes('finish') || kind.includes('penalty') ||
    ['long_shot', 'placed_shot', 'power_shot', 'arcade_bomb', 'counter_finish'].includes(id);
}

function applyLocalRefereeRobbery(action, defending) {
  state.rpgRefereeRobberyUsed = true;
  if (action) action.refereeRobbery = true;
  state.rpgClearChance = false;
  if (typeof resetArcadeCombo === 'function') resetArcadeCombo();

  if (!defending) {
    const shot = localActionLooksLikeShot(action);
    if (shot) state.rpgShots = Number(state.rpgShots || 0) + 1;
    state.rpgPossession = 'opponent';
    state.rpgZone = shot ? 1 : 2;

    const messages = shot ? [
      '🚩 WAŁEK SĘDZIOWSKI! Wszystko zrobione dobrze, piłka nawet zmierzała tam gdzie trzeba, ale chorągiewka idzie w górę. Spalony z kapelusza.',
      '🧑‍⚖️ WAŁEK SĘDZIOWSKI! Sędzia anuluje akcję. Powód? „Coś tam było”. Powtórki oczywiście nie ma.',
      '📣 WAŁEK SĘDZIOWSKI! Już miała być feta, ale pan sędzia dopatrzył się przewinienia, którego poza nim nie widział nikt na obiekcie.',
    ] : [
      '📣 WAŁEK SĘDZIOWSKI! Prawidłowe zagranie, ale gwizdek za faul w ataku. Z ławki natychmiast: „PANIE SĘDZIO, ZA CO?!”',
      '🧑‍⚖️ WAŁEK SĘDZIOWSKI! Akcja idzie idealnie, więc naturalnie sędzia ją przerywa. Decyzja: faul. Uzasadnienie: brak.',
      '🚩 WAŁEK SĘDZIOWSKI! Liniowy coś zobaczył. Co dokładnie — tego nie wie nawet liniowy. Piłka dla rywala.',
    ];
    localChaosBaseAddRpgLog(messages[Math.floor(Math.random() * messages.length)], 'bad');
  } else {
    state.rpgPossession = 'opponent';
    state.rpgZone = Math.max(0, Number(state.rpgZone || 0) - 1);
    if (state.rpgZone <= 1 && typeof arcadeEvent === 'function') {
      state.rpgSetPiece = arcadeEvent(
        '🎯',
        'Wolny dla rywala po „faulu”',
        'Odbiór był czysty, ale pan sędzia ma własną wersję wydarzeń.',
        'opponent_free_kick',
      );
    }
    const messages = [
      '🧑‍⚖️ WAŁEK SĘDZIOWSKI! Czysty odbiór, idealny timing… i gwizdek dla rywala. Ławka już stoi.',
      '📣 WAŁEK SĘDZIOWSKI! Bronisz jak należy, ale sędzia widzi faul. „Panie sędzio, piłkę trafił!” nie zmienia decyzji.',
      '🟨 WAŁEK SĘDZIOWSKI! Wszystko zgodnie ze sztuką, tylko nie według człowieka z gwizdkiem. Rywal zostaje przy piłce.',
    ];
    localChaosBaseAddRpgLog(messages[Math.floor(Math.random() * messages.length)], 'bad');
  }

  // The quiz answer remains correct. A little anger keeps the player from feeling
  // completely punished for knowing the answer.
  if (typeof arcadeMomentum === 'function') arcadeMomentum(5);
  localChaosBaseAddRpgLog('🔥 Złość po decyzji: +5% ognia. Wiedza była dobra, tylko sędzia nie współpracował.', 'good');
  if (typeof renderArcadeHud === 'function') renderArcadeHud();
}

const localChaosBaseResolvePlayerAction = resolvePlayerAction;
resolvePlayerAction = function localChaosResolvePlayerAction(action, correct) {
  if (localRefereeRobberyRoll(action, correct)) {
    applyLocalRefereeRobbery(action, false);
    return;
  }
  return localChaosBaseResolvePlayerAction(action, correct);
};

const localChaosBaseResolveOpponentAction = resolveOpponentAction;
resolveOpponentAction = function localChaosResolveOpponentAction(action, correct) {
  if (localRefereeRobberyRoll(action, correct)) {
    applyLocalRefereeRobbery(action, true);
    return;
  }
  return localChaosBaseResolveOpponentAction(action, correct);
};
