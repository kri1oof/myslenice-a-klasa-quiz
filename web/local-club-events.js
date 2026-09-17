// "A-klasowe życie": decision events between RPG actions.
// The quiz still resolves football actions; these events add the organisational,
// pitch, crowd and touchline choices that make a local match feel local.

const LOCAL_LIFE_EVENT_CHANCE = 0.26;
const LOCAL_LIFE_EVENT_CHAOS_CHANCE = 0.42;
const LOCAL_LIFE_MAX_EVENTS = 2;
const LOCAL_LIFE_MIN_SPACING = 3;

const LOCAL_LIFE_CATEGORIES = Object.freeze({
  organisation: { icon:'📋', label:'ORGANIZACJA' },
  pitch: { icon:'🌱', label:'BOISKO I POGODA' },
  crowd: { icon:'📣', label:'KIBICE I OKOLICE' },
  touchline: { icon:'🗣️', label:'ŁAWKA I SĘDZIA' },
  dressing: { icon:'🔑', label:'SZATNIA' },
});

const LOCAL_LIFE_EVENTS = Object.freeze([
  {
    id:'no_linesman', category:'organisation', icon:'🏁', title:'Brak sędziego liniowego',
    copy:'Asystent nie dojechał, a pierwszy gwizdek coraz bliżej. Kto bierze chorągiewkę?',
    choices:[
      { label:'Rezerwowy z ławki', desc:'Zna grę, ale osłabia ławkę.', result:'Spalony będzie odgwizdany jak należy. Ławka przez chwilę jest krótsza.', effect:{ defenseDc:-1, delayed:{ after:2, opponentMomentum:8, log:'🏁 Rezerwowy wraca z chorągiewką, ale rywal zdążył złapać rytm. +8% ognia dla rywala.' } } },
      { label:'Kibic spod płotu', desc:'Pewność siebie większa niż znajomość przepisów.', result:'Kibic bierze chorągiewkę i natychmiast staje się głównym bohaterem.', effect:{ playerMomentum:8, attackDc:1 } },
      { label:'Telefon do działacza', desc:'„On na pewno kogoś zna”. Trzeba poczekać.', result:'Działacz uruchamia kontakty. Mecz rusza później, ale w komplecie.', effect:{ clock:2, delayed:{ after:2, playerMomentum:12, log:'📞 Znajomy działacza w końcu dojechał. Organizacyjny sukces: +12% ognia.' } } },
    ],
  },
  {
    id:'ball_in_river', category:'pitch', icon:'🌊', title:'Piłka wpada do rzeki',
    copy:'Poszła daleko za bramkę i właśnie odpływa. Zapasowa jest… gdzieś.',
    choices:[
      { label:'Biegnie najmłodszy', desc:'Tradycja lokalnego futbolu.', result:'Młody wraca mokry, ale z piłką. Trybuny doceniają poświęcenie.', effect:{ playerMomentum:10, clock:1 } },
      { label:'Bierzemy zapasową', desc:'Szybko, tylko trochę miękka.', result:'Gramy dalej piłką, która widziała lepsze czasy.', effect:{ attackDc:1 } },
      { label:'Czekamy, aż dopłynie', desc:'Pełen spokój organizacyjny.', result:'Piłka wyłowiona. Obie drużyny zdążyły odpocząć.', effect:{ clock:3, playerMomentum:5, opponentMomentum:-5 } },
    ],
  },
  {
    id:'late_player', category:'organisation', icon:'🚗', title:'Spóźniony zawodnik',
    copy:'Numer 9 właśnie parkuje pod boiskiem. Twierdzi, że „GPS dziwnie poprowadził”.',
    choices:[
      { label:'Czekamy dwie minuty', desc:'Napastnik zdąży założyć buty.', result:'Wbiega prosto z parkingu. Rozgrzewka była głównie w samochodzie.', effect:{ clock:2, attackDc:1, delayed:{ after:2, attackDc:-1, log:'🚗 Spóźniony numer 9 złapał oddech. Następny atak będzie łatwiejszy.' } } },
      { label:'Gramy bez niego', desc:'Punktualność też jest elementem taktyki.', result:'Zaczynacie w aktualnym składzie. Szatnia kupuje tę decyzję.', effect:{ playerMomentum:8 } },
      { label:'Telefon na głośniku', desc:'Niech cała ławka usłyszy wyjaśnienia.', result:'Wyjaśnienia bawią ławkę, ale skupienie lekko ucieka.', effect:{ playerMomentum:12, defenseDc:1 } },
    ],
  },
  {
    id:'locked_dressing_room', category:'dressing', icon:'🔑', title:'Zamknięta szatnia',
    copy:'Drużyna jest, stroje są, tylko klucz jest u człowieka, który „już jedzie”.',
    choices:[
      { label:'Rozgrzewka od razu', desc:'Nie tracimy czasu.', result:'Rozgrzewka rusza w pełnym rynsztunku. Nogi są gotowe.', effect:{ playerMomentum:8, clock:1 } },
      { label:'Szukamy gospodarza', desc:'Ktoś na obiekcie musi mieć drugi klucz.', result:'Drugi klucz odnaleziony w najbardziej oczywistej szufladzie.', effect:{ clock:2, defenseDc:-1 } },
      { label:'Przebieramy się w aucie', desc:'A-klasowy standard awaryjny.', result:'Logistyka opanowana. Godność została na parkingu.', effect:{ attackDc:-1, defenseDc:1 } },
    ],
  },
  {
    id:'missing_protocol', category:'organisation', icon:'📋', title:'Nie ma protokołu',
    copy:'Kierownik patrzy na trenera, trener na prezesa, a sędzia na zegarek.',
    choices:[
      { label:'Spisujemy z pamięci', desc:'Nazwiska znamy. Numery prawie też.', result:'Protokół gotowy. Jeden zawodnik odkrywa nowy numer na koszulce.', effect:{ playerMomentum:5, attackDc:1 } },
      { label:'Szukamy kierownika', desc:'Na pewno jest gdzieś przy bramie.', result:'Kierownik odnaleziony razem z poprawnym składem.', effect:{ clock:2, defenseDc:-1 } },
      { label:'Zdjęcie starej kartki', desc:'Technologia ratuje A-klasę.', result:'Lista wraca z chmury, czyli z galerii w telefonie.', effect:{ playerMomentum:8 } },
    ],
  },
  {
    id:'uneven_pitch', category:'pitch', icon:'🌱', title:'Kretowisko w środku pola',
    copy:'Piłka odbija się w sposób, którego nie przewidział żaden schemat taktyczny.',
    choices:[
      { label:'Gramy górą', desc:'Laga omija największe nierówności.', result:'Plan jest prosty: wysoko, daleko i bez kontaktu z murawą.', effect:{ attackDc:-1, defenseDc:1 } },
      { label:'Klepiemy mimo wszystko', desc:'Technika ponad warunki.', result:'Ambitnie. Każde przyjęcie wygląda teraz jak test charakteru.', effect:{ playerMomentum:10, attackDc:1 } },
      { label:'Kapitan poprawia murawę', desc:'Butem, dwoma ruchami. Profesjonalnie.', result:'Największa dziura wyrównana. Przynajmniej na oko.', effect:{ clock:1, attackDc:-1 } },
    ],
  },
  {
    id:'downpour', category:'pitch', icon:'🌧️', title:'Oberwanie chmury',
    copy:'Murawa w minutę zamienia się w basen, a piłka staje w każdej kałuży.',
    choices:[
      { label:'Upraszczamy grę', desc:'Bez ryzyka pod własną bramką.', result:'Laga staje się pełnoprawnym systemem gry.', effect:{ defenseDc:-1, attackDc:1 } },
      { label:'Pressing na chaos', desc:'Rywal też nie panuje nad piłką.', result:'Polujecie na każdy mokry kozioł. Mecz robi się dziki.', effect:{ playerMomentum:12, defenseDc:1 } },
      { label:'Czekamy pięć minut', desc:'Może przejdzie bokiem.', result:'Najgorsza ściana deszczu mija. Skarpety już nie wyschną.', effect:{ clock:3, playerMomentum:5, opponentMomentum:-6 } },
    ],
  },
  {
    id:'no_light', category:'pitch', icon:'💡', title:'Zapada zmrok',
    copy:'Lamp nie ma, a piłka zaczyna zlewać się z boiskiem. Do końca jeszcze kawałek.',
    choices:[
      { label:'Gramy szybciej', desc:'Kończymy, zanim zrobi się całkiem ciemno.', result:'Tempo rośnie, podobnie jak liczba niedokładności.', effect:{ playerMomentum:10, attackDc:1, clock:-2 } },
      { label:'Jaskrawa zapasowa piłka', desc:'Ktoś widział pomarańczową w magazynku.', result:'Piłkę widać. Stan powietrza pozostaje tajemnicą.', effect:{ clock:1, attackDc:-1 } },
      { label:'Telefony przy linii', desc:'Kibice robią prowizoryczne oświetlenie.', result:'Trybuny świecą latarkami. Klimat jak na europejskich pucharach, prawie.', effect:{ playerMomentum:15, defenseDc:1 } },
    ],
  },
  {
    id:'grill_behind_goal', category:'crowd', icon:'🌭', title:'Grill za bramką',
    copy:'Kiełbasa gotowa, koncentracja bramkarza zdecydowanie mniej.',
    choices:[
      { label:'Ignorujemy zapach', desc:'Pełen profesjonalizm.', result:'Drużyna wraca myślami na boisko.', effect:{ defenseDc:-1 } },
      { label:'Obietnica po meczu', desc:'Najlepsza premia motywacyjna.', result:'Szatnia gra o kiełbasę. Nagle każdy ma drugi bieg.', effect:{ playerMomentum:14 } },
      { label:'Wysyłamy rezerwowego', desc:'Kontrola jakości musi być.', result:'Jakość potwierdzona. Rezerwowi tracą chwilę koncentracji.', effect:{ attackDc:-1, defenseDc:1 } },
    ],
  },
  {
    id:'fan_keeps_ball', category:'crowd', icon:'⚽', title:'Kibic trzyma piłkę',
    copy:'Piłka wypadła za płot. Kibic odda ją, gdy dokończy rozmowę.',
    choices:[
      { label:'Kapitan idzie po piłkę', desc:'Dyplomacja ponad wszystko.', result:'Krótka rozmowa, piłka wraca, kapitan zna już pół lokalnych plotek.', effect:{ clock:2, playerMomentum:5 } },
      { label:'Dajemy zapasową', desc:'Niech sobie potrzyma.', result:'Gra wznowiona natychmiast. Tamta piłka wróci pewnie po meczu.', effect:{ attackDc:-1 } },
      { label:'Trybuny negocjują', desc:'Presja społeczna działa najlepiej.', result:'Piłka wraca przy aplauzie całego sektora.', effect:{ playerMomentum:12, clock:1 } },
    ],
  },
  {
    id:'dog_on_pitch', category:'crowd', icon:'🐕', title:'Pies na murawie',
    copy:'Mamy zmianę. Wbiega zawodnik bez numeru i od razu rusza za piłką.',
    choices:[
      { label:'Wabimy go piłką', desc:'Ryzykowne, bo właśnie o nią mu chodzi.', result:'Pies schodzi dopiero z piłką. Publiczność ma nowego zawodnika meczu.', effect:{ clock:2, playerMomentum:12 } },
      { label:'Wołamy właściciela', desc:'Ktoś na pewno wie, czyj jest.', result:'Właściciel znaleziony szybciej niż niektórzy rezerwowi.', effect:{ clock:1, defenseDc:-1 } },
      { label:'Czekamy na aut', desc:'Może sam uzna, że akcja skończona.', result:'Pies wyprowadza kontrę, po czym traci zainteresowanie przy chorągiewce.', effect:{ playerMomentum:8, attackDc:1 } },
    ],
  },
  {
    id:'megaphone_fan', category:'crowd', icon:'🎺', title:'Kibic z megafonem',
    copy:'Cała okolica już wie, że był faul. Sędzia też, choć nadal ma inne zdanie.',
    choices:[
      { label:'Podkręcamy doping', desc:'Niech niesie drużynę.', result:'Głośniej już się nie da. Chyba.', effect:{ playerMomentum:15, defenseDc:1 } },
      { label:'Kapitan uspokaja sektor', desc:'Potrzebujemy skupienia.', result:'Megafon milknie na całe trzydzieści sekund.', effect:{ defenseDc:-1, playerMomentum:-4 } },
      { label:'Ławka odpowiada chórem', desc:'Pełna integracja z trybuną.', result:'Taktyki nie słychać, ale morale szybuje.', effect:{ playerMomentum:18, attackDc:1 } },
    ],
  },
  {
    id:'coach_vs_ref', category:'touchline', icon:'🗣️', title:'Trener rywala dyskutuje z sędzią',
    copy:'„Panie sędzio, ale co pan gwiżdże?!” Dyskusja właśnie wchodzi na poziom wykładu.',
    choices:[
      { label:'Nie wchodzimy w to', desc:'Niech rywal traci energię.', result:'Rywal zajmuje się sędzią, wy zajmujecie się meczem.', effect:{ attackDc:-1, opponentMomentum:-8 } },
      { label:'Kapitan też podchodzi', desc:'Żeby zachować równowagę sił.', result:'Teraz dyskutują już wszyscy. Sędzia nie zmienia niczego.', effect:{ clock:2, playerMomentum:8, defenseDc:1 } },
      { label:'Szybko wznawiamy', desc:'Korzystamy z zamieszania.', result:'Rywal wraca do gry sekundę za późno.', effect:{ attackDc:-1, playerMomentum:6 } },
    ],
  },
  {
    id:'ref_no_cards', category:'touchline', icon:'🟥', title:'Sędzia zapomniał kartek',
    copy:'Kieszonki sprawdzone trzy razy. Żółtej ani czerwonej nie ma.',
    choices:[
      { label:'Pożyczamy z ławki', desc:'Kierownik ma zestaw awaryjny.', result:'Kartki odnalezione. Sędzia znów czuje władzę.', effect:{ clock:1, defenseDc:-1 } },
      { label:'Gramy na ostrzeżenia', desc:'Dziś wszystko będzie „ostatni raz”.', result:'Mecz robi się twardszy, a ławki głośniejsze.', effect:{ playerMomentum:10, defenseDc:1 } },
      { label:'Notatnik wystarczy', desc:'Kolor można dopisać po meczu.', result:'Sędzia zapisuje nazwiska. Nikt nie wie, za jaki kolor.', effect:{ opponentMomentum:-6, attackDc:-1 } },
    ],
  },
  {
    id:'wasps_at_bench', category:'touchline', icon:'🐝', title:'Osy przy ławce',
    copy:'Rezerwowi wykonują najbardziej intensywną rozgrzewkę tego sezonu.',
    choices:[
      { label:'Przenosimy ławkę', desc:'Dwa metry mogą uratować spokój.', result:'Ławka przesunięta. Sędzia patrzy, ale odpuszcza.', effect:{ clock:1, defenseDc:-1 } },
      { label:'Ręcznik i kontra', desc:'Kierownik przejmuje inicjatywę.', result:'Kierownik wygrywa pojedynek. Rezerwowi są pod wrażeniem.', effect:{ playerMomentum:12 } },
      { label:'Rozgrzewka za bramką', desc:'Nikt nie będzie siedział.', result:'Cała ławka jest już gotowa do wejścia. Może aż za bardzo.', effect:{ attackDc:-1, defenseDc:1 } },
    ],
  },
]);

