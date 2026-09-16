const state = {
  all: [],
  pool: [],
  current: null,
  index: 0,
  correct: 0,
  answered: 0,
  availableCount: 0,
  clubMeta: {},
};

const el = (id) => document.getElementById(id);

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const typeLabels = {
  match_score: 'Wynik meczu',
  match_winner: 'Zwycięzca meczu',
  match_total_goals: 'Liczba goli w meczu',
  club_goals_for: 'Bramki drużyny w sezonie',
  club_goals_against: 'Stracone bramki drużyny',
  round_opponent: 'Rywal w danej kolejce',
  match_round: 'Kolejka meczu',
  halftime_score: 'Wynik do przerwy',
  standing_position: 'Miejsce w tabeli',
  standing_points: 'Punkty w tabeli',
  player_season_goals: 'Gole zawodnika w sezonie',
  top_scorer: 'Najlepszy strzelec',
  player_goal_compare: 'Porównanie strzelców',
  goal_scorer: 'Strzelec bramki',
  clean_sheets: 'Czyste konta',
  btts_matches: 'Mecze z golami obu drużyn',
  winning_streak: 'Seria zwycięstw',
  biggest_win: 'Najwyższe zwycięstwo',
  highest_scoring_club_match: 'Najbardziej bramkowy mecz drużyny',
  match_date: 'Data meczu',
  match_weekday: 'Dzień tygodnia meczu',
  starting_xi_player: 'Wyjściowy skład',
  came_off_bench: 'Wejście z ławki',
  substitution_minute_in: 'Minuta zmiany',
  match_captain: 'Kapitan w meczu',
  shirt_number_match: 'Numer koszulki',
  substitutes_used: 'Liczba wykorzystanych rezerwowych',
  player_match_goals: 'Gole zawodnika w meczu',
  player_match_goals_complete: 'Gole zawodnika w meczu',
  first_scorer_complete: 'Pierwszy strzelec meczu',
  last_scorer_complete: 'Ostatni strzelec meczu',
  distinct_scorers_complete: 'Liczba różnych strzelców',
  brace_scorer: 'Dublet w meczu',
  hattrick_scorer: 'Hat-trick w meczu',
  first_half_goal_count: 'Gole w I połowie',
  second_half_goal_count: 'Gole w II połowie',
  round_total_goals: 'Gole w całej kolejce',
  round_highest_scoring_match: 'Najbardziej bramkowy mecz kolejki',
  season_zero_zero_matches: 'Remisy 0:0 w sezonie',
  season_five_plus_goal_matches: 'Mecze z minimum 5 golami',
  most_common_score: 'Najczęstszy wynik',
  highest_scoring_round: 'Najbardziej bramkowa kolejka',
  club_home_points: 'Punkty u siebie',
  club_away_points: 'Punkty na wyjazdach',
  longest_unbeaten_streak: 'Najdłuższa seria bez porażki',
  longest_winless_streak: 'Najdłuższa seria bez zwycięstwa',
  first_win_round: 'Pierwsze zwycięstwo w sezonie',
  h2h_season_points: 'Punkty H2H w sezonie',
  league_team_count: 'Liczba drużyn w lidze',
  club_not_in_season: 'Która drużyna nie grała w sezonie',
  player_club_season: 'Klub zawodnika w sezonie',
  player_season_membership: 'Sezon występów zawodnika',
};

function labelType(type) {
  return typeLabels[type] || type.replaceAll('_', ' ');
}

function refreshTypeOptions() {
  const type = el('type');
  const values = [...new Set(state.all.map(q => q.type))].sort();
  type.innerHTML = '<option value="all">Wszystkie</option>' +
    values.map(v => `<option value="${v}">${labelType(v)}</option>`).join('');
}

