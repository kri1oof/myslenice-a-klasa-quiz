(function (global) {
  'use strict';

  const TRUST_KEYS = Object.freeze(['players', 'coach', 'supporters', 'sponsors']);
  const choice = (label, desc, result, budget = 0, trust = {}, match = null) => ({ label, desc, result, effect:{ budget, trust, ...(match ? { match } : {}) } });
  const decision = (id, icon, title, copy, choices) => ({ id, icon, title, copy, choices });

  const DECISIONS = Object.freeze([
    decision('shirt_sponsor','🤝','Sponsor chce większej ekspozycji','Lokalna firma proponuje dodatkowe środki, ale chce mocniej zaznaczyć swoją obecność przy pierwszej drużynie.',[
      choice('Bierzemy pełny pakiet','+4 500 zł, więcej zobowiązań wobec sponsora.','Sponsor wchodzi szerzej w klub.',4500,{sponsors:8,supporters:-1}),
      choice('Negocjujemy mniejszy pakiet','+2 800 zł i spokojniejsze warunki.','Udaje się znaleźć kompromis.',2800,{sponsors:4,supporters:1}),
      choice('Zostajemy przy swoim','Bez dodatkowych pieniędzy.','Klub zachowuje pełną swobodę.',0,{sponsors:-4,supporters:2}),
    ]),
    decision('winter_hall','🏟️','Trzeba zabezpieczyć treningi zimą','Pogoda zaczyna ograniczać normalny trening. Trener chce zarezerwować halę z wyprzedzeniem.',[
      choice('Stała hala','Koszt 2 600 zł. Lepsza regularność treningów.','Sztab ma pewny plan na zimę.',-2600,{players:6,coach:8},{all:0.02}),
      choice('Tylko najgorsze tygodnie','Koszt 1 200 zł.','Jest plan awaryjny, ale bez komfortu.',-1200,{players:2,coach:3},{all:0.01}),
      choice('Trenujemy na zewnątrz','Bez kosztu.','Budżet zostaje cały, sztab nie jest zachwycony.',0,{players:-2,coach:-3},{all:-0.01}),
    ]),
    decision('young_player','🌱','Dać szansę młodemu zawodnikowi?','Sztab wskazuje wyróżniającego się młodego gracza. Można włączyć go do pracy z pierwszą drużyną.',[
      choice('Włączamy go na stałe','Mały koszt organizacyjny, mocny sygnał dla klubu.','Młody zawodnik trafia do szerszej kadry.',-400,{players:2,coach:3,supporters:5},{all:0.005}),
      choice('Najpierw kilka treningów','Bez presji i bez dużego kosztu.','Sztab spokojnie sprawdza zawodnika.',-100,{coach:2,supporters:2}),
      choice('Jeszcze nie teraz','Stawiamy na obecną kadrę.','Temat wraca na później.',0,{coach:-2,supporters:-2}),
    ]),
    decision('training_balls','⚽','Sprzęt treningowy jest już mocno zużyty','Kilka piłek nadaje się bardziej do muzeum A-klasy niż do normalnego treningu.',[
      choice('Kupujemy porządny komplet','Koszt 900 zł.','Trening od razu wygląda normalniej.',-900,{players:4,coach:3},{attack:0.01}),
      choice('Tylko najpotrzebniejsze sztuki','Koszt 400 zł.','Minimum sprzętowe jest zabezpieczone.',-400,{players:1,coach:1}),
      choice('Jeszcze wytrzymają','Bez wydatku.','Budżet oszczędzony, cierpliwość sztabu trochę mniej.',0,{players:-2,coach:-2}),
    ]),
    decision('pitch_work','🌿','Murawa wymaga pracy przed serią meczów domowych','Po deszczu boisko jest nierówne i miękkie. Trzeba zdecydować, ile klub wkłada w przygotowanie płyty.',[
      choice('Pełne prace','Koszt 1 800 zł.','Boisko zostaje solidnie przygotowane.',-1800,{coach:4,supporters:3},{all:0.015}),
      choice('Robota społeczna + materiały','Koszt 600 zł.','Ludzie z klubu wspólnie ratują murawę.',-600,{supporters:6,coach:1},{all:0.005}),
      choice('Gramy jak jest','Bez kosztu.','Oszczędzamy, ale warunki nie pomagają drużynie.',0,{coach:-4,supporters:-2},{all:-0.02}),
    ]),
    decision('away_transport','🚌','Wyjazd logistycznie robi się trudny','Kilku zawodników ma problem z dojazdem na dalszy mecz. Klub może zorganizować wspólny transport.',[
      choice('Autokar dla całej drużyny','Koszt 1 400 zł.','Wszyscy jadą razem i bez kombinowania.',-1400,{players:5,coach:3},{all:0.015}),
      choice('Busy i samochody klubowe','Koszt 500 zł.','Nie jest luksusowo, ale działa.',-500,{players:1,coach:1}),
      choice('Każdy organizuje dojazd sam','Klub nie ponosi kosztu.','Budżet oszczędzony, szatnia trochę mniej zadowolona.',0,{players:-3,coach:-2},{all:-0.015}),
    ]),
    decision('late_work','🕒','Część kadry kończy pracę tuż przed meczem','A-klasowa codzienność: kilku zawodników może dotrzeć na zbiórkę na ostatnią chwilę.',[
      choice('Organizujemy szybki transport','Koszt 600 zł.','Zawodnicy docierają razem i bez nerwów.',-600,{players:5},{all:0.015}),
      choice('Przesuwamy odprawę','Bez kosztu, mniej czasu na przygotowanie.','Szatnia dostosowuje plan dnia.',0,{players:2,coach:-1}),
      choice('Szykujemy zmienników','Stawiamy na dostępnych ludzi.','Trener ma jasny plan B.',0,{coach:3,players:-1},{all:-0.005}),
    ]),
    decision('extra_session','📋','Trener prosi o dodatkowy trening','Przed ważnym meczem sztab chce dołożyć jedną jednostkę i przećwiczyć stałe fragmenty.',[
      choice('Dajemy dodatkowy termin','Koszt 500 zł.','Sztab dostaje warunki do dodatkowej pracy.',-500,{coach:5,players:1},{all:0.015}),
      choice('Zostajemy przy planie','Bez dodatkowych kosztów.','Tydzień przebiega standardowo.',0,{}),
      choice('Zamiast tego regeneracja','Koszt 300 zł.','Mniej taktyki, więcej świeżości.',-300,{players:4,coach:1},{defence:0.01}),
    ]),
    decision('academy_grant','🎓','Pojawia się możliwość dofinansowania akademii','Projekt wymaga wkładu własnego, ale może zostawić w klubie więcej sprzętu i zajęć dla dzieci.',[
      choice('Wchodzimy w projekt','Wkład własny, ale projekt daje klubowi większą wartość.','Akademia dostaje mocny impuls.',1000,{supporters:6,sponsors:4,coach:1}),
      choice('Mniejszy zakres','Skromniejszy projekt.','Klub korzysta, ale ostrożniej.',300,{supporters:3,sponsors:2}),
      choice('Odpuśćmy w tym sezonie','Brak ryzyka finansowego.','Budżet pierwszej drużyny pozostaje nietknięty.',0,{supporters:-3,sponsors:-1}),
    ]),
    decision('higher_league_offer','📞','Podstawowy zawodnik ma propozycję z wyższej ligi','To anonimowy scenariusz organizacyjny trybu prezesa, niezwiązany z konkretną osobą z bazy ŁNP.',[
      choice('Nie blokujemy odejścia','Dobra relacja z szatnią, sportowo trudniej.','Klub zachowuje się fair wobec zawodnika.',500,{players:6,supporters:-3,coach:-2},{all:-0.02}),
      choice('Premia za pozostanie','Koszt 1 000 zł.','Zawodnik zostaje do końca sezonu.',-1000,{players:2,coach:4,supporters:3},{all:0.015}),
      choice('Dogadujemy się do końca rundy','Bez dodatkowego kosztu.','Obie strony odkładają decyzję.',0,{players:1,coach:1}),
    ]),
    decision('win_bonus','💰','Szatnia pyta o premię za ważny mecz','Przed trudnym spotkaniem pojawia się temat dodatkowej motywacji finansowej.',[
      choice('Pełna premia meczowa','Koszt 1 200 zł.','Szatnia dostaje dodatkowy bodziec.',-1200,{players:6},{all:0.025}),
      choice('Symboliczna premia','Koszt 400 zł.','Gest jest zauważony, budżet cierpi mniej.',-400,{players:2},{all:0.01}),
      choice('Gramy bez premii','Bez kosztu.','Nic się nie zmienia poza kilkoma komentarzami w szatni.',0,{players:-2}),
    ]),
    decision('match_partner','📣','Partner chce zrobić akcję podczas meczu domowego','Firma proponuje aktywację przy boisku i dodatkowy wkład do klubowej kasy.',[
      choice('Robimy pełną akcję','+1 800 zł, trochę pracy organizacyjnej.','Mecz ma sponsorską oprawę, klub zarabia.',1800,{sponsors:7,supporters:2,coach:-1}),
      choice('Mała ekspozycja','+800 zł.','Partner jest widoczny, organizacja pozostaje prosta.',800,{sponsors:3,supporters:1}),
      choice('Nie dokładamy obowiązków','Bez dodatkowego przychodu.','Dzień meczowy pozostaje prostszy.',0,{sponsors:-4,coach:1}),
    ]),
    decision('physio_support','🩹','Sztab chce lepszego zabezpieczenia medycznego','Przy napiętym terminarzu trener proponuje dodatkową opiekę fizjoterapeutyczną dla pierwszej drużyny.',[
      choice('Regularna współpraca','Koszt 1 500 zł.','Zespół ma lepsze warunki regeneracji.',-1500,{players:6,coach:5},{all:0.02}),
      choice('Tylko po meczach','Koszt 600 zł.','Podstawowe wsparcie jest zabezpieczone.',-600,{players:2,coach:2},{all:0.005}),
      choice('Zostajemy przy obecnym modelu','Bez kosztu.','Budżet bez zmian, sztab chciałby więcej.',0,{players:-2,coach:-2},{all:-0.005}),
    ]),
    decision('lights','💡','Oświetlenie boiska zaczyna odmawiać współpracy','Wieczorne treningi są coraz trudniejsze. Trzeba zdecydować, czy robić naprawę od razu.',[
      choice('Naprawiamy porządnie','Koszt 2 200 zł.','Problem z oświetleniem znika.',-2200,{coach:4,supporters:2},{all:0.01}),
      choice('Naprawa tymczasowa','Koszt 700 zł.','Do końca rundy powinno wystarczyć.',-700,{coach:1}),
      choice('Przesuwamy treningi wcześniej','Bez kosztu finansowego.','Da się trenować, ale plan jest mniej wygodny.',0,{players:-2,coach:-3},{all:-0.01}),
    ]),
    decision('club_media','📱','Klub potrzebuje lepszej komunikacji','Sponsorzy pytają o zasięgi, kibice chcą więcej informacji, a ktoś musi to wszystko prowadzić.',[
      choice('Mały budżet na media','Koszt 700 zł.','Komunikacja zaczyna wyglądać regularnie.',-700,{supporters:5,sponsors:5}),
      choice('Robimy społecznie','Koszt 150 zł.','Jest mniej profesjonalnie, ale regularnie.',-150,{supporters:3,sponsors:2}),
      choice('Wyniki wystarczą','Bez kosztu.','Klub oszczędza, partnerzy chcieliby większej widoczności.',0,{supporters:-2,sponsors:-3}),
    ]),
    decision('locker_room_conflict','🗣️','Po treningu iskrzy w szatni','Dwóch zawodników mocno się spiera. To anonimowy scenariusz gry, niezwiązany z realnymi osobami.',[
      choice('Prezes rozmawia z obiema stronami','Bez kosztu, potrzebny czas.','Emocje opadają bez publicznej awantury.',0,{players:4,coach:1},{all:0.005}),
      choice('Trener ma pełną odpowiedzialność','Wzmacniamy pozycję szkoleniowca.','Sztab rozwiązuje temat po swojemu.',0,{coach:4,players:-2}),
      choice('Twarda dyscyplina','Jasne zasady, ale szatnia czuje presję.','Konflikt ucina się szybko.',0,{players:-4,coach:2},{defence:0.01}),
    ]),
    decision('club_day','🍔','Pomysł na klubowy dzień z kibicami','Można zrobić rodzinny dzień przy boisku, mały turniej i zbiórkę na działalność klubu.',[
      choice('Robimy pełne wydarzenie','Koszt organizacji, ale potencjalny przychód większy.','Frekwencja dopisuje i klub zyskuje społecznie.',1700,{supporters:8,sponsors:4,players:1}),
      choice('Mały grill po meczu','Niski koszt, mniejszy efekt.','Prosto, lokalnie i skutecznie.',600,{supporters:4,sponsors:1}),
      choice('Nie dokładamy wydarzeń','Zero ryzyka organizacyjnego.','Weekend zostaje wyłącznie meczowy.',0,{supporters:-2}),
    ]),
    decision('academy_coach','🧒','Akademia potrzebuje dodatkowego trenera','Rosnąca grupa dzieci wymaga więcej uwagi. Decyzja wpływa na klub, ale nie daje automatycznego gola pierwszej drużynie.',[
      choice('Zatrudniamy dodatkowego trenera','Koszt 1 800 zł.','Akademia dostaje stabilniejsze warunki.',-1800,{supporters:6,sponsors:3,coach:1}),
      choice('Łączymy role w obecnym sztabie','Koszt 600 zł, większe obciążenie.','Problem rozwiązany na teraz.',-600,{supporters:3,coach:-2}),
      choice('Czekamy do kolejnego sezonu','Bez wydatku.','Budżet bez zmian, otoczenie klubu oczekiwało więcej.',0,{supporters:-4,sponsors:-1}),
    ]),
  ]);

  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const roll = Math.max(0, Math.min(.999999, Number(random()) || 0));
      const j = Math.floor(roll * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function initialState(totalRounds = 0, random = Math.random) {
    return {
      active:true, budget:12000,
      trust:{ players:55, coach:55, supporters:50, sponsors:50 },
      usedIds:[], order:shuffle(DECISIONS.map(item => item.id), random), history:[],
      currentDecision:null, currentMatchEffect:null, decidedRound:-1,
      matches:0, totalRounds:Number(totalRounds || 0), lastFinance:0,
    };
  }

  function decisionById(id) { return DECISIONS.find(item => item.id === id) || null; }

  function pickDecision(profile) {
    const used = new Set(profile?.usedIds || []);
    const order = Array.isArray(profile?.order) ? profile.order : DECISIONS.map(item => item.id);
    const nextId = order.find(id => !used.has(id));
    return nextId ? decisionById(nextId) : null;
  }

  function canChoose(profile, selectedChoice) {
    return Number(profile?.budget || 0) + Number(selectedChoice?.effect?.budget || 0) >= 0;
  }

  function normalizedTrust(trust = {}) {
    const result = {};
    TRUST_KEYS.forEach(key => { result[key] = clamp(trust[key] ?? 50, 0, 100); });
    return result;
  }

  function applyTrust(trust, delta = {}) {
    const next = normalizedTrust(trust);
    TRUST_KEYS.forEach(key => { next[key] = clamp(next[key] + Number(delta[key] || 0), 0, 100); });
    return next;
  }

  function normalizeMatchEffect(effect = null) {
    if (!effect) return null;
    return {
      all:clamp(effect.all || 0, -0.08, 0.08),
      attack:clamp(effect.attack || 0, -0.08, 0.08),
      defence:clamp(effect.defence || 0, -0.08, 0.08),
    };
  }

  function applyChoice(profile, selectedDecision, choiceIndex, roundIndex = 0) {
    const selectedChoice = selectedDecision?.choices?.[choiceIndex];
    if (!profile || !selectedDecision || !selectedChoice) return { ok:false, reason:'invalid' };
    if (!canChoose(profile, selectedChoice)) return { ok:false, reason:'budget' };
    const budgetDelta = Number(selectedChoice.effect?.budget || 0);
    const next = {
      ...profile,
      budget:Number(profile.budget || 0) + budgetDelta,
      trust:applyTrust(profile.trust, selectedChoice.effect?.trust),
      usedIds:[...new Set([...(profile.usedIds || []), selectedDecision.id])],
      currentDecision:null,
      currentMatchEffect:normalizeMatchEffect(selectedChoice.effect?.match),
      decidedRound:Number(roundIndex),
      history:[...(profile.history || []), {
        round:Number(roundIndex) + 1, decisionId:selectedDecision.id, title:selectedDecision.title,
        choice:selectedChoice.label, result:selectedChoice.result, budgetDelta,
        trustDelta:{ ...(selectedChoice.effect?.trust || {}) },
        matchEffect:normalizeMatchEffect(selectedChoice.effect?.match),
      }],
    };
    return { ok:true, profile:next, choice:selectedChoice, budgetDelta };
  }

  function chanceModifier(effect, possession = 'player') {
    const normalized = normalizeMatchEffect(effect);
    if (!normalized) return 0;
    const side = possession === 'opponent' ? normalized.defence : normalized.attack;
    return clamp(normalized.all + side, -0.08, 0.08);
  }

  function adjustedChance(baseChance, effect, possession = 'player') {
    return clamp(Number(baseChance || 0) + chanceModifier(effect, possession), 0.04, 0.97);
  }

  function matchFinance({ venue = 'DOM', result = 'D' } = {}) {
    const base = String(venue).toUpperCase() === 'DOM' ? 700 : -250;
    const bonus = result === 'W' ? 300 : result === 'D' ? 100 : 0;
    return base + bonus;
  }

  function postMatchTrustDelta(result) {
    if (result === 'W') return { players:3, coach:2, supporters:3, sponsors:2 };
    if (result === 'L') return { players:-2, coach:-2, supporters:-3, sponsors:-1 };
    return { players:1, coach:0, supporters:0, sponsors:0 };
  }

  function applyPostMatch(profile, context = {}) {
    if (!profile) return null;
    const finance = matchFinance(context);
    return {
      ...profile,
      budget:Number(profile.budget || 0) + finance,
      trust:applyTrust(profile.trust, postMatchTrustDelta(context.result)),
      currentMatchEffect:null,
      matches:Number(profile.matches || 0) + 1,
      lastFinance:finance,
    };
  }

  function averageTrust(profile) {
    const trust = normalizedTrust(profile?.trust);
    return Math.round(TRUST_KEYS.reduce((sum, key) => sum + trust[key], 0) / TRUST_KEYS.length);
  }

  function trustLabel(value) {
    const score = Number(value || 0);
    if (score >= 75) return 'bardzo wysokie';
    if (score >= 60) return 'wysokie';
    if (score >= 40) return 'stabilne';
    if (score >= 25) return 'niskie';
    return 'kryzysowe';
  }

  function money(value) { return `${Math.round(Number(value || 0)).toLocaleString('pl-PL')} zł`; }

  const api = {
    TRUST_KEYS, DECISIONS, initialState, decisionById, pickDecision, canChoose, applyChoice,
    normalizedTrust, chanceModifier, adjustedChance, matchFinance, applyPostMatch,
    averageTrust, trustLabel, money,
  };

  global.PresidentModeCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