function localLifeClampDc(value) {
  return Math.max(1, Math.min(5, Number(value || 1)));
}

function localLifeApply(effect = {}, delayed = false) {
  if (effect.playerMomentum && typeof arcadeMomentum === 'function') arcadeMomentum(effect.playerMomentum);
  if (effect.opponentMomentum && typeof arcadeMomentum === 'function') arcadeMomentum(effect.opponentMomentum, true);
  if (effect.attackDc) state.rpgLifeNextAttackDc = Number(effect.attackDc);
  if (effect.defenseDc) state.rpgLifeNextDefenseDc = Number(effect.defenseDc);
  if (effect.clock) state.rpgMinute = Math.max(0, Math.min(90, Number(state.rpgMinute || 0) + Number(effect.clock)));
  if (!delayed && effect.delayed) {
    if (!Array.isArray(state.rpgLifeDelayed)) state.rpgLifeDelayed = [];
    state.rpgLifeDelayed.push({
      ...effect.delayed,
      dueAction: Number(state.rpgActionsPlayed || 0) + Number(effect.delayed.after || 2),
    });
  }
}

function localLifeResolveDelayed() {
  const now = Number(state.rpgActionsPlayed || 0);
  const due = (state.rpgLifeDelayed || []).filter(item => Number(item.dueAction) <= now);
  state.rpgLifeDelayed = (state.rpgLifeDelayed || []).filter(item => Number(item.dueAction) > now);
  due.forEach(item => {
    localLifeApply(item, true);
    if (item.log) addRpgLog(item.log, item.attackDc < 0 || item.defenseDc < 0 || item.playerMomentum > 0 ? 'good' : '');
  });
}

