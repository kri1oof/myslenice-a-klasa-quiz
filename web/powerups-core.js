(function exposePowerupCore(root) {
  const POWERUPS = Object.freeze({
    ace: Object.freeze({
      id: 'ace', icon: '🎯', label: 'As w rękawie', scope: 'any', bonus: 0.10,
      desc: '+10 pp do szansy wykonania następnej akcji.',
    }),
    attack: Object.freeze({
      id: 'attack', icon: '⚡', label: 'Zryw', scope: 'attack', bonus: 0.14,
      desc: '+14 pp do następnej akcji, gdy atakujesz.',
    }),
    defense: Object.freeze({
      id: 'defense', icon: '🛡️', label: 'Mur', scope: 'defense', bonus: 0.14,
      desc: '+14 pp do następnej akcji, gdy bronisz.',
    }),
    second_ball: Object.freeze({
      id: 'second_ball', icon: '🔁', label: 'Druga piłka', scope: 'any', bonus: 0,
      desc: 'Po nieudanym wykonaniu dostajesz jeden ponowny rzut z 70% pierwotnej szansy.',
      reroll: true,
    }),
  });

  function clamp(value, min = 0.04, max = 0.97) {
    return Math.max(min, Math.min(max, Number(value || 0)));
  }

  function card(cardId) {
    return POWERUPS[cardId] || null;
  }

  function isEligible(cardId, { possession = 'player' } = {}) {
    const item = card(cardId);
    if (!item) return false;
    if (item.scope === 'attack') return possession === 'player';
    if (item.scope === 'defense') return possession === 'opponent';
    return true;
  }

  function drawHand(count = 3, rng = Math.random) {
    const ids = Object.keys(POWERUPS);
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const raw = Number(rng());
      const safe = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
      const pick = Math.floor(safe * (index + 1));
      [ids[index], ids[pick]] = [ids[pick], ids[index]];
    }
    return ids.slice(0, Math.max(0, Math.min(ids.length, Number(count || 0))));
  }

  function usedSet(usedIds) {
    if (usedIds instanceof Set) return usedIds;
    return new Set(Array.isArray(usedIds) ? usedIds : []);
  }

  function canActivate({
    cardId,
    hand = [],
    usedIds = new Set(),
    activeCard = null,
    lockedCard = null,
    possession = 'player',
  } = {}) {
    if (!card(cardId) || !hand.includes(cardId)) return false;
    if (usedSet(usedIds).has(cardId) || lockedCard) return false;
    if (activeCard && activeCard !== cardId) return false;
    return isEligible(cardId, { possession });
  }

  function chanceBonus(cardId, context = {}) {
    const item = card(cardId);
    if (!item || !isEligible(cardId, context)) return 0;
    return Number(item.bonus || 0);
  }

  function adjustedChance(base, cardId, context = {}) {
    return clamp(Number(base || 0) + chanceBonus(cardId, context));
  }

  function rerollChance(originalChance, cardId) {
    const item = card(cardId);
    if (!item?.reroll) return null;
    return clamp(Number(originalChance || 0) * 0.70, 0.04, 0.80);
  }

  function impactLabel(cardId, context = {}) {
    const item = card(cardId);
    if (!item) return '';
    if (item.reroll) return 'drugi rzut po pudle';
    const bonus = chanceBonus(cardId, context);
    return bonus ? `+${Math.round(bonus * 100)} pp` : 'bez efektu w tej sytuacji';
  }

  const api = {
    POWERUPS,
    card,
    clamp,
    isEligible,
    drawHand,
    canActivate,
    chanceBonus,
    adjustedChance,
    rerollChance,
    impactLabel,
  };

  root.PowerupCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
