// Text commentator for Match RPG. Loaded late so it observes the final outcome
// after scenarios, tactics, player state, events, rivalry, power-ups and achievements.
const matchCommentatorCore = globalThis.MatchCommentatorCore;
const commentatorBaseResetRpgState = resetRpgState;
const commentatorBaseEnsureRpgUi = ensureRpgUi;
const commentatorBaseRenderRpgBoard = renderRpgBoard;
const commentatorBaseChooseRpgAction = chooseRpgAction;
const commentatorBaseAnswer = answer;
const commentatorBaseFinishGame = finishGame;

function commentatorContext(extra = {}) {
  const rivalry = state.rpgRivalryProfile || {};
  return {
    minute: Number(state.rpgMinute || 0),
    playerGoalsAfter: Number(state.rpgPlayerGoals || 0),
    opponentGoalsAfter: Number(state.rpgOpponentGoals || 0),
    rivalryType: rivalry.type || 'normal',
    opponentClub: state.rpgOpponentClub || '',
    playerName: state.rpgCharacter?.player || '',
    ...extra,
  };
}

function ensureCommentatorUi() {
  const narrator = el('rpg-narrator');
  if (!narrator) return;
  narrator.classList.add('rpg-commentator');
  const label = narrator.querySelector('small');
  if (label) label.textContent = 'Komentator';
  if (!el('rpg-commentator-status')) {
    const status = document.createElement('span');
    status.id = 'rpg-commentator-status';
    status.className = 'rpg-commentator-status';
    status.textContent = 'RELACJA NA ŻYWO';
    narrator.appendChild(status);
  }
}

function renderCommentary() {
  ensureCommentatorUi();
  if (!rpgActive()) return;
  const narrator = el('rpg-narrator');
  const line = narrator?.querySelector('strong');
  if (!line) return;
  const latest = state.rpgCommentaryLatest;
  if (latest?.text) {
    line.textContent = latest.text;
    narrator.classList.toggle('good', latest.tone === 'good');
    narrator.classList.toggle('bad', latest.tone === 'bad');
    narrator.classList.toggle('goal', latest.tone === 'goal');
  } else if (matchCommentatorCore) {
    line.textContent = matchCommentatorCore.openingLine(commentatorContext());
    narrator.classList.remove('good', 'bad', 'goal');
  }
}

function setCommentary(text, tone = '', kind = 'live') {
  if (!text) return;
  const entry = {
    text: String(text),
    tone,
    kind,
    minute: Number(state.rpgMinute || 0),
    score: `${Number(state.rpgPlayerGoals || 0)}:${Number(state.rpgOpponentGoals || 0)}`,
  };
  state.rpgCommentaryLatest = entry;
  state.rpgCommentaryHistory = [entry, ...(state.rpgCommentaryHistory || [])].slice(0, 8);
  renderCommentary();
}

resetRpgState = function commentatorResetRpgState() {
  commentatorBaseResetRpgState();
  state.rpgCommentaryLatest = null;
  state.rpgCommentaryHistory = [];
};

ensureRpgUi = function commentatorEnsureRpgUi() {
  commentatorBaseEnsureRpgUi();
  ensureCommentatorUi();
};

renderRpgBoard = function commentatorRenderRpgBoard() {
  commentatorBaseRenderRpgBoard();
  renderCommentary();
};

chooseRpgAction = function commentatorChooseRpgAction(action) {
  const result = commentatorBaseChooseRpgAction(action);
  if (rpgActive() && matchCommentatorCore && action) {
    setCommentary(matchCommentatorCore.decisionLine(commentatorContext({
      actionLabel: action.label,
      possession: state.rpgPossession,
    })), '', 'decision');
  }
  return result;
};

answer = function commentatorAnswer(button, option) {
  if (!rpgActive()) return commentatorBaseAnswer(button, option);
  const action = state.rpgCurrentAction;
  const question = state.current;
  const before = {
    playerGoals: Number(state.rpgPlayerGoals || 0),
    opponentGoals: Number(state.rpgOpponentGoals || 0),
    possession: state.rpgPossession,
    zone: Number(state.rpgZone || 0),
    minute: Number(state.rpgMinute || 0),
  };
  const knowledgeCorrect = Boolean(question && option === question.answer);
  const result = commentatorBaseAnswer(button, option);

  if (matchCommentatorCore && action) {
    const outcome = state.rpgScenarioLastOutcome;
    const success = typeof outcome?.success === 'boolean' ? outcome.success : knowledgeCorrect;
    const ctx = commentatorContext({
      minute: before.minute,
      actionLabel: outcome?.actionLabel || action.label,
      knowledgeCorrect: typeof outcome?.knowledgeCorrect === 'boolean' ? outcome.knowledgeCorrect : knowledgeCorrect,
      success,
      playerGoalsBefore: before.playerGoals,
      opponentGoalsBefore: before.opponentGoals,
      playerGoalsAfter: Number(state.rpgPlayerGoals || 0),
      opponentGoalsAfter: Number(state.rpgOpponentGoals || 0),
      possessionBefore: before.possession,
      possessionAfter: state.rpgPossession,
      zoneBefore: before.zone,
      zoneAfter: Number(state.rpgZone || 0),
    });
    const scored = ctx.playerGoalsAfter > ctx.playerGoalsBefore;
    const conceded = ctx.opponentGoalsAfter > ctx.opponentGoalsBefore;
    setCommentary(matchCommentatorCore.outcomeLine(ctx), scored ? 'goal' : conceded || !success ? 'bad' : 'good', 'outcome');
  }
  return result;
};

function ensureResultCommentary() {
  const result = el('result');
  if (!result || el('result-commentary')) return;
  const card = document.createElement('p');
  card.id = 'result-commentary';
  card.className = 'result-commentary';
  const details = el('result-details');
  if (details) details.insertAdjacentElement('afterend', card);
  else result.appendChild(card);
}

finishGame = function commentatorFinishGame() {
  const finalContext = {
    playerGoals: Number(state.rpgPlayerGoals || 0),
    opponentGoals: Number(state.rpgOpponentGoals || 0),
  };
  const result = commentatorBaseFinishGame();
  if (!rpgActive() || !matchCommentatorCore) return result;
  ensureResultCommentary();
  const card = el('result-commentary');
  if (card) card.innerHTML = `<small>KOMENTATOR</small><strong>${matchCommentatorCore.finishLine(finalContext)}</strong>`;
  return result;
};