function localLifeEventById(id) {
  return LOCAL_LIFE_EVENTS.find(event => event.id === id) || null;
}

function localLifeForce(id = null, countEvent = true) {
  let candidates = LOCAL_LIFE_EVENTS.filter(event => !(state.rpgLifeUsedIds instanceof Set) || !state.rpgLifeUsedIds.has(event.id));
  if (!candidates.length) candidates = [...LOCAL_LIFE_EVENTS];
  const event = id ? localLifeEventById(id) : candidates[Math.floor(Math.random() * candidates.length)];
  if (!event || state.rpgLifeActiveEvent) return false;
  state.rpgLifeActiveEvent = event;
  if (!(state.rpgLifeUsedIds instanceof Set)) state.rpgLifeUsedIds = new Set();
  state.rpgLifeUsedIds.add(event.id);
  if (countEvent) {
    state.rpgLifeEventCount = Number(state.rpgLifeEventCount || 0) + 1;
    state.rpgLifeLastEventAction = Number(state.rpgActionsPlayed || 0);
  }
  state.rpgLifeNarration = `${event.icon} ${event.title}. ${event.copy}`;
  addRpgLog(`${event.icon} A-KLASOWE ŻYCIE: ${event.title}.`, '');
  return event;
}

function maybeTriggerLocalLifeEvent() {
  if (!rpgActive() || state.rpgEnded || state.rpgHalftimePending || state.rpgInAddedTime || state.rpgSetPiece || state.rpgLifeActiveEvent) return false;
  if (Number(state.rpgLifeEventCount || 0) >= LOCAL_LIFE_MAX_EVENTS) return false;
  const actionNo = Number(state.rpgActionsPlayed || 0);
  if (actionNo < 2 || actionNo - Number(state.rpgLifeLastEventAction ?? -4) < LOCAL_LIFE_MIN_SPACING) return false;
  // Do not stack three different random-event systems on the same action.
  if (Number(state.rpgLastEventAction ?? -1) === actionNo || Number(state.rpgMediaLastEventAction ?? -1) === actionNo) return false;
  const style = typeof arcadeStyle === 'function' ? arcadeStyle() : null;
  const chance = style?.id === 'chaos' ? LOCAL_LIFE_EVENT_CHAOS_CHANCE : LOCAL_LIFE_EVENT_CHANCE;
  if (Math.random() > chance && actionNo - Number(state.rpgLifeLastEventAction ?? -4) < 5) return false;
  return Boolean(localLifeForce());
}

