// Local-football humour layer for the arcade RPG.
// Keeps the balance/mechanics intact and only makes labels, descriptions and commentary
// feel like a proper A-klasa Sunday afternoon.

const LOCAL_ACTION_COPY = Object.freeze({
  short_build: ['Od bramkarza po bożemu', 'Niby spokojnie, ale pierwszy zły kontakt i już krzyk z ławki.'],
  carry: ['Sam se pójdę', 'Bierzesz piłkę i jedziesz. Jak się uda — profesor. Jak nie — wiadomo.'],
  long_ball: ['🚀 LAGA NA DZIKA', 'Zero filozofii. Wysoko, daleko i niech napastnik się martwi.'],
  safe_pass: ['Poklepać, aż się znudzi', 'Kilka podań, żeby rywal pobiegał i ktoś z boku powiedział: „graj szybciej!”.'],
  vertical: ['Dziura między liniami', 'Wepchnij piłkę tam, gdzie teoretycznie nikogo nie powinno być.'],
  through_ball: ['Prostopadła na aferę', 'Albo wyjdzie sam na sam, albo piłka trafi pod sklep.'],
  combination: ['Klepka jak na orliku', 'Dwa kontakty i nagle wygląda, jakbyście trenowali to w tygodniu.'],
  killer_pass: ['No patrz, idzie!', 'Podanie, po którym pół ławki wstaje zanim piłka doleci.'],
  long_shot: ['🌪️ STRZAŁ ŻYCIA PO WIDŁACH', 'Raz na sezon wchodzi. Pytanie tylko, czy właśnie teraz.'],
  cutback: ['Wycofaj, bo tam ktoś jest', 'Klasyka: wszyscy lecą do bramki, jeden mądry zostaje z tyłu.'],
  placed_shot: ['Po ziemi, przy słupku', 'Bez napinki. Jak mawiają: bramkarz też człowiek.'],
  power_shot: ['Ile fabryka dała', 'Technika techniką, ale czasem trzeba po prostu przywalić.'],

  arcade_quick_counter: ['🚀 LAGA I DO PRZODU', 'Koszt 25% formy. Pomocnicy mogą odpocząć — piłka już jest trzydzieści metrów dalej.'],
  arcade_laser: ['🎯 Piłka jak od linijki', 'Koszt 30% formy. Takie podanie, że nawet boczny przestaje gadać.'],
  arcade_bomb: ['🌪️ STRZAŁ ŻYCIA PO WIDŁACH', 'Koszt 35% formy. Albo gol kolejki, albo nowa piłka za ogrodzeniem.'],
  arcade_golden: ['⭐ AKCJA Z INNEJ LIGI', 'Koszt całej formy. Przez chwilę wszyscy wyglądają, jakby przyszli z okręgówki.'],

  shape: ['Stańcie wreszcie w linii', 'Teoria jest prosta: czterech obrońców ma stać mniej więcej obok siebie.'],
  press: ['Leć na niego!', 'Plan taktyczny w dwóch słowach. Reszta wyjdzie w praniu.'],
  tackle: ['Wślizg albo szpital', 'Jak trafisz w piłkę — bohater. Jak nie — pan sędzia już biegnie.'],
  block: ['Zastaw się czymkolwiek', 'Noga, plecy, brzuch — byle piłka nie przeszła.'],
  close_angle: ['Zamknij mu bramkę', 'Nie musi być elegancko. Ma nie mieć gdzie strzelić.'],
  last_tackle: ['Ratuj co się da', 'Ostatni moment. Wślizg, modlitwa i patrzymy na sędziego.'],
  arcade_bus: ['🚌 Zaparkuj autobus', 'Koszt 20% formy. Dziesięciu za piłką i niech próbują.'],
  arcade_gegenpress: ['🐗 Doskok jak po premię', 'Koszt 30% formy. Wszyscy do piłki, zanim rywal zdąży podnieść głowę.'],

  penalty_placed: ['🎯 Na pewniaka', 'Po ziemi w róg. Bez cudowania, bo potem trzeba wejść do szatni.'],
  penalty_power: ['💥 Ile sił', 'Pod poprzeczkę albo w siatkę za bramką.'],
  penalty_panenka: ['😎 Panenka, bo czemu nie', 'Jak wejdzie — legenda. Jak nie — temat na grupie do środy.'],
  corner_short: ['🔁 Krótko, żeby wszystkich zdenerwować', 'Cała drużyna czeka w polu karnym, a wy gracie na dwa metry.'],
  corner_near: ['🎯 Na bliższy i chaos', 'Muśnięcie, ryk, odbitka i może coś wpadnie.'],
  corner_far: ['🛰️ Wrzutka na aferę', 'Wysoko na dalszy. Potem już tylko druga piłka i modlitwa.'],
  fk_cross: ['📡 Wrzuta w kocioł', 'Niech tam się kotłuje. Ktoś to może dotknie.'],
  fk_curl: ['🎯 Byle nie w mur', 'Technicznie nad murem. Najważniejsze: nie trafić pierwszego chłopa.'],
  fk_power: ['💣 Urwij siatkę', 'Pełna moc. Mur też ma prawo się bać.'],
  counter_wing: ['🏃 Puść szybkiego po boku', 'Niech biegnie. Od tego jest szybki.'],
  counter_striker: ['🎯 Dawaj do dziewiątki', 'Napastnik już macha od pięciu sekund. Może wreszcie dostać.'],
  counter_finish: ['💥 Strzelaj, zanim wrócą!', 'Jak zaczniemy kombinować, zaraz będzie po kontrze.'],

  setpiece_safe: ['🧱 Mur i nie dyskutować', 'Najpierw ustawcie się. Potem można mieć pretensje.'],
  setpiece_claim: ['🧤 Bramkarz, twoja!', 'Piłka w powietrzu, wszyscy krzyczą to samo.'],
  setpiece_counter: ['🚀 Wybij i leć!', 'Obrona stałego fragmentu w stylu A-klasy: daleko od bramki i za piłką.'],
});

