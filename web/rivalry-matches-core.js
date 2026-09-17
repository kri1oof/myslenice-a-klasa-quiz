(function exposeRivalryMatchCore(root) {
  const MATCH_TYPES = new Set(['match_score']);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || 0)));
  }

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('pl-PL');
  }

  function parseScore(value) {
    const match = String(value || '').match(/^(\d+)\s*[:\-]\s*(\d+)$/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2])];
  }

  function pairKey(a, b) {
    return [String(a || ''), String(b || '')]
      .sort((x, y) => x.localeCompare(y, 'pl'))
      .join('||');
  }

  function matchQuestions(questions, club = null, opponent = null) {
    const key = club && opponent ? pairKey(club, opponent) : null;
    return (questions || []).filter(question => {
      if (!MATCH_TYPES.has(String(question?.type || ''))) return false;
      const clubs = Array.isArray(question?.clubs) ? [...new Set(question.clubs.filter(Boolean))] : [];
      if (clubs.length !== 2) return false;
      if (club && !clubs.includes(club)) return false;
      if (key && pairKey(clubs[0], clubs[1]) !== key) return false;
      return Boolean(parseScore(question.answer));
    });
  }

  function h2hProfile(questions, club, opponent) {
    const rows = matchQuestions(questions, club, opponent);
    let close = 0;
    let draws = 0;
    let goals = 0;
    for (const row of rows) {
      const score = parseScore(row.answer);
      if (!score) continue;
      const [home, away] = score;
      const diff = Math.abs(home - away);
      if (diff <= 1) close += 1;
      if (diff === 0) draws += 1;
      goals += home + away;
    }
    const matches = rows.length;
    return {
      club,
      opponent,
      matches,
      closeMatches: close,
      draws,
      closeRate: matches ? close / matches : 0,
      averageGoals: matches ? goals / matches : 0,
    };
  }

  function sameCity(clubMeta, club, opponent) {
    const a = normalize(clubMeta?.[club]?.city);
    const b = normalize(clubMeta?.[opponent]?.city);
    return Boolean(a && b && a === b && normalize(club) !== normalize(opponent));
  }

  function classify(profile, clubMeta = {}) {
    const derby = sameCity(clubMeta, profile.club, profile.opponent);
    if (derby) {
      return {
        id: 'derby',
        label: 'DERBY',
        icon: '🔥',
        pressure: 78,
        description: `Oba kluby są przypisane do tej samej miejscowości (${clubMeta?.[profile.club]?.city || 'lokalnie'}).`,
      };
    }
    if (profile.matches >= 6 && profile.closeRate >= 0.5) {
      return {
        id: 'rivalry',
        label: 'RYWALIZACJA H2H',
        icon: '⚔️',
        pressure: 70,
        description: `${profile.matches} meczów w bazie, ${profile.closeMatches} rozstrzygniętych różnicą najwyżej jednej bramki.`,
      };
    }
    if (profile.matches >= 4 && (profile.closeRate >= 0.5 || profile.draws >= 2)) {
      return {
        id: 'high_stakes',
        label: 'MECZ PODWYŻSZONEJ STAWKI',
        icon: '💥',
        pressure: 58,
        description: `${profile.matches} bezpośrednie mecze w bazie · bliskie: ${profile.closeMatches} · remisy: ${profile.draws}.`,
      };
    }
    return {
      id: 'normal',
      label: 'MECZ LIGOWY',
      icon: '🏟️',
      pressure: 35,
      description: profile.matches
        ? `${profile.matches} bezpośrednie ${profile.matches === 1 ? 'spotkanie' : 'spotkania'} w bazie.`
        : 'Brak wystarczającej historii H2H do oznaczenia dodatkowej rywalizacji.',
    };
  }

  function opponentPool(characters, club, season) {
    const seen = new Set();
    const result = [];
    for (const player of characters || []) {
      const candidate = player?.club;
      if (!candidate || candidate === club || player?.season !== season || seen.has(candidate)) continue;
      seen.add(candidate);
      result.push(candidate);
    }
    return result.sort((a, b) => a.localeCompare(b, 'pl'));
  }

  function opponentProfiles(questions, characters, clubMeta, character) {
    if (!character?.club || !character?.season) return [];
    return opponentPool(characters, character.club, character.season).map(opponent => {
      const h2h = h2hProfile(questions, character.club, opponent);
      const classification = classify(h2h, clubMeta);
      return { opponent, h2h, classification };
    });
  }

  function profileWeight(profile) {
    const id = profile?.classification?.id;
    if (id === 'derby') return 7;
    if (id === 'rivalry') return 5;
    if (id === 'high_stakes') return 3;
    return 1;
  }

  function pickOpponent(profiles, random = Math.random) {
    const list = (profiles || []).filter(Boolean);
    if (!list.length) return null;
    const weighted = list.map(profile => ({ profile, weight: profileWeight(profile) }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let cursor = clamp(random(), 0, 0.999999) * total;
    for (const item of weighted) {
      cursor -= item.weight;
      if (cursor < 0) return item.profile;
    }
    return weighted[weighted.length - 1].profile;
  }

  function pressureForContext(basePressure, context = {}) {
    let pressure = Number(basePressure || 35);
    const minute = Number(context.minute || 0);
    const scoreDiff = Math.abs(Number(context.scoreDiff || 0));
    const level = String(context.level || 'normal');
    if (minute >= 70 && scoreDiff <= 1) pressure += 8;
    if (minute >= 82 && scoreDiff === 0) pressure += 5;
    if (level === 'derby') pressure += 4;
    return clamp(pressure, 20, 95);
  }

  function updatePressure(basePressure, event = {}) {
    let next = Number(basePressure || 35);
    if (event.conceded) next += 8;
    if (event.scored) next -= 4;
    if (event.actionFailed) next += 2;
    if (event.actionSucceeded) next -= 1;
    if (event.minute >= 70 && Math.abs(Number(event.scoreDiff || 0)) <= 1) next += 2;
    return clamp(next, 20, 90);
  }

  function pressureModifier(pressure, knowledgeCorrect, action = {}, level = 'normal') {
    if (level === 'normal') return 0;
    const intensity = clamp((Number(pressure || 50) - 45) / 50, 0, 1);
    const difficulty = clamp((Number(action?.dc || 3) - 2) / 3, 0, 1);
    if (knowledgeCorrect) return 0.008 + 0.012 * intensity;
    return -(0.008 + 0.026 * intensity * (0.45 + 0.55 * difficulty));
  }

  const MOMENTS = Object.freeze([
    { id:'crowd_surge', icon:'📣', label:'Trybuny podkręcają tempo', minMinute:18, actionsLeft:2, attack:0.018, defence:-0.006 },
    { id:'hard_tackle', icon:'💢', label:'Iskrzy po ostrym wejściu', minMinute:25, actionsLeft:1, risky:-0.022, safe:0.006 },
    { id:'touchline_noise', icon:'🗣️', label:'Ławki żyją każdą decyzją', minMinute:45, actionsLeft:2, wrong:-0.018 },
    { id:'late_tension', icon:'⏱️', label:'Nerwowa końcówka', minMinute:70, actionsLeft:2, correct:0.015, wrong:-0.025, closeOnly:true },
  ]);

  function momentCandidates(context = {}, usedIds = new Set()) {
    const minute = Number(context.minute || 0);
    const close = Math.abs(Number(context.scoreDiff || 0)) <= 1;
    return MOMENTS.filter(moment =>
      minute >= moment.minMinute &&
      !usedIds.has(moment.id) &&
      (!moment.closeOnly || close)
    );
  }

  function pickMoment(context = {}, usedIds = new Set(), random = Math.random) {
    const candidates = momentCandidates(context, usedIds);
    if (!candidates.length) return null;
    const index = Math.min(candidates.length - 1, Math.floor(clamp(random(), 0, 0.999999) * candidates.length));
    return { ...candidates[index] };
  }

  function momentModifier(moment, action = {}, knowledgeCorrect = null, possession = 'player') {
    if (!moment) return 0;
    let modifier = 0;
    const dc = Number(action?.dc || 3);
    if (knowledgeCorrect === true) modifier += Number(moment.correct || 0);
    if (knowledgeCorrect === false) modifier += Number(moment.wrong || 0);
    if (dc >= 4) modifier += Number(moment.risky || 0);
    if (dc <= 2) modifier += Number(moment.safe || 0);
    if (possession === 'player') modifier += Number(moment.attack || 0);
    else modifier += Number(moment.defence || 0);
    return modifier;
  }

  function tickMoment(moment) {
    if (!moment) return null;
    const actionsLeft = Number(moment.actionsLeft || 0) - 1;
    return actionsLeft > 0 ? { ...moment, actionsLeft } : null;
  }

  function adjustedChance(baseChance, context = {}) {
    const pressure = pressureForContext(context.pressure, context);
    const pressureBonus = pressureModifier(pressure, context.knowledgeCorrect, context.action, context.level);
    const momentBonus = momentModifier(context.moment, context.action, context.knowledgeCorrect, context.possession);
    return clamp(Number(baseChance || 0) + pressureBonus + momentBonus, 0.04, 0.97);
  }

  root.RivalryMatchCore = {
    MATCH_TYPES,
    MOMENTS,
    parseScore,
    pairKey,
    matchQuestions,
    h2hProfile,
    sameCity,
    classify,
    opponentPool,
    opponentProfiles,
    profileWeight,
    pickOpponent,
    pressureForContext,
    updatePressure,
    pressureModifier,
    momentCandidates,
    pickMoment,
    momentModifier,
    tickMoment,
    adjustedChance,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
