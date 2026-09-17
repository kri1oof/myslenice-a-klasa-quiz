// Pure tactical decision model for Match RPG.
// Kept DOM-free so probability modifiers can be regression-tested in Node.
(function tacticalCoreFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TacticalDecisionCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function tacticalCore() {
  const clamp = (value, min = 0.05, max = 0.95) => Math.max(min, Math.min(max, value));

  const PROFILES = Object.freeze({
    balanced: {
      id: 'balanced', icon: '⚖️', label: 'Graj swoje',
      desc: 'Bez skrajności. Zachowujesz dotychczasowy balans ryzyka.',
      attack: 0, defence: 0, safe: 0.02, risky: 0,
    },
    control: {
      id: 'control', icon: '🧠', label: 'Kontroluj mecz',
      desc: 'Więcej cierpliwości i bezpieczniejszych decyzji, mniej forsowania trudnych zagrań.',
      attack: 0.02, defence: 0.03, safe: 0.09, risky: -0.07,
    },
    high_press: {
      id: 'high_press', icon: '🔥', label: 'Wysoki pressing',
      desc: 'Agresywnie odbierasz wysoko. Zyskujesz przy odbiorach, ale zostawiasz przestrzeń za plecami.',
      attack: 0.07, defence: 0.07, safe: -0.03, risky: 0.05, turnoverRisk: 0.07,
    },
    direct: {
      id: 'direct', icon: '🚀', label: 'Graj bezpośrednio',
      desc: 'Szybciej przenosisz ciężar gry pod bramkę. Kontry i strzały zyskują, spokojne rozegranie traci.',
      attack: 0.08, defence: -0.02, safe: -0.06, risky: 0.07,
    },
    low_block: {
      id: 'low_block', icon: '🧱', label: 'Cofnij zespół',
      desc: 'Bronisz wyniku nisko. Obrona jest pewniejsza, ale trudniej wyjść z własnej połowy.',
      attack: -0.09, defence: 0.14, safe: 0.05, risky: -0.05,
    },
    second_goal: {
      id: 'second_goal', icon: '⚔️', label: 'Idź po drugiego gola',
      desc: 'Nie bronisz wyniku. Atakujesz odważniej, kosztem zabezpieczenia tyłów.',
      attack: 0.13, defence: -0.10, safe: -0.04, risky: 0.08,
    },
    all_in: {
      id: 'all_in', icon: '🚨', label: 'Wszystko do przodu',
      desc: 'Pełne ryzyko w pogoni za wynikiem. Atak mocno zyskuje, obrona wyraźnie traci.',
      attack: 0.16, defence: -0.14, safe: -0.07, risky: 0.10,
    },
    counter: {
      id: 'counter', icon: '⚡', label: 'Czekaj na kontrę',
      desc: 'Oddajesz trochę inicjatywy, ale szybkie ataki po odbiorze stają się groźniejsze.',
      attack: 0.05, defence: 0.07, safe: 0.02, risky: 0.04,
    },
  });

  function decisionSet({ minute = 0, scoreDiff = 0 } = {}) {
    if (minute >= 72) {
      if (scoreDiff > 0) return ['low_block', 'balanced', 'second_goal'];
      if (scoreDiff < 0) return ['all_in', 'direct', 'control'];
      return ['high_press', 'balanced', 'counter'];
    }
    if (minute >= 50) {
      if (scoreDiff > 0) return ['control', 'balanced', 'second_goal'];
      if (scoreDiff < 0) return ['high_press', 'direct', 'balanced'];
      return ['control', 'high_press', 'direct'];
    }
    return ['control', 'high_press', 'direct'];
  }

  function isAttackingKind(kind = '') {
    const value = String(kind);
    return /shot|advance|chance|counter|penalty|corner|free_kick|laser|bomb|golden/.test(value) && !/defend/.test(value);
  }

  function isDefendingKind(kind = '') {
    return /defend|danger|block|tackle|bus|gegenpress/.test(String(kind));
  }

  function modifier({ profileId = 'balanced', possession = 'player', kind = '', dc = 3 } = {}) {
    const profile = PROFILES[profileId] || PROFILES.balanced;
    let value = possession === 'player' || isAttackingKind(kind) ? profile.attack : profile.defence;
    if (isDefendingKind(kind)) value = profile.defence;
    if (Number(dc) <= 2) value += profile.safe || 0;
    if (Number(dc) >= 4) value += profile.risky || 0;
    return value;
  }

  function adjustedChance(baseChance, context = {}) {
    return clamp(Number(baseChance || 0) + modifier(context));
  }

  return Object.freeze({ PROFILES, clamp, decisionSet, modifier, adjustedChance });
}));
