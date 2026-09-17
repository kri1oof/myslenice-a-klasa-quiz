// Pure tactical decision model for Match RPG.
// DOM-free so modifiers and decision sets can be regression-tested in Node.
(function tacticalCoreFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TacticalDecisionCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function tacticalCore() {
  const clamp = (value, min = 0.05, max = 0.95) => Math.max(min, Math.min(max, value));

  const PROFILES = Object.freeze({
    balanced: { id:'balanced', icon:'⚖️', label:'Graj swoje', desc:'Bez skrajności. Zachowujesz dotychczasowy balans ryzyka.', attack:0, defence:0, safe:0.02, risky:0 },
    control: { id:'control', icon:'🧠', label:'Kontroluj mecz', desc:'Więcej cierpliwości i bezpiecznych decyzji, mniej forsowania trudnych zagrań.', attack:0.02, defence:0.03, safe:0.09, risky:-0.07 },
    high_press: { id:'high_press', icon:'🔥', label:'Wysoki pressing', desc:'Agresywnie odbierasz wysoko. Zyskujesz przy odbiorach, ale zostawiasz przestrzeń za plecami.', attack:0.07, defence:0.07, safe:-0.03, risky:0.05 },
    direct: { id:'direct', icon:'🚀', label:'Graj bezpośrednio', desc:'Szybciej przenosisz ciężar gry pod bramkę. Kontry i strzały zyskują, spokojne rozegranie traci.', attack:0.08, defence:-0.02, safe:-0.06, risky:0.07 },
    low_block: { id:'low_block', icon:'🧱', label:'Cofnij zespół', desc:'Bronisz wyniku nisko. Obrona jest pewniejsza, ale trudniej wyjść z własnej połowy.', attack:-0.09, defence:0.14, safe:0.05, risky:-0.05 },
    second_goal: { id:'second_goal', icon:'⚔️', label:'Idź po drugiego gola', desc:'Nie bronisz wyniku. Atakujesz odważniej, kosztem zabezpieczenia tyłów.', attack:0.13, defence:-0.10, safe:-0.04, risky:0.08 },
    all_in: { id:'all_in', icon:'🚨', label:'Wszystko do przodu', desc:'Pełne ryzyko w pogoni za wynikiem. Atak mocno zyskuje, obrona wyraźnie traci.', attack:0.16, defence:-0.14, safe:-0.07, risky:0.10 },
    counter: { id:'counter', icon:'⚡', label:'Czekaj na kontrę', desc:'Oddajesz trochę inicjatywy, ale szybkie ataki po odbiorze stają się groźniejsze.', attack:0.05, defence:0.07, safe:0.02, risky:0.04 },
  });

  function decisionBand(minute = 0) {
    if (minute >= 72) return 'late';
    if (minute >= 50) return 'second_half';
    if (minute >= 24) return 'first_half';
    return null;
  }

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

  function decisionHeadline({ minute = 0, scoreDiff = 0 } = {}) {
    if (minute >= 72 && scoreDiff > 0) return 'Jak bronisz prowadzenia?';
    if (minute >= 72 && scoreDiff < 0) return 'Musisz gonić wynik. Co zmieniasz?';
    if (minute >= 72) return 'Końcówka na styku. Jaki plan na ostatnie minuty?';
    if (minute >= 50 && scoreDiff > 0) return 'Prowadzisz po przerwie. Jak zarządzasz meczem?';
    if (minute >= 50 && scoreDiff < 0) return 'Po przerwie trzeba odwrócić mecz.';
    if (minute >= 50) return 'Druga połowa. W którą stronę przesuwasz ryzyko?';
    return 'Pierwsza narada taktyczna. Jak chcesz prowadzić ten mecz?';
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

  function questionShift({ profileId = 'balanced', possession = 'player', kind = '', dc = 3 } = {}) {
    const hard = Number(dc) >= 4;
    const safe = Number(dc) <= 2;
    const attack = possession === 'player' || isAttackingKind(kind);
    const defence = possession === 'opponent' || isDefendingKind(kind);
    if (profileId === 'control') return safe ? -1 : (hard ? 1 : 0);
    if (profileId === 'high_press') return defence && hard ? -1 : (safe ? 1 : 0);
    if (profileId === 'direct') return attack && hard ? -1 : (safe ? 1 : 0);
    if (profileId === 'low_block') return defence ? -1 : (attack ? 1 : 0);
    if (profileId === 'second_goal' || profileId === 'all_in') return attack ? -1 : (defence ? 1 : 0);
    if (profileId === 'counter') return /counter|tackle|defend/.test(String(kind)) ? -1 : 0;
    return 0;
  }

  function adjustedChance(baseChance, context = {}) {
    return clamp(Number(baseChance || 0) + modifier(context));
  }

  return Object.freeze({ PROFILES, clamp, decisionBand, decisionSet, decisionHeadline, modifier, questionShift, adjustedChance });
}));