const localLifeBaseResetRpgState = resetRpgState;
resetRpgState = function localLifeResetRpgState() {
  localLifeBaseResetRpgState();
  state.rpgLifeEventCount = 0;
  state.rpgLifeLastEventAction = -4;
  state.rpgLifeUsedIds = new Set();
  state.rpgLifeActiveEvent = null;
  state.rpgLifeDelayed = [];
  state.rpgLifeNextAttackDc = 0;
  state.rpgLifeNextDefenseDc = 0;
  state.rpgLifeNarration = '';
};

const localLifeBasePlayerActions = playerActions;
playerActions = function localLifePlayerActions() {
  return localLifeBasePlayerActions().map(original => {
    const action = { ...original };
    const delta = Number(state.rpgLifeNextAttackDc || 0);
    if (delta) {
      action.dc = localLifeClampDc(action.dc + delta);
      action.desc = `${action.desc} ${delta < 0 ? '🏟️ Event pomaga: test −1.' : '🏟️ Event przeszkadza: test +1.'}`;
      action.lifeModifierKind = 'attack';
    }
    return action;
  });
};

const localLifeBaseOpponentActions = opponentActions;
opponentActions = function localLifeOpponentActions() {
  return localLifeBaseOpponentActions().map(original => {
    const action = { ...original };
    const delta = Number(state.rpgLifeNextDefenseDc || 0);
    if (delta) {
      action.dc = localLifeClampDc(action.dc + delta);
      action.desc = `${action.desc} ${delta < 0 ? '🏟️ Event pomaga: test −1.' : '🏟️ Event przeszkadza: test +1.'}`;
      action.lifeModifierKind = 'defense';
    }
    return action;
  });
};

