// Pure helpers for Match RPG substitutions.
(function substitutionCoreFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SubstitutionCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function substitutionCore() {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function windowForMinute(minute) {
    const value = Number(minute || 0);
    if (value >= 72 && value < 90) return 'late';
    if (value >= 55 && value < 72) return 'middle';
    return null;
  }

  function canOffer({ minute = 0, usedCount = 0, resolvedBands = [], maxChanges = 2 } = {}) {
    if (Number(usedCount || 0) >= Number(maxChanges || 2)) return null;
    const band = windowForMinute(minute);
    if (!band) return null;
    const resolved = resolvedBands instanceof Set ? resolvedBands : new Set(resolvedBands || []);
    return resolved.has(band) ? null : band;
  }

  function benchScore(profile) {
    const stats = profile?.stats || {};
    const ratings = profile?.ratings || {};
    const appearances = Number(stats.appearances || 0);
    const starts = Number(stats.starts || 0);
    const subEntries = Number(stats.sub_entries || 0);
    const nonStarts = Math.max(0, appearances - starts);
    const rhythm = Number(ratings.rhythm || 0);
    const overall = Number(ratings.game_rating || 0);
    const reliability = profile?.sample_reliable ? 16 : 0;
    return (subEntries * 13) + (nonStarts * 5) + (rhythm * 0.22) + (overall * 0.12) + reliability;
  }

  function eligibleCandidates(profiles, active, usedIds = []) {
    if (!active) return [];
    const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);
    return (profiles || []).filter(profile => {
      if (!profile || !profile.id || profile.id === active.id || used.has(profile.id)) return false;
      if (profile.club !== active.club || profile.season !== active.season) return false;
      return Number(profile?.stats?.appearances || 0) > 0;
    });
  }

  function metric(profile, name) {
    return Number(profile?.ratings?.[name] || 0);
  }

  function pickCandidates(profiles, active, usedIds = [], count = 3, rng = Math.random) {
    const pool = eligibleCandidates(profiles, active, usedIds);
    if (!pool.length) return [];
    const selected = [];
    const selectedIds = new Set();

    function take(sorter) {
      const ranked = pool.filter(p => !selectedIds.has(p.id)).sort(sorter);
      if (!ranked.length) return;
      const window = ranked.slice(0, Math.min(5, ranked.length));
      const roll = clamp(Number(rng()) || 0, 0, 0.999999);
      const choice = window[Math.floor(roll * window.length)];
      selected.push(choice);
      selectedIds.add(choice.id);
    }

    take((a, b) => benchScore(b) - benchScore(a));
    if (selected.length < count) take((a, b) => metric(b, 'rhythm') - metric(a, 'rhythm'));
    if (selected.length < count) take((a, b) => metric(b, 'game_rating') - metric(a, 'game_rating'));
    while (selected.length < count) {
      const remaining = pool
        .filter(p => !selectedIds.has(p.id))
        .sort((a, b) => benchScore(b) - benchScore(a));
      if (!remaining.length) break;
      selected.push(remaining[0]);
      selectedIds.add(remaining[0].id);
    }
    return selected;
  }

  function knowledgeEffect(correct) {
    return correct
      ? { bonus: 0.06, actionsLeft: 2, tone: 'good', label: 'świeże wejście' }
      : { bonus: -0.03, actionsLeft: 1, tone: 'bad', label: 'trudne wejście' };
  }

  function adjustedChance(baseChance, effect) {
    const base = Number(baseChance || 0);
    if (!effect || Number(effect.actionsLeft || 0) <= 0) return clamp(base, 0.04, 0.97);
    return clamp(base + Number(effect.bonus || 0), 0.04, 0.97);
  }

  function tickEffect(effect) {
    if (!effect) return null;
    const left = Math.max(0, Number(effect.actionsLeft || 0) - 1);
    if (!left) return null;
    return { ...effect, actionsLeft: left };
  }

  function effectLabel(effect) {
    if (!effect || Number(effect.actionsLeft || 0) <= 0) return '';
    const points = Math.round(Number(effect.bonus || 0) * 100);
    const sign = points > 0 ? '+' : '';
    const actionWord = Number(effect.actionsLeft) === 1 ? 'akcję' : 'akcje';
    return `${sign}${points} pp przez ${effect.actionsLeft} ${actionWord}`;
  }

  return Object.freeze({
    clamp,
    windowForMinute,
    canOffer,
    benchScore,
    eligibleCandidates,
    pickCandidates,
    knowledgeEffect,
    adjustedChance,
    tickEffect,
    effectLabel,
  });
}));
