(function (global) {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function scoreText(playerGoals, opponentGoals) {
    return `${Number(playerGoals || 0)}:${Number(opponentGoals || 0)}`;
  }

  function zoneLabel(zone) {
    return ['własnym polu karnym', 'własnej połowie', 'środku pola', 'strefie ataku', 'polu karnym rywala'][clamp(zone, 0, 4)];
  }

  function stableIndex(seed, length) {
    if (!length) return 0;
    const text = String(seed || 'a-klasa');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash) % length;
  }

  function pick(items, seed) {
    return items[stableIndex(seed, items.length)] || items[0] || '';
  }

  function intensity(ctx) {
    const minute = Number(ctx.minute || 0);
    const diff = Math.abs(Number(ctx.playerGoalsAfter || 0) - Number(ctx.opponentGoalsAfter || 0));
    if (minute >= 80 && diff <= 1) return 'late_close';
    if (ctx.rivalryType === 'derby') return 'derby';
    if (ctx.rivalryType === 'rivalry' || ctx.rivalryType === 'high_stakes') return 'rivalry';
    return 'normal';
  }

  function openingLine(ctx) {
    const opponent = ctx.opponentClub ? ` Rywal: ${ctx.opponentClub}.` : '';
    if (ctx.rivalryType === 'derby') return `Derby. Tu każda piłka waży trochę więcej.${opponent}`;
    if (ctx.rivalryType === 'rivalry') return `Znów spotykają się dobrze znani rywale.${opponent}`;
    return `Pierwszy gwizdek. Gramy cierpliwie i szukamy swoich momentów.${opponent}`;
  }

  function decisionLine(ctx) {
    const label = String(ctx.actionLabel || 'zagranie');
    if (ctx.possession === 'opponent') return `Decyzja w obronie: ${label}. Teraz test wiedzy rozstrzygnie, ile daje ta decyzja.`;
    return `Wybrane zagranie: ${label}. Wiedza daje przewagę, ale wykonanie nadal trzeba dowieźć.`;
  }

  function outcomeLine(ctx) {
    const beforePlayer = Number(ctx.playerGoalsBefore || 0);
    const afterPlayer = Number(ctx.playerGoalsAfter || 0);
    const beforeOpponent = Number(ctx.opponentGoalsBefore || 0);
    const afterOpponent = Number(ctx.opponentGoalsAfter || 0);
    const scored = afterPlayer > beforePlayer;
    const conceded = afterOpponent > beforeOpponent;
    const score = scoreText(afterPlayer, afterOpponent);
    const label = String(ctx.actionLabel || 'Akcja');
    const minute = Number(ctx.minute || 0);
    const seed = `${minute}|${label}|${score}|${ctx.success}|${ctx.knowledgeCorrect}`;
    const mood = intensity(ctx);

    if (scored) {
      const who = ctx.playerName ? `${ctx.playerName}! ` : '';
      return pick([
        `GOOOL! ${who}${label} kończy się bramką. Jest ${score}.`,
        `Jest trafienie! ${who}Ta akcja miała sens od pierwszego podania. ${score}.`,
        `Piłka w siatce! ${who}W A-klasie nie ma VAR-u od urody — liczy się wynik: ${score}.`,
      ], seed);
    }

    if (conceded) {
      return pick([
        `Gol dla rywala. Jedna nieudana decyzja i robi się ${score}.`,
        `Rywal wykorzystuje moment. Tablica pokazuje ${score}. Trzeba odpowiedzieć następną akcją.`,
        `Niestety, piłka wpada do naszej bramki. ${score} i mecz zaczyna pisać nowy scenariusz.`,
      ], seed);
    }

    if (ctx.success) {
      if (ctx.possessionBefore === 'opponent') {
        return pick([
          `Dobra robota w obronie. ${label} zatrzymuje zagrożenie.`,
          `Czytelnie i skutecznie. Rywal traci przewagę w tej akcji.`,
          `To jest potrzebna interwencja. Piłka zostaje opanowana bez paniki.`,
        ], seed);
      }
      const base = pick([
        `${label} działa. Akcja przesuwa się do ${zoneLabel(ctx.zoneAfter)}.`,
        `Dobre tempo. ${label} daje kolejny metr i lepszą pozycję.`,
        `Udane zagranie. Piłka zostaje przy nas i sytuacja wygląda coraz ciekawiej.`,
      ], seed);
      if (mood === 'late_close') return `${base} Końcówka, więc teraz każdy detal ma znaczenie.`;
      if (mood === 'derby') return `${base} W derbach trybuny czują takie momenty od razu.`;
      return base;
    }

    if (ctx.knowledgeCorrect) {
      return pick([
        `Wiedza była dobra, ale boisko zrobiło swoje. ${label} tym razem nie wychodzi.`,
        `Dobra odpowiedź dała przewagę, nie gwarancję. Futbol mówi „nie” tej akcji.`,
        `Test zdany, wykonanie nie. To właśnie ten margines nieprzewidywalności meczu.`,
      ], seed);
    }

    if (ctx.possessionBefore === 'opponent') {
      return pick([
        `Nie udało się zatrzymać akcji. Rywal dostaje więcej miejsca.`,
        `Spóźniona reakcja. Teraz trzeba bronić jeszcze bliżej własnej bramki.`,
        `Rywal przechodzi ten fragment gry i podkręca presję.`,
      ], seed);
    }

    return pick([
      `${label} nie wychodzi. Strata i trzeba szybko wracać do ustawienia.`,
      `Tym razem za dużo ryzyka. Piłka przechodzi na stronę rywala.`,
      `Akcja się urywa. A-klasa przypomina, że prostsze rozwiązanie czasem żyje dłużej.`,
    ], seed);
  }

  function finishLine(ctx) {
    const player = Number(ctx.playerGoals || 0);
    const opponent = Number(ctx.opponentGoals || 0);
    const score = scoreText(player, opponent);
    if (player > opponent) return `Koniec! ${score}. Trzy punkty wypracowane decyzjami i wiedzą.`;
    if (player < opponent) return `Koniec meczu: ${score}. Były momenty, ale rywal lepiej wykorzystał swoje.`;
    return `Końcowy gwizdek przy ${score}. Nikt nie odpuścił, nikt nie zabrał pełnej puli.`;
  }

  const api = Object.freeze({
    scoreText,
    zoneLabel,
    intensity,
    openingLine,
    decisionLine,
    outcomeLine,
    finishLine,
  });

  global.MatchCommentatorCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
