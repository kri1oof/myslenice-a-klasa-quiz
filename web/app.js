const state = {
  all: [],
  pool: [],
  current: null,
  index: 0,
  correct: 0,
  answered: 0,
  streak: 0,
  bestStreak: 0,
  availableCount: 0,
  clubMeta: {},
  seasons: [],
  questionIndex: null,
  loadedQuestionFiles: new Set(),
  loadingQuestionFiles: new Map(),
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
  match_score: 'Dokładny wynik meczu',
  match_winner: 'Kto wygrał mecz',
  match_total_goals: 'Łączna liczba goli',
  club_match_goals: 'Gole drużyny w meczu',
  club_match_conceded: 'Stracone gole w meczu',
  round_opponent: 'Rywal w kolejce',
  round_number: 'Numer kolejki',
  match_round: 'Numer kolejki',
  halftime_score: 'Wynik do przerwy',
  final_position: 'Końcowe miejsce w tabeli',
  standing_position: 'Miejsce w tabeli',
  season_points: 'Punkty w sezonie',
  standing_points: 'Punkty w tabeli',
  season_wins: 'Zwycięstwa w sezonie',
  season_draws: 'Remisy w sezonie',
  season_losses: 'Porażki w sezonie',
  season_goals_for: 'Gole strzelone w sezonie',
  club_goals_for: 'Gole strzelone w sezonie',
  season_goals_against: 'Gole stracone w sezonie',
  club_goals_against: 'Gole stracone w sezonie',
  season_goal_difference: 'Bilans bramkowy',
  player_season_goals: 'Gole zawodnika w sezonie',
  top_scorer: 'Najlepszy strzelec',
  player_goal_compare: 'Porównanie strzelców',
  goal_scorer: 'Strzelec bramki',
  match_scorer: 'Strzelec w meczu',
  scorer_minute: 'Minuta zdobycia bramki',
  first_scorer_match: 'Pierwszy strzelec meczu',
  different_scorers_match: 'Liczba różnych strzelców',
  clean_sheets: 'Czyste konta',
  season_clean_sheets: 'Czyste konta w sezonie',
  btts_matches: 'Mecze z golami obu drużyn',
  season_btts: 'Mecze, w których obie drużyny strzelały',
  winning_streak: 'Seria zwycięstw',
  longest_winning_streak: 'Najdłuższa seria zwycięstw',
  biggest_win: 'Najwyższe zwycięstwo',
  biggest_win_opponent: 'Rywal w najwyższym zwycięstwie',
  highest_scoring_club_match: 'Najbardziej bramkowy mecz drużyny',
  highest_scoring_match_opponent: 'Rywal w najbardziej bramkowym meczu',
  match_date: 'Data meczu',
  match_weekday: 'Dzień tygodnia',
  starting_xi_player: 'Wyjściowa jedenastka',
  came_off_bench: 'Wejście z ławki',
  substitution_minute_in: 'Minuta wejścia z ławki',
  match_captain: 'Kapitan w meczu',
  shirt_number_match: 'Numer na koszulce',
  substitutes_used: 'Wykorzystani rezerwowi',
  player_match_goals: 'Gole zawodnika w meczu',
  player_match_goals_complete: 'Gole zawodnika w meczu',
  first_scorer_complete: 'Pierwszy strzelec',
  last_scorer_complete: 'Ostatni strzelec',
  distinct_scorers_complete: 'Liczba różnych strzelców',
  brace_scorer: 'Autor dubletu',
  hattrick_scorer: 'Autor hat-tricka',
  first_half_goal_count: 'Gole w pierwszej połowie',
  second_half_goal_count: 'Gole w drugiej połowie',
  round_total_goals: 'Gole w całej kolejce',
  round_highest_scoring_match: 'Najbardziej bramkowy mecz kolejki',
  season_zero_zero_matches: 'Remisy 0:0',
  season_five_plus_goal_matches: 'Mecze z co najmniej 5 golami',
  most_common_score: 'Najczęstszy wynik',
  highest_scoring_round: 'Najbardziej bramkowa kolejka',
  club_home_points: 'Punkty u siebie',
  club_away_points: 'Punkty na wyjazdach',
  longest_unbeaten_streak: 'Najdłuższa seria bez porażki',
  longest_winless_streak: 'Najdłuższa seria bez zwycięstwa',
  first_win_round: 'Pierwsze zwycięstwo w sezonie',
  h2h_season_points: 'Punkty w bezpośrednich meczach',
  league_team_count: 'Liczba drużyn w lidze',
  club_not_in_season: 'Drużyna spoza danego sezonu',
  player_club_season: 'Klub zawodnika w sezonie',
  player_season_membership: 'Sezon występów zawodnika',
  social_mvp: 'MVP według relacji',
  social_standout_player: 'Bohater meczu',
  social_captain: 'Kapitan według relacji',
  social_assist: 'Asysta przy bramce',
  social_penalty_scorer: 'Strzelec z rzutu karnego',
  social_missed_penalty: 'Niewykorzystany rzut karny',
  social_own_goal: 'Gol samobójczy',
  social_equalizer: 'Strzelec gola wyrównującego',
  social_late_equalizer: 'Późny gol wyrównujący',
  social_hat_trick_scorer: 'Hat-trick z relacji',
  social_substitute_brace_scorer: 'Dublet rezerwowego',
  social_free_kick_scorer: 'Gol z rzutu wolnego',
  social_stoppage_time_scorer: 'Gol w doliczonym czasie',
  social_returning_player: 'Powrót zawodnika do składu',
  social_attendance: 'Frekwencja na meczu',
  social_oldest_starting_age: 'Wiek najstarszego zawodnika',
  social_comeback_from: 'Odrobienie strat',
  social_halfway_line_scorer: 'Gol z okolic połowy boiska',
  social_header_scorer: 'Gol głową',
  social_brace_scorer: 'Dublet z kroniki meczu',
  social_four_goal_scorer: 'Cztery gole jednego zawodnika',
  social_promotion_clinching_goal_scorer: 'Gol pieczętujący awans',
  social_opening_goal_scorer: 'Gol otwierający wynik',
  social_first_senior_goal_scorer: 'Pierwszy gol w seniorskiej piłce',
  social_penalty_saver: 'Obroniony rzut karny',
  social_red_carded_goalkeeper: 'Czerwona kartka bramkarza',
  social_emergency_goalkeeper: 'Awaryjny bramkarz',
};

