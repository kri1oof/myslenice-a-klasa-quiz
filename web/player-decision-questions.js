// Player/minute decision layer for Match RPG.
// Adds labels/categories for official ŁNP-derived questions and makes penalties
// prefer those questions instead of drawing randomly from the whole bank.

const PLAYER_DECISION_RPG_TYPES = new Set([
  'player_season_minutes_over',
  'compare_player_minutes',
  'compare_player_starts',
  'compare_player_appearances',
  'compare_player_cards',
  'match_player_minutes',
  'match_compare_player_minutes',
  'compare_substitution_entry',
  'unused_substitute',
  'match_squad_absent',
  'match_squad_size',
  'starting_xi_player',
  'came_off_bench',
  'substitution_minute_in',
  'player_match_role',
  'player_match_club',
]);

Object.assign(typeLabels, {
  player_season_minutes_over: 'Próg minut zawodnika',
  compare_player_minutes: 'Porównanie minut zawodników',
  compare_player_starts: 'Porównanie pierwszych składów',
  compare_player_appearances: 'Porównanie występów',
  compare_player_cards: 'Porównanie kartek',
  match_player_minutes: 'Minuty zawodnika w meczu',
  match_compare_player_minutes: 'Kto grał dłużej',
  compare_substitution_entry: 'Kto wszedł wcześniej',
  unused_substitute: 'Niewykorzystany rezerwowy',
  match_squad_absent: 'Kogo nie było w kadrze meczowej',
  match_squad_size: 'Liczebność kadry meczowej',
});

const playerDecisionBaseCategoryForType = categoryForType;
categoryForType = function playerDecisionCategoryForType(type) {
  const value = String(type || '');
  if (/minutes|compare_player_(starts|appearances|cards)|compare_substitution_entry/.test(value)) return 'decyzje';
  if (/match_squad_absent|match_squad_size|unused_substitute/.test(value)) return 'sklady';
  return playerDecisionBaseCategoryForType(type);
};
categoryLabels.decyzje = 'Minuty i porównania zawodników';

const playerDecisionBaseChooseRpgQuestion = chooseRpgQuestion;
chooseRpgQuestion = function playerDecisionChooseRpgQuestion(dc, excludeId = null) {
  const penaltyMoment = state.rpgQuestionPreference === 'player_decisions' ||
    (!state.rpgAwaitingAction && state.rpgCurrentAction?.kind === 'arcade_penalty');
  if (!penaltyMoment) return playerDecisionBaseChooseRpgQuestion(dc, excludeId);

  const eligible = state.rpgQuestionBank.filter(q =>
    q.id !== excludeId &&
    Array.isArray(q.options) && q.options.length >= 2 &&
    PLAYER_DECISION_RPG_TYPES.has(String(q.type || '')) &&
    !String(q.type || '').startsWith('special_')
  );
  if (!eligible.length) return playerDecisionBaseChooseRpgQuestion(dc, excludeId);

  let candidates = eligible.filter(q => !state.rpgUsedQuestionIds.has(q.id));
  if (!candidates.length) candidates = eligible;

  const ranked = candidates.map(q => {
    const difficulty = Number(q.difficulty || 3);
    const category = categoryForType(q.type);
    const distance = Math.abs(difficulty - dc);
    const repeatPenalty = category === state.rpgLastCategory ? 0.7 : 0;
    return { q, weight: distance + repeatPenalty + Math.random() * 0.35 };
  }).sort((a, b) => a.weight - b.weight);

  const chosen = ranked[0].q;
  state.rpgUsedQuestionIds.add(chosen.id);
  state.rpgLastCategory = categoryForType(chosen.type);
  return chosen;
};

const playerDecisionBaseChooseRpgAction = chooseRpgAction;
chooseRpgAction = function playerDecisionChooseRpgAction(action) {
  state.rpgQuestionPreference = action?.kind === 'arcade_penalty' ? 'player_decisions' : null;
  try {
    return playerDecisionBaseChooseRpgAction(action);
  } finally {
    state.rpgQuestionPreference = null;
  }
};

const playerDecisionBaseSetPieceActions = playerSetPieceActions;
playerSetPieceActions = function playerDecisionSetPieceActions(event) {
  if (event?.type !== 'penalty') return playerDecisionBaseSetPieceActions(event);
  return [
    {
      id: 'penalty_left',
      label: '⬅️ Strzel w lewo',
      desc: 'Wybierasz lewy róg. Powodzenie rozstrzygnie test wiedzy o zawodnikach.',
      dc: 3,
      kind: 'arcade_penalty',
      special: true,
      setPiece: true,
    },
    {
      id: 'penalty_center',
      label: '⬆️ Strzel środkiem',
      desc: 'Zostajesz przy środku bramki. Powodzenie rozstrzygnie test wiedzy o zawodnikach.',
      dc: 3,
      kind: 'arcade_penalty',
      special: true,
      setPiece: true,
    },
    {
      id: 'penalty_right',
      label: '➡️ Strzel w prawo',
      desc: 'Wybierasz prawy róg. Powodzenie rozstrzygnie test wiedzy o zawodnikach.',
      dc: 3,
      kind: 'arcade_penalty',
      special: true,
      setPiece: true,
    },
  ];
};