const localLifeBaseChooseRpgAction = chooseRpgAction;
chooseRpgAction = function localLifeChooseRpgAction(action) {
  if (action?.lifeModifierKind === 'attack') state.rpgLifeNextAttackDc = 0;
  if (action?.lifeModifierKind === 'defense') state.rpgLifeNextDefenseDc = 0;
  return localLifeBaseChooseRpgAction(action);
};

function localLifeChoose(index) {
  const event = state.rpgLifeActiveEvent;
  const choice = event?.choices?.[index];
  if (!event || !choice) return false;
  localLifeApply(choice.effect || {});
  addRpgLog(`${event.icon} ${choice.result}`, choice.effect?.playerMomentum > 0 || choice.effect?.attackDc < 0 || choice.effect?.defenseDc < 0 ? 'good' : '');
  state.rpgLifeActiveEvent = null;
  state.rpgLifeNarration = '';
  renderRpgBoard();
  renderActionPanel();
  return true;
}

function renderLocalLifeDecision() {
  const panel = el('rpg-action-panel');
  const event = state.rpgLifeActiveEvent;
  if (!panel || !event) return false;
  const category = LOCAL_LIFE_CATEGORIES[event.category] || LOCAL_LIFE_CATEGORIES.organisation;
  panel.classList.add('life-event-active');
  panel.innerHTML = `
    <div class="life-event-card">
      <div class="life-event-top"><span class="life-event-category">${category.icon} ${category.label}</span><span class="life-event-counter">A-KLASOWE ŻYCIE</span></div>
      <div class="life-event-story"><span class="life-event-icon">${event.icon}</span><div><h3>${event.title}</h3><p>${event.copy}</p></div></div>
      <div class="life-event-question">Co robisz?</div>
      <div class="life-event-choices"></div>
      <small class="life-event-note">Decyzja może zadziałać od razu albo wrócić do ciebie za kilka akcji.</small>
    </div>`;
  const choices = panel.querySelector('.life-event-choices');
  event.choices.forEach((choice, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'life-event-choice';
    button.innerHTML = `<span>${String.fromCharCode(65 + index)}</span><strong>${choice.label}</strong><small>${choice.desc}</small>`;
    button.addEventListener('click', () => localLifeChoose(index));
    choices.appendChild(button);
  });
  return true;
}

const localLifeBaseRenderActionPanel = renderActionPanel;
renderActionPanel = function localLifeRenderActionPanel() {
  localLifeResolveDelayed();
  const panel = el('rpg-action-panel');
  if (panel) panel.classList.remove('life-event-active');
  if (state.rpgLifeActiveEvent) {
    renderLocalLifeDecision();
    return;
  }
  return localLifeBaseRenderActionPanel();
};

const localLifeBaseNarratorText = narratorText;
narratorText = function localLifeNarratorText() {
  if (state.rpgLifeActiveEvent && state.rpgLifeNarration) return state.rpgLifeNarration;
  return localLifeBaseNarratorText();
};

const localLifeBaseAnswer = answer;
answer = function localLifeAnswer(button, option) {
  if (!rpgActive()) return localLifeBaseAnswer(button, option);
  const beforeAnswered = Number(state.answered || 0);
  const result = localLifeBaseAnswer(button, option);
  if (Number(state.answered || 0) > beforeAnswered) maybeTriggerLocalLifeEvent();
  return result;
};
