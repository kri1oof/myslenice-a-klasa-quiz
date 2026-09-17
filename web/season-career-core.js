(function exposeSeasonCareerCore(root) {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || 0)));
  }

  function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function clubsForSeason(characters, questions, season) {
    const fromCharacters = unique((characters || [])
      .filter(player => player?.season === season)
      .map(player => player.club))
      .sort((a, b) => a.localeCompare(b, 'pl'));
    if (fromCharacters.length >= 6) return fromCharacters;

    return unique((questions || [])
      .filter(question => question?.season === season)
      .flatMap(question => Array.isArray(question.clubs) ? question.clubs : []))
      .sort((a, b) => a.localeCompare(b, 'pl'));
  }

  function roundRobin(clubs) {
    const teams = unique(clubs);
    if (teams.length < 2) return [];
    const working = [...teams];
    if (working.length % 2) working.push(null);
    const size = working.length;
    const fixed = working[0];
    let rotating = working.slice(1);
    const firstLeg = [];

    for (let round = 0; round < size - 1; round += 1) {
      const order = [fixed, ...rotating];
      const fixtures = [];
      for (let i = 0; i < size / 2; i += 1) {
        let a = order[i];
        let b = order[size - 1 - i];
        if (!a || !b) continue;
        if ((round + i) % 2 === 1) [a, b] = [b, a];
        fixtures.push({ round: round + 1, leg: 1, home: a, away: b });
      }
      firstLeg.push(fixtures);
      rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
    }

    const secondLeg = firstLeg.map((fixtures, index) => fixtures.map(fixture => ({
      round: firstLeg.length + index + 1,
      leg: 2,
      home: fixture.away,
      away: fixture.home,
    })));
    return [...firstLeg, ...secondLeg];
  }

  function createTable(clubs) {
    const table = {};
    unique(clubs).forEach(club => {
      table[club] = { club, played:0, wins:0, draws:0, losses:0, gf:0, ga:0, points:0 };
    });
    return table;
  }

  function cloneTable(table) {
    return Object.fromEntries(Object.entries(table || {}).map(([club, row]) => [club, { ...row }]));
  }

  function applyResult(table, fixture, homeGoals, awayGoals) {
    const next = cloneTable(table);
    if (!fixture?.home || !fixture?.away || !next[fixture.home] || !next[fixture.away]) return next;
    const hg = Math.max(0, Math.round(Number(homeGoals || 0)));
    const ag = Math.max(0, Math.round(Number(awayGoals || 0)));
    const home = next[fixture.home];
    const away = next[fixture.away];
    home.played += 1; away.played += 1;
    home.gf += hg; home.ga += ag;
    away.gf += ag; away.ga += hg;
    if (hg > ag) {
      home.wins += 1; home.points += 3; away.losses += 1;
    } else if (hg < ag) {
      away.wins += 1; away.points += 3; home.losses += 1;
    } else {
      home.draws += 1; away.draws += 1; home.points += 1; away.points += 1;
    }
    return next;
  }

  function standings(table) {
    return Object.values(table || {})
      .map(row => ({ ...row, gd: Number(row.gf || 0) - Number(row.ga || 0) }))
      .sort((a, b) =>
        Number(b.points || 0) - Number(a.points || 0) ||
        Number(b.gd || 0) - Number(a.gd || 0) ||
        Number(b.gf || 0) - Number(a.gf || 0) ||
        String(a.club).localeCompare(String(b.club), 'pl')
      );
  }

  function position(table, club) {
    const rows = standings(table);
    const index = rows.findIndex(row => row.club === club);
    return index >= 0 ? index + 1 : null;
  }

  function clubStrength(characters, club, season) {
    const ratings = (characters || [])
      .filter(player => player?.club === club && player?.season === season)
      .map(player => Number(player?.ratings?.game_rating ?? player?.game_rating ?? 0))
      .filter(value => Number.isFinite(value) && value > 0)
      .sort((a, b) => b - a);
    if (!ratings.length) return 65;
    const sample = ratings.slice(0, Math.min(14, ratings.length));
    return sample.reduce((sum, value) => sum + value, 0) / sample.length;
  }

  function strengthMap(characters, clubs, season) {
    return Object.fromEntries(unique(clubs).map(club => [club, clubStrength(characters, club, season)]));
  }

  function hashSeed(value) {
    let hash = 2166136261;
    for (const ch of String(value || '')) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = hashSeed(seed) || 1;
    return function random() {
      state = Math.imul(1664525, state) + 1013904223 >>> 0;
      return state / 4294967296;
    };
  }

  function poisson(lambda, random) {
    const limit = Math.exp(-Math.max(0.15, lambda));
    let product = 1;
    let count = 0;
    while (product > limit && count < 8) {
      count += 1;
      product *= random();
    }
    return Math.max(0, count - 1);
  }

  function simulateFixture(fixture, strengths = {}, seed = '') {
    const homeStrength = Number(strengths?.[fixture.home] ?? 65);
    const awayStrength = Number(strengths?.[fixture.away] ?? 65);
    const diff = clamp((homeStrength - awayStrength) / 18, -1.2, 1.2);
    const random = seededRandom(`${seed}|${fixture.round}|${fixture.home}|${fixture.away}`);
    const homeLambda = clamp(1.35 + diff * 0.42, 0.45, 2.55);
    const awayLambda = clamp(1.05 - diff * 0.36, 0.35, 2.35);
    return {
      home: fixture.home,
      away: fixture.away,
      homeGoals: Math.min(6, poisson(homeLambda, random)),
      awayGoals: Math.min(6, poisson(awayLambda, random)),
      simulated: true,
    };
  }

  function userResultForFixture(fixture, club, userGoals, opponentGoals) {
    if (!fixture || !club) return null;
    const ug = Math.max(0, Math.round(Number(userGoals || 0)));
    const og = Math.max(0, Math.round(Number(opponentGoals || 0)));
    if (fixture.home === club) {
      return { home:fixture.home, away:fixture.away, homeGoals:ug, awayGoals:og, simulated:false };
    }
    return { home:fixture.home, away:fixture.away, homeGoals:og, awayGoals:ug, simulated:false };
  }

  function resultCode(userGoals, opponentGoals) {
    if (Number(userGoals) > Number(opponentGoals)) return 'W';
    if (Number(userGoals) < Number(opponentGoals)) return 'L';
    return 'D';
  }

  function objective(teamCount) {
    const teams = Math.max(2, Number(teamCount || 0));
    const targetPosition = Math.max(3, Math.ceil(teams / 2));
    return {
      targetPosition,
      label: `Górna połowa tabeli · TOP ${targetPosition}`,
    };
  }

  function developmentXp({ correct = 0, answered = 0, result = 'D' } = {}) {
    const accuracy = answered > 0 ? clamp(correct / answered, 0, 1) : 0;
    const resultBonus = result === 'W' ? 4 : result === 'D' ? 2 : 0;
    return 2 + Math.round(accuracy * 6) + resultBonus;
  }

  function levelForXp(xp) {
    const value = Math.max(0, Number(xp || 0));
    if (value >= 108) return 5;
    if (value >= 72) return 4;
    if (value >= 42) return 3;
    if (value >= 18) return 2;
    return 1;
  }

  function developmentBonus(record) {
    const level = levelForXp(record?.xp || 0);
    return (level - 1) * 0.006;
  }

  function addDevelopment(development, playerIds, xp) {
    const next = Object.fromEntries(Object.entries(development || {}).map(([id, row]) => [id, { ...row }]));
    unique(playerIds).forEach(id => {
      const previous = next[id] || { xp:0, matches:0 };
      const totalXp = Number(previous.xp || 0) + Math.max(0, Number(xp || 0));
      next[id] = {
        xp: totalXp,
        matches: Number(previous.matches || 0) + 1,
        level: levelForXp(totalXp),
      };
    });
    return next;
  }

  function adjustChance(baseChance, developmentRecord) {
    return clamp(Number(baseChance || 0) + developmentBonus(developmentRecord), 0.04, 0.97);
  }

  function nextUserFixture(rounds, startIndex, club) {
    for (let index = Math.max(0, Number(startIndex || 0)); index < (rounds || []).length; index += 1) {
      const fixture = (rounds[index] || []).find(item => item.home === club || item.away === club);
      if (fixture) return { index, fixture };
    }
    return null;
  }

  root.SeasonCareerCore = Object.freeze({
    clamp,
    clubsForSeason,
    roundRobin,
    createTable,
    applyResult,
    standings,
    position,
    clubStrength,
    strengthMap,
    seededRandom,
    simulateFixture,
    userResultForFixture,
    resultCode,
    objective,
    developmentXp,
    levelForXp,
    developmentBonus,
    addDevelopment,
    adjustChance,
    nextUserFixture,
  });
}(typeof globalThis !== 'undefined' ? globalThis : this));