const typeWords = {
  social: 'ciekawostka', match: 'mecz', club: 'drużyna', season: 'sezon', player: 'zawodnik',
  goal: 'gol', goals: 'gole', scorer: 'strzelec', score: 'wynik', winner: 'zwycięzca',
  round: 'kolejka', points: 'punkty', position: 'miejsce', home: 'u siebie', away: 'na wyjeździe',
  first: 'pierwszy', last: 'ostatni', longest: 'najdłuższa', highest: 'najwyższy', streak: 'seria',
  attendance: 'frekwencja', captain: 'kapitan', assist: 'asysta', penalty: 'rzut karny',
  header: 'główka', brace: 'dublet', four: 'cztery', minute: 'minuta', date: 'data',
  weekday: 'dzień tygodnia', complete: '',
};

function labelType(type) {
  if (typeLabels[type]) return typeLabels[type];
  const text = String(type || '').split('_').map(part => typeWords[part] ?? part).filter(Boolean).join(' ');
  if (!text) return 'Inne pytanie';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function categoryForType(type) {
  const value = String(type || '');
  if (value.startsWith('social_')) return 'ciekawostki';
  if (/captain|starting_xi|bench|substitution|shirt_number|substitutes/.test(value)) return 'sklady';
  if (/player|scorer|goal|brace|hattrick|hat_trick/.test(value)) return 'zawodnicy';
  if (/streak|biggest|highest|clean|btts|most_common|zero_zero|five_plus|h2h/.test(value)) return 'rekordy';
  if (/standing|position|points|season_|league_team|club_not_in/.test(value)) return 'sezon';
  if (/date|weekday|round|opponent/.test(value)) return 'terminarz';
  return 'mecze';
}

const categoryLabels = {
  mecze: 'Mecze i wyniki',
  sezon: 'Tabela i sezon',
  zawodnicy: 'Zawodnicy i gole',
  sklady: 'Składy i role',
  rekordy: 'Serie i rekordy',
  terminarz: 'Terminarz i kolejki',
  ciekawostki: 'Kroniki i ciekawostki',
};

function refreshTypeOptions() {
  const select = el('type');
  const indexedTypes = Array.isArray(state.questionIndex?.types) ? state.questionIndex.types : [];
  const values = [...new Set((indexedTypes.length ? indexedTypes : state.all.map(q => q.type)).filter(Boolean))]
    .sort((a, b) => labelType(a).localeCompare(labelType(b), 'pl'));
  select.innerHTML = '<option value="all">Wszystkie rodzaje pytań</option>';
  Object.keys(categoryLabels).forEach(category => {
    const inCategory = values.filter(value => categoryForType(value) === category);
    if (!inCategory.length) return;
    const group = document.createElement('optgroup');
    group.label = categoryLabels[category];
    inCategory.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = labelType(value);
      group.appendChild(option);
    });
    select.appendChild(group);
  });
}

