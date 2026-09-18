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

  function initialState(totalRounds = 0, random = Math.random) {
    return {
      active:true,
      budget:12000,
      recurring:0,
      careerYear:1,
      seasonsCompleted:0,
      seasonHistory:[],
      offseason:null,
      offseasonHistory:[],
      transferRoster:[],
      transferHistory:[],
      departedPlayerKeys:[],
      departureHistory:[],
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
        history:[...(profile.history || []), {
          round:Number(roundIndex) + 1, careerYear:Number(profile.careerYear || 1), type:'investment', category:area,
          title:'Inwestycja: ' + (meta?.label || area), choice:'Poziom ' + (level + 1),
          result:'Stały rozwój obszaru: +' + gain + '.', budgetDelta:-cost, recurringDelta:0,
          trustDelta:{}, areaDelta:{ [area]:gain },
        }],
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
    return Math.round(clamp(performance * .38 + finance * .20 + club * .22 + trust * .20 + strategyBonus, 0, 100));
  }
  function boardLabel(value) {
    const score = Number(value || 0);
    if (score >= 80) return 'pełne poparcie';
    if (score >= 65) return 'mocna pozycja';
    if (score >= 45) return 'cierpliwość zarządu';
    if (score >= 30) return 'narastająca presja';
    return 'kryzys zaufania';
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
  function pickDecision(profile, roundIndex = 0) {
    const used = new Set(profile?.usedIds || []);
    const order = Array.isArray(profile?.order) && profile.order.length ? profile.order : DECISIONS.map(item => item.id);
    const fresh = order.find(id => !used.has(id));
    if (fresh) return decisionById(fresh);
    const lastUsed = profile?.lastUsedRound || {};
    const candidates = DECISIONS
      .map(item => ({ item, last:Number(lastUsed[item.id] ?? -999) }))
      .sort((a,b) => a.last - b.last || a.item.id.localeCompare(b.item.id));
    const rested = candidates.find(row => Number(roundIndex) - row.last >= 4);
    return (rested || candidates[0])?.item || null;
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

  function roundFinance(profile, { venue = 'DOM', result = 'D' } = {}) {
    const trust = normalizedTrust(profile?.trust);
    const areas = normalizedAreas(profile?.areas);
    const venueBase = String(venue).toUpperCase() === 'DOM' ? 620 : -320;
    const resultBonus = result === 'W' ? 150 : result === 'D' ? 50 : 0;
    const supporterEffect = String(venue).toUpperCase() === 'DOM' ? Math.round((trust.supporters - 50) * 4) : 0;
    const sponsorEffect = Math.round((trust.sponsors - 50) * 2.5);
    const organizationEffect = Math.round((areas.organization - 50) * 2);
    return Math.round(Number(profile?.recurring || 0) + venueBase + resultBonus + supporterEffect + sponsorEffect + organizationEffect);
  }
  function postRoundTrustDelta(result) {
    if (result === 'W') return { players:1, coach:1, supporters:2, sponsors:1 };
    if (result === 'L') return { players:-1, coach:-1, supporters:-2, sponsors:-1 };
    return { players:0, coach:0, supporters:0, sponsors:0 };
  }
  function applyPostRound(profile, context = {}) {
    if (!profile) return null;
    const finance = roundFinance(profile, context);
    return {
      ...profile,
      budget:Number(profile.budget || 0) + finance,
      trust:applyMap(profile.trust, postRoundTrustDelta(context.result), TRUST_KEYS, normalizedTrust),
      roundsCompleted:Number(profile.roundsCompleted || 0) + 1,
      lastFinance:finance,
      lastResult:context.result || null,
      lastMatch:context.match ? { ...context.match } : null,
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
      return { ok:true, profile, offseason:profile.offseason, reused:true };
    }
    const settlement = offseasonSettlement(profile);
    if (!settlement) return { ok:false, reason:'settlement' };
    const offseason = {
      careerYear:Number(season.careerYear || profile.careerYear || 1),
      season:season.season,
      settlement,
      planId:null,
      planLabel:null,
      planResult:null,
      transferWindowClosed:false,
      marketIds:[],
      departureResolved:false,
      departureCase:null,
    };
    return {
      ok:true,
      offseason,
      profile:{
        ...profile,
        budget:settlement.budgetAfter,
        offseason,
      },
    };
  }

  function canChooseOffseasonPlan(profile, plan) {
    return Boolean(
      profile?.offseason &&
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
    if (!profile?.offseason || profile.offseason.departureResolved || !candidate?.playerKey) return false;
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
    const entry = {
      id:candidate.id,
      playerKey:candidate.playerKey || candidate.id,
      player:candidate.player || 'Zawodnik',
      sourceClub:candidate.club || null,
      sourceSeason:candidate.season || null,
      archetype:candidate.archetype || null,
      stats:{ ...(candidate.stats || {}) },
      ratings:{ ...(candidate.ratings || {}) },
      careerYear:Number(profile.offseason?.careerYear || profile.careerYear || 1),
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
    return {
      ...profile,
      seasonsCompleted:Number(profile.seasonsCompleted || 0) + 1,
      seasonHistory:[...(profile.seasonHistory || []), record],
    };
  }

  function prepareNextSeason(profile, totalRounds = 0, random = Math.random) {
    if (!profile) return null;
    return {
      ...profile,
      careerYear:Number(profile.careerYear || 1) + 1,
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
    TRUST_KEYS, AREA_KEYS, CATEGORY_LABELS, STRATEGIES, UPGRADE_META, OFFSEASON_PLANS, COMPETITIONS, DECISIONS,
    initialState, strategyById, chooseStrategy, upgradeLevel, upgradeCost, canUpgrade, buyUpgrade,
    boardTargetPosition, boardConfidence, boardLabel, normalizedJobSecurity, employmentLabel, reviewEmployment, managementWarnings,
    offseasonPlanById, offseasonSettlement, beginOffseason, canChooseOffseasonPlan, applyOffseasonPlan,
    departureGameTerms, canResolveDeparture, resolveDeparture,
    transferGameTerms, canSignTransfer, signTransfer, closeTransferWindow,
    competitionByLevel, competitionMovement, competitionMovementLabel,
    seasonVerdict, completeSeason, prepareNextSeason,
    decisionById, pickDecision, canChoose, applyChoice,
    normalizedTrust, normalizedAreas, managementStrengthModifier, adjustedClubStrength,
    roundFinance, applyPostRound, applyPostMatch:applyPostRound,
    averageTrust, averageAreas, trustLabel, areaLabel, financeLabel, money,
  };

  global.PresidentModeCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