const LOCAL_STYLE_COPY = Object.freeze({
  high_press: ['Od pierwszej minuty po kostkach', 'Rywal doskakuje wysoko. Na takie rzeczy od zawsze wynaleziono lagę.'],
  counter: ['Czekają i lecą', 'Niby nic nie grają, a po jednej stracie nagle jest trzech pod twoją bramką.'],
  compact: ['Murarka', 'Ośmiu za piłką, dwóch z przodu i powodzenia w szukaniu miejsca.'],
  chaos: ['Pełna A-klasa', 'Kartoflisko, przypadkowe odbitki, stałe fragmenty i wydarzenia, których nie było w planie.'],
});

function localiseAction(action) {
  const copy = LOCAL_ACTION_COPY[action?.id];
  if (!copy) return action;
  return { ...action, label: copy[0], desc: copy[1] };
}

// The arrays are frozen, but their style objects are intentionally mutable.
ARCADE_STYLES.forEach(style => {
  const copy = LOCAL_STYLE_COPY[style.id];
  if (copy) {
    style.name = copy[0];
    style.desc = copy[1];
  }
});

const unlockNames = new Map([
  [25, '🚀 Laga i do przodu'],
  [50, '🎯 Piłka od linijki / 🐗 doskok po premię'],
  [75, '🌪️ Strzał życia po widłach'],
  [100, '⭐ Akcja z innej ligi'],
]);
ARCADE_UNLOCKS.forEach(unlock => {
  if (unlockNames.has(unlock.value)) unlock.label = unlockNames.get(unlock.value);
});

const localBasePlayerActions = playerActions;
playerActions = function localPlayerActions() {
  return localBasePlayerActions().map(localiseAction);
};

const localBaseOpponentActions = opponentActions;
opponentActions = function localOpponentActions() {
  return localBaseOpponentActions().map(localiseAction);
};

