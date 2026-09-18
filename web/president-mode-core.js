(function (global) {
  'use strict';

  const TRUST_KEYS = Object.freeze(['players', 'coach', 'supporters', 'sponsors']);
  const AREA_KEYS = Object.freeze(['squad', 'staff', 'academy', 'facilities', 'organization', 'community']);
  const CATEGORY_LABELS = Object.freeze({
    finance:'Finanse i partnerzy', staff:'Sztab', squad:'Kadra', academy:'Akademia',
    facilities:'Obiekt', organization:'Organizacja', community:'Klub i otoczenie',
  });

  const STRATEGIES = Object.freeze([
    {
      id:'promotion', icon:'🚀', label:'Atak na czołówkę',
      copy:'Więcej środków idzie w pierwszą drużynę i sztab. Zarząd oczekuje walki o TOP 3.',
      effect:{ budget:-2200, recurring:-80, trust:{ players:4, coach:5, supporters:3 }, areas:{ squad:7, staff:4 } },
    },
    {
      id:'balanced', icon:'⚖️', label:'Stabilizacja klubu',
      copy:'Najważniejsze są finanse, organizacja i spokojny rozwój. Celem jest górna połowa tabeli bez ryzykowania przyszłości.',
      effect:{ budget:0, recurring:40, trust:{ sponsors:3, supporters:2 }, areas:{ organization:5, facilities:3, community:2 } },
    },
    {
      id:'academy', icon:'🌱', label:'Klub od podstaw',
      copy:'Priorytetem są akademia, lokalna społeczność i infrastruktura. Wynik seniorów nadal ma znaczenie, ale nie jest jedynym miernikiem.',
      effect:{ budget:-1200, recurring:-40, trust:{ supporters:5, sponsors:2 }, areas:{ academy:9, community:5, facilities:2 } },
    },
  ]);

  const BOARD_MANDATES = Object.freeze([
    {
      id:'promotion_path',
      icon:'⬆️',
      label:'Wejść poziom wyżej',
      duration:3,
      copy:'Zarząd daje kilka sezonów na sportowy krok naprzód. Liczy się osiągnięcie wyższego poziomu rozgrywek, nie jeden dobry miesiąc.',
    },
    {
      id:'academy_path',
      icon:'🌱',
      label:'Zbudować ścieżkę z akademii',
      duration:3,
      copy:'Akademia ma stać się realnym źródłem pierwszej drużyny: wysoki poziom szkolenia i co najmniej dwóch wychowanków wprowadzonych w tej kadencji.',
    },
    {
      id:'financial_stability',
      icon:'💰',
      label:'Ustabilizować finanse',
      duration:2,
      copy:'Zarząd oczekuje bezpiecznej rezerwy i nieujemnego stałego bilansu, żeby klub nie żył wyłącznie od kolejki do kolejki.',
    },
    {
      id:'club_foundations',
      icon:'🏟️',
      label:'Zbudować zaplecze klubu',
      duration:3,
      copy:'Priorytetem są obiekt i organizacja. Klub ma być gotowy na większe wymagania kolejnych poziomów kariery.',
    },
  ]);

  const UPGRADE_META = Object.freeze({
    squad:{ label:'Kadra', icon:'👥' }, staff:{ label:'Sztab', icon:'📋' },
    academy:{ label:'Akademia', icon:'🧒' }, facilities:{ label:'Obiekt', icon:'🏟️' },
    organization:{ label:'Organizacja', icon:'🗂️' }, community:{ label:'Społeczność', icon:'📣' },
  });
  const UPGRADE_COSTS = Object.freeze([700, 1300, 2200]);
  const UPGRADE_GAINS = Object.freeze([4, 5, 6]);

  const COMPETITIONS = Object.freeze({
    0:{ level:0, label:'B klasa', short:'B klasa', simulated:true, strengthOffset:-5 },
    1:{ level:1, label:'A klasa Myślenice', short:'A klasa', simulated:false, strengthOffset:0 },
    2:{ level:2, label:'Liga okręgowa', short:'Okręgówka', simulated:true, strengthOffset:5 },
    3:{ level:3, label:'V liga', short:'V liga', simulated:true, strengthOffset:9 },
    4:{ level:4, label:'IV liga', short:'IV liga', simulated:true, strengthOffset:13 },
  });

  const OFFSEASON_PLANS = Object.freeze([
    {
      id:'preseason',
      icon:'🏃',
      label:'Mocny okres przygotowawczy',
      copy:'Więcej środków trafia do pierwszej drużyny i sztabu przed startem ligi.',
      effect:{ budget:-1200, trust:{ players:4, coach:3 }, areas:{ squad:3, staff:2 } },
    },
    {
      id:'infrastructure',
      icon:'🏟️',
      label:'Porządkujemy zaplecze',
      copy:'Lato wykorzystujemy na obiekt, organizację i przygotowanie klubu do całego roku.',
      effect:{ budget:-900, trust:{ sponsors:2 }, areas:{ facilities:4, organization:3 } },
    },
    {
      id:'community',
      icon:'🌱',
      label:'Akademia i lokalny klub',
      copy:'Priorytetem są młodzież, nabór i relacja z ludźmi wokół klubu.',
      effect:{ budget:-700, trust:{ supporters:4, sponsors:1 }, areas:{ academy:4, community:4 } },
    },
    {
      id:'reserve',
      icon:'🧾',
      label:'Ostrożne lato',
      copy:'Nie dokładamy dużych kosztów. Porządkujemy sprawy i budujemy rezerwę na sezon.',
      effect:{ budget:0, trust:{ sponsors:2 }, areas:{ organization:2 } },
    },
  ]);

  const CONTRACT_TEMPLATES = Object.freeze([
    {
      id:'local_partner',
      icon:'🤝',
      label:'Pakiet lokalny',
      copy:'Spokojna, wielosezonowa współpraca bez ostrego celu sportowego.',
      duration:2,
      signingBonus:900,
      recurring:100,
      condition:null,
    },
    {
      id:'performance_partner',
      icon:'🎯',
      label:'Pakiet wynikowy',
      copy:'Wyższe wpływy, ale partner oczekuje miejsca w TOP 5 na koniec każdego sezonu.',
      duration:2,
      signingBonus:1600,
      recurring:180,
      condition:{ type:'position', threshold:5, label:'TOP 5' },
    },
    {
      id:'community_partner',
      icon:'🌱',
      label:'Pakiet społecznościowy',
      copy:'Partner wspiera klub długofalowo, jeśli rozwój akademii i społeczności nie zostanie zaniedbany.',
      duration:3,
      signingBonus:650,
      recurring:85,
      condition:{ type:'community', threshold:55, label:'społeczność min. 55/100' },
    },
  ]);

  const choice = (label, desc, result, budget = 0, trust = {}, areas = {}, recurring = 0) => ({
    label, desc, result, effect:{ budget, trust, areas, recurring },
  });
  const decision = (id, category, icon, title, copy, choices) => ({ id, category, icon, title, copy, choices });

  const DECISIONS = Object.freeze([
    decision('shirt_sponsor','finance','🤝','Nowa umowa sponsorska','Lokalna firma chce wejść szerzej w klub. Trzeba ustalić skalę ekspozycji i zobowiązań.',[
      choice('Pełny pakiet sponsorski','Duży zastrzyk gotówki i stała współpraca.','Sponsor zostaje partnerem głównym.',4200,{sponsors:8,supporters:-1},{community:3,organization:1},220),
      choice('Pakiet lokalny','Mniejsza umowa i mniej obowiązków.','Klub podpisuje spokojniejszą współpracę.',2400,{sponsors:5,supporters:1},{community:2},120),
      choice('Nie podpisujemy teraz','Zachowujemy pełną swobodę.','Klub zostaje przy obecnych partnerach.',0,{sponsors:-3,supporters:2},{community:1},0),
    ]),
    decision('municipal_grant','finance','🏛️','Można złożyć wniosek o dotację','Program wymaga wkładu własnego i dokumentacji, ale może sfinansować część klubowych działań.',[
      choice('Duży projekt','Więcej pracy i wkładu własnego, ale największy potencjał.','Wniosek przechodzi do realizacji.',1800,{sponsors:3,supporters:4},{organization:5,facilities:3,academy:3},0),
      choice('Mniejszy projekt','Bezpieczniejszy zakres i prostsze rozliczenie.','Klub korzysta z mniejszego programu.',800,{sponsors:2,supporters:2},{organization:3,academy:2},0),
      choice('Odpuszczamy nabór','Nie dokładamy papierologii.','Klub nie składa wniosku.',0,{supporters:-2},{organization:-1},0),
    ]),
    decision('overdue_invoice','finance','🧾','Do zapłaty została zaległa faktura','W księgowości pojawia się koszt, którego nie można już dłużej odkładać.',[
      choice('Płacimy od razu','Czyścimy temat kosztem bieżącego budżetu.','Zobowiązanie znika z listy.',-1600,{sponsors:1},{organization:5},0),
      choice('Rozkładamy na raty','Mniejszy wydatek dziś, ale stałe obciążenie przez kilka kolejek.','Firma zgadza się na harmonogram.',-500,{sponsors:0},{organization:2},-120),
      choice('Negocjujemy termin','Bez kosztu teraz, ale ryzykujemy relacją.','Termin przesunięty, temat wróci później.',0,{sponsors:-3},{organization:-2},0),
    ]),
    decision('membership_policy','finance','💳','Składki członkowskie wymagają uporządkowania','Część wpłat jest spóźniona, a klub potrzebuje przewidywalnego finansowania.',[
      choice('Porządkujemy system wpłat','Wdrażamy jasne terminy i przypomnienia.','Wpłaty stają się bardziej regularne.',-250,{supporters:2},{organization:5,community:1},90),
      choice('Zostawiamy elastyczność','Mniej formalnie, mniejsza przewidywalność.','Klub dalej działa na dotychczasowych zasadach.',0,{supporters:2},{organization:-1},20),
      choice('Podnosimy składkę','Więcej pieniędzy, większe ryzyko niezadowolenia.','Wpływy rosną, ale część środowiska protestuje.',0,{supporters:-5},{community:-2,organization:1},170),
    ]),

    decision('coach_contract','staff','📋','Trzeba ustalić przyszłość trenera','Kończy się okres obecnych ustaleń ze szkoleniowcem. Prezes musi zdecydować o modelu współpracy.',[
      choice('Dłuższa umowa','Stabilność sztabu kosztuje, ale daje jasny kierunek.','Trener dostaje mocny mandat.',-900,{coach:8,players:3},{staff:6,squad:2},-90),
      choice('Do końca sezonu','Kontynuujemy bez długiego zobowiązania.','Obie strony zostają przy krótszym porozumieniu.',-300,{coach:3},{staff:2},-30),
      choice('Szukamy nowego kierunku','Bez natychmiastowego kosztu, ale rośnie niepewność.','Klub rozpoczyna rozeznanie rynku.',0,{coach:-8,players:-2},{staff:-4,organization:-1},0),
    ]),
    decision('assistant_staff','staff','🧠','Sztab chce dodatkowej osoby do pomocy','Trener prosi o wsparcie organizacyjne i szkoleniowe podczas treningów.',[
      choice('Bierzemy asystenta','Stałe wsparcie sztabu.','Sztab ma lepszy podział obowiązków.',-700,{coach:6,players:2},{staff:6},-80),
      choice('Pomoc dorywcza','Kilka godzin wsparcia tygodniowo.','Najpilniejsze obowiązki są zabezpieczone.',-250,{coach:3},{staff:3},-30),
      choice('Zostajemy w obecnym składzie','Bez nowych kosztów.','Sztab musi dzielić obowiązki między siebie.',0,{coach:-3},{staff:-2},0),
    ]),
    decision('physio_contract','staff','🩹','Klub potrzebuje lepszej opieki fizjoterapeutycznej','Przy dużej liczbie treningów i meczów sztab chce stałej współpracy z fizjoterapeutą.',[
      choice('Stała współpraca','Regularne dyżury i szybsza reakcja na urazy.','Klub zabezpiecza stałą opiekę.',-1100,{players:7,coach:5},{staff:5,squad:3},-100),
      choice('Dyżur raz w tygodniu','Tańsza wersja podstawowego wsparcia.','Najważniejsze przypadki mają opiekę.',-450,{players:3,coach:2},{staff:2,squad:1},-40),
      choice('Zostajemy przy obecnym modelu','Bez kosztu, ale sztab oczekiwał więcej.','Opieka pozostaje doraźna.',0,{players:-3,coach:-2},{staff:-2},0),
    ]),
    decision('staff_courses','staff','🎓','Trenerzy mogą pojechać na szkolenie','Pojawia się możliwość podniesienia kwalifikacji sztabu i wymiany doświadczeń.',[
      choice('Finansujemy pełne szkolenie','Klub pokrywa koszty kilku osób.','Sztab wraca z nowymi pomysłami.',-900,{coach:6},{staff:7,academy:2},0),
      choice('Jedzie jedna osoba','Mniejszy koszt i częściowy efekt.','Wiedza wraca do klubu przez jednego trenera.',-350,{coach:3},{staff:3,academy:1},0),
      choice('Nie w tym roku','Budżet zostaje nienaruszony.','Sztab musi poczekać na kolejną okazję.',0,{coach:-2},{staff:-1},0),
    ]),

    decision('key_player_offer','squad','📞','Ważny zawodnik ma ofertę z wyższej ligi','Anonimowy scenariusz gry: nie dotyczy konkretnej osoby z danych ŁNP. Klub musi zdecydować, jak podejść do odejścia.',[
      choice('Nie blokujemy transferu','Dobra relacja z szatnią, ale kadra robi się cieńsza.','Klub pozwala zawodnikowi zrobić krok wyżej.',500,{players:7,coach:-2,supporters:-2},{squad:-5,community:2},0),
      choice('Proponujemy pozostanie','Koszt premii i mocniejsza kadra.','Zawodnik zostaje na kolejny okres.',-1000,{players:3,coach:4,supporters:3},{squad:5},-40),
      choice('Dogadujemy odejście po sezonie','Kompromis dla obu stron.','Zawodnik zostaje do końca rozgrywek.',0,{players:2,coach:2},{squad:1},0),
    ]),
    decision('local_recruitment','squad','🧲','Można wzmocnić kadrę lokalnym zawodnikiem','Sztab wskazuje dostępnego gracza z okolicy. To fikcyjny kandydat w mechanice gry, nie realna informacja transferowa.',[
      choice('Działamy od razu','Koszt rejestracji i ustaleń, ale kadra zyskuje głębię.','Nowy zawodnik dołącza do zespołu.',-850,{players:2,coach:5,supporters:3},{squad:6,organization:1},-30),
      choice('Najpierw treningi testowe','Mniejszy koszt, ostrożniejsza decyzja.','Sztab sprawdza zawodnika przed ruchem.',-200,{coach:3},{squad:2},0),
      choice('Zostajemy przy obecnej kadrze','Bez wydatku i bez wzmocnienia.','Klub nie wykonuje ruchu.',0,{coach:-2},{squad:-1},0),
    ]),
    decision('youth_pathway','squad','🌱','Najlepsi juniorzy potrzebują ścieżki do seniorów','Akademia pyta, jak klub ma przygotowywać starszych zawodników do pierwszej drużyny.',[
      choice('Stały program przejścia','Wspólne treningi i plan wdrażania.','Akademia dostaje jasną drogę do seniorów.',-500,{players:2,coach:4,supporters:4},{squad:3,academy:6,staff:2},0),
      choice('Pojedyncze zaproszenia','Mniej formalny model.','Najlepsi juniorzy pojawiają się okresowo na treningach.',-150,{coach:2,supporters:2},{squad:1,academy:3},0),
      choice('Seniorzy i akademia osobno','Prostsza organizacja, słabsza ciągłość.','Ścieżka pozostaje nieformalna.',0,{supporters:-3},{academy:-3,squad:-1},0),
    ]),
    decision('registrations','squad','🗂️','Trzeba uporządkować zgłoszenia i badania','Kilku zawodnikom kończą się ważne dokumenty albo badania. To praca administracyjna, nie decyzja meczowa.',[
      choice('Robimy wszystko z wyprzedzeniem','Koszt badań i obsługi, pełny porządek.','Dokumentacja kadry jest kompletna.',-650,{players:3,coach:3},{organization:7,squad:3},0),
      choice('Najpilniejsze przypadki','Minimum potrzebne na teraz.','Najważniejsze dokumenty są zabezpieczone.',-250,{players:1},{organization:3,squad:1},0),
      choice('Odkładamy część spraw','Oszczędzamy dziś, ryzykujemy bałagan później.','Administracja zostaje z zaległościami.',0,{coach:-2},{organization:-5,squad:-2},0),
    ]),

    decision('academy_coach','academy','🧒','Akademia potrzebuje dodatkowego trenera','Rosnąca liczba dzieci powoduje, że jedna osoba nie jest w stanie prowadzić wszystkich zajęć komfortowo.',[
      choice('Zatrudniamy trenera','Większy koszt, stabilniejsza akademia.','Grupy dostają lepszą opiekę.',-1200,{supporters:6,sponsors:3},{academy:8,staff:2,community:2},-110),
      choice('Pomocnik na część zajęć','Mniejszy koszt i częściowe odciążenie.','Największa grupa dostaje wsparcie.',-450,{supporters:3},{academy:4,staff:1},-40),
      choice('Łączymy grupy','Bez kosztu, ale jakość organizacji spada.','Akademia działa dalej w większych grupach.',0,{supporters:-4},{academy:-4},0),
    ]),
    decision('academy_equipment','academy','🎒','Dzieciom brakuje części sprzętu treningowego','Piłki, pachołki i znaczniki są mocno zużyte. Trzeba ustalić skalę zakupów.',[
      choice('Pełny zestaw','Kupujemy komplet na cały sezon.','Akademia dostaje świeży sprzęt.',-1000,{supporters:5,sponsors:2},{academy:6,community:1},0),
      choice('Najpilniejsze rzeczy','Kupujemy tylko to, czego naprawdę brakuje.','Treningi są zabezpieczone.',-400,{supporters:2},{academy:3},0),
      choice('Jeszcze wytrzyma','Bez wydatku.','Sprzęt zostaje w użyciu mimo zużycia.',0,{supporters:-3},{academy:-3},0),
    ]),
    decision('new_youth_group','academy','👶','Rodzice pytają o nową grupę dla najmłodszych','Jest zainteresowanie, ale uruchomienie grupy oznacza dodatkowego trenera, sprzęt i terminy.',[
      choice('Otwieramy grupę','Inwestycja w rozwój akademii i społeczności.','Nowa grupa rusza.',-900,{supporters:7,sponsors:3},{academy:7,community:5,organization:1},-60),
      choice('Lista chętnych i start później','Budujemy bazę bez natychmiastowych kosztów.','Klub przygotowuje start na kolejny okres.',-100,{supporters:3},{academy:3,community:2},0),
      choice('Nie mamy zasobów','Nie otwieramy kolejnej grupy.','Klub skupia się na obecnych zespołach.',0,{supporters:-4},{academy:-2,community:-2},0),
    ]),
    decision('academy_tournament','academy','🏅','Można zorganizować turniej akademii','Wolny termin na boisku można wykorzystać na wydarzenie dla dzieci, rodziców i partnerów.',[
      choice('Duży turniej','Więcej organizacji, ale mocny efekt społeczny.','Turniej przyciąga kilka klubów i lokalnych partnerów.',-600,{supporters:7,sponsors:5},{academy:5,community:6,organization:2},80),
      choice('Mały turniej wewnętrzny','Prościej i taniej.','Dzieci grają, rodzice zostają przy klubie na dłużej.',-200,{supporters:4},{academy:3,community:3},20),
      choice('Odpuszczamy termin','Zero ryzyka i pracy.','Boisko zostaje wolne.',0,{supporters:-2},{community:-1},0),
    ]),

    decision('pitch_renovation','facilities','🌿','Murawa potrzebuje większych prac','Płyta jest nierówna i wymaga inwestycji wykraczającej poza zwykłe koszenie.',[
      choice('Robimy pełną regenerację','Duży wydatek, ale realna poprawa obiektu.','Boisko przechodzi większe prace.',-2600,{supporters:4,coach:3},{facilities:9,community:2},0),
      choice('Materiały + praca własna','Tańsza poprawa przy pomocy ludzi z klubu.','Najgorsze miejsca zostają naprawione.',-850,{supporters:6},{facilities:5,community:4},0),
      choice('Tylko bieżące łatanie','Bez większej inwestycji.','Murawa pozostaje słabym punktem obiektu.',0,{coach:-3,supporters:-2},{facilities:-4},0),
    ]),
    decision('lights','facilities','💡','Oświetlenie wymaga modernizacji','Wieczorne zajęcia są coraz trudniejsze, a część lamp działa tylko wtedy, kiedy ma ochotę.',[
      choice('Modernizacja całego systemu','Duży koszt, trwałe rozwiązanie.','Oświetlenie przestaje być problemem.',-2400,{coach:4,supporters:2},{facilities:8,organization:2},0),
      choice('Naprawa sekcji awaryjnej','Tańsza poprawa na ten sezon.','Najgorsze punkty zostają naprawione.',-750,{coach:2},{facilities:4},0),
      choice('Przesuwamy zajęcia wcześniej','Bez inwestycji, mniej wygodny harmonogram.','Klub dostosowuje godziny treningów.',0,{players:-2,coach:-3},{facilities:-2,organization:-1},0),
    ]),
    decision('dressing_room','facilities','🚪','Szatnie wymagają odświeżenia','Prysznice, ławki i drobne wyposażenie proszą się o remont od dłuższego czasu.',[
      choice('Remontujemy całość','Wyraźna poprawa zaplecza.','Szatnie zaczynają wyglądać jak klubowe zaplecze, a nie magazyn.',-1900,{players:5,supporters:3},{facilities:7,community:2},0),
      choice('Naprawiamy najpilniejsze','Mniejszy koszt i widoczna poprawa.','Największe problemy znikają.',-650,{players:2},{facilities:3},0),
      choice('Jeszcze sezon wytrzyma','Bez wydatku.','Remont znów trafia na później.',0,{players:-3,supporters:-2},{facilities:-3},0),
    ]),
    decision('safety_fence','facilities','🛠️','Ogrodzenie i zabezpieczenia obiektu wymagają pracy','Kilka elementów przy boisku trzeba poprawić, zanim zrobi się z tego większy problem.',[
      choice('Pełny przegląd i naprawa','Klub zamyka temat kompleksowo.','Obiekt jest bezpieczniejszy i lepiej przygotowany.',-1400,{supporters:2},{facilities:5,organization:5},0),
      choice('Naprawiamy pilne miejsca','Największe ryzyka znikają.','Podstawowe zabezpieczenia są poprawione.',-500,{supporters:1},{facilities:3,organization:2},0),
      choice('Oznaczamy i odkładamy','Bez kosztu dziś.','Problem zostaje pod kontrolą tylko na papierze.',0,{supporters:-3},{facilities:-3,organization:-3},0),
    ]),

    decision('insurance','organization','🛡️','Kończy się klubowe ubezpieczenie','Trzeba wybrać zakres polisy dla zawodników, sprzętu i działalności klubu.',[
      choice('Pełny pakiet','Drożej, ale z szerokim zakresem.','Klub zabezpiecza najważniejsze ryzyka.',-1200,{players:3,sponsors:2},{organization:8},-40),
      choice('Pakiet podstawowy','Najważniejsze elementy są objęte ochroną.','Klub wybiera rozsądne minimum.',-550,{players:1},{organization:4},-15),
      choice('Najtańsza opcja','Minimalny koszt, minimalny zakres.','Budżet oszczędzony kosztem bezpieczeństwa organizacyjnego.',-180,{players:-2},{organization:-3},0),
    ]),
    decision('federation_paperwork','organization','📚','Związkowa dokumentacja wymaga uporządkowania','Terminy zgłoszeń, licencje i formalności zaczynają się nakładać.',[
      choice('Porządkujemy wszystko teraz','Kilka godzin pracy i drobne opłaty.','Dokumentacja zostaje zamknięta z wyprzedzeniem.',-350,{coach:2},{organization:8},0),
      choice('Tylko pilne sprawy','Największe ryzyka są załatwione.','Część papierów zostaje na później.',-120,{},{organization:4},0),
      choice('Robimy na ostatnią chwilę','Oszczędzamy czas dziś.','Stres administracyjny rośnie.',0,{coach:-2},{organization:-5},0),
    ]),
    decision('volunteer_network','organization','🙋','Klub potrzebuje więcej osób do pomocy','Organizacja dnia klubowego, akademii i obiektu opiera się stale na tych samych kilku osobach.',[
      choice('Budujemy ekipę wolontariuszy','Organizujemy nabór i jasny podział ról.','Klub przestaje być zależny od dwóch osób od wszystkiego.',-250,{supporters:5,sponsors:2},{organization:7,community:5},0),
      choice('Lista dyżurów rodziców i działaczy','Proste rozwiązanie bez formalnego naboru.','Obowiązki rozkładają się trochę szerzej.',0,{supporters:2},{organization:4,community:2},0),
      choice('Działamy jak dotąd','Bez dodatkowej pracy dziś.','Najbardziej zaangażowani nadal biorą wszystko na siebie.',0,{supporters:-2},{organization:-4,community:-1},0),
    ]),

    decision('club_media','community','📱','Komunikacja klubu wymaga regularności','Kibice i partnerzy pytają o wyniki, zapowiedzi, akademię i życie klubu.',[
      choice('Stała osoba do komunikacji','Regularne materiały i lepsza obsługa partnerów.','Klub zaczyna komunikować się systematycznie.',-700,{supporters:6,sponsors:6},{community:7,organization:2},-50),
      choice('Robimy społecznie','Mniej profesjonalnie, ale regularnie.','Kilka osób dzieli obowiązki.',-150,{supporters:3,sponsors:2},{community:4},0),
      choice('Wyniki wystarczą','Zero kosztu i minimum komunikacji.','Klub publikuje tylko podstawowe informacje.',0,{supporters:-3,sponsors:-4},{community:-4},0),
    ]),
    decision('club_day','community','🍔','Pomysł na rodzinny dzień klubowy','Turniej dzieci, grill, prezentacja drużyn i partnerzy mogą przyciągnąć ludzi na obiekt.',[
      choice('Robimy pełne wydarzenie','Więcej pracy, ale duża szansa na przychód i integrację.','Dzień klubowy przyciąga lokalną społeczność.',900,{supporters:9,sponsors:5,players:2},{community:9,organization:2,academy:2},80),
      choice('Małe spotkanie przy boisku','Mniej skali, nadal dobry efekt.','Klub robi prostą lokalną imprezę.',250,{supporters:5,sponsors:2},{community:5},20),
      choice('Nie dokładamy wydarzeń','Zero ryzyka organizacyjnego.','Weekend zostaje bez dodatkowej aktywności.',0,{supporters:-2},{community:-2},0),
    ]),
    decision('school_partnership','community','🏫','Szkoła proponuje współpracę z klubem','Można zrobić wspólne nabory, zajęcia pokazowe i promocję akademii.',[
      choice('Wchodzimy szeroko','Kilka wspólnych działań w ciągu roku.','Klub zyskuje stały kanał dotarcia do dzieci i rodziców.',-450,{supporters:6,sponsors:2},{community:7,academy:6,organization:2},0),
      choice('Jedna akcja naborowa','Sprawdzamy współpracę bez dużych zobowiązań.','Pierwsze wspólne zajęcia dochodzą do skutku.',-120,{supporters:3},{community:3,academy:3},0),
      choice('Nie mamy zasobów','Klub odmawia w tym sezonie.','Szansa przechodzi na kolejny rok.',0,{supporters:-3},{community:-2,academy:-1},0),
    ]),
    decision('sponsor_delay','finance','⏳','Sponsor spóźnia się z przelewem','Partner zapewnia, że pieniądze wpłyną, ale klub ma wydatki już teraz.',[
      choice('Dajemy czas','Chronimy relację, ale zaciskamy budżet na kilka tygodni.','Sponsor dostaje dodatkowy termin.',0,{sponsors:4},{organization:-1},0),
      choice('Prosimy o część wpłaty teraz','Kompromis poprawia płynność.','Część środków trafia do klubu.',700,{sponsors:1},{organization:2},0),
      choice('Stawiamy twardy termin','Porządek finansowy kosztem relacji.','Klub wysyła formalne wezwanie.',1000,{sponsors:-4},{organization:4},0),
    ]),
    decision('away_transport','finance','🚌','Rosną koszty transportu na wyjazdy','Przewoźnik podnosi stawkę i trzeba wybrać model na dalszą część sezonu.',[
      choice('Stała umowa z przewoźnikiem','Pewny transport, ale stały koszt.','Klub zabezpiecza wszystkie wyjazdy.',-650,{players:3,coach:2},{organization:5},-55),
      choice('Rezerwujemy każdy wyjazd osobno','Mniej zobowiązań, więcej pracy organizacyjnej.','Transport będzie ustalany kolejka po kolejce.',-220,{},{organization:1},-20),
      choice('Szukamy oszczędności','Najtańsze warianty pogarszają komfort.','Koszty spadają, szatnia nie jest zachwycona.',0,{players:-3,coach:-1},{organization:-1},0),
    ]),
    decision('goalkeeper_coach','staff','🧤','Bramkarze proszą o osobny trening','Sztab widzi sens dodatkowych zajęć dla bramkarzy, ale potrzebna jest kolejna osoba.',[
      choice('Stały trener bramkarzy','Najpełniejszy wariant szkoleniowy.','Bramkarze dostają regularną opiekę.',-850,{players:4,coach:5},{staff:6,squad:3},-70),
      choice('Jeden trening specjalistyczny tygodniowo','Tańszy kompromis.','Bramkarze dostają podstawowe wsparcie.',-300,{players:2,coach:2},{staff:3,squad:1},-25),
      choice('Zostajemy przy obecnym sztabie','Bez nowego kosztu.','Trening bramkarzy pozostaje częścią zwykłych zajęć.',0,{coach:-2},{staff:-1},0),
    ]),
    decision('squad_integration','squad','🤝','W szatni tworzą się osobne grupki','Trener zgłasza, że atmosfera jest poprawna, ale integracja kadry zaczyna siadać.',[
      choice('Weekend integracyjny','Koszt, ale mocny sygnał dla zespołu.','Szatnia spędza więcej czasu razem.',-650,{players:8,coach:3},{squad:5,community:1},0),
      choice('Wspólny posiłek po treningu','Prosta i tańsza forma.','Atmosfera wyraźnie się poprawia.',-180,{players:4},{squad:2},0),
      choice('Nie ingerujemy','Liczymy, że temat sam się uspokoi.','Trener musi zarządzać atmosferą bez wsparcia zarządu.',0,{players:-3,coach:-2},{squad:-2},0),
    ]),
    decision('winter_hall','academy','🏫','Akademia potrzebuje hali na zimę','Rodzice chcą znać plan treningów zanim pogoda wymusi zejście z boiska.',[
      choice('Rezerwujemy pełny grafik hali','Stabilne treningi przez całą zimę.','Akademia ma zabezpieczone terminy.',-1100,{supporters:6},{academy:7,organization:4},-90),
      choice('Bierzemy tylko najważniejsze terminy','Mniej godzin, ale podstawowe grupy są zabezpieczone.','Klub układa oszczędniejszy grafik.',-450,{supporters:3},{academy:3,organization:2},-35),
      choice('Czekamy na pogodę','Brak wydatku dziś, duże ryzyko chaosu zimą.','Plan treningowy pozostaje niepewny.',0,{supporters:-4},{academy:-3,organization:-2},0),
    ]),
    decision('irrigation','facilities','💧','Murawa potrzebuje lepszego nawadniania','W suchych tygodniach utrzymanie boiska zaczyna zabierać coraz więcej czasu.',[
      choice('Modernizujemy nawadnianie','Duży jednorazowy koszt i mniej problemów później.','Boisko dostaje lepszy system nawadniania.',-2100,{coach:3,supporters:2},{facilities:8,organization:2},0),
      choice('Kupujemy sprzęt przenośny','Tańsza poprawa bieżącego utrzymania.','Obsługa murawy staje się łatwiejsza.',-700,{coach:1},{facilities:4},0),
      choice('Zostajemy przy pracy ręcznej','Oszczędzamy pieniądze kosztem czasu i jakości.','Murawa nadal wymaga dużo pracy.',0,{coach:-2},{facilities:-2,organization:-1},0),
    ]),
    decision('matchday_security','organization','🦺','Dzień meczowy wymaga lepszej organizacji','Przy większej frekwencji potrzeba jasnego podziału wejścia, parkingu, porządku i obsługi.',[
      choice('Stała ekipa meczowa','Kosztuje, ale porządkuje każdy mecz domowy.','Dzień meczowy działa sprawniej.',-600,{supporters:3,sponsors:2},{organization:7,community:2},-45),
      choice('Dyżury działaczy i wolontariuszy','Tańszy model oparty na klubie.','Najważniejsze role dostają obsadę.',-120,{supporters:2},{organization:4,community:2},0),
      choice('Jak dotąd','Bez dodatkowej pracy i kosztów.','Ryzyko organizacyjnego chaosu zostaje.',0,{supporters:-2,sponsors:-1},{organization:-3},0),
    ]),
    decision('club_merch','community','👕','Kibice pytają o klubowe koszulki i szaliki','Mały sklepik może budować tożsamość i przynosić dodatkowy przychód.',[
      choice('Robimy serię klubową','Większy koszt startowy i szansa na stały przychód.','Pierwsza pula gadżetów trafia do sprzedaży.',-900,{supporters:7,sponsors:2},{community:7,organization:2},95),
      choice('Mała partia na mecze domowe','Testujemy zainteresowanie.','Klub zaczyna od niewielkiej liczby produktów.',-300,{supporters:4},{community:4},35),
      choice('Na razie odpuszczamy','Nie zamrażamy pieniędzy w towarze.','Kibice muszą poczekać na klubowe gadżety.',0,{supporters:-2},{community:-1},0),
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
  function normalizedTrust(trust = {}) {
    const result = {};
    TRUST_KEYS.forEach(key => { result[key] = clamp(trust[key] ?? 50, 0, 100); });
    return result;
  }
  function normalizedAreas(areas = {}) {
    const defaults = { squad:55, staff:55, academy:45, facilities:45, organization:55, community:50 };
    const result = {};
    AREA_KEYS.forEach(key => { result[key] = clamp(areas[key] ?? defaults[key], 0, 100); });
    return result;
  }
  function applyMap(base, delta, keys, normalizer) {
    const next = normalizer(base);
    keys.forEach(key => { next[key] = clamp(next[key] + Number(delta?.[key] || 0), 0, 100); });
    return next;
  }

  const FINANCE_CATEGORIES = Object.freeze({
    matchday:'Mecze i transport',
    sponsors:'Sponsorzy i partnerzy',
    contracts:'Stałe umowy',
    squad:'Kadra i transfery',
    investment:'Inwestycje i klub',
    other:'Pozostałe',
  });

  function financeEntry(profile, category, label, amount, round = null, meta = {}) {
    return {
      careerYear:Number(profile?.careerYear || 1),
      round:round === null ? null : Number(round),
      category:FINANCE_CATEGORIES[category] ? category : 'other',
      label:String(label || FINANCE_CATEGORIES[category] || 'Operacja'),
      amount:Math.round(Number(amount || 0)),
      ...meta,
    };
  }

  function appendFinanceEntries(profile, entries = []) {
    const additions = entries.filter(entry => entry && Number(entry.amount || 0) !== 0);
    return [...(profile?.financeLedger || []), ...additions];
  }

  function financeCategorySummary(profile, careerYear = null) {
    const year = careerYear === null ? Number(profile?.careerYear || 1) : Number(careerYear);
    const totals = Object.fromEntries(Object.keys(FINANCE_CATEGORIES).map(key => [key, 0]));
    (profile?.financeLedger || [])
      .filter(entry => Number(entry.careerYear || 0) === year)
      .forEach(entry => {
        const category = FINANCE_CATEGORIES[entry.category] ? entry.category : 'other';
        totals[category] += Number(entry.amount || 0);
      });
    return totals;
  }

  function initialState(totalRounds = 0, random = Math.random) {
    return {
      active:true,
      budget:12000,
      recurring:0,
      financeLedger:[],
      supporterBase:220,
      attendanceHistory:[],
      recentResults:[],
      reputation:40,
      reputationHistory:[],
      contracts:[],
      contractHistory:[],
      careerYear:1,
      seasonsCompleted:0,
      seasonHistory:[],
      boardMandate:null,
      boardMandateHistory:[],
      offseason:null,
      offseasonHistory:[],
      transferRoster:[],
      transferHistory:[],
      academyRoster:[],
      academyHistory:[],
      retainedRoster:[],
      playerContractHistory:[],
      playerDevelopmentHistory:[],
      readinessHistory:[],
      departedPlayerKeys:[],
      departureHistory:[],
      employmentHistory:[],
      jobMarket:null,
      jobSecurity:{ status:'secure', lowRounds:0, ultimatumRoundsLeft:0, fired:false, reason:null, history:[] },
      strategy:null,
      upgradeLevels:Object.fromEntries(AREA_KEYS.map(key => [key, 0])),
      lastUpgradeRound:-99,
      trust:normalizedTrust({ players:55, coach:55, supporters:50, sponsors:50 }),
      areas:normalizedAreas(),
      order:shuffle(DECISIONS.map(item => item.id), random),
      usedIds:[],
      lastUsedRound:{},
      history:[],
      currentDecision:null,
      decidedRound:-1,
      lastUpgradeRound:-99,
      roundsCompleted:0,
      totalRounds:Number(totalRounds || 0),
      lastFinance:0,
      recentResults:[],
      lastAttendance:null,
      lastAttendanceCapacity:0,
      lastSupporterBaseDelta:0,
      lastResult:null,
      lastMatch:null,
    };
  }

  function strategyById(id) { return STRATEGIES.find(item => item.id === id) || null; }
  function chooseStrategy(profile, strategyId) {
    const strategy = strategyById(strategyId);
    if (!profile || !strategy || profile.strategy) return { ok:false, reason:'invalid' };
    const effect = strategy.effect || {};
    const budgetDelta = Number(effect.budget || 0);
    if (Number(profile.budget || 0) + budgetDelta < 0) return { ok:false, reason:'budget' };
    return {
      ok:true,
      strategy,
      profile:{
        ...profile,
        strategy:strategy.id,
        budget:Number(profile.budget || 0) + budgetDelta,
        recurring:Number(profile.recurring || 0) + Number(effect.recurring || 0),
        trust:applyMap(profile.trust, effect.trust, TRUST_KEYS, normalizedTrust),
        areas:applyMap(profile.areas, effect.areas, AREA_KEYS, normalizedAreas),
        financeLedger:appendFinanceEntries(profile, [
          financeEntry(profile, 'investment', 'Plan sezonu: ' + strategy.label, budgetDelta, 0),
        ]),
        history:[...(profile.history || []), {
          round:0, careerYear:Number(profile.careerYear || 1), type:'strategy', title:'Plan sezonu', choice:strategy.label, result:strategy.copy,
          budgetDelta, recurringDelta:Number(effect.recurring || 0),
          trustDelta:{ ...(effect.trust || {}) }, areaDelta:{ ...(effect.areas || {}) },
        }],
      },
    };
  }

  function upgradeLevel(profile, area) {
    return clamp(Number(profile?.upgradeLevels?.[area] || 0), 0, UPGRADE_COSTS.length);
  }
  function upgradeCost(profile, area) {
    const level = upgradeLevel(profile, area);
    return level >= UPGRADE_COSTS.length ? null : UPGRADE_COSTS[level];
  }
  function canUpgrade(profile, area, roundIndex = 0) {
    if (!profile?.strategy || !AREA_KEYS.includes(area)) return false;
    const cost = upgradeCost(profile, area);
    if (cost === null || Number(profile.budget || 0) < cost) return false;
    return Number(roundIndex) - Number(profile.lastUpgradeRound ?? -99) >= 3;
  }
  function buyUpgrade(profile, area, roundIndex = 0) {
    if (!canUpgrade(profile, area, roundIndex)) return { ok:false, reason:'unavailable' };
    const level = upgradeLevel(profile, area);
    const cost = UPGRADE_COSTS[level];
    const gain = UPGRADE_GAINS[level];
    const levels = { ...(profile.upgradeLevels || {}), [area]:level + 1 };
    const meta = UPGRADE_META[area];
    return {
      ok:true, cost, gain,
      profile:{
        ...profile,
        budget:Number(profile.budget || 0) - cost,
        areas:applyMap(profile.areas, { [area]:gain }, AREA_KEYS, normalizedAreas),
        upgradeLevels:levels,
        lastUpgradeRound:Number(roundIndex),
        financeLedger:appendFinanceEntries(profile, [
          financeEntry(profile, 'investment', 'Inwestycja: ' + (meta?.label || area), -cost, Number(roundIndex) + 1),
        ]),
        history:[...(profile.history || []), {
          round:Number(roundIndex) + 1, careerYear:Number(profile.careerYear || 1), type:'investment', category:area,
          title:'Inwestycja: ' + (meta?.label || area), choice:'Poziom ' + (level + 1),
          result:'Stały rozwój obszaru: +' + gain + '.', budgetDelta:-cost, recurringDelta:0,
          trustDelta:{}, areaDelta:{ [area]:gain },
        }],
      },
    };
  }

  function boardMandateTemplateById(id) {
    return BOARD_MANDATES.find(item => item.id === id) || null;
  }

  function canChooseBoardMandate(profile, mandateId) {
    const template = boardMandateTemplateById(mandateId);
    return Boolean(
      profile &&
      template &&
      (!profile.boardMandate || profile.boardMandate.status !== 'active')
    );
  }

  function chooseBoardMandate(profile, mandateId, context = {}) {
    const template = boardMandateTemplateById(mandateId);
    if (!canChooseBoardMandate(profile, mandateId) || !template) {
      return { ok:false, reason:'unavailable' };
    }
    const careerYear = Number(profile.careerYear || 1);
    const level = competitionByLevel(context.competitionLevel ?? 1).level;
    const target = {};
    if (template.id === 'promotion_path') {
      if (level < 4) target.level = Math.min(4, level + 1);
      else target.position = 3;
    } else if (template.id === 'academy_path') {
      target.academy = 70;
      target.graduates = 2;
    } else if (template.id === 'financial_stability') {
      target.budget = 16000;
      target.recurring = 0;
    } else if (template.id === 'club_foundations') {
      target.facilities = 65;
      target.organization = 65;
    }
    const mandate = {
      id:template.id,
      icon:template.icon,
      label:template.label,
      duration:Number(template.duration || 2),
      startedCareerYear:careerYear,
      deadlineCareerYear:careerYear + Number(template.duration || 2) - 1,
      startCompetitionLevel:level,
      status:'active',
      target,
      lastProgress:0,
      lastDetail:'Mandat dopiero się rozpoczął.',
    };
    return { ok:true, mandate, profile:{ ...profile, boardMandate:mandate } };
  }

  function mandateAcademyGraduates(profile, mandate) {
    return (profile?.academyHistory || []).filter(item =>
      item?.type === 'promoted' &&
      Number(item.careerYear || 0) >= Number(mandate?.startedCareerYear || 1)
    ).length;
  }

  function boardMandateProgress(profile, context = {}) {
    const mandate = profile?.boardMandate;
    if (!mandate) return null;
    const template = boardMandateTemplateById(mandate.id);
    if (!template) return null;
    const areas = normalizedAreas(profile?.areas);
    let percent = 0;
    let achieved = false;
    let detail = '';

    if (mandate.id === 'promotion_path') {
      if (Number.isFinite(Number(mandate.target?.level))) {
        const currentLevel = competitionByLevel(
          context?.movement?.toLevel ?? context.competitionLevel ?? mandate.startCompetitionLevel ?? 1
        ).level;
        const targetLevel = Number(mandate.target.level);
        const startLevel = Number(mandate.startCompetitionLevel || 0);
        const span = Math.max(1, targetLevel - startLevel);
        percent = clamp(((currentLevel - startLevel) / span) * 100, 0, 100);
        achieved = currentLevel >= targetLevel;
        detail = 'Poziom ' + currentLevel + ' → cel ' + targetLevel + ' (' + competitionByLevel(targetLevel).short + ')';
      } else {
        const position = Number(context.position || 999);
        percent = position <= 3 ? 100 : clamp((14 - position) / 11 * 100, 0, 95);
        achieved = position <= Number(mandate.target?.position || 3);
        detail = 'Miejsce ' + (Number.isFinite(position) && position < 999 ? position : '—') + ' → cel TOP ' + Number(mandate.target?.position || 3);
      }
    } else if (mandate.id === 'academy_path') {
      const academyTarget = Number(mandate.target?.academy || 70);
      const graduatesTarget = Number(mandate.target?.graduates || 2);
      const graduates = mandateAcademyGraduates(profile, mandate);
      const academyPart = clamp(Number(areas.academy || 0) / academyTarget, 0, 1);
      const graduatePart = clamp(graduates / graduatesTarget, 0, 1);
      percent = Math.round((academyPart + graduatePart) * 50);
      achieved = Number(areas.academy || 0) >= academyTarget && graduates >= graduatesTarget;
      detail = 'Akademia ' + Number(areas.academy || 0) + '/' + academyTarget + ' · wychowankowie ' + graduates + '/' + graduatesTarget;
    } else if (mandate.id === 'financial_stability') {
      const budgetTarget = Number(mandate.target?.budget || 16000);
      const recurringTarget = Number(mandate.target?.recurring || 0);
      const budgetPart = clamp(Number(profile?.budget || 0) / budgetTarget, 0, 1);
      const recurringPart = Number(profile?.recurring || 0) >= recurringTarget ? 1 : clamp(1 + Number(profile?.recurring || 0) / 500, 0, .95);
      percent = Math.round((budgetPart + recurringPart) * 50);
      achieved = Number(profile?.budget || 0) >= budgetTarget && Number(profile?.recurring || 0) >= recurringTarget;
      detail = 'Budżet ' + money(profile?.budget || 0) + '/' + money(budgetTarget) + ' · stały bilans ' + (Number(profile?.recurring || 0) >= 0 ? '+' : '') + money(profile?.recurring || 0) + '/kol.';
    } else if (mandate.id === 'club_foundations') {
      const facilitiesTarget = Number(mandate.target?.facilities || 65);
      const organizationTarget = Number(mandate.target?.organization || 65);
      percent = Math.round((
        clamp(Number(areas.facilities || 0) / facilitiesTarget, 0, 1) +
        clamp(Number(areas.organization || 0) / organizationTarget, 0, 1)
      ) * 50);
      achieved = Number(areas.facilities || 0) >= facilitiesTarget && Number(areas.organization || 0) >= organizationTarget;
      detail = 'Obiekt ' + Number(areas.facilities || 0) + '/' + facilitiesTarget + ' · organizacja ' + Number(areas.organization || 0) + '/' + organizationTarget;
    }

    return {
      ...mandate,
      template,
      percent:Math.round(clamp(percent, 0, 100)),
      achieved,
      detail,
      yearsLeft:Math.max(0, Number(mandate.deadlineCareerYear || 0) - Number(profile?.careerYear || 1) + 1),
    };
  }

  function boardMandateConfidenceModifier(profile, context = {}) {
    const progress = boardMandateProgress(profile, context);
    let modifier = 0;
    if (progress?.status === 'active') {
      if (progress.percent >= 80) modifier += 5;
      else if (progress.percent >= 50) modifier += 2;
      else if (Number(profile?.careerYear || 1) > Number(progress.startedCareerYear || 1)) modifier -= 4;
    }
    const recent = [...(profile?.boardMandateHistory || [])].at(-1);
    if (recent && Number(recent.resolvedCareerYear || 0) >= Number(profile?.careerYear || 1) - 1) {
      if (recent.status === 'achieved') modifier += 4;
      if (recent.status === 'failed') modifier -= 6;
    }
    return modifier;
  }

  function settleBoardMandateSeason(profile, record) {
    const mandate = profile?.boardMandate;
    if (!mandate || mandate.status !== 'active') {
      return { profile, reputationDelta:0, outcome:null };
    }
    const progress = boardMandateProgress(profile, {
      competitionLevel:record.competitionLevel,
      movement:record.movement,
      position:record.position,
    });
    const deadlineReached = Number(record.careerYear || 0) >= Number(mandate.deadlineCareerYear || 0);
    if (!progress?.achieved && !deadlineReached) {
      return {
        reputationDelta:0,
        outcome:null,
        profile:{
          ...profile,
          boardMandate:{
            ...mandate,
            lastProgress:Number(progress?.percent || 0),
            lastDetail:progress?.detail || mandate.lastDetail,
          },
        },
      };
    }

    const achieved = Boolean(progress?.achieved);
    const resolved = {
      ...mandate,
      status:achieved ? 'achieved' : 'failed',
      resolvedCareerYear:Number(record.careerYear || profile.careerYear || 1),
      lastProgress:Number(progress?.percent || 0),
      lastDetail:progress?.detail || '',
    };
    let jobSecurity = normalizedJobSecurity(profile.jobSecurity);
    if (achieved) {
      if (jobSecurity.status === 'warning') {
        jobSecurity = { ...jobSecurity, status:'secure', lowRounds:0, reason:null };
      } else {
        jobSecurity = { ...jobSecurity, lowRounds:Math.max(0, Number(jobSecurity.lowRounds || 0) - 1) };
      }
    } else if (jobSecurity.status === 'secure') {
      jobSecurity = { ...jobSecurity, status:'warning', lowRounds:Math.max(1, Number(jobSecurity.lowRounds || 0)), reason:'niewykonany mandat zarządu' };
    } else if (jobSecurity.status === 'warning') {
      jobSecurity = { ...jobSecurity, lowRounds:Number(jobSecurity.lowRounds || 0) + 1, reason:'niewykonany mandat zarządu' };
    }

    return {
      outcome:resolved.status,
      reputationDelta:achieved ? 6 : -6,
      profile:{
        ...profile,
        boardMandate:resolved,
        boardMandateHistory:[...(profile.boardMandateHistory || []), resolved],
        jobSecurity,
      },
    };
  }

  function boardTargetPosition(profile, teamCount = 14) {
    const teams = Math.max(2, Number(teamCount || 14));
    if (profile?.strategy === 'promotion') return Math.min(3, teams);
    if (profile?.strategy === 'academy') return Math.min(teams, Math.max(4, Math.ceil(teams * .65)));
    return Math.max(3, Math.ceil(teams / 2));
  }
  function boardConfidence(profile, context = {}) {
    const teamCount = Math.max(2, Number(context.teamCount || 14));
    const position = Math.max(1, Number(context.position || teamCount));
    const target = boardTargetPosition(profile, teamCount);
    const performance = clamp(55 + (target - position) * 7, 10, 90);
    const finance = clamp(45 + Number(profile?.budget || 0) / 400, 5, 90);
    const club = averageAreas(profile);
    const trust = averageTrust(profile);
    let strategyBonus = 0;
    if (profile?.strategy === 'academy') strategyBonus = (Number(profile?.areas?.academy || 0) - 50) * .18;
    if (profile?.strategy === 'balanced') strategyBonus = (Number(profile?.areas?.organization || 0) - 50) * .12;
    if (profile?.strategy === 'promotion') strategyBonus = (Number(profile?.areas?.squad || 0) - 50) * .12;
    const mandateBonus = boardMandateConfidenceModifier(profile, context);
    return Math.round(clamp(performance * .38 + finance * .20 + club * .22 + trust * .20 + strategyBonus + mandateBonus, 0, 100));
  }
  function boardLabel(value) {
    const score = Number(value || 0);
    if (score >= 80) return 'pełne poparcie';
    if (score >= 65) return 'mocna pozycja';
    if (score >= 45) return 'cierpliwość zarządu';
    if (score >= 30) return 'narastająca presja';
    return 'kryzys zaufania';
  }
  function reputationScore(profile) {
    if (Number.isFinite(Number(profile?.reputation))) return Math.round(clamp(Number(profile.reputation), 0, 100));
    let score = 40;
    for (const season of profile?.seasonHistory || []) score = clamp(score + seasonReputationDelta(season), 0, 100);
    return Math.round(score);
  }

  function reputationLabel(value) {
    const score = Number(value || 0);
    if (score >= 80) return 'uznana marka';
    if (score >= 65) return 'ceniony prezes';
    if (score >= 50) return 'mocna reputacja lokalna';
    if (score >= 35) return 'rozpoznawalny lokalnie';
    return 'odbudowa reputacji';
  }

  function seasonReputationDelta(record = {}) {
    const verdict = record.verdict || seasonVerdict(record).code;
    const movement = record.movement || competitionMovement({
      level:Number(record.competitionLevel ?? 1),
      position:Number(record.position || 0),
      teamCount:Number(record.teamCount || 14),
    });
    let delta = verdict === 'champion' ? 10 : verdict === 'target' ? 5 : verdict === 'close' ? 1 : -5;
    if (movement.code === 'promotion') delta += 7;
    if (movement.code === 'relegation') delta -= 7;
    const confidence = Number(record.boardConfidence || 0);
    if (confidence >= 75) delta += 2;
    if (confidence > 0 && confidence < 30) delta -= 3;
    const level = Number(record.competitionLevel ?? 1);
    if (verdict !== 'missed') delta += Math.max(0, level - 1);
    return Math.round(clamp(delta, -15, 20));
  }

  function jobMarketLevels(profile, currentLevel = 1, reason = 'career') {
    const level = competitionByLevel(currentLevel).level;
    const reputation = reputationScore(profile);
    const levels = new Set([level]);

    if (reason === 'dismissal') {
      if (level > 0) levels.add(level - 1);
      if (reputation >= 72 && level < 4) levels.add(level + 1);
    } else {
      if (reputation >= 55 && level < 4) levels.add(level + 1);
      if (reputation >= 80 && level < 3) levels.add(level + 2);
      if (reputation < 35 && level > 0) levels.add(level - 1);
    }
    return [...levels].sort((a,b) => b - a);
  }

  function jobMarketSummary(profile, currentLevel = 1, reason = 'career') {
    const reputation = reputationScore(profile);
    const levels = jobMarketLevels(profile, currentLevel, reason);
    return {
      reputation,
      label:reputationLabel(reputation),
      levels,
      highestLevel:Math.max(...levels),
      lowestLevel:Math.min(...levels),
    };
  }

  const COMPETITION_REQUIREMENTS = Object.freeze({
    0:{ facilities:35, organization:35 },
    1:{ facilities:45, organization:45 },
    2:{ facilities:55, organization:55 },
    3:{ facilities:65, organization:62 },
    4:{ facilities:75, organization:70 },
  });

  function competitionRequirements(level = 1) {
    const normalized = competitionByLevel(level).level;
    return { ...(COMPETITION_REQUIREMENTS[normalized] || COMPETITION_REQUIREMENTS[1]) };
  }

  function competitionReadiness(profile, level = 1) {
    const competition = competitionByLevel(level);
    const requirements = competitionRequirements(competition.level);
    const areas = normalizedAreas(profile?.areas);
    const facilityGap = Math.max(0, requirements.facilities - Number(areas.facilities || 0));
    const organizationGap = Math.max(0, requirements.organization - Number(areas.organization || 0));
    const ready = facilityGap === 0 && organizationGap === 0;
    const upgradeCost = ready ? 0 : Math.max(
      400,
      Math.round((350 + facilityGap * 80 + organizationGap * 65) / 50) * 50,
    );
    const temporaryCost = ready ? 0 : Math.max(
      250,
      Math.round((200 + facilityGap * 28 + organizationGap * 22) / 50) * 50,
    );
    return {
      level:competition.level,
      competitionLabel:competition.label,
      requirements,
      current:{ facilities:areas.facilities, organization:areas.organization },
      gaps:{ facilities:facilityGap, organization:organizationGap },
      ready,
      upgradeCost,
      temporaryCost,
    };
  }

  function resolveCompetitionReadiness(profile, method) {
    if (!profile?.offseason || profile.offseason.competitionReadinessResolved) {
      return { ok:false, reason:'unavailable' };
    }
    const readiness = competitionReadiness(profile, profile.offseason.competitionReadinessLevel ?? 1);
    if (readiness.ready) {
      return {
        ok:true,
        method:'already_ready',
        profile:{
          ...profile,
          offseason:{
            ...profile.offseason,
            competitionReadinessResolved:true,
            competitionReadinessMethod:'already_ready',
            competitionReadiness:readiness,
          },
        },
      };
    }

    if (!['upgrade','temporary'].includes(method)) return { ok:false, reason:'invalid' };
    const cost = method === 'upgrade' ? readiness.upgradeCost : readiness.temporaryCost;
    if (Number(profile.budget || 0) < cost) return { ok:false, reason:'budget' };

    const areaDelta = method === 'upgrade'
      ? {
          facilities:readiness.gaps.facilities,
          organization:readiness.gaps.organization,
        }
      : {};
    const resultLabel = method === 'upgrade'
      ? 'Trwałe przygotowanie klubu do poziomu ' + readiness.competitionLabel
      : 'Tymczasowy plan organizacyjny na poziom ' + readiness.competitionLabel;
    const entry = {
      careerYear:Number(profile.offseason?.careerYear || profile.careerYear || 1),
      level:readiness.level,
      competitionLabel:readiness.competitionLabel,
      method,
      cost,
      requirements:{ ...readiness.requirements },
      before:{ ...readiness.current },
      areaDelta:{ ...areaDelta },
    };
    return {
      ok:true,
      method,
      cost,
      profile:{
        ...profile,
        budget:Number(profile.budget || 0) - cost,
        areas:applyMap(profile.areas, areaDelta, AREA_KEYS, normalizedAreas),
        trust:applyMap(
          profile.trust,
          method === 'upgrade' ? { sponsors:2, supporters:1 } : { sponsors:-1 },
          TRUST_KEYS,
          normalizedTrust,
        ),
        readinessHistory:[...(profile.readinessHistory || []), entry],
        financeLedger:appendFinanceEntries(profile, [
          financeEntry(profile, 'investment', resultLabel, -cost, null),
        ]),
        offseason:{
          ...profile.offseason,
          competitionReadinessResolved:true,
          competitionReadinessMethod:method,
          competitionReadiness:readiness,
        },
      },
    };
  }

  function jobOfferTerms(offer = {}) {
    const level = competitionByLevel(offer.competitionLevel ?? 1).level;
    const budget = Math.round((9000 + level * 1800 + Number(offer.budgetBonus || 0)) / 500) * 500;
    const requirements = competitionRequirements(level);
    const areas = {
      squad:clamp(50 + level * 3, 45, 70),
      staff:clamp(50 + level * 2, 45, 68),
      academy:48,
      facilities:Math.max(requirements.facilities, clamp(45 + level * 2, 40, 75)),
      organization:Math.max(requirements.organization, 52),
      community:50,
    };
    return { budget, areas };
  }

  function acceptJobOffer(profile, offer) {
    if (!profile || !offer?.club) return { ok:false, reason:'invalid' };
    const terms = jobOfferTerms(offer);
    const mandateHistory = [...(profile.boardMandateHistory || [])];
    if (profile.boardMandate?.status === 'active') {
      mandateHistory.push({
        ...profile.boardMandate,
        status:'abandoned',
        resolvedCareerYear:Number(profile.careerYear || 1),
        lastDetail:'Mandat przerwany przez zmianę klubu.',
      });
    }
    const entry = {
      careerYear:Number(profile.careerYear || 1),
      fromClub:offer.fromClub || null,
      toClub:String(offer.club),
      competitionLevel:Number(offer.competitionLevel ?? 1),
      competitionLabel:String(offer.competitionLabel || competitionByLevel(offer.competitionLevel ?? 1).label),
      reason:offer.reason || 'offer',
      simulated:Boolean(offer.simulated),
      budget:terms.budget,
    };
    return {
      ok:true,
      terms,
      profile:{
        ...profile,
        budget:terms.budget,
        recurring:0,
        supporterBase:Math.round(180 + Number(offer.competitionLevel ?? 1) * 70),
        attendanceHistory:[],
        recentResults:[],
        strategy:null,
        boardMandate:null,
        boardMandateHistory:mandateHistory,
        trust:normalizedTrust({ players:55, coach:55, supporters:50, sponsors:50 }),
        areas:normalizedAreas(terms.areas),
        upgradeLevels:Object.fromEntries(AREA_KEYS.map(key => [key, 0])),
        lastUpgradeRound:-99,
        transferRoster:[],
        academyRoster:[],
        retainedRoster:[],
        contracts:[],
        departedPlayerKeys:[],
        jobMarket:null,
        offseason:null,
        jobSecurity:{ status:'secure', lowRounds:0, ultimatumRoundsLeft:0, fired:false, reason:null, history:[] },
        employmentHistory:[...(profile.employmentHistory || []), entry],
      },
    };
  }

  function normalizedJobSecurity(job = {}) {
    return {
      status:['secure','warning','ultimatum','fired'].includes(job.status) ? job.status : 'secure',
      lowRounds:Math.max(0, Number(job.lowRounds || 0)),
      ultimatumRoundsLeft:Math.max(0, Number(job.ultimatumRoundsLeft || 0)),
      fired:Boolean(job.fired),
      reason:job.reason || null,
      history:Array.isArray(job.history) ? [...job.history] : [],
    };
  }

  function employmentLabel(profile) {
    const job = normalizedJobSecurity(profile?.jobSecurity);
    if (job.fired || job.status === 'fired') return 'zwolniony';
    if (job.status === 'ultimatum') return 'ultimatum zarządu';
    if (job.status === 'warning') return 'ostrzeżenie zarządu';
    return 'stanowisko bezpieczne';
  }

  function reviewEmployment(profile, context = {}) {
    if (!profile) return null;
    const current = normalizedJobSecurity(profile.jobSecurity);
    if (current.fired) return profile;
    const confidence = boardConfidence(profile, context);
    const budget = Number(profile.budget || 0);
    const round = Number(context.round || profile.roundsCompleted || 0);
    const healthy = confidence >= 45 && budget >= 0;
    const underPressure = confidence < 30 || budget < 0;
    let next = { ...current };
    let event = null;

    if (current.status === 'ultimatum') {
      if (healthy) {
        next = { ...current, status:'secure', lowRounds:0, ultimatumRoundsLeft:0, reason:null };
        event = { round, type:'recovered', confidence, label:'Zarząd wycofał ultimatum' };
      } else {
        const remaining = Math.max(0, current.ultimatumRoundsLeft - 1);
        if (remaining === 0) {
          next = {
            ...current,
            status:'fired',
            fired:true,
            ultimatumRoundsLeft:0,
            reason:budget < 0 ? 'finanse' : 'wyniki i poparcie zarządu',
          };
          event = { round, type:'fired', confidence, label:'Zarząd zakończył współpracę' };
        } else {
          next = { ...current, ultimatumRoundsLeft:remaining };
        }
      }
    } else if (underPressure) {
      const lowRounds = current.lowRounds + 1;
      if (lowRounds >= 2) {
        next = { ...current, status:'ultimatum', lowRounds, ultimatumRoundsLeft:3, reason:null };
        event = { round, type:'ultimatum', confidence, label:'Ultimatum zarządu: 3 kolejki na poprawę' };
      } else {
        next = { ...current, status:'warning', lowRounds };
        if (current.status !== 'warning') {
          event = { round, type:'warning', confidence, label:'Zarząd wystosował ostrzeżenie' };
        }
      }
    } else if (current.status === 'warning' || current.lowRounds) {
      next = { ...current, status:'secure', lowRounds:0, reason:null };
      event = { round, type:'stabilized', confidence, label:'Sytuacja na stanowisku uspokojona' };
    }

    if (event) next.history = [...current.history, event];
    if (event?.type === 'fired') {
      const before = reputationScore(profile);
      const delta = -6;
      const after = Math.round(clamp(before + delta, 0, 100));
      return {
        ...profile,
        reputation:after,
        reputationHistory:[...(profile.reputationHistory || []), {
          careerYear:Number(profile.careerYear || 1),
          type:'dismissal',
          delta,
          before,
          after,
        }],
        jobSecurity:next,
      };
    }
    return { ...profile, jobSecurity:next };
  }

  function managementWarnings(profile, context = {}) {
    const warnings = [];
    const trust = normalizedTrust(profile?.trust);
    const areas = normalizedAreas(profile?.areas);
    if (Number(profile?.budget || 0) < 1500) warnings.push('Płynność finansowa jest na niebezpiecznie niskim poziomie.');
    const weakestTrust = TRUST_KEYS.reduce((a, b) => trust[a] <= trust[b] ? a : b);
    const trustLabels = { players:'szatnia', coach:'trener', supporters:'kibice', sponsors:'sponsorzy' };
    if (trust[weakestTrust] < 30) warnings.push('Kryzys zaufania: ' + (trustLabels[weakestTrust] || weakestTrust) + '.');
    const weakestArea = AREA_KEYS.reduce((a, b) => areas[a] <= areas[b] ? a : b);
    if (areas[weakestArea] < 30) warnings.push('Obszar wymagający pilnej reakcji: ' + (UPGRADE_META[weakestArea]?.label || weakestArea) + '.');
    if (boardConfidence(profile, context) < 30) warnings.push('Zarząd oczekuje szybkiej poprawy wyników lub kondycji klubu.');
    return warnings;
  }

  function decisionById(id) { return DECISIONS.find(item => item.id === id) || null; }

  function decisionRelevance(profile, decision) {
    if (!profile || !decision) return 0;
    const areas = normalizedAreas(profile.areas);
    const trust = normalizedTrust(profile.trust);
    const categoryArea = {
      staff:'staff', squad:'squad', academy:'academy', facilities:'facilities',
      organization:'organization', community:'community',
    };
    let score = 10;
    const areaKey = categoryArea[decision.category];
    if (areaKey) score += Math.max(0, 60 - areas[areaKey]) * 1.25;

    if (decision.category === 'finance') {
      if (Number(profile.budget || 0) < 2500) score += 42;
      else if (Number(profile.budget || 0) < 5000) score += 22;
    }
    if (decision.category === 'staff') score += Math.max(0, 50 - trust.coach) * .9;
    if (decision.category === 'squad') score += Math.max(0, 50 - trust.players) * .9;
    if (decision.category === 'community') {
      score += Math.max(0, 48 - trust.supporters) * .65;
    }

    if (decision.id === 'squad_integration') score += Math.max(0, 55 - trust.players) * 1.6;
    if (['shirt_sponsor','sponsor_delay','club_merch','club_day'].includes(decision.id)) {
      score += Math.max(0, trust.sponsors - 55) * .7;
    }
    if (['club_merch','club_day','school_partnership'].includes(decision.id)) {
      score += Math.max(0, trust.supporters - 55) * .5;
    }
    if (['academy_tournament','new_youth_group','youth_pathway'].includes(decision.id)) {
      score += Math.max(0, areas.academy - 65) * .6;
    }
    if (['pitch_renovation','lights','dressing_room','safety_fence','irrigation'].includes(decision.id)) {
      score += Math.max(0, 55 - areas.facilities) * .85;
    }
    if (['federation_paperwork','registrations','matchday_security','volunteer_network'].includes(decision.id)) {
      score += Math.max(0, 55 - areas.organization) * .75;
    }

    const recentCategories = (profile.history || [])
      .filter(item => item.decisionId)
      .slice(-2)
      .map(item => item.category);
    if (recentCategories.at(-1) === decision.category) score -= 18;
    if (recentCategories.at(-2) === decision.category) score -= 7;
    return Math.max(0, Math.round(score * 10) / 10);
  }

  function decisionTrigger(profile, decision) {
    if (!profile || !decision) return { score:0, label:'Bieżąca sprawa sezonu.' };
    const areas = normalizedAreas(profile.areas);
    const trust = normalizedTrust(profile.trust);
    if (decision.category === 'finance' && Number(profile.budget || 0) < 5000) {
      return { score:decisionRelevance(profile, decision), label:'Napięty budżet zwiększa znaczenie spraw finansowych.' };
    }
    if (decision.id === 'squad_integration' && trust.players < 50) {
      return { score:decisionRelevance(profile, decision), label:'Niskie zaufanie szatni zwiększa ryzyko problemów z atmosferą.' };
    }
    if (decision.category === 'staff' && trust.coach < 45) {
      return { score:decisionRelevance(profile, decision), label:'Relacja z trenerem jest słaba, więc sprawy sztabu stają się pilniejsze.' };
    }
    if (decision.category === 'facilities' && areas.facilities < 55) {
      return { score:decisionRelevance(profile, decision), label:'Słaby stan obiektu zwiększa częstotliwość problemów infrastrukturalnych.' };
    }
    if (decision.category === 'organization' && areas.organization < 55) {
      return { score:decisionRelevance(profile, decision), label:'Niska organizacja klubu generuje więcej spraw administracyjnych.' };
    }
    if (decision.category === 'academy' && areas.academy < 55) {
      return { score:decisionRelevance(profile, decision), label:'Akademia wymaga uwagi, więc częściej trafia na biurko prezesa.' };
    }
    if (decision.category === 'community' && trust.supporters < 48) {
      return { score:decisionRelevance(profile, decision), label:'Słabsza relacja z kibicami zwiększa presję na działania lokalne.' };
    }
    if (['shirt_sponsor','club_merch','club_day'].includes(decision.id) && trust.sponsors >= 65) {
      return { score:decisionRelevance(profile, decision), label:'Dobre relacje z partnerami otwierają dodatkowe okazje dla klubu.' };
    }
    if (['academy_tournament','new_youth_group','youth_pathway'].includes(decision.id) && areas.academy >= 70) {
      return { score:decisionRelevance(profile, decision), label:'Mocna akademia tworzy nowe możliwości rozwoju.' };
    }
    return { score:decisionRelevance(profile, decision), label:'Sprawa wynika z bieżącego rytmu sezonu i stanu klubu.' };
  }

  function pickDecision(profile, roundIndex = 0) {
    const used = new Set(profile?.usedIds || []);
    const order = Array.isArray(profile?.order) && profile.order.length ? profile.order : DECISIONS.map(item => item.id);
    const orderRank = new Map(order.map((id, index) => [id, index]));
    const freshCandidates = order
      .filter(id => !used.has(id))
      .map(id => decisionById(id))
      .filter(Boolean);
    if (freshCandidates.length) {
      return freshCandidates.sort((a, b) =>
        decisionRelevance(profile, b) - decisionRelevance(profile, a) ||
        Number(orderRank.get(a.id) ?? 999) - Number(orderRank.get(b.id) ?? 999)
      )[0] || null;
    }

    const lastUsed = profile?.lastUsedRound || {};
    const restedCandidates = DECISIONS
      .filter(item => Number(roundIndex) - Number(lastUsed[item.id] ?? -999) >= 4);
    const candidates = restedCandidates.length ? restedCandidates : DECISIONS;
    return [...candidates].sort((a, b) =>
      decisionRelevance(profile, b) - decisionRelevance(profile, a) ||
      Number(lastUsed[a.id] ?? -999) - Number(lastUsed[b.id] ?? -999) ||
      a.id.localeCompare(b.id)
    )[0] || null;
  }
  function canChoose(profile, selectedChoice) {
    return Number(profile?.budget || 0) + Number(selectedChoice?.effect?.budget || 0) >= 0;
  }
  function applyChoice(profile, selectedDecision, choiceIndex, roundIndex = 0) {
    const selectedChoice = selectedDecision?.choices?.[choiceIndex];
    if (!profile || !selectedDecision || !selectedChoice) return { ok:false, reason:'invalid' };
    if (!canChoose(profile, selectedChoice)) return { ok:false, reason:'budget' };
    const budgetDelta = Number(selectedChoice.effect?.budget || 0);
    const recurringDelta = Number(selectedChoice.effect?.recurring || 0);
    const next = {
      ...profile,
      budget:Number(profile.budget || 0) + budgetDelta,
      recurring:Number(profile.recurring || 0) + recurringDelta,
      trust:applyMap(profile.trust, selectedChoice.effect?.trust, TRUST_KEYS, normalizedTrust),
      areas:applyMap(profile.areas, selectedChoice.effect?.areas, AREA_KEYS, normalizedAreas),
      usedIds:[...new Set([...(profile.usedIds || []), selectedDecision.id])],
      lastUsedRound:{ ...(profile.lastUsedRound || {}), [selectedDecision.id]:Number(roundIndex) },
      currentDecision:null,
      decidedRound:Number(roundIndex),
      financeLedger:appendFinanceEntries(profile, [
        financeEntry(
          profile,
          selectedDecision.category === 'finance' ? 'sponsors' : selectedDecision.category === 'squad' ? 'squad' : 'investment',
          selectedDecision.title,
          budgetDelta,
          Number(roundIndex) + 1,
        ),
      ]),
      history:[...(profile.history || []), {
        round:Number(roundIndex) + 1,
        careerYear:Number(profile.careerYear || 1),
        decisionId:selectedDecision.id,
        category:selectedDecision.category,
        title:selectedDecision.title,
        choice:selectedChoice.label,
        result:selectedChoice.result,
        budgetDelta,
        recurringDelta,
        trustDelta:{ ...(selectedChoice.effect?.trust || {}) },
        areaDelta:{ ...(selectedChoice.effect?.areas || {}) },
      }],
    };
    return { ok:true, profile:next, choice:selectedChoice, budgetDelta, recurringDelta };
  }

  function managementStrengthModifier(profile) {
    const areas = normalizedAreas(profile?.areas);
    const trust = normalizedTrust(profile?.trust);
    const sporting = areas.squad * .36 + areas.staff * .28 + areas.facilities * .14 + areas.organization * .14 + areas.academy * .08;
    const climate = (trust.players + trust.coach) / 2;
    const modifier = (sporting - 50) * .09 + (climate - 50) * .025;
    return clamp(modifier, -5, 5);
  }
  function adjustedClubStrength(baseStrength, profile) {
    return clamp(Number(baseStrength || 65) + managementStrengthModifier(profile), 45, 90);
  }

  function supporterBaseValue(profile) {
    return Math.round(clamp(Number(profile?.supporterBase ?? 220), 80, 2500));
  }

  function recentFormScore(profile) {
    const results = (profile?.recentResults || []).slice(-5);
    if (!results.length) return 0;
    const score = results.reduce((sum, result) =>
      sum + (result === 'W' ? 1 : result === 'D' ? .25 : -.6), 0
    ) / results.length;
    return clamp(score, -.6, 1);
  }

  function attendanceCapacity(profile, competitionLevel = 1) {
    const areas = normalizedAreas(profile?.areas);
    const level = competitionByLevel(competitionLevel).level;
    return Math.round(clamp(
      180 + Number(areas.facilities || 0) * 7 + Number(areas.organization || 0) * 1.5 + level * 55,
      220,
      1800,
    ) / 5) * 5;
  }

  function estimateAttendance(profile, context = {}) {
    const home = String(context.venue || 'DOM').toUpperCase() === 'DOM';
    const level = competitionByLevel(context.competitionLevel ?? 1).level;
    const capacity = attendanceCapacity(profile, level);
    const supporterBase = supporterBaseValue(profile);
    if (!home) {
      return {
        home:false,
        attendance:0,
        capacity,
        supporterBase,
        occupancy:0,
        matchdayRevenue:-320,
        level,
      };
    }

    const trust = normalizedTrust(profile?.trust);
    const areas = normalizedAreas(profile?.areas);
    const levelMultiplier = [0.85, 1, 1.2, 1.4, 1.65][level] || 1;
    const supporterFactor = .75 + Number(trust.supporters || 50) / 200;
    const communityFactor = .85 + Number(areas.community || 50) / 330;
    const formFactor = 1 + recentFormScore(profile) * .14;
    const demand = supporterBase * levelMultiplier * supporterFactor * communityFactor * formFactor;
    const attendance = Math.max(80, Math.min(capacity, Math.round(demand / 5) * 5));
    const occupancy = capacity ? attendance / capacity : 0;
    const unitYield = 1.8 + Number(areas.organization || 50) / 100 * 1.2;
    const matchdayRevenue = Math.round(attendance * unitYield / 10) * 10;
    return {
      home:true,
      attendance,
      capacity,
      supporterBase,
      occupancy,
      matchdayRevenue,
      level,
    };
  }

  function supporterBaseDelta(profile, context = {}, attendance = null) {
    const areas = normalizedAreas(profile?.areas);
    const result = context.result || 'D';
    let delta = result === 'W' ? 5 : result === 'D' ? 1 : -3;
    delta += Math.round((Number(areas.community || 50) - 50) / 25);
    if (attendance?.home && Number(attendance.occupancy || 0) >= .75) delta += 2;
    if (attendance?.home && Number(attendance.occupancy || 0) < .35) delta -= 1;
    return Math.round(clamp(delta, -8, 10));
  }

  function roundFinanceBreakdown(profile, { venue = 'DOM', result = 'D', competitionLevel = 1 } = {}) {
    const trust = normalizedTrust(profile?.trust);
    const areas = normalizedAreas(profile?.areas);
    const home = String(venue).toUpperCase() === 'DOM';
    const attendance = estimateAttendance(profile, { venue, competitionLevel });
    const resultBonus = result === 'W' ? 150 : result === 'D' ? 50 : 0;
    const sponsorEffect = Math.round((trust.sponsors - 50) * 2.5);
    const organizationEffect = Math.round((areas.organization - 50) * 2);
    const recurring = Math.round(Number(profile?.recurring || 0));
    const rows = [
      {
        category:'matchday',
        label:home
          ? 'Mecz domowy · frekwencja gry ' + attendance.attendance + '/' + attendance.capacity
          : 'Transport na wyjazd',
        amount:attendance.matchdayRevenue,
      },
      { category:'matchday', label:'Premia za wynik', amount:resultBonus },
      { category:'sponsors', label:'Bieżący efekt partnerów', amount:sponsorEffect },
      { category:'contracts', label:'Stałe umowy i zobowiązania', amount:recurring },
      { category:'other', label:'Sprawność organizacyjna', amount:organizationEffect },
    ];
    return {
      attendance,
      rows,
      total:Math.round(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
    };
  }

  function roundFinance(profile, context = {}) {
    return roundFinanceBreakdown(profile, context).total;
  }
  function postRoundTrustDelta(result) {
    if (result === 'W') return { players:1, coach:1, supporters:2, sponsors:1 };
    if (result === 'L') return { players:-1, coach:-1, supporters:-2, sponsors:-1 };
    return { players:0, coach:0, supporters:0, sponsors:0 };
  }
  function applyPostRound(profile, context = {}) {
    if (!profile) return null;
    const breakdown = roundFinanceBreakdown(profile, context);
    const finance = breakdown.total;
    const round = Number(profile.roundsCompleted || 0) + 1;
    const baseDelta = supporterBaseDelta(profile, context, breakdown.attendance);
    const supporterBase = Math.round(clamp(supporterBaseValue(profile) + baseDelta, 80, 2500));
    const attendanceEntry = {
      careerYear:Number(profile.careerYear || 1),
      round,
      home:Boolean(breakdown.attendance?.home),
      attendance:Number(breakdown.attendance?.attendance || 0),
      capacity:Number(breakdown.attendance?.capacity || 0),
      occupancy:Number(breakdown.attendance?.occupancy || 0),
      supporterBaseBefore:supporterBaseValue(profile),
      supporterBaseAfter:supporterBase,
      supporterBaseDelta:baseDelta,
      result:context.result || null,
      competitionLevel:Number(context.competitionLevel ?? 1),
    };
    return {
      ...profile,
      budget:Number(profile.budget || 0) + finance,
      financeLedger:appendFinanceEntries(profile, breakdown.rows.map(row =>
        financeEntry(profile, row.category, row.label, row.amount, round)
      )),
      trust:applyMap(profile.trust, postRoundTrustDelta(context.result), TRUST_KEYS, normalizedTrust),
      supporterBase,
      attendanceHistory:[...(profile.attendanceHistory || []), attendanceEntry],
      recentResults:[...(profile.recentResults || []), context.result || 'D'].slice(-5),
      roundsCompleted:Number(profile.roundsCompleted || 0) + 1,
      lastFinance:finance,
      lastAttendance:breakdown.attendance?.home ? Number(breakdown.attendance.attendance || 0) : null,
      lastAttendanceCapacity:Number(breakdown.attendance?.capacity || 0),
      lastSupporterBaseDelta:baseDelta,
      lastResult:context.result || null,
      lastMatch:context.match ? { ...context.match } : null,
    };
  }

  function contractTemplateById(id) {
    return CONTRACT_TEMPLATES.find(item => item.id === id) || null;
  }

  function contractConditionMet(contract, season, profile) {
    const condition = contract?.condition;
    if (!condition) return true;
    if (condition.type === 'position') {
      return Number(season?.position || 999) <= Number(condition.threshold || 0);
    }
    if (condition.type === 'community') {
      return Number(profile?.areas?.community || 0) >= Number(condition.threshold || 0);
    }
    return true;
  }

  function processSeasonContracts(profile, season) {
    if (!profile) return null;
    let recurring = Number(profile.recurring || 0);
    let trust = normalizedTrust(profile.trust);
    const active = [];
    const history = [...(profile.contractHistory || [])];

    for (const raw of profile.contracts || []) {
      const contract = { ...raw };
      const conditionMet = contractConditionMet(contract, season, profile);
      const nextRemaining = Math.max(0, Number(contract.remainingSeasons || 0) - 1);
      if (!conditionMet) {
        recurring -= Number(contract.recurring || 0);
        trust = applyMap(trust, { sponsors:-4 }, TRUST_KEYS, normalizedTrust);
        history.push({
          ...contract,
          endedCareerYear:Number(profile.careerYear || 1),
          endReason:'condition',
          conditionMet:false,
        });
        continue;
      }
      if (nextRemaining <= 0) {
        recurring -= Number(contract.recurring || 0);
        history.push({
          ...contract,
          remainingSeasons:0,
          endedCareerYear:Number(profile.careerYear || 1),
          endReason:'expired',
          conditionMet:true,
        });
        continue;
      }
      active.push({ ...contract, remainingSeasons:nextRemaining, lastConditionMet:true });
      trust = applyMap(trust, { sponsors:1 }, TRUST_KEYS, normalizedTrust);
    }

    return { ...profile, recurring, trust, contracts:active, contractHistory:history };
  }

  function availableContractTemplates(profile) {
    const activeIds = new Set((profile?.contracts || []).map(item => item.templateId));
    return CONTRACT_TEMPLATES.filter(template => !activeIds.has(template.id));
  }

  function canAcceptContract(profile, templateId) {
    if (
      !profile?.offseason ||
      !profile.offseason.competitionReadinessResolved ||
      !profile.offseason.planId ||
      profile.offseason.sponsorDecisionResolved
    ) return false;
    if ((profile.contracts || []).length >= 2) return false;
    return Boolean(contractTemplateById(templateId)) &&
      !(profile.contracts || []).some(item => item.templateId === templateId);
  }

  function acceptSponsorContract(profile, templateId) {
    const template = contractTemplateById(templateId);
    if (!template || !canAcceptContract(profile, templateId)) return { ok:false, reason:'unavailable' };
    const contract = {
      id:'sponsor:' + template.id + ':' + Number(profile.careerYear || 1),
      templateId:template.id,
      kind:'sponsor',
      label:template.label,
      icon:template.icon,
      startedCareerYear:Number(profile.careerYear || 1),
      duration:Number(template.duration || 1),
      remainingSeasons:Number(template.duration || 1),
      signingBonus:Number(template.signingBonus || 0),
      recurring:Number(template.recurring || 0),
      condition:template.condition ? { ...template.condition } : null,
    };
    return {
      ok:true,
      contract,
      profile:{
        ...profile,
        budget:Number(profile.budget || 0) + contract.signingBonus,
        recurring:Number(profile.recurring || 0) + contract.recurring,
        trust:applyMap(profile.trust, { sponsors:3 }, TRUST_KEYS, normalizedTrust),
        contracts:[...(profile.contracts || []), contract],
        contractHistory:[...(profile.contractHistory || []), {
          ...contract,
          event:'signed',
          careerYear:Number(profile.careerYear || 1),
        }],
        financeLedger:appendFinanceEntries(profile, [
          financeEntry(profile, 'sponsors', 'Podpisanie umowy: ' + contract.label, contract.signingBonus, null),
        ]),
        offseason:{ ...profile.offseason, sponsorDecisionResolved:true, selectedContractId:contract.id },
      },
    };
  }

  function skipSponsorContract(profile) {
    if (!profile?.offseason || profile.offseason.sponsorDecisionResolved) return { ok:false, reason:'unavailable' };
    return {
      ok:true,
      profile:{ ...profile, offseason:{ ...profile.offseason, sponsorDecisionResolved:true, selectedContractId:null } },
    };
  }

  const ACADEMY_FIRST_NAMES = Object.freeze(['Jakub','Kacper','Oskar','Michał','Antoni','Filip','Szymon','Bartosz','Mateusz','Jan']);
  const ACADEMY_LAST_NAMES = Object.freeze(['Nowak','Kowal','Wójcik','Mazur','Król','Lis','Kurek','Duda','Pawlik','Zając']);
  const ACADEMY_ROLES = Object.freeze([
    { role:'Bramkarz', archetype:'Refleks' },
    { role:'Obrońca', archetype:'Walczak' },
    { role:'Pomocnik', archetype:'Rozgrywający' },
    { role:'Skrzydłowy', archetype:'Szybkość' },
    { role:'Napastnik', archetype:'Egzekutor' },
  ]);

  function academyHash(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function academyRoll(seed, salt = 0) {
    const value = academyHash(String(seed) + '|' + String(salt));
    return (value % 10000) / 10000;
  }

  function createAcademyProspects(profile, season = {}) {
    const academy = Number(profile?.areas?.academy ?? 45);
    const careerYear = Number(season?.careerYear || profile?.careerYear || 1);
    const club = String(season?.club || 'club');
    const seasonLabel = String(season?.season || '');
    const count = academy >= 75 ? 3 : academy >= 55 ? 2 : 1;
    const seed = club + '|' + seasonLabel + '|' + careerYear + '|' + Math.round(academy);
    const prospects = [];

    for (let index = 0; index < count; index += 1) {
      const first = ACADEMY_FIRST_NAMES[Math.floor(academyRoll(seed, index * 7 + 1) * ACADEMY_FIRST_NAMES.length)];
      const last = ACADEMY_LAST_NAMES[Math.floor(academyRoll(seed, index * 7 + 2) * ACADEMY_LAST_NAMES.length)];
      const role = ACADEMY_ROLES[Math.floor(academyRoll(seed, index * 7 + 3) * ACADEMY_ROLES.length)];
      const age = 16 + Math.floor(academyRoll(seed, index * 7 + 4) * 3);
      const rating = Math.round(clamp(48 + academy * .20 + (academyRoll(seed, index * 7 + 5) - .5) * 10, 48, 82));
      const potential = Math.round(clamp(rating + 7 + academyRoll(seed, index * 7 + 6) * 12, rating + 4, 92));
      const developmentCost = Math.max(250, Math.round((180 + rating * 5.5) / 50) * 50);
      const recurring = Math.max(10, Math.round((rating - 40) * .65 / 5) * 5);
      const squadGain = rating >= 72 ? 4 : rating >= 64 ? 3 : 2;
      prospects.push({
        id:'academy:' + careerYear + ':' + index + ':' + academyHash(seed + '|' + index),
        player:first + ' ' + last,
        age,
        role:role.role,
        archetype:role.archetype,
        ratings:{ game_rating:rating, potential },
        developmentCost,
        recurring,
        squadGain,
        fictional:true,
        source:'career_academy',
        sourceSeason:seasonLabel,
        sourceClub:club,
      });
    }
    return prospects;
  }

  function academyProspectById(profile, prospectId) {
    return (profile?.offseason?.academyProspects || []).find(item => item.id === prospectId) || null;
  }

  function canPromoteAcademyProspect(profile, prospectId) {
    if (
      !profile?.offseason ||
      !profile.offseason.playerContractsResolved ||
      profile.offseason.academyDecisionResolved
    ) return false;
    const prospect = academyProspectById(profile, prospectId);
    if (!prospect) return false;
    return Number(profile.budget || 0) >= Number(prospect.developmentCost || 0);
  }

  function promoteAcademyProspect(profile, prospectId) {
    if (!canPromoteAcademyProspect(profile, prospectId)) return { ok:false, reason:'unavailable' };
    const prospect = academyProspectById(profile, prospectId);
    const entry = {
      ...prospect,
      promotedCareerYear:Number(profile.offseason?.careerYear || profile.careerYear || 1),
      careerSeasons:0,
      lastDevelopmentDelta:0,
      contractYears:3,
      contractRemaining:3,
      contractRecurring:Number(prospect.recurring || 0),
      contractRenewals:0,
    };
    return {
      ok:true,
      prospect:entry,
      profile:{
        ...profile,
        budget:Number(profile.budget || 0) - Number(entry.developmentCost || 0),
        recurring:Number(profile.recurring || 0) - Number(entry.recurring || 0),
        areas:applyMap(profile.areas, { squad:Number(entry.squadGain || 0), academy:1 }, AREA_KEYS, normalizedAreas),
        trust:applyMap(profile.trust, { players:1, supporters:3 }, TRUST_KEYS, normalizedTrust),
        academyRoster:[...(profile.academyRoster || []), entry],
        academyHistory:[...(profile.academyHistory || []), {
          careerYear:entry.promotedCareerYear,
          type:'promoted',
          prospect:{ ...entry },
        }],
        financeLedger:appendFinanceEntries(profile, [
          financeEntry(profile, 'squad', 'Wdrożenie wychowanka: ' + entry.player, -Number(entry.developmentCost || 0), null),
        ]),
        offseason:{
          ...profile.offseason,
          academyDecisionResolved:true,
          academySelectedId:entry.id,
        },
      },
    };
  }

  function skipAcademyIntake(profile) {
    if (
      !profile?.offseason ||
      !profile.offseason.playerContractsResolved ||
      profile.offseason.academyDecisionResolved
    ) return { ok:false, reason:'unavailable' };
    return {
      ok:true,
      profile:{
        ...profile,
        academyHistory:[...(profile.academyHistory || []), {
          careerYear:Number(profile.offseason?.careerYear || profile.careerYear || 1),
          type:'skipped',
          prospects:(profile.offseason.academyProspects || []).map(item => ({ ...item })),
        }],
        offseason:{
          ...profile.offseason,
          academyDecisionResolved:true,
          academySelectedId:null,
        },
      },
    };
  }

  function careerContractDefaults(kind = 'transfer') {
    return kind === 'academy'
      ? { years:3 }
      : { years:2 };
  }

  function normalizeCareerPlayerContract(player, kind = 'transfer') {
    const defaults = careerContractDefaults(kind);
    const yearsRaw = Number(player?.contractYears);
    const years = Number.isFinite(yearsRaw) && yearsRaw > 0 ? Math.round(yearsRaw) : defaults.years;
    const remainingRaw = Number(player?.contractRemaining);
    const hasExplicitRemaining = Number.isFinite(remainingRaw) && remainingRaw >= 0;
    const recurring = Math.max(0, Number(player?.contractRecurring ?? player?.recurring ?? 0));
    return {
      ...player,
      contractYears:years,
      contractRemaining:hasExplicitRemaining ? Math.round(remainingRaw) : years,
      contractRecurring:recurring,
      contractRenewals:Math.max(0, Number(player?.contractRenewals || 0)),
      __careerContractMigrated:!hasExplicitRemaining,
    };
  }

  function careerContractTerms(player, kind = 'transfer') {
    const normalized = normalizeCareerPlayerContract(player, kind);
    const rating = clamp(Number(normalized?.ratings?.game_rating || 60), 35, 95);
    const ageValue = Number(normalized?.careerAge ?? normalized?.age ?? 0);
    const age = Number.isFinite(ageValue) && ageValue > 0 ? ageValue : null;
    const currentRecurring = Math.max(0, Number(normalized.contractRecurring || 0));
    const years = age !== null && age >= 34
      ? 1
      : kind === 'academy' && (age === null || age <= 23)
        ? 3
        : 2;
    const marketRecurring = kind === 'academy'
      ? Math.max(15, Math.round((rating - 34) * .90 / 5) * 5)
      : Math.max(25, Math.round((rating - 34) * 1.35 / 5) * 5);
    const recurring = Math.max(currentRecurring, marketRecurring);
    const renewalBonus = Math.max(
      300,
      Math.round((220 + Math.max(0, rating - 50) * 28 + years * 90) / 50) * 50,
    );
    return {
      years,
      renewalBonus,
      recurring,
      currentRecurring,
      rating,
      age,
      retiring:Boolean(age !== null && age >= 37),
    };
  }

  function careerRosterSpecs(profile) {
    return [
      { key:'academyRoster', kind:'academy', rows:profile?.academyRoster || [] },
      { key:'transferRoster', kind:'transfer', rows:profile?.transferRoster || [] },
      { key:'retainedRoster', kind:'retained', rows:profile?.retainedRoster || [] },
    ];
  }

  function careerPlayerContractId(player, kind = 'transfer') {
    return String(player?.id || player?.playerKey || (kind + ':' + String(player?.player || 'player')));
  }

  function processCareerPlayerContracts(profile, season = {}) {
    if (!profile) return { profile, cases:[], retirements:[] };
    let recurring = Number(profile.recurring || 0);
    let areas = normalizedAreas(profile.areas);
    let trust = normalizedTrust(profile.trust);
    const history = [...(profile.playerContractHistory || [])];
    const cases = [];
    const retirements = [];
    const rosters = {};
    const careerYear = Number(profile.careerYear || season?.careerYear || 1);

    for (const spec of careerRosterSpecs(profile)) {
      const kept = [];
      for (const source of spec.rows) {
        const player = normalizeCareerPlayerContract(source, spec.kind);
        const joinedYear = Number(
          spec.kind === 'academy'
            ? player?.promotedCareerYear ?? careerYear
            : player?.careerYear ?? careerYear,
        );

        // Legacy players from saves created before contracts existed receive a fresh
        // contract window instead of expiring immediately after an update.
        if (player.__careerContractMigrated) {
          const migrated = { ...player };
          delete migrated.__careerContractMigrated;
          kept.push(migrated);
          continue;
        }

        // A player added in this same career year has not completed a full season yet.
        if (joinedYear >= careerYear) {
          const unchanged = { ...player };
          delete unchanged.__careerContractMigrated;
          kept.push(unchanged);
          continue;
        }

        const nextRemaining = Math.max(0, Number(player.contractRemaining || 0) - 1);
        const terms = careerContractTerms(player, spec.kind);
        const clean = { ...player, contractRemaining:nextRemaining };
        delete clean.__careerContractMigrated;

        if (nextRemaining > 0) {
          kept.push(clean);
          continue;
        }

        if (terms.retiring) {
          recurring += terms.currentRecurring;
          const squadLoss = Math.max(1, Number(player.squadGain || 1));
          areas = applyMap(areas, { squad:-squadLoss }, AREA_KEYS, normalizedAreas);
          trust = applyMap(trust, { players:1, supporters:1 }, TRUST_KEYS, normalizedTrust);
          const event = {
            careerYear,
            season:String(season?.season || ''),
            type:'retired',
            kind:spec.kind,
            playerId:careerPlayerContractId(player, spec.kind),
            player:player.player || 'Zawodnik',
            age:terms.age,
            rating:terms.rating,
            releasedRecurring:terms.currentRecurring,
          };
          retirements.push(event);
          history.push(event);
          continue;
        }

        kept.push(clean);
        cases.push({
          id:'career-contract:' + careerYear + ':' + spec.kind + ':' + careerPlayerContractId(player, spec.kind),
          kind:spec.kind,
          rosterKey:spec.key,
          playerId:careerPlayerContractId(player, spec.kind),
          player:player.player || 'Zawodnik',
          age:terms.age,
          rating:terms.rating,
          currentRecurring:terms.currentRecurring,
          renewalYears:terms.years,
          renewalBonus:terms.renewalBonus,
          renewalRecurring:terms.recurring,
          squadGain:Math.max(1, Number(player.squadGain || 1)),
          resolved:false,
          outcome:null,
        });
      }
      rosters[spec.key] = kept;
    }

    return {
      cases,
      retirements,
      profile:{
        ...profile,
        ...rosters,
        recurring,
        areas,
        trust,
        playerContractHistory:history,
      },
    };
  }

  function currentCareerPlayerContractCase(profile) {
    return (profile?.offseason?.playerContractCases || []).find(item => !item.resolved) || null;
  }

  function canResolveCareerPlayerContract(profile, caseId, outcome) {
    if (
      !profile?.offseason ||
      !profile.offseason.sponsorDecisionResolved ||
      profile.offseason.playerContractsResolved
    ) return false;
    const item = (profile.offseason.playerContractCases || []).find(row => row.id === caseId && !row.resolved);
    if (!item || !['renew','release'].includes(outcome)) return false;
    if (outcome === 'renew') return Number(profile.budget || 0) >= Number(item.renewalBonus || 0);
    return true;
  }

  function resolveCareerPlayerContract(profile, caseId, outcome) {
    if (!canResolveCareerPlayerContract(profile, caseId, outcome)) {
      return { ok:false, reason:'unavailable' };
    }
    const cases = (profile.offseason.playerContractCases || []).map(item => ({ ...item }));
    const caseIndex = cases.findIndex(item => item.id === caseId);
    const item = cases[caseIndex];
    const roster = [...(profile[item.rosterKey] || [])];
    const playerIndex = roster.findIndex(player => careerPlayerContractId(player, item.kind) === item.playerId);
    if (playerIndex < 0) return { ok:false, reason:'missing-player' };
    const player = normalizeCareerPlayerContract(roster[playerIndex], item.kind);
    const oldRecurring = Math.max(0, Number(player.contractRecurring ?? item.currentRecurring ?? 0));
    let budget = Number(profile.budget || 0);
    let recurring = Number(profile.recurring || 0);
    let areas = normalizedAreas(profile.areas);
    let trust = normalizedTrust(profile.trust);
    let financeLedger = [...(profile.financeLedger || [])];

    if (outcome === 'renew') {
      budget -= Number(item.renewalBonus || 0);
      recurring += oldRecurring - Number(item.renewalRecurring || 0);
      roster[playerIndex] = {
        ...player,
        recurring:Number(item.renewalRecurring || 0),
        contractYears:Number(item.renewalYears || 1),
        contractRemaining:Number(item.renewalYears || 1),
        contractRecurring:Number(item.renewalRecurring || 0),
        contractRenewals:Number(player.contractRenewals || 0) + 1,
      };
      trust = applyMap(trust, { players:2, coach:1 }, TRUST_KEYS, normalizedTrust);
      financeLedger = appendFinanceEntries(
        { ...profile, financeLedger },
        [financeEntry(profile, 'squad', 'Odnowienie umowy kariery: ' + item.player, -Number(item.renewalBonus || 0), null)],
      );
    } else {
      roster.splice(playerIndex, 1);
      recurring += oldRecurring;
      areas = applyMap(areas, { squad:-Math.max(1, Number(item.squadGain || 1)) }, AREA_KEYS, normalizedAreas);
      trust = applyMap(trust, { players:-1, supporters:-1 }, TRUST_KEYS, normalizedTrust);
    }

    cases[caseIndex] = { ...item, resolved:true, outcome };
    const resolved = cases.every(row => row.resolved);
    const event = {
      careerYear:Number(profile.offseason?.careerYear || profile.careerYear || 1),
      season:String(profile.offseason?.season || ''),
      type:outcome === 'renew' ? 'renewed' : 'released',
      kind:item.kind,
      playerId:item.playerId,
      player:item.player,
      age:item.age,
      rating:item.rating,
      years:outcome === 'renew' ? Number(item.renewalYears || 1) : 0,
      bonus:outcome === 'renew' ? Number(item.renewalBonus || 0) : 0,
      recurringBefore:oldRecurring,
      recurringAfter:outcome === 'renew' ? Number(item.renewalRecurring || 0) : 0,
    };

    return {
      ok:true,
      event,
      profile:{
        ...profile,
        [item.rosterKey]:roster,
        budget,
        recurring,
        areas,
        trust,
        financeLedger,
        playerContractHistory:[...(profile.playerContractHistory || []), event],
        offseason:{
          ...profile.offseason,
          playerContractCases:cases,
          playerContractsResolved:resolved,
        },
      },
    };
  }

  function latestSeasonRecord(profile) {
    const history = profile?.seasonHistory || [];
    return history.length ? history[history.length - 1] : null;
  }

  function offseasonPlanById(id) {
    return OFFSEASON_PLANS.find(item => item.id === id) || null;
  }

  function offseasonSettlement(profile) {
    const season = latestSeasonRecord(profile);
    if (!profile || !season) return null;
    const verdict = seasonVerdict({ position:season.position, target:season.target });
    const performanceBonus = verdict.code === 'champion'
      ? 2200
      : verdict.code === 'target'
        ? 1400
        : verdict.code === 'close'
          ? 800
          : 300;
    const trust = normalizedTrust(profile.trust);
    const areas = normalizedAreas(profile.areas);
    const partnerBonus = Math.round(clamp((trust.sponsors + trust.supporters - 80) * 20, 0, 1800));
    const maintenanceCost = Math.round(500 + (100 - areas.facilities) * 6 + (100 - areas.organization) * 3);
    const net = performanceBonus + partnerBonus - maintenanceCost;
    return {
      season:season.season,
      careerYear:season.careerYear,
      budgetBefore:Number(profile.budget || 0),
      performanceBonus,
      partnerBonus,
      maintenanceCost,
      net,
      budgetAfter:Number(profile.budget || 0) + net,
    };
  }

  function beginOffseason(profile) {
    if (!profile) return { ok:false, reason:'invalid' };
    const season = latestSeasonRecord(profile);
    if (!season) return { ok:false, reason:'season' };
    if (profile.offseason && Number(profile.offseason.careerYear) === Number(season.careerYear)) {
      let migratedOffseason = { ...profile.offseason };
      let changed = false;
      if (migratedOffseason.competitionReadinessResolved === undefined) {
        const targetLevel = Number(season?.movement?.toLevel ?? season?.competitionLevel ?? 1);
        const readiness = competitionReadiness(profile, targetLevel);
        migratedOffseason = {
          ...migratedOffseason,
          competitionReadinessLevel:targetLevel,
          competitionReadiness:readiness,
          competitionReadinessResolved:readiness.ready,
          competitionReadinessMethod:readiness.ready ? 'already_ready' : null,
        };
        changed = true;
      }
      // Do not introduce a surprise expiry decision halfway through an already-saved
      // offseason created by an older version of the game.
      if (migratedOffseason.playerContractsResolved === undefined) {
        migratedOffseason = {
          ...migratedOffseason,
          playerContractCases:[],
          playerContractsResolved:true,
          retirementNotices:[],
        };
        changed = true;
      }
      if (changed) {
        const migrated = { ...profile, offseason:migratedOffseason };
        return { ok:true, profile:migrated, offseason:migratedOffseason, reused:true };
      }
      return { ok:true, profile, offseason:profile.offseason, reused:true };
    }
    const sponsorProcessed = processSeasonContracts(profile, season);
    const contractProcess = processCareerPlayerContracts(sponsorProcessed, season);
    const processed = contractProcess.profile;
    const settlement = offseasonSettlement(processed);
    if (!settlement) return { ok:false, reason:'settlement' };
    const academyProspects = createAcademyProspects(processed, season);
    const readinessLevel = Number(season?.movement?.toLevel ?? season?.competitionLevel ?? 1);
    const readiness = competitionReadiness(processed, readinessLevel);
    const offseason = {
      careerYear:Number(season.careerYear || processed.careerYear || 1),
      season:season.season,
      settlement,
      competitionReadinessLevel:readinessLevel,
      competitionReadiness:readiness,
      competitionReadinessResolved:readiness.ready,
      competitionReadinessMethod:readiness.ready ? 'already_ready' : null,
      planId:null,
      planLabel:null,
      planResult:null,
      sponsorDecisionResolved:(processed.contracts || []).length >= 2 || availableContractTemplates(processed).length === 0,
      selectedContractId:null,
      playerContractCases:contractProcess.cases,
      playerContractsResolved:contractProcess.cases.length === 0,
      retirementNotices:contractProcess.retirements,
      academyProspects,
      academyDecisionResolved:academyProspects.length === 0,
      academySelectedId:null,
      transferWindowClosed:false,
      marketIds:[],
      departureResolved:false,
      departureCase:null,
    };
    return {
      ok:true,
      offseason,
      profile:{
        ...processed,
        budget:settlement.budgetAfter,
        financeLedger:appendFinanceEntries(processed, [
          financeEntry(processed, 'sponsors', 'Premia za wynik sezonu', settlement.performanceBonus, null),
          financeEntry(processed, 'sponsors', 'Partnerzy i otoczenie', settlement.partnerBonus, null),
          financeEntry(processed, 'investment', 'Utrzymanie i przeglądy', -settlement.maintenanceCost, null),
        ]),
        offseason,
      },
    };
  }

  function canChooseOffseasonPlan(profile, plan) {
    return Boolean(
      profile?.offseason &&
      profile.offseason.competitionReadinessResolved &&
      !profile.offseason.planId &&
      plan &&
      Number(profile.budget || 0) + Number(plan.effect?.budget || 0) >= 0
    );
  }

  function applyOffseasonPlan(profile, planId) {
    const plan = offseasonPlanById(planId);
    if (!profile || !plan || !profile.offseason) return { ok:false, reason:'invalid' };
    if (profile.offseason.planId) return { ok:false, reason:'already' };
    if (!canChooseOffseasonPlan(profile, plan)) return { ok:false, reason:'budget' };
    const effect = plan.effect || {};
    const entry = {
      careerYear:Number(profile.offseason.careerYear || profile.careerYear || 1),
      season:profile.offseason.season,
      planId:plan.id,
      label:plan.label,
      budgetDelta:Number(effect.budget || 0),
      trustDelta:{ ...(effect.trust || {}) },
      areaDelta:{ ...(effect.areas || {}) },
    };
    const offseason = {
      ...profile.offseason,
      planId:plan.id,
      planLabel:plan.label,
      planResult:plan.copy,
    };
    return {
      ok:true,
      plan,
      profile:{
        ...profile,
        budget:Number(profile.budget || 0) + Number(effect.budget || 0),
        trust:applyMap(profile.trust, effect.trust, TRUST_KEYS, normalizedTrust),
        areas:applyMap(profile.areas, effect.areas, AREA_KEYS, normalizedAreas),
        financeLedger:appendFinanceEntries(profile, [
          financeEntry(profile, 'investment', 'Lato: ' + plan.label, Number(effect.budget || 0), null),
        ]),
        offseason,
        offseasonHistory:[...(profile.offseasonHistory || []), entry],
      },
    };
  }

  function departureGameTerms(candidate = {}) {
    const rating = clamp(Number(candidate?.ratings?.game_rating || 60), 35, 95);
    const appearances = Math.max(0, Number(candidate?.stats?.appearances || 0));
    const retentionCost = Math.max(400, Math.round((450 + Math.max(0, rating - 55) * 36 + Math.min(24, appearances) * 12) / 50) * 50);
    const retentionRecurring = Math.max(15, Math.round((rating - 35) * 0.9 / 5) * 5);
    const compensation = Math.max(250, Math.round((retentionCost * 0.55) / 50) * 50);
    const squadLoss = rating >= 84 ? 5 : rating >= 76 ? 4 : 3;
    return { retentionCost, retentionRecurring, compensation, squadLoss };
  }

  function canResolveDeparture(profile, candidate, outcome) {
    if (
      !profile?.offseason ||
      !profile.offseason.academyDecisionResolved ||
      profile.offseason.departureResolved ||
      !candidate?.playerKey
    ) return false;
    if (outcome === 'retain') {
      return Number(profile.budget || 0) >= departureGameTerms(candidate).retentionCost;
    }
    return outcome === 'release';
  }

  function resolveDeparture(profile, candidate, outcome) {
    if (!canResolveDeparture(profile, candidate, outcome)) return { ok:false, reason:'unavailable' };
    const terms = departureGameTerms(candidate);
    const retained = outcome === 'retain';
    const entry = {
      careerYear:Number(profile.offseason?.careerYear || profile.careerYear || 1),
      playerKey:candidate.playerKey,
      player:candidate.player || 'Zawodnik',
      sourceClub:candidate.club || null,
      sourceSeason:candidate.season || null,
      factualTransition:Boolean(candidate.factualTransition),
      observedNextClub:candidate.observedNextClub || null,
      observedNextSeason:candidate.observedNextSeason || null,
      outcome:retained ? 'retain' : 'release',
      retentionCost:retained ? terms.retentionCost : 0,
      retentionRecurring:retained ? terms.retentionRecurring : 0,
      compensation:retained ? 0 : terms.compensation,
      stats:{ ...(candidate.stats || {}) },
      ratings:{ ...(candidate.ratings || {}) },
      archetype:candidate.archetype || null,
    };
    const departed = new Set(profile.departedPlayerKeys || []);
    if (!retained) departed.add(candidate.playerKey);
    const retainedEntry = retained ? {
      id:'retained:' + candidate.playerKey + ':' + Number(profile.offseason?.careerYear || profile.careerYear || 1),
      playerKey:candidate.playerKey,
      player:candidate.player || 'Zawodnik',
      sourceClub:candidate.club || null,
      sourceSeason:candidate.season || null,
      archetype:candidate.archetype || null,
      stats:{ ...(candidate.stats || {}) },
      ratings:{ ...(candidate.ratings || {}) },
      sourceGameRating:Number(candidate?.ratings?.game_rating || 0) || null,
      careerAge:Number(candidate?.age || candidate?.stats?.age || 0) || null,
      careerYear:Number(profile.offseason?.careerYear || profile.careerYear || 1),
      careerSeasons:0,
      lastDevelopmentDelta:0,
      recurring:terms.retentionRecurring,
      squadGain:1,
      contractYears:2,
      contractRemaining:2,
      contractRecurring:terms.retentionRecurring,
      contractRenewals:0,
      factualTransition:Boolean(candidate.factualTransition),
      observedNextClub:candidate.observedNextClub || null,
      observedNextSeason:candidate.observedNextSeason || null,
    } : null;
    return {
      ok:true,
      terms,
      profile:{
        ...profile,
        budget:Number(profile.budget || 0) + (retained ? -terms.retentionCost : terms.compensation),
        recurring:Number(profile.recurring || 0) + (retained ? -terms.retentionRecurring : 0),
        areas:applyMap(profile.areas, { squad:retained ? 1 : -terms.squadLoss }, AREA_KEYS, normalizedAreas),
        trust:applyMap(
          profile.trust,
          retained ? { players:3, coach:2, supporters:1 } : { players:1, coach:-2, supporters:-1 },
          TRUST_KEYS,
          normalizedTrust,
        ),
        departedPlayerKeys:[...departed],
        retainedRoster:retained ? [...(profile.retainedRoster || []), retainedEntry] : [...(profile.retainedRoster || [])],
        financeLedger:appendFinanceEntries(profile, [
          financeEntry(
            profile,
            'squad',
            retained ? 'Zatrzymanie: ' + entry.player : 'Odejście: ' + entry.player,
            retained ? -terms.retentionCost : terms.compensation,
            null,
          ),
        ]),
        departureHistory:[...(profile.departureHistory || []), entry],
        offseason:{
          ...profile.offseason,
          departureResolved:true,
          departureCase:{
            playerKey:candidate.playerKey,
            player:candidate.player || 'Zawodnik',
            outcome:entry.outcome,
            factualTransition:entry.factualTransition,
            observedNextClub:entry.observedNextClub,
            observedNextSeason:entry.observedNextSeason,
          },
        },
      },
    };
  }

  function transferGameTerms(candidate = {}) {
    const rating = clamp(Number(candidate?.ratings?.game_rating || 60), 35, 95);
    const appearances = Math.max(0, Number(candidate?.stats?.appearances || 0));
    const goals = Math.max(0, Number(candidate?.stats?.goals || 0));
    const rawFee = 350 + Math.max(0, rating - 50) * 38 + Math.min(24, appearances) * 16 + Math.min(15, goals) * 28;
    const fee = Math.max(350, Math.round(rawFee / 50) * 50);
    const recurring = Math.max(20, Math.round((rating - 35) * 1.45 / 5) * 5);
    const squadGain = rating >= 84 ? 5 : rating >= 76 ? 4 : rating >= 68 ? 3 : 2;
    return { fee, recurring, squadGain };
  }

  function canSignTransfer(profile, candidate) {
    if (
      !profile?.offseason ||
      !profile.offseason.departureResolved ||
      profile.offseason.transferWindowClosed ||
      !candidate?.id
    ) return false;
    const candidateKey = candidate.playerKey || candidate.id;
    const signingsThisWindow = (profile.transferHistory || []).filter(
      item => Number(item.careerYear) === Number(profile.offseason.careerYear)
    ).length;
    if (signingsThisWindow >= 2) return false;
    if ((profile.transferRoster || []).some(item => (item.playerKey || item.id) === candidateKey)) return false;
    const terms = transferGameTerms(candidate);
    return Number(profile.budget || 0) >= terms.fee;
  }

  function signTransfer(profile, candidate) {
    if (!canSignTransfer(profile, candidate)) return { ok:false, reason:'unavailable' };
    const terms = transferGameTerms(candidate);
    const sourceRating = clamp(Number(candidate?.ratings?.game_rating || 60), 35, 95);
    const sourceAge = Number(candidate?.age || candidate?.stats?.age || 0) || null;
    const careerPotential = Math.round(clamp(
      Number(candidate?.ratings?.potential || 0) ||
        sourceRating + (sourceAge && sourceAge <= 22 ? 10 : sourceAge && sourceAge <= 26 ? 6 : 3),
      sourceRating,
      95,
    ));
    const entry = {
      id:candidate.id,
      playerKey:candidate.playerKey || candidate.id,
      player:candidate.player || 'Zawodnik',
      sourceClub:candidate.club || null,
      sourceSeason:candidate.season || null,
      archetype:candidate.archetype || null,
      stats:{ ...(candidate.stats || {}) },
      sourceGameRating:sourceRating,
      careerAge:sourceAge,
      ratings:{ ...(candidate.ratings || {}), game_rating:sourceRating, potential:careerPotential },
      careerYear:Number(profile.offseason?.careerYear || profile.careerYear || 1),
      careerSeasons:0,
      lastDevelopmentDelta:0,
      contractYears:2,
      contractRemaining:2,
      contractRecurring:terms.recurring,
      contractRenewals:0,
      fee:terms.fee,
      recurring:terms.recurring,
      squadGain:terms.squadGain,
    };
    return {
      ok:true,
      terms,
      profile:{
        ...profile,
        budget:Number(profile.budget || 0) - terms.fee,
        recurring:Number(profile.recurring || 0) - terms.recurring,
        areas:applyMap(profile.areas, { squad:terms.squadGain }, AREA_KEYS, normalizedAreas),
        trust:applyMap(profile.trust, { coach:2, supporters:1 }, TRUST_KEYS, normalizedTrust),
        financeLedger:appendFinanceEntries(profile, [
          financeEntry(profile, 'squad', 'Transfer: ' + entry.player, -terms.fee, null),
        ]),
        transferRoster:[...(profile.transferRoster || []), entry],
        transferHistory:[...(profile.transferHistory || []), entry],
      },
    };
  }

  function closeTransferWindow(profile) {
    if (!profile?.offseason) return { ok:false, reason:'invalid' };
    return {
      ok:true,
      profile:{
        ...profile,
        offseason:{ ...profile.offseason, transferWindowClosed:true },
      },
    };
  }

  function competitionByLevel(level = 1) {
    const value = clamp(Math.round(Number(level ?? 1)), 0, 4);
    return COMPETITIONS[value] || COMPETITIONS[1];
  }

  function competitionMovement({ level = 1, position = 1, teamCount = 14 } = {}) {
    const current = competitionByLevel(level);
    const teams = Math.max(2, Number(teamCount || 14));
    const pos = clamp(Math.round(Number(position || teams)), 1, teams);
    let nextLevel = current.level;
    let code = 'stay';
    if (pos === 1 && current.level < 4) {
      nextLevel += 1;
      code = 'promotion';
    } else if (pos >= Math.max(2, teams - 1) && current.level > 0) {
      nextLevel -= 1;
      code = 'relegation';
    }
    const next = competitionByLevel(nextLevel);
    return {
      code,
      fromLevel:current.level,
      toLevel:next.level,
      fromLabel:current.label,
      toLabel:next.label,
      position:pos,
      teamCount:teams,
    };
  }

  function competitionMovementLabel(movement) {
    if (movement?.code === 'promotion') return 'Awans do: ' + movement.toLabel;
    if (movement?.code === 'relegation') return 'Spadek do: ' + movement.toLabel;
    return 'Pozostanie w: ' + (movement?.toLabel || competitionByLevel(1).label);
  }

  function seasonVerdict(summary = {}) {
    const position = Math.max(1, Number(summary.position || 999));
    const target = Math.max(1, Number(summary.target || 999));
    if (position === 1) return { code:'champion', icon:'🏆', label:'Mistrz ligi', tone:'champion' };
    if (position <= target) return { code:'target', icon:'✅', label:'Cel zarządu osiągnięty', tone:'success' };
    const gap = position - target;
    if (gap <= 2) return { code:'close', icon:'🟡', label:'Cel był blisko', tone:'warning' };
    return { code:'missed', icon:'⚠️', label:'Cel zarządu nieosiągnięty', tone:'danger' };
  }

  function completeSeason(profile, summary = {}) {
    if (!profile) return null;
    const record = {
      careerYear:Number(profile.careerYear || 1),
      season:String(summary.season || ''),
      club:String(summary.club || ''),
      simulated:Boolean(summary.simulated),
      position:Number(summary.position || 0),
      points:Number(summary.points || 0),
      wins:Number(summary.wins || 0),
      draws:Number(summary.draws || 0),
      losses:Number(summary.losses || 0),
      gf:Number(summary.gf || 0),
      ga:Number(summary.ga || 0),
      target:Number(summary.target || 0),
      boardConfidence:Number(summary.boardConfidence || 0),
      budget:Number(profile.budget || 0),
      averageTrust:averageTrust(profile),
      averageAreas:averageAreas(profile),
      strategy:profile.strategy || null,
      competitionLevel:Number(summary.competitionLevel ?? 1),
      competitionLabel:String(summary.competitionLabel || competitionByLevel(summary.competitionLevel ?? 1).label),
      movement:competitionMovement({
        level:Number(summary.competitionLevel ?? 1),
        position:Number(summary.position || 0),
        teamCount:Number(summary.teamCount || 14),
      }),
      verdict:seasonVerdict(summary).code,
    };
    const mandateSettlement = settleBoardMandateSeason(profile, record);
    const mandateProfile = mandateSettlement.profile;
    const beforeReputation = reputationScore(profile);
    const reputationDelta = Math.round(clamp(
      seasonReputationDelta(record) + Number(mandateSettlement.reputationDelta || 0),
      -20,
      25,
    ));
    const afterReputation = Math.round(clamp(beforeReputation + reputationDelta, 0, 100));
    const movementSupporterDelta = record.movement?.code === 'promotion'
      ? 30
      : record.movement?.code === 'relegation'
        ? -20
        : 0;
    const supporterBaseAfter = Math.round(clamp(
      supporterBaseValue(mandateProfile) + movementSupporterDelta,
      80,
      2500,
    ));
    const enrichedRecord = {
      ...record,
      mandateOutcome:mandateSettlement.outcome,
      supporterBaseDelta:movementSupporterDelta,
      supporterBaseAfter,
      reputationDelta,
      reputationAfter:afterReputation,
    };
    return {
      ...mandateProfile,
      supporterBase:supporterBaseAfter,
      reputation:afterReputation,
      reputationHistory:[...(profile.reputationHistory || []), {
        careerYear:record.careerYear,
        season:record.season,
        club:record.club,
        type:'season',
        delta:reputationDelta,
        before:beforeReputation,
        after:afterReputation,
        verdict:record.verdict,
        movement:record.movement?.code || 'stay',
      }],
      seasonsCompleted:Number(profile.seasonsCompleted || 0) + 1,
      seasonHistory:[...(profile.seasonHistory || []), enrichedRecord],
    };
  }

  function careerPlayerDevelopmentDelta(player, profile, kind = 'transfer') {
    const rating = clamp(Number(player?.ratings?.game_rating || 60), 35, 95);
    const potential = clamp(Number(player?.ratings?.potential || rating), rating, 95);
    const ageValue = Number(player?.careerAge ?? player?.age ?? 0);
    const age = Number.isFinite(ageValue) && ageValue > 0 ? ageValue : null;
    const staff = Number(profile?.areas?.staff || 50);
    const academy = Number(profile?.areas?.academy || 50);
    const headroom = Math.max(0, potential - rating);
    let delta = 0;

    if (age === null) {
      if (headroom > 0 && staff >= 70) delta = 1;
    } else if (age <= 21) {
      delta = headroom > 0 ? 1 : 0;
      if (headroom >= 2 && staff >= 60) delta += 1;
      if (kind === 'academy' && headroom >= 3 && academy >= 65) delta += 1;
    } else if (age <= 24) {
      delta = headroom > 0 ? 1 : 0;
      if (headroom >= 3 && staff >= 72) delta += 1;
    } else if (age <= 29) {
      delta = headroom >= 2 && staff >= 72 ? 1 : 0;
    } else if (age <= 32) {
      delta = staff >= 70 ? 0 : -1;
    } else {
      delta = staff >= 72 ? -1 : -2;
    }

    if (delta > 0) delta = Math.min(delta, headroom, 3);
    return Math.round(clamp(delta, -3, 3));
  }

  function developCareerPlayer(player, profile, kind, targetCareerYear) {
    const currentCareerYear = Number(profile?.careerYear || 1);
    const joinedYear = Number(
      kind === 'academy'
        ? player?.promotedCareerYear ?? currentCareerYear
        : player?.careerYear ?? currentCareerYear,
    );
    const ageValue = Number(player?.careerAge ?? player?.age ?? 0);
    const age = Number.isFinite(ageValue) && ageValue > 0 ? ageValue : null;

    // A player signed/promoted in the just-finished offseason has not spent a full season
    // in this alternate career yet, so do not award development immediately.
    if (joinedYear >= currentCareerYear) {
      return { player:{ ...player }, change:null };
    }

    const before = clamp(Number(player?.ratings?.game_rating || 60), 35, 95);
    const delta = careerPlayerDevelopmentDelta(player, profile, kind);
    const after = clamp(before + delta, 35, 95);
    const updated = {
      ...player,
      age:kind === 'academy' && age !== null ? age + 1 : player?.age,
      careerAge:age !== null ? age + 1 : null,
      careerSeasons:Number(player?.careerSeasons || 0) + 1,
      lastDevelopmentDelta:delta,
      ratings:{ ...(player?.ratings || {}), game_rating:after },
    };
    return {
      player:updated,
      change:{
        id:player?.id || player?.playerKey || player?.player,
        player:player?.player || 'Zawodnik',
        kind,
        targetCareerYear:Number(targetCareerYear || currentCareerYear + 1),
        ageBefore:age,
        ageAfter:updated.careerAge,
        ratingBefore:before,
        ratingAfter:after,
        delta,
        potential:Number(updated?.ratings?.potential || after),
      },
    };
  }

  function developCareerSquad(profile, targetCareerYear = null) {
    if (!profile) return null;
    const nextYear = Number(targetCareerYear || Number(profile.careerYear || 1) + 1);
    if ((profile.playerDevelopmentHistory || []).some(item => Number(item.targetCareerYear) === nextYear)) {
      return profile;
    }

    const academyChanges = (profile.academyRoster || []).map(player =>
      developCareerPlayer(player, profile, 'academy', nextYear)
    );
    const transferChanges = (profile.transferRoster || []).map(player =>
      developCareerPlayer(player, profile, 'transfer', nextYear)
    );
    const retainedChanges = (profile.retainedRoster || []).map(player =>
      developCareerPlayer(player, profile, 'retained', nextYear)
    );
    const changes = [...academyChanges, ...transferChanges, ...retainedChanges]
      .map(item => item.change)
      .filter(Boolean);
    const totalDelta = changes.reduce((sum, item) => sum + Number(item.delta || 0), 0);
    const squadDelta = Math.round(clamp(totalDelta / 2, -3, 3));

    return {
      ...profile,
      academyRoster:academyChanges.map(item => item.player),
      transferRoster:transferChanges.map(item => item.player),
      retainedRoster:retainedChanges.map(item => item.player),
      areas:applyMap(profile.areas, { squad:squadDelta }, AREA_KEYS, normalizedAreas),
      playerDevelopmentHistory:[...(profile.playerDevelopmentHistory || []), {
        targetCareerYear:nextYear,
        staff:Number(profile?.areas?.staff || 0),
        academy:Number(profile?.areas?.academy || 0),
        squadDelta,
        changes,
      }],
    };
  }

  function prepareNextSeason(profile, totalRounds = 0, random = Math.random) {
    if (!profile) return null;
    const nextCareerYear = Number(profile.careerYear || 1) + 1;
    const developed = developCareerSquad(profile, nextCareerYear);
    return {
      ...developed,
      careerYear:nextCareerYear,
      strategy:null,
      offseason:null,
      order:shuffle(DECISIONS.map(item => item.id), random),
      usedIds:[],
      lastUsedRound:{},
      currentDecision:null,
      decidedRound:-1,
      roundsCompleted:0,
      totalRounds:Number(totalRounds || 0),
      lastFinance:0,
      lastResult:null,
      lastMatch:null,
    };
  }

  function averageTrust(profile) {
    const trust = normalizedTrust(profile?.trust);
    return Math.round(TRUST_KEYS.reduce((sum, key) => sum + trust[key], 0) / TRUST_KEYS.length);
  }
  function averageAreas(profile) {
    const areas = normalizedAreas(profile?.areas);
    return Math.round(AREA_KEYS.reduce((sum, key) => sum + areas[key], 0) / AREA_KEYS.length);
  }
  function trustLabel(value) {
    const score = Number(value || 0);
    if (score >= 75) return 'bardzo wysokie';
    if (score >= 60) return 'wysokie';
    if (score >= 40) return 'stabilne';
    if (score >= 25) return 'niskie';
    return 'kryzysowe';
  }
  function areaLabel(value) {
    const score = Number(value || 0);
    if (score >= 75) return 'bardzo mocne';
    if (score >= 60) return 'mocne';
    if (score >= 40) return 'stabilne';
    if (score >= 25) return 'słabe';
    return 'kryzysowe';
  }
  function financeLabel(profile) {
    const budget = Number(profile?.budget || 0);
    if (budget >= 16000) return 'duża rezerwa';
    if (budget >= 8000) return 'bezpiecznie';
    if (budget >= 3000) return 'ciasno';
    if (budget >= 0) return 'bardzo ciasno';
    return 'zadłużenie';
  }
  function money(value) { return `${Math.round(Number(value || 0)).toLocaleString('pl-PL')} zł`; }

  const api = {
    TRUST_KEYS, AREA_KEYS, CATEGORY_LABELS, STRATEGIES, BOARD_MANDATES, UPGRADE_META, OFFSEASON_PLANS, CONTRACT_TEMPLATES, COMPETITIONS, COMPETITION_REQUIREMENTS, FINANCE_CATEGORIES, DECISIONS,
    initialState, strategyById, chooseStrategy, upgradeLevel, upgradeCost, canUpgrade, buyUpgrade,
    boardMandateTemplateById, canChooseBoardMandate, chooseBoardMandate, boardMandateProgress,
    boardMandateConfidenceModifier, settleBoardMandateSeason,
    boardTargetPosition, boardConfidence, boardLabel,
    reputationScore, reputationLabel, seasonReputationDelta, jobMarketLevels, jobMarketSummary,
    competitionRequirements, competitionReadiness, resolveCompetitionReadiness,
    jobOfferTerms, acceptJobOffer, normalizedJobSecurity, employmentLabel, reviewEmployment, managementWarnings,
    offseasonPlanById, offseasonSettlement, beginOffseason, canChooseOffseasonPlan, applyOffseasonPlan,
    contractTemplateById, contractConditionMet, processSeasonContracts, availableContractTemplates,
    canAcceptContract, acceptSponsorContract, skipSponsorContract,
    createAcademyProspects, academyProspectById, canPromoteAcademyProspect, promoteAcademyProspect, skipAcademyIntake,
    careerContractDefaults, normalizeCareerPlayerContract, careerContractTerms, processCareerPlayerContracts,
    currentCareerPlayerContractCase, canResolveCareerPlayerContract, resolveCareerPlayerContract,
    departureGameTerms, canResolveDeparture, resolveDeparture,
    transferGameTerms, canSignTransfer, signTransfer, closeTransferWindow,
    competitionByLevel, competitionMovement, competitionMovementLabel,
    seasonVerdict, completeSeason, careerPlayerDevelopmentDelta, developCareerPlayer, developCareerSquad, prepareNextSeason,
    decisionById, decisionRelevance, decisionTrigger, pickDecision, canChoose, applyChoice,
    normalizedTrust, normalizedAreas, managementStrengthModifier, adjustedClubStrength,
    supporterBaseValue, recentFormScore, attendanceCapacity, estimateAttendance, supporterBaseDelta,
    financeEntry, financeCategorySummary, roundFinanceBreakdown, roundFinance, applyPostRound, applyPostMatch:applyPostRound,
    averageTrust, averageAreas, trustLabel, areaLabel, financeLabel, money,
  };

  global.PresidentModeCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
