(function (global) {
  'use strict';

  const TRUST_KEYS = Object.freeze(['players', 'coach', 'supporters', 'sponsors']);

  const DECISIONS = Object.freeze([
    {
      id:'shirt_sponsor', icon:'🤝', title:'Sponsor chce większej ekspozycji',
      copy:'Lokalna firma proponuje dodatkowe środki, ale chce mocniej zaznaczyć swoją obecność przy pierwszej drużynie.',
      choices:[
        { label:'Bierzemy pełny pakiet', desc:'+4 500 zł, więcej zobowiązań wobec sponsora.', result:'Sponsor wchodzi szerzej w klub.', effect:{ budget:4500, trust:{ sponsors:8, supporters:-1 } } },
        { label:'Negocjujemy mniejszy pakiet', desc:'+2 800 zł i spokojniejsze warunki.', result:'Udaje się znaleźć kompromis.', effect:{ budget:2800, trust:{ sponsors:4, supporters:1 } } },
        { label:'Zostajemy przy swoim', desc:'Bez dodatkowych pieniędzy.', result:'Klub zachowuje pełną swobodę.', effect:{ budget:0, trust:{ sponsors:-4, supporters:2 } } },
      ],
    },
    {
      id:'winter_hall', icon:'🏟️', title:'Trzeba zabezpieczyć treningi zimą',
      copy:'Pogoda zaczyna ograniczać normalny trening. Trener chce zarezerwować halę z wyprzedzeniem.',
      choices:[
        { label:'Stała hala', desc:'Koszt 2 600 zł. Lepsza regularność treningów.', result:'Sztab ma pewny plan na zimę.', effect:{ budget:-2600, trust:{ players:6, coach:8 }, match:{ all:0.02 } } },
        { label:'Tylko najgorsze tygodnie', desc:'Koszt 1 200 zł.', result:'Jest plan awaryjny, ale bez komfortu.', effect:{ budget:-1200, trust:{ players:2, coach:3 }, match:{ all:0.01 } } },
        { label:'Trenujemy na zewnątrz', desc:'Bez kosztu.', result:'Budżet zostaje cały, sztab nie jest zachwycony.', effect:{ budget:0, trust:{ players:-2, coach:-3 }, match:{ all:-0.01 } } },
      ],
    },
    {
      id:'young_player', icon:'🌱', title:'Dać szansę młodemu zawodnikowi?',
      copy:'Sztab wskazuje wyróżniającego się młodego gracza. Można włączyć go do pracy z pierwszą drużyną.',
      choices:[
        { label:'Włączamy go na stałe', desc:'Mały koszt organizacyjny, mocny sygnał dla klubu.', result:'Młody zawodnik trafia do szerszej kadry.', effect:{ budget:-400, trust:{ players:2, coach:3, supporters:5 }, match:{ all:0.005 } } },
        { label:'Najpierw kilka treningów', desc:'Bez presji i bez dużego kosztu.', result:'Sztab spokojnie sprawdza zawodnika.', effect:{ budget:-100, trust:{ coach:2, supporters:2 } } },
        { label:'Jeszcze nie teraz', desc:'Stawiamy na obecną kadrę.', result:'Temat wraca na później.', effect:{ budget:0, trust:{ coach:-2, supporters:-2 } } },
      ],
    },
    {
      id:'training_balls', icon:'⚽', title:'Sprzęt treningowy jest już mocno zużyty',
      copy:'Kilka piłek nadaje się bardziej do muzeum A-klasy niż do normalnego treningu.',
      choices:[
        { label:'Kupujemy porządny komplet', desc:'Koszt 900 zł.', result:'Trening od razu wygląda normalniej.', effect:{ budget:-900, trust:{ players:4, coach:3 }, match:{ attack:0.01 } } },
        { label:'Tylko najpotrzebniejsze sztuki', desc:'Koszt 400 zł.', result:'Minimum sprzętowe jest zabezpieczone.', effect:{ budget:-400, trust:{ players:1, coach:1 } } },
        { label:'Jeszcze wytrzymają', desc:'Bez wydatku.', result:'Budżet oszczędzony, cierpliwość sztabu trochę mniej.', effect:{ budget:0, trust:{ players:-2, coach:-2 } } },
      ],
    },
    {
      id:'pitch_work', icon:'🌿', title:'Murawa wymaga pracy przed serią meczów domowych',
      copy:'Po deszczu boisko jest nierówne i miękkie. Trzeba zdecydować, ile klub wkłada w przygotowanie płyty.',
      choices:[
        { label:'Pełne prace', desc:'Koszt 1 800 zł.', result:'Boisko zostaje solidnie przygotowane.', effect:{ budget:-1800, trust:{ coach:4, supporters:3 }, match:{ all:0.015 } } },
        { label:'Robota społeczna + materiały', desc:'Koszt 600 zł.', result:'Ludzie z klubu wspólnie ratują murawę.', effect:{ budget:-600, trust:{ supporters:6, coach:1 }, match:{ all:0.005 } } },
        { label:'Gramy jak jest', desc:'Bez kosztu.', result:'Oszczędzamy, ale warunki nie pomagają drużynie.', effect:{ budget:0, trust:{ coach:-4, supporters:-2 }, match:{ all:-0.02 } } },
      ],
    },
    {
      id:'away_transport', icon:'🚌', title:'Wyjazd logistycznie robi się trudny',
      copy:'Kilku zawodników ma problem z dojazdem na dalszy mecz. Klub może zorganizować wspólny transport.',
      choices:[
        { label:'Autokar dla całej drużyny', desc:'Koszt 1 400 zł.', result:'Wszyscy jadą razem i bez kombinowania.', effect:{ budget:-1400, trust:{ players:5, coach:3 }, match:{ all:0.015 } } },
        { label:'Busy i samochody klubowe', desc:'Koszt 500 zł.', result:'Nie jest luksusowo, ale działa.', effect:{ budget:-500, trust:{ players:1, coach:1 } } },
        { label:'Każdy organizuje dojazd sam', desc:'Prawie bez kosztu.', result:'Klub oszczędza, szatnia trochę mniej.', effect:{ budget:-100, trust:{ players:-3, coach:-2 }, match:{ all:-0.015 } } },
      ],
    },
    {
      id:'late_work', icon:'🕒', title:'Część kadry kończy pracę tuż przed meczem',
      copy:'A-klasowa codzienność: kilku zawodników może dotrzeć na zbiórkę na ostatnią chwilę.',
      choices:[
        { label:'Organizujemy szybki transport', desc:'Koszt 600 zł.', result:'Zawodnicy docierają razem i bez nerwów.', effect:{ budget:-600, trust:{ players:5 }, match:{ all:0.015 } } },
        { label:'Przesuwamy odprawę', desc:'Bez kosztu, mniej czasu na przygotowanie.', result:'Szatnia dostosowuje plan dnia.', effect:{ budget:0, trust:{ players:2, coach:-1 } } },
        { label:'Szykujemy zmienników', desc:'Stawiamy na dostępnych ludzi.', result:'Trener ma jasny plan B.', effect:{ budget:0, trust:{ coach:3, players:-1 }, match:{ all:-0.005 } } },
      ],
    },
    {
      id:'extra_session', icon:'📋', title:'Trener prosi o dodatkowy trening',
      copy:'Przed ważnym meczem sztab chce dołożyć jedną jednostkę i przećwiczyć stałe fragmenty.',
      choices:[
        { label:'Dajemy dodatkowy termin', desc:'Koszt 500 zł.', result:'Sztab dostaje warunki do dodatkowej pracy.', effect:{ budget:-500, trust:{ coach:5, players:1 }, match:{ all:0.015 } } },
        { label:'Zostajemy przy planie', desc:'Bez dodatkowych kosztów.', result:'Tydzień przebiega standardowo.', effect:{ budget:0, trust:{} } },
        { label:'Zamiast tego regeneracja', desc:'Koszt 300 zł.', result:'Mniej taktyki, więcej świeżości.', effect:{ budget:-300, trust:{ players:4, coach:1 }, match:{ defence:0.01 } } },
      ],
    },
    {
      id:'academy_grant', icon:'🎓', title:'Pojawia się możliwość dofinansowania akademii',
      copy:'Projekt wymaga wkładu własnego, ale może zostawić w klubie więcej sprzętu i zajęć dla dzieci.',
      choices:[
        { label:'Wchodzimy w projekt', desc:'Wkład 2 000 zł, do klubu wraca większa wartość projektu.', result:'Akademia dostaje mocny impuls.', effect:{ budget:1000, trust:{ supporters:6, sponsors:4, coach:1 } } },
        { label:'Mniejszy zakres', desc:'Wkład 700 zł i skromniejszy projekt.', result:'Klub korzysta, ale ostrożniej.', effect:{ budget:300, trust:{ supporters:3, sponsors:2 } } },
        { label:'Odpuśćmy w tym sezonie', desc:'Brak ryzyka finansowego.', result:'Budżet pierwszej drużyny pozostaje nietknięty.', effect:{ budget:0, trust:{ supporters:-3, sponsors:-1 } } },
      ],
    },
    {
      id:'higher_league_offer', icon:'📞', title:'Podstawowy zawodnik ma propozycję z wyższej ligi',
      copy:'Nie chodzi o konkretną osobę z bazy ŁNP — to losowy scenariusz organizacyjny trybu prezesa.',
      choices:[
        { label:'Nie blokujemy odejścia', desc:'Dobra relacja z szatnią, sportowo trudniej.', result:'Klub zachowuje się fair wobec zawodnika.', effect:{ budget:500, trust:{ players:6, supporters:-3, coach:-2 }, match:{ all:-0.02 } } },
        { label:'Premia za pozostanie', desc:'Koszt 1 000 zł.', result:'Zawodnik zostaje do końca sezonu.', effect:{ budget:-1000, trust:{ players:2, coach:4, supporters:3 }, match:{ all:0.015 } } },
        { label:'Dogadujemy się do końca rundy', desc:'Bez dodatkowego kosztu.', result:'Obie strony odkładają decyzję.', effect:{ budget:0, trust:{ players:1, coach:1 } } },
      ],
    },
    {
      id:'win_bonus', icon:'💰', title:'Szatnia pyta o premię za ważny mecz',
      copy:'Przed trudnym spotkaniem pojawia się temat dodatkowej motywacji finansowej.',
      choices:[
        { label:'Pełna premia meczowa', desc:'Koszt 1 200 zł.', result:'Szatnia dostaje dodatkowy bodziec.', effect:{ budget:-1200, trust:{ players:6 }, match:{ all:0.025 } } },
        { label:'Symboliczna premia', desc:'Koszt 400 zł.', result:'Gest jest zauważony, budżet cierpi mniej.', effect:{ budget:-400, trust:{ players:2 }, match:{ all:0.01 } } },
        { label:'Gramy bez premii', desc:'Bez kosztu.', result:'Nic się nie zmienia poza kilkoma komentarzami w szatni.', effect:{ budget:0, trust:{ players:-2 } } },
      ],
    },
    {
      id:'match_partner', icon:'📣', title:'Partner chce zrobić akcję podczas meczu domowego',
      copy:'Firma proponuje aktywację przy boisku i dodatkowy wkład do klubowej kasy.',
      choices:[
        { label:'Robimy pełną akcję', desc:'+1 800 zł, trochę pracy organizacyjnej.', result:'Mecz ma sponsorską oprawę, klub zarabia.', effect:{ budget:1800, trust:{ sponsors:7, supporters:2, coach:-1 } } },
        { label:'Mała ekspozycja', desc:'+800 zł.', result:'Partner jest widoczny, organizacja pozostaje prosta.', effect:{ budget:800, trust:{ sponsors:3, supporters:1 } } },
        { label:'Nie dokładamy obowiązków', desc:'Bez dodatkowego przychodu.', result:'Dzień meczowy pozostaje prostszy.', effect:{ budget:0, trust:{ sponsors:-4, coach:1 } } },
      ],
    },
    {
      id:'physio_support', icon:'🩹', title:'Sztab chce lepszego zabezpieczenia medycznego',
      copy:'Przy napiętym terminarzu trener proponuje dodatkową opiekę fizjoterapeutyczną dla pierwszej drużyny.',
      choices:[
        { label:'Regularna współpraca', desc:'Koszt 1 500 zł.', result:'Zespół ma lepsze warunki regeneracji.', effect:{ budget:-1500, trust:{ players:6, coach:5 }, match:{ all:0.02 } } },
        { label:'Tylko po meczach', desc:'Koszt 600 zł.', result:'Podstawowe wsparcie jest zabezpieczone.', effect:{ budget:-600, trust:{ players:2, coach:2 }, match:{ all:0.005 } } },
        { label:'Zostajemy przy obecnym modelu', desc:'Bez kosztu.', result:'Budżet bez zmian, sztab chciałby więcej.', effect:{ budget:0, trust:{ players:-2, coach:-2 }, match:{ all:-0.005 } } },
      ],
    },
    {
      id:'lights', icon:'💡', title:'Oświetlenie boiska zaczyna odmawiać współpracy',
      copy:'Wieczorne treningi są coraz trudniejsze. Trzeba zdecydować, czy robić naprawę od razu.',
      choices:[
        { label:'Naprawiamy porządnie', desc:'Koszt 2 200 zł.', result:'Problem z oświetleniem znika.', effect:{ budget:-2200, trust:{ coach:4, supporters:2 }, match:{ all:0.01 } } },
        { label:'Naprawa tymczasowa', desc:'Koszt 700 zł.', result:'Do końca rundy powinno wystarczyć.', effect:{ budget:-700, trust:{ coach:1 } } },
        { label:'Przesuwamy treningi wcześniej', desc:'Bez kosztu finansowego.', result:'Da się trenować, ale plan jest mniej wygodny.', effect:{ budget:0, trust:{ players:-2, coach:-3 }, match:{ all:-0.01 } } },
      ],
    },
    {
      id:'club_media', icon:'📱', title:'Klub potrzebuje lepszej komunikacji',
      copy:'Sponsorzy pytają o zasięgi, kibice chcą więcej informacji, a ktoś musi to wszystko prowadzić.',
      choices:[
        { label:'Mały budżet na media', desc:'Koszt 700 zł.', result:'Komunikacja zaczyna wyglądać regularnie.', effect:{ budget:-700, trust:{ supporters:5, sponsors:5 } } },
        { label:'Robimy społecznie', desc:'Koszt 150 zł.', result:'Jest mniej profesjonalnie, ale regularnie.', effect:{ budget:-150, trust:{ supporters:3, sponsors:2 } } },
        { label:'Wyniki wystarczą', desc:'Bez kosztu.', result:'Klub oszczędza, partnerzy chcieliby większej widoczności.', effect:{ budget:0, trust:{ supporters:-2, sponsors:-3 } } },
      ],
    },
    {
      id:'locker_room_conflict', icon:'🗣️', title:'Po treningu iskrzy w szatni',
      copy:'Dwóch zawodników mocno się spiera. To anonimowy scenariusz gry, niezwiązany z realnymi osobami.',
      choices:[
        { label:'Prezes rozmawia z obiema stronami', desc:'Bez kosztu, potrzebny czas.', result:'Emocje opadają bez publicznej awantury.', effect:{ budget:0, trust:{ players:4, coach:1 }, match:{ all:0.005 } } },
        { label:'Trener ma pełną odpowiedzialność', desc:'Wzmacniamy pozycję szkoleniowca.', result:'Sztab rozwiązuje temat po swojemu.', effect:{ budget:0, trust:{ coach:4, players:-2 } } },
        { label:'Twarda dyscyplina', desc:'Jasne zasady, ale szatnia czuje presję.', result:'Konflikt ucina się szybko.', effect:{ budget:0, trust:{ players:-4, coach:2 }, match:{ defence:0.01 } } },
      ],
    },
    {
      id:'club_day', icon:'🍔', title:'Pomysł na klubowy dzień z kibicami',
      copy:'Można zrobić rodzinny dzień przy boisku, mały turniej i zbiórkę na działalność klubu.',
      choices:[
        { label:'Robimy pełne wydarzenie', desc:'Koszt organizacji 500 zł, potencjalny przychód większy.', result:'Frekwencja dopisuje i klub zyskuje społecznie.', effect:{ budget:1700, trust:{ supporters:8, sponsors:4, players:1 } } },
        { label:'Mały grill po meczu', desc:'Niski koszt, mniejszy efekt.', result:'Prosto, lokalnie i skutecznie.', effect:{ budget:600, trust:{ supporters:4, sponsors:1 } } },
        { label:'Nie dokładamy wydarzeń', desc:'Zero ryzyka organizacyjnego.', result:'Weekend zostaje wyłącznie meczowy.', effect:{ budget:0, trust:{ supporters:-2 } } },
      ],
    },
    {
      id:'academy_coach', icon:'🧒', title:'Akademia potrzebuje dodatkowego trenera',
      copy:'Rosnąca grupa dzieci wymaga więcej uwagi. Decyzja nie daje natychmiastowego gola pierwszej drużynie, ale wpływa na klub.',
      choices:[
        { label:'Zatrudniamy dodatkowego trenera', desc:'Koszt 1 800 zł.', result:'Akademia dostaje stabilniejsze warunki.', effect:{ budget:-1800, trust:{ supporters:6, sponsors:3, coach:1 } } },
        { label:'Łączymy role w obecnym sztabie', desc:'Koszt 600 zł, większe obciążenie.', result:'Problem rozwiązany na teraz.', effect:{ budget:-600, trust:{ supporters:3, coach:-2 } } },
        { label:'Czekamy do kolejnego sezonu', desc:'Bez wydatku.', result:'Budżet bez zmian, rodzice i kibice oczekiwali więcej.', effect:{ budget:0, trust:{ supporters:-4, sponsors:-1 } } },
      ],
    },
  ]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(clamp(random(), 0, 0.999999) * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function initialState(totalRounds = 0, random = Math.random) {
    return {
      active:true,
      budget:12000,
      trust:{ players:55, coach:55, supporters:50, sponsors:50 },
      usedIds:[],
      order:shuffle(DECISIONS.map(item => item.id), random),
      history:[],
      currentDecision:null,
      currentMatchEffect:null,
      decidedRound:-1,
      matches:0,
      totalRounds:Number(totalRounds || 0),
      lastFinance:0,
    };
  }

  function decisionById(id) {
    return DECISIONS.find(item => item.id === id) || null;
  }

  function pickDecision(profile, roundIndex = 0) {
    const used = new Set(profile?.usedIds || []);
    const order = Array.isArray(profile?.order) ? profile.order : DECISIONS.map(item => item.id);
    const nextId = order.find(id => !used.has(id));
    return nextId ? decisionById(nextId) : null;
  }

  function canChoose(profile, choice) {
    const delta = Number(choice?.effect?.budget || 0);
    return Number(profile?.budget || 0) + delta >= 0;
  }

  function normalizedTrust(trust = {}) {
    const result = {};
    TRUST_KEYS.forEach(key => { result[key] = clamp(trust[key] ?? 50, 0, 100); });
    return result;
  }

  function applyTrust(trust, delta = {}) {
    const next = normalizedTrust(trust);
    TRUST_KEYS.forEach(key => {
      next[key] = clamp(next[key] + Number(delta[key] || 0), 0, 100);
    });
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

  function applyChoice(profile, decision, choiceIndex, roundIndex = 0) {
    const choice = decision?.choices?.[choiceIndex];
    if (!profile || !decision || !choice) return { ok:false, reason:'invalid' };
    if (!canChoose(profile, choice)) return { ok:false, reason:'budget' };
    const budgetDelta = Number(choice.effect?.budget || 0);
    const next = {
      ...profile,
      budget:Number(profile.budget || 0) + budgetDelta,
      trust:applyTrust(profile.trust, choice.effect?.trust),
      usedIds:[...new Set([...(profile.usedIds || []), decision.id])],
      currentDecision:null,
      currentMatchEffect:normalizeMatchEffect(choice.effect?.match),
      decidedRound:Number(roundIndex),
      history:[...(profile.history || []), {
        round:Number(roundIndex) + 1,
        decisionId:decision.id,
        title:decision.title,
        choice:choice.label,
        result:choice.result,
        budgetDelta,
        trustDelta:{ ...(choice.effect?.trust || {}) },
        matchEffect:normalizeMatchEffect(choice.effect?.match),
      }],
    };
    return { ok:true, profile:next, choice, budgetDelta };
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

  function money(value) {
    return `${Math.round(Number(value || 0)).toLocaleString('pl-PL')} zł`;
  }

  const api = {
    TRUST_KEYS,
    DECISIONS,
    initialState,
    decisionById,
    pickDecision,
    canChoose,
    applyChoice,
    normalizedTrust,
    chanceModifier,
    adjustedChance,
    matchFinance,
    applyPostMatch,
    averageTrust,
    trustLabel,
    money,
  };

  global.PresidentModeCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