const localBaseNarratorText = narratorText;
narratorText = function localNarratorText() {
  if (!rpgActive()) return localBaseNarratorText();
  if (state.rpgSetPiece?.type === 'penalty') return 'Karny. Na ławce cisza, zza bramki już ktoś doradza gdzie strzelać.';
  if (state.rpgSetPiece?.type === 'corner') return 'Róg. Stoper już idzie w pole karne i pokazuje ręką, gdzie ma być wrzutka.';
  if (state.rpgSetPiece?.type === 'free_kick') return 'Wolny. Jeden ustawia piłkę, trzech innych tłumaczy mu, jak powinien uderzyć.';
  if (state.rpgSetPiece?.type === 'counter_3v2') return 'Trzech na dwóch! Teraz tylko nie przekombinować, co zwykle jest najtrudniejsze.';
  if (state.rpgPossession === 'player' && state.rpgZone <= 1) return 'Spokojnie od tyłu… albo laga. Publiczność ma już swoje zdanie.';
  if (state.rpgPossession === 'player' && state.rpgZone === 2) return 'Środek pola. Ktoś krzyczy „odwróć!”, ktoś „graj!”, a decyzja należy do ciebie.';
  if (state.rpgPossession === 'player' && state.rpgZone >= 3) return 'Jest zapach bramki. Teraz albo piłkarska jakość, albo strzał w kukurydzę.';
  if (state.rpgPossession === 'opponent' && state.rpgZone <= 1) return 'Gorąco pod bramką. Z ławki leci klasyczne: „wybij to!”';
  return localBaseNarratorText();
};

const localBaseAddRpgLog = addRpgLog;
const LOCAL_LOG_REPLACEMENTS = [
  ['PERFECT BUILD-UP! Trzy udane elementy akcji — wykreowana stuprocentowa sytuacja.', 'TRZY PODANIA Z RZĘDU! Na A-klasę to już tiki-taka — masz stuprocentową sytuację.'],
  ['Rzut karny zamieniony na bramkę.', 'Karny wykorzystany. Bramkarz w jedną, piłka w drugą — jak na treningu.'],
  ['Karny zmarnowany — bramkarz ratuje rywala.', 'Karny zmarnowany. Cisza taka, że słychać komentarze zza płotu.'],
  ['Krótki róg rozegrany idealnie. Masz czystą pozycję w szesnastce.', 'Krótki róg jednak miał sens. Nikt się tego nie spodziewał — masz czystą pozycję.'],
  ['Rywal czyta krótki róg i wychodzi z kontrą.', 'Krótki róg, dwie sekundy później kontra rywala. Z ławki: „po co było kombinować?!”'],
  ['Idealna piłka z wolnego. Masz okazję na wykończenie.', 'Wrzutka z wolnego siadła jak złoto. Teraz tylko ktoś musi wsadzić głowę.'],
  ['Dośrodkowanie z wolnego wybite przez pierwszego obrońcę.', 'Wolny zatrzymany na pierwszym chłopie. Klasyka gatunku.'],
  ['Perfekcyjny rzut wolny wpada do siatki.', 'STRZAŁ ŻYCIA! Wolny wpada tam, gdzie bramkarz może tylko zrobić zdjęcie.'],
  ['Wolny nie znajduje drogi do bramki.', 'Wolny bez historii. Mur cały, piłka też.'],
  ['Kontra 3 na 2 rozegrana wzorowo — wychodzisz na czystą pozycję.', 'Trzech na dwóch i — niebywałe — rozegrane jak trzeba. Masz czystą pozycję.'],
];
addRpgLog = function localAddRpgLog(text, tone = '') {
  let localText = text;
  for (const [from, to] of LOCAL_LOG_REPLACEMENTS) {
    if (localText.includes(from)) {
      localText = localText.replace(from, to);
      break;
    }
  }
  return localBaseAddRpgLog(localText, tone);
};

// Make the HUD itself a little less sterile.
const localBaseEnsureArcadeHud = ensureArcadeHud;
ensureArcadeHud = function localEnsureArcadeHud() {
  localBaseEnsureArcadeHud();
  const formLabel = document.querySelector('.arcade-meter-card .arcade-meter-head span');
  const comboLabel = document.querySelector('.arcade-combo-card .arcade-meter-head span');
  const comboCopy = el('arcade-combo-copy');
  if (formLabel) formLabel.textContent = '🔥 JEST OGIEŃ';
  if (comboLabel) comboLabel.textContent = '⚽ KLEPKA';
  if (comboCopy && !(state.rpgCombo || []).length) comboCopy.textContent = 'Trzy udane zagrania i zaczyna pachnieć tiki-taką.';
};