function refreshClubOptions() {
  const club = el('club');
  const clubs = [...new Set(state.all.flatMap(q => Array.isArray(q.clubs) ? q.clubs : []))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pl'));
  club.innerHTML = clubs.map(name => `<option value="${name}">${name}</option>`).join('');
  el('scope-mode').querySelector('option[value="club"]').disabled = clubs.length === 0;
  updateScopeControls();
}

function updateScopeControls() {
  const isClub = el('scope-mode').value === 'club';
  el('club-label').classList.toggle('hidden', !isClub);
}

function questionMatchesScope(q) {
  if (el('scope-mode').value === 'league') return true;
  const selectedClub = el('club').value;
  return Boolean(selectedClub) && Array.isArray(q.clubs) && q.clubs.includes(selectedClub);
}

function getRequestedQuestionCount(available) {
  const raw = el('question-count').value;
  if (raw === 'all') return available;
  const requested = Number.parseInt(raw, 10);
  if (!Number.isFinite(requested) || requested <= 0) return Math.min(10, available);
  return Math.min(requested, available);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
}

function crestUrl(club) {
  const meta = state.clubMeta[club] || {};
  if (meta.crest) return meta.crest;
  // Remote URL is a fallback only. Once fetch-crests is run, local crest wins.
  return meta.crest_remote_url || null;
}

function renderQuestionClubs(q) {
  const box = el('question-clubs');
  box.innerHTML = '';
  const clubs = Array.isArray(q.clubs) ? q.clubs.slice(0, 3) : [];
  clubs.forEach(club => {
    const badge = document.createElement('div');
    badge.className = 'club-badge';
    const url = crestUrl(club);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Herb ${club}`;
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.remove();
        const fallback = document.createElement('span');
        fallback.className = 'crest-fallback';
        fallback.textContent = initials(club);
        badge.prepend(fallback);
      }, { once: true });
      badge.appendChild(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'crest-fallback';
      fallback.textContent = initials(club);
      badge.appendChild(fallback);
    }
    const name = document.createElement('span');
    name.textContent = club;
    badge.appendChild(name);
    box.appendChild(badge);
  });
  box.classList.toggle('hidden', clubs.length === 0);
}

const humorCorrect = [
  'Sędzia wskazuje środek — punkt dla Ciebie.',
  'Trybuna kiwa z uznaniem. To było pewne wykończenie.',
  'Bez VAR-u. Odpowiedź siedzi idealnie.',
  'Piłkarska pamięć jak u kierownika drużyny z segregatorem.',
  'Komentator już podnosi głos: jest trafienie!'
];
const humorWrong = [
  'Ta odpowiedź minęła słupek, ale gramy dalej.',
  'Ławka rezerwowych już otwiera 90minut. Następne będzie lepsze.',
  'Było blisko jak wyjazdowy remis stracony w 90+4.',
  'Trybuna mruczy, ale sezon jest długi.',
  'Spokojnie — nawet tablica wyników czasem potrzebuje poprawki.'
];

function randomFrom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function humorEnabled() {
  return Boolean(el('humor')?.checked);
}

function resultHumor(percent) {
  if (percent === 100) return 'Profesor A-klasy. Możesz prowadzić kronikę ligi bez notatek.';
  if (percent >= 85) return 'Skaut z notesem. Niewiele Ci umyka.';
  if (percent >= 70) return 'Stały bywalec trybuny — forma jest.';
  if (percent >= 50) return 'Solidny środek tabeli. Jeszcze jedna kolejka i atakujemy podium.';
  return 'Okres przygotowawczy trwa. Rewanż czeka.';
}

function startGame() {
  const difficulty = el('difficulty').value;
  const type = el('type').value;
  const selectedClub = el('scope-mode').value === 'club' ? el('club').value : null;

  const matching = shuffle(state.all.filter(q =>
    questionMatchesScope(q) &&
    (difficulty === 'all' || String(q.difficulty) === difficulty) &&
    (type === 'all' || q.type === type)
  ));

  state.availableCount = matching.length;
  const roundLength = getRequestedQuestionCount(matching.length);
  state.pool = matching.slice(0, roundLength);
  state.index = 0;
  state.correct = 0;
  state.answered = 0;
  state.current = null;
  updateScore();
  el('result').classList.add('hidden');

  if (!state.pool.length) {
    el('status').textContent = selectedClub
      ? `Brak pytań dla klubu ${selectedClub} przy wybranych filtrach.`
      : 'Brak pytań dla wybranych filtrów.';
    el('status').classList.remove('hidden');
    el('quiz').classList.add('hidden');
    return;
  }

  const scopeLabel = selectedClub ? `Kibic: ${selectedClub}` : 'Cała A-klasa Myślenice';
  const availability = state.pool.length === state.availableCount
    ? `${state.pool.length} pytań`
    : `${state.pool.length} z ${state.availableCount} dostępnych pytań`;
  el('status').textContent = `${scopeLabel} · ta gra: ${availability}`;
  el('status').classList.remove('hidden');
  el('quiz').classList.remove('hidden');
  showQuestion();
}

function updateScore() {
  el('score').textContent = `${state.correct} / ${state.answered}`;
}

function showQuestion() {
  if (state.index >= state.pool.length) {
    finishGame();
    return;
  }

  const q = state.pool[state.index];
  state.current = q;
  renderQuestionClubs(q);
  el('question-number').textContent = `Pytanie ${state.index + 1} z ${state.pool.length}`;
  el('season').textContent = q.season || 'bez sezonu';
  el('difficulty-label').textContent = `trudność ${q.difficulty}/5`;
  el('question').textContent = q.question;
  el('feedback').classList.add('hidden');
  el('source-box').classList.add('hidden');
  el('next').classList.add('hidden');
  el('sources').classList.add('hidden');

  const answers = el('answers');
  answers.innerHTML = '';
  shuffle(q.options).forEach(option => {
    const button = document.createElement('button');
    button.className = 'answer';
    button.textContent = option;
    button.addEventListener('click', () => answer(button, option));
    answers.appendChild(button);
  });
}

function answer(button, option) {
  const q = state.current;
  const buttons = [...document.querySelectorAll('.answer')];
  buttons.forEach(b => {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add('correct');
  });
  state.answered += 1;
  if (option === q.answer) {
    state.correct += 1;
  } else {
    button.classList.add('wrong');
  }
  updateScore();
  const feedback = el('feedback');
  feedback.innerHTML = '';
  const factual = document.createElement('div');
  factual.textContent = q.explanation || `Poprawna odpowiedź: ${q.answer}`;
  feedback.appendChild(factual);
  if (humorEnabled()) {
    const joke = document.createElement('div');
    joke.className = 'humor-line';
    joke.textContent = option === q.answer ? randomFrom(humorCorrect) : randomFrom(humorWrong);
    feedback.appendChild(joke);
  }
  feedback.classList.remove('hidden');
  el('next').textContent = state.index === state.pool.length - 1
    ? 'Zobacz wynik'
    : 'Następne pytanie';
  el('next').classList.remove('hidden');
  if (q.sources?.length) el('sources').classList.remove('hidden');
}

function finishGame() {
  const total = state.pool.length;
  const percent = total ? Math.round((state.correct / total) * 100) : 0;
  const wrong = total - state.correct;

  el('quiz').classList.add('hidden');
  el('result-score').textContent = `${state.correct} / ${total}`;
  el('result-percent').textContent = `${percent}%`;
  el('result-details').textContent = `Poprawne: ${state.correct} · Błędne: ${wrong}`;
  el('result-humor').textContent = humorEnabled() ? resultHumor(percent) : '';
  el('result-humor').classList.toggle('hidden', !humorEnabled());
  el('result').classList.remove('hidden');
  el('status').textContent = 'Rozgrywka zakończona.';
}

el('next').addEventListener('click', () => {
  state.index += 1;
  showQuestion();
});

el('sources').addEventListener('click', () => {
  const box = el('source-box');
  box.innerHTML = '<strong>Źródła:</strong><br>' + state.current.sources
    .map(url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
    .join('<br>');
  box.classList.toggle('hidden');
});

el('scope-mode').addEventListener('change', updateScopeControls);
el('new-game').addEventListener('click', startGame);
el('play-again').addEventListener('click', startGame);

fetch('data/questions.json')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(data => {
    state.all = data.questions || [];
    state.clubMeta = data.clubs || {};
    refreshTypeOptions();
    refreshClubOptions();
    startGame();
  })
  .catch(err => {
    el('status').textContent = `Nie udało się wczytać bazy pytań: ${err.message}`;
  });
