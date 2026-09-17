// Pure helpers for real-player RPG characters.
(function playerCharacterCoreFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PlayerCharacterCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function playerCharacterCore() {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function filterProfiles(profiles, { club = null, seasons = [] } = {}) {
    const allowedSeasons = new Set((seasons || []).filter(Boolean));
    return (profiles || []).filter(profile => {
      if (club && profile.club !== club) return false;
      if (allowedSeasons.size && !allowedSeasons.has(profile.season)) return false;
      return true;
    });
  }

  function metric(profile, name) {
    return Number(profile?.ratings?.[name] || 0);
  }

  function pickCandidates(profiles, count = 3, rng = Math.random) {
    const source = [...(profiles || [])];
    if (!source.length) return [];
    const reliable = source.filter(p => p.sample_reliable);
    const pool = reliable.length >= Math.min(count, 3) ? reliable : source;
    const used = new Set();
    const chosen = [];

    function takeBy(metricName) {
      const ranked = pool
        .filter(p => !used.has(p.id))
        .sort((a, b) => metric(b, metricName) - metric(a, metricName));
      if (!ranked.length) return;
      const window = ranked.slice(0, Math.min(5, ranked.length));
      const roll = clamp(Number(rng()) || 0, 0, 0.999999);
      const picked = window[Math.floor(roll * window.length)];
      used.add(picked.id);
      chosen.push(picked);
    }

    ['finishing', 'rhythm', 'experience'].forEach(name => {
      if (chosen.length < count) takeBy(name);
    });
    while (chosen.length < count) {
      const remaining = pool
        .filter(p => !used.has(p.id))
        .sort((a, b) => metric(b, 'game_rating') - metric(a, 'game_rating'));
      if (!remaining.length) break;
      used.add(remaining[0].id);
      chosen.push(remaining[0]);
    }
    return chosen;
  }

  function actionModifier(character, { kind = '', dc = 3, possession = 'player' } = {}) {
    if (!character) return 0;
    const finishing = metric(character, 'finishing') || 65;
    const rhythm = metric(character, 'rhythm') || 65;
    const experience = metric(character, 'experience') || 65;
    const discipline = metric(character, 'discipline') || 65;
    const value = String(kind || '');
    const difficulty = Number(dc || 3);
    let modifier = 0;

    if (possession === 'player') {
      if (/shot|penalty|finish|header|bomb/.test(value)) {
        modifier += (finishing - 65) / 500;
      } else if (/advance|chance|counter|corner|free_kick/.test(value)) {
        modifier += (rhythm - 65) / 850;
        if (difficulty >= 4) modifier += (experience - 65) / 1400;
      } else {
        modifier += (rhythm - 65) / 1200;
      }
    } else {
      modifier += (experience - 65) / 1050;
      if (/tackle|block|danger/.test(value)) modifier += (discipline - 65) / 1700;
      if (difficulty >= 4) modifier += (experience - 65) / 1800;
    }
    return clamp(modifier, -0.07, 0.09);
  }

  function adjustedChance(baseChance, character, context = {}) {
    return clamp(Number(baseChance || 0) + actionModifier(character, context), 0.04, 0.97);
  }

  function impactLabel(modifier) {
    const points = Math.round(Number(modifier || 0) * 100);
    if (points === 0) return '0 pp';
    return `${points > 0 ? '+' : ''}${points} pp`;
  }

  return Object.freeze({ clamp, filterProfiles, pickCandidates, actionModifier, adjustedChance, impactLabel });
}));