function refreshClubOptions() {
  const club = el('club');
  const indexedClubs = Object.keys(state.clubMeta || {});
  const clubs = [...new Set(indexedClubs.length
    ? indexedClubs
    : state.all.flatMap(q => Array.isArray(q.clubs) ? q.clubs : []))]
    .filter(name => Boolean(name) && /\p{L}/u.test(String(name)))
    .sort((a, b) => a.localeCompare(b, 'pl'));
  club.innerHTML = clubs.map(name => `<option value="${name}">${name}</option>`).join('');
  el('scope-mode').querySelector('option[value="club"]').disabled = clubs.length === 0;
  updateScopeControls();
}

function seasonStartYear(label) {
  const match = String(label || '').match(/^(\d{4})\/(\d{2}|\d{4})$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function refreshSeasonOptions() {
  const indexedSeasons = Array.isArray(state.questionIndex?.seasons) ? state.questionIndex.seasons : [];
  state.seasons = [...new Set((indexedSeasons.length ? indexedSeasons : state.all.map(q => q.season))
    .filter(season => seasonStartYear(season) !== null))]
    .sort((a, b) => seasonStartYear(a) - seasonStartYear(b));
  const html = state.seasons.map(season => `<option value="${season}">${season}</option>`).join('');
  el('season-from').innerHTML = html;
  el('season-to').innerHTML = html;
  const hasSeasons = state.seasons.length > 0;
  el('season-mode').disabled = !hasSeasons;
  if (hasSeasons) {
    const latest = state.seasons[state.seasons.length - 1];
    el('season-from').value = latest;
    el('season-to').value = latest;
  }
  updateSeasonControls();
}

function updateScopeControls() {
  el('club-label').classList.toggle('hidden', el('scope-mode').value !== 'club');
}

function updateSeasonControls() {
  const mode = el('season-mode').value;
  el('season-from-label').classList.toggle('hidden', mode === 'all');
  el('season-to-label').classList.toggle('hidden', mode !== 'range');
}

function questionMatchesScope(q) {
  if (el('scope-mode').value === 'league') return true;
  const selectedClub = el('club').value;
  return Boolean(selectedClub) && Array.isArray(q.clubs) && q.clubs.includes(selectedClub);
}

function questionMatchesSeason(q) {
  const mode = el('season-mode').value;
  if (mode === 'all') return true;
  if (!q.season) return false;
  const from = el('season-from').value;
  if (mode === 'single') return q.season === from;
  const to = el('season-to').value;
  const qIndex = state.seasons.indexOf(q.season);
  const fromIndex = state.seasons.indexOf(from);
  const toIndex = state.seasons.indexOf(to);
  if (qIndex < 0 || fromIndex < 0 || toIndex < 0) return false;
  return qIndex >= Math.min(fromIndex, toIndex) && qIndex <= Math.max(fromIndex, toIndex);
}

function selectedSeasonLabel() {
  const mode = el('season-mode').value;
  if (mode === 'all') return 'wszystkie sezony';
  const from = el('season-from').value;
  if (mode === 'single') return `sezon ${from}`;
  const to = el('season-to').value;
  const fromIndex = state.seasons.indexOf(from);
  const toIndex = state.seasons.indexOf(to);
  return `sezony ${state.seasons[Math.min(fromIndex, toIndex)]}–${state.seasons[Math.max(fromIndex, toIndex)]}`;
}

function selectedSeasonSet() {
  const mode = el('season-mode').value;
  if (mode === 'all') return null;
  const from = el('season-from').value;
  if (mode === 'single') return new Set([from]);
  const to = el('season-to').value;
  const fromIndex = state.seasons.indexOf(from);
  const toIndex = state.seasons.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return new Set();
  const lo = Math.min(fromIndex, toIndex);
  const hi = Math.max(fromIndex, toIndex);
  return new Set(state.seasons.slice(lo, hi + 1));
}

function questionFilesForSelection() {
  const files = Array.isArray(state.questionIndex?.files) ? state.questionIndex.files : [];
  const seasons = selectedSeasonSet();
  if (seasons === null) return files;
  return files.filter(entry => entry.season && seasons.has(entry.season));
}

async function loadQuestionFile(entry) {
  const path = entry?.path;
  if (!path || state.loadedQuestionFiles.has(path)) return;
  if (state.loadingQuestionFiles.has(path)) return state.loadingQuestionFiles.get(path);

  const promise = fetch(`data/questions/${path}`)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status} dla ${path}`);
      return response.json();
    })
    .then(payload => {
      if (state.loadedQuestionFiles.has(path)) return;
      const questions = Array.isArray(payload.questions) ? payload.questions : [];
      state.all.push(...questions);
      state.loadedQuestionFiles.add(path);
    })
    .finally(() => {
      state.loadingQuestionFiles.delete(path);
    });

  state.loadingQuestionFiles.set(path, promise);
  return promise;
}

async function ensureQuestionsLoadedForSelection() {
  if (!state.questionIndex) return;
  const needed = questionFilesForSelection();
  const missing = needed.filter(entry => !state.loadedQuestionFiles.has(entry.path));
  if (!missing.length) return;

  const previous = el('status').textContent;
  el('status').textContent = `Ładowanie pytań dla wybranego zakresu… (${missing.length} plików)`;
  await Promise.all(missing.map(loadQuestionFile));
  if (typeof sanitizeFrontClubData === 'function') sanitizeFrontClubData();
  el('status').textContent = previous;
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
  return meta.crest || meta.crest_remote_url || null;
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

function hashSeed(value) {
  let hash = 2166136261;
  for (const ch of String(value || '')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function stablePick(values, seed) {
  return values.length ? values[hashSeed(seed) % values.length] : '';
}

const questionStyles = {
  mecze: [
    ['TABLICA WYNIKÓW', 'Pamiętasz ten mecz?'],
    ['90 MINUT PÓŹNIEJ', 'Wracamy do wyniku.'],
    ['Z ARCHIWUM KOLEJKI', 'Bez podpowiedzi z protokołu.'],
    ['MECZ POD LUPĄ', 'Tu liczy się pamięć do wyników.'],
    ['KIBICOWSKA PAMIĘĆ', 'Ten rezultat gdzieś już widziałeś.'],
  ],
  sezon: [
    ['TABELA NIE KŁAMIE', 'Czas policzyć punkty.'],
    ['SEZON W LICZBACH', 'Statystyka wchodzi na boisko.'],
    ['KTO PAMIĘTA TABELĘ?', 'Sprawdzamy ligową pamięć.'],
    ['PUNKTY, GOLE, MIEJSCA', 'Excel prezesa byłby dumny.'],
  ],
  zawodnicy: [
    ['NAZWISKO NA TABLICĘ', 'Kto zapisał się przy tej akcji?'],
    ['BRAMKOWA KRONIKA', 'Szukamy właściwego nazwiska.'],
    ['SNAJPERSKI TEST', 'Piłka już w siatce — kto strzelał?'],
    ['KARTOTEKA ZAWODNIKA', 'Czas na ludzi, nie tabelki.'],
  ],
  sklady: [
    ['SZATNIA I ŁAWKA', 'Kto był wtedy na boisku?'],
    ['KARTA MECZOWA', 'Zaglądamy do składu.'],
    ['TRENER PAMIĘTA', 'Ty też powinieneś.'],
    ['ŁAWKA REZERWOWYCH', 'Sprawdzamy personalia.'],
  ],
  rekordy: [
    ['STATYSTYCZNY NOKAUT', 'Tu jedna kolejka nie wystarczy.'],
    ['SERIE I REKORDY', 'Sprawdzamy dłuższą pamięć.'],
    ['FORMA SEZONU', 'Kto liczył, ten ma przewagę.'],
    ['LICZBY NIE GRAJĄ? A JEDNAK', 'Czas na rekordy i serie.'],
  ],
  terminarz: [
    ['KALENDARZ KIBICA', 'Data, kolejka, rywal — pamiętasz?'],
    ['TERMINARZ POD LUPĄ', 'Kiedy i z kim?'],
    ['KOLEJKA PO KOLEJCE', 'Wracamy do kalendarza rozgrywek.'],
    ['SOBOTA CZY NIEDZIELA?', 'Terminarz też potrafi boleć.'],
  ],
  ciekawostki: [
    ['A-KLASOWY SMACZEK', 'Tego nie wyczytasz z samej tabeli.'],
    ['Z LOKALNEJ KRONIKI', 'Tu zaczynają się prawdziwe historie.'],
    ['TEGO NIE MA W SKRÓCIE', 'Pora na detal z meczu.'],
    ['BOISKOWA OPOWIEŚĆ', 'Mały szczegół, duża pamięć.'],
    ['KTO BYŁ, TEN PAMIĘTA', 'Ciekawostka dla wtajemniczonych.'],
  ],
};

function styleForQuestion(q) {
  const category = categoryForType(q.type);
  return stablePick(questionStyles[category] || questionStyles.mecze, `${q.id || q.question}|${q.type}`);
}

function styledQuestionText(q) {
  const [, intro] = styleForQuestion(q);
  return (el('game-style')?.value || 'stadium') === 'classic' ? q.question : `${intro} ${q.question}`;
}

const humorCorrect = [
  'Sędzia wskazuje środek — punkt dla Ciebie.',
  'Trybuna kiwa z uznaniem. To było pewne wykończenie.',
  'Bez VAR-u. Odpowiedź siedzi idealnie.',
  'Piłkarska pamięć jak u kierownika drużyny z segregatorem.',
  'Komentator już podnosi głos: jest trafienie!',
  'Siatka zatrzepotała. Czysta robota.',
  'Pewniej niż karny pod poprzeczkę.',
  'Prezes już szykuje premię meczową.',
  'Tak się odpowiada na trudnym terenie.',
  'Pełna kontrola. Nawet trener nie ma uwag.',
  'Trafione jak wrzutka na dalszy słupek.',
  'Kronikarz ligi właśnie dopisał Ci punkt.',
  'Nie trzeba powtórki — odpowiedź ewidentna.',
  'Publiczność wstaje z krzesełek. Jest punkt.',
  'Forma rośnie z kolejki na kolejkę.',
  'Odpowiedź weszła przy samym słupku.',
  'Kierownik drużyny potwierdza: wszystko się zgadza.',
  'To było czytane jak ustawienie rywala przy stałym fragmencie.',
  'Elegancko. Piłka, bramka, punkt.',
  'Tego nawet protokół nie podważy.',
];

const humorWrong = [
  'Ta odpowiedź minęła słupek, ale gramy dalej.',
  'Ławka rezerwowych już otwiera 90minut. Następne będzie lepsze.',
  'Było blisko jak wyjazdowy remis stracony w 90+4.',
  'Trybuna mruczy, ale sezon jest długi.',
  'Spokojnie — nawet tablica wyników czasem potrzebuje poprawki.',
  'Strzał w aut. Piłkę poda chłopak od podawania.',
  'VAR z remizy mówi: niestety nie.',
  'Trener patrzy w ziemię, ale jeszcze Cię nie zmienia.',
  'To poszło wysoko nad poprzeczką.',
  'Ktoś na ławce krzyknął „było blisko”. Nie było.',
  'Kartka za dyskusje? Nie, tylko kolejne pytanie.',
  'Ta akcja wymagała lepszego rozegrania.',
  'Kibic za bramką znał odpowiedź. Podobno.',
  'Zapisujemy jako niecelny strzał i jedziemy dalej.',
  'Mur stał dobrze. Odpowiedź się nie przebiła.',
  'Dzisiaj protokół meczu wygrał z pamięcią.',
  'To była odpowiedź z kategorii „a może wejdzie”. Nie weszła.',
  'Ławka już szykuje zmianę taktyki.',
  'Bez paniki. Nawet lider czasem gubi punkty.',
  'Następna akcja od zera. Ta poszła w trybuny.',
];

const chaosCorrect = [
  'GOOOL! Sąsiad z drugiego końca wsi też już wie.',
  'Tak pewnie, jakbyś sam wpisywał wynik do protokołu.',
  'Prezes zatwierdził. Skarbnik też, choć nie był pytany.',
  'Pięknie. Piłka jeszcze nie spadła z siatki.',
  'Spiker stadionowy zgubił głos. Punkt jest Twój.',
  'To było tak dobre, że przeciwnik pyta o rewanż.',
  'Wjechało bez kierunkowskazu. Punkt.',
  'Nawet człowiek od wapnowania linii bije brawo.',
];

const chaosWrong = [
  'Aut na wysokości własnego pola karnego. Ambitnie.',
  'Trener odwrócił się do ławki i udaje, że tego nie widział.',
  'Piłka poleciała na parking. Prosimy oddać.',
  'Ktoś krzyknął „gramy!”. Szkoda, że po odpowiedzi.',
  'To była odpowiedź w stylu boiska po listopadowym deszczu.',
  'Sędzia nawet nie musiał gwizdać. Samo się nie zgadza.',
  'Prezes pyta, czy na pewno trenowaliśmy ten element.',
  'Dobra, skreślamy i mówimy, że murawa była ciężka.',
];

const nextLabels = ['Następne pytanie', 'Gramy dalej', 'Następna akcja', 'Dawaj kolejne', 'Kolejna piłka', 'Jedziemy dalej'];

function randomFrom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function gameStyle() {
  return el('game-style')?.value || 'stadium';
}

function humorEnabled() {
  return gameStyle() !== 'classic';
}

function feedbackHumor(correct) {
  if (gameStyle() === 'chaos') return randomFrom(correct ? chaosCorrect : chaosWrong);
  return randomFrom(correct ? humorCorrect : humorWrong);
}

function streakText(streak) {
  if (streak >= 10) return `🔥 ${streak} z rzędu! Tryb nie do zatrzymania.`;
  if (streak >= 7) return `🔥 ${streak} z rzędu! Lider tabeli pyta o Twój numer.`;
  if (streak >= 5) return `🔥 ${streak} z rzędu! To już seria, nie przypadek.`;
  if (streak >= 3) return `🔥 ${streak} poprawne z rzędu. Forma rośnie.`;
  return '';
}

function resultHumor(percent) {
  const groups = percent === 100
    ? ['Profesor A-klasy. Możesz prowadzić kronikę ligi bez notatek.', 'Komplet punktów. Kierownik drużyny oddaje Ci segregator.', '100%. Nawet sędzia nie znalazł podstaw do korekty.']
    : percent >= 85
      ? ['Skaut z notesem. Niewiele Ci umyka.', 'Forma na awans. Jeden detal i byłby komplet.', 'Bardzo mocny występ. Trybuny skandują nazwisko.']
      : percent >= 70
        ? ['Stały bywalec trybuny — forma jest.', 'Pewne miejsce w górnej połowie tabeli.', 'Dobry mecz. Kilka sytuacji zmarnowanych, ale punkty są.']
        : percent >= 50
          ? ['Solidny środek tabeli. Jeszcze jedna kolejka i atakujemy podium.', 'Bilans dodatni moralnie. Sportowo jeszcze pracujemy.', 'Były przebłyski. Trener zostawia Cię w pierwszym składzie.']
          : ['Okres przygotowawczy trwa. Rewanż czeka.', 'Dzisiaj ciężki teren. Na własnym boisku będzie lepiej.', 'Tabela boli, ale sezon jest długi.'];
  return randomFrom(groups);
}

function startGame() {
  const difficulty = el('difficulty').value;
  const type = el('type').value;
  const selectedClub = el('scope-mode').value === 'club' ? el('club').value : null;
  const matching = shuffle(state.all.filter(q =>
    questionMatchesScope(q) && questionMatchesSeason(q) &&
    (difficulty === 'all' || String(q.difficulty) === difficulty) &&
    (type === 'all' || q.type === type)
  ));
  state.availableCount = matching.length;
  state.pool = matching.slice(0, getRequestedQuestionCount(matching.length));
  state.index = 0;
  state.correct = 0;
  state.answered = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.current = null;
  updateScore();
  el('result').classList.add('hidden');
  if (!state.pool.length) {
    el('status').textContent = selectedClub
      ? `Brak pytań dla klubu ${selectedClub} przy wybranych filtrach i zakresie sezonów.`
      : 'Brak pytań dla wybranych filtrów i zakresu sezonów.';
    el('status').classList.remove('hidden');
    el('quiz').classList.add('hidden');
    return;
  }
  const scopeLabel = selectedClub ? `Tryb klubowy: ${selectedClub}` : 'Cała A-klasa Myślenice';
  const availability = state.pool.length === state.availableCount
    ? `${state.pool.length} pytań`
    : `${state.pool.length} z ${state.availableCount} dostępnych pytań`;
  el('status').textContent = `${scopeLabel} · ${selectedSeasonLabel()} · ${availability}`;
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
  const [styleName] = styleForQuestion(q);
  el('question-number').textContent = `Pytanie ${state.index + 1} z ${state.pool.length}`;
  el('season').textContent = q.season || 'bez sezonu';
  el('difficulty-label').textContent = `Poziom ${q.difficulty}/5`;
  el('question-style').textContent = styleName;
  el('question-type-label').textContent = labelType(q.type);
  el('question').textContent = styledQuestionText(q);
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
  const isCorrect = option === q.answer;
  const buttons = [...document.querySelectorAll('.answer')];
  buttons.forEach(b => {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add('correct');
  });
  state.answered += 1;
  if (isCorrect) {
    state.correct += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
  } else {
    state.streak = 0;
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
    joke.textContent = feedbackHumor(isCorrect);
    feedback.appendChild(joke);
  }
  const streak = streakText(state.streak);
  if (streak) {
    const streakLine = document.createElement('div');
    streakLine.className = 'streak-line';
    streakLine.textContent = streak;
    feedback.appendChild(streakLine);
  }
  feedback.classList.remove('hidden');
  el('next').textContent = state.index === state.pool.length - 1
    ? 'Końcowy gwizdek — pokaż wynik'
    : (gameStyle() === 'classic' ? 'Następne pytanie' : randomFrom(nextLabels));
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
  el('result-details').textContent = `Poprawne: ${state.correct} · Błędne: ${wrong} · Najlepsza seria: ${state.bestStreak}`;
  el('result-humor').textContent = humorEnabled() ? resultHumor(percent) : '';
  el('result-humor').classList.toggle('hidden', !humorEnabled());
  el('result').classList.remove('hidden');
  el('status').textContent = 'Końcowy gwizdek. Rozgrywka zakończona.';
}

el('next').addEventListener('click', () => {
  state.index += 1;
  showQuestion();
});

el('sources').addEventListener('click', () => {
  const box = el('source-box');
  box.innerHTML = '<strong>Źródła:</strong><br>' + state.current.sources
    .map(url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`).join('<br>');
  box.classList.toggle('hidden');
});

el('scope-mode').addEventListener('change', updateScopeControls);
el('season-mode').addEventListener('change', updateSeasonControls);
el('new-game').addEventListener('click', startGame);
el('play-again').addEventListener('click', startGame);

async function loadQuestionDatabase() {
  const indexResponse = await fetch('data/questions/index.json');
  if (indexResponse.ok) {
    const index = await indexResponse.json();
    state.questionIndex = index;
    state.clubMeta = index.clubs || {};
    state.all = [];
    refreshTypeOptions();
    refreshClubOptions();
    refreshSeasonOptions();
    startGame();
    return;
  }

  const legacyResponse = await fetch('data/questions.json');
  if (!legacyResponse.ok) {
    throw new Error(`HTTP ${legacyResponse.status}`);
  }
  const data = await legacyResponse.json();
  state.all = data.questions || [];
  state.clubMeta = data.clubs || {};
  refreshTypeOptions();
  refreshClubOptions();
  refreshSeasonOptions();
  startGame();
}

loadQuestionDatabase().catch(err => {
  el('status').textContent = `Nie udało się wczytać bazy pytań: ${err.message}`;
});
