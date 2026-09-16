// Runtime quality layer for the public beta.
// It keeps the full question bank available, but makes mixed games less repetitive
// and removes artificial distractors from questions with a natural 2/3-answer set.

const dryQuestionTypes = new Set([
  'match_date',
  'match_weekday',
  'match_round',
  'round_number',
]);

const richQuestionTypes = new Set([
  'goal_scorer',
  'first_scorer_complete',
  'last_scorer_complete',
  'brace_scorer',
  'hattrick_scorer',
  'starting_xi_player',
  'came_off_bench',
  'match_captain',
  'substitution_minute_in',
  'player_match_goals',
  'player_match_goals_complete',
  'player_match_club',
  'player_match_role',
  'player_season_goals',
  'player_season_appearances',
  'player_club_season',
  'club_top_scorer',
  'compare_player_goals',
  'roster_member',
  'roster_role',
  'biggest_win_opponent',
  'highest_scoring_match_opponent',
  'longest_unbeaten_streak',
  'longest_winless_streak',
]);

const mechanicalQuestionTypes = new Set([
  'match_total_goals',
  'club_match_goals',
  'club_match_conceded',
  'season_points',
  'season_wins',
  'season_draws',
  'season_losses',
  'season_goals_for',
  'season_goals_against',
  'club_home_points',
  'club_away_points',
]);

function questionQualityWeight(q) {
  const type = q?.type || '';
  if (type.startsWith('social_')) return 4.0;
  if (richQuestionTypes.has(type)) return 2.5;
  if (dryQuestionTypes.has(type)) return 0.22;
  if (mechanicalQuestionTypes.has(type)) return 0.65;
  return 1.15;
}

function weightedQuestionOrder(values) {
  const weighted = values.map(value => ({
    value,
    key: Math.pow(Math.random(), 1 / Math.max(0.05, questionQualityWeight(value))),
  }));
  weighted.sort((a, b) => b.key - a.key);
  const ordered = weighted.map(x => x.value);

  // Avoid long runs of the same question type where another type is available nearby.
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i]?.type !== ordered[i - 1]?.type) continue;
    const swapAt = ordered.findIndex((q, idx) => idx > i && idx <= i + 8 && q?.type !== ordered[i - 1]?.type);
    if (swapAt > i) [ordered[i], ordered[swapAt]] = [ordered[swapAt], ordered[i]];
  }
  return ordered;
}

function naturalizeOptions(q) {
  if (!q || !Array.isArray(q.options)) return;
  let options = [...new Set(q.options)];

  if (q.type === 'match_winner') {
    const clubs = Array.isArray(q.clubs) ? q.clubs.filter(c => q.question.includes(c)) : [];
    options = options.filter(x => x === 'Remis' || clubs.includes(x));
  } else if (q.type === 'higher_finish') {
    options = options.filter(x => x !== 'Zajęły to samo miejsce' && x !== 'Żaden z tych klubów');
  } else if (q.type === 'compare_player_goals') {
    options = options.filter(x => x !== 'Żaden z nich');
  } else if (q.type === 'player_match_role') {
    options = options.filter(x => x === 'Podstawowy skład' || x === 'Ławka rezerwowych');
  } else if (q.type === 'player_match_club') {
    const clubs = Array.isArray(q.clubs) ? q.clubs.filter(c => q.question.includes(c)) : [];
    options = options.filter(x => clubs.includes(x));
  } else if (q.type === 'h2h_season_points') {
    const correct = Number.parseInt(q.answer, 10);
    if (Number.isFinite(correct)) {
      const feasible = [0, 1, 2, 3, 4, 6]; // two league meetings: 5 points is impossible
      options = feasible
        .sort((a, b) => Math.abs(a - correct) - Math.abs(b - correct) || a - b)
        .slice(0, 4)
        .map(String);
      if (!options.includes(String(correct))) options[options.length - 1] = String(correct);
    }
  }

  if (options.length >= 2 && options.length <= 4 && options.includes(q.answer)) q.options = options;
}

// app.js declares these as classic-script globals. The public beta loads this file
// immediately afterwards, before questions.json normally finishes downloading.
const baseShuffle = shuffle;
shuffle = function qualityShuffle(values) {
  if (Array.isArray(values) && values.length && typeof values[0] === 'object' && values[0] !== null && 'type' in values[0]) {
    return weightedQuestionOrder(values);
  }
  return baseShuffle(values);
};

const baseShowQuestion = showQuestion;
showQuestion = function qualityShowQuestion() {
  if (state.index < state.pool.length) naturalizeOptions(state.pool[state.index]);
  return baseShowQuestion();
};

const baseLabelType = labelType;
labelType = function qualityLabelType(type) {
  if (String(type).startsWith('social_')) return 'Kontekst klubowy / ciekawostka';
  return baseLabelType(type);
};
