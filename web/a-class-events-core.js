// Pure helpers for contextual A-class match events.
(function aClassEventsCoreFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AClassEventsCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function aClassEventsCore() {
  const PREMATCH_IDS = new Set([
    'no_linesman',
    'late_player',
    'locked_dressing_room',
    'missing_protocol',
    'forgotten_kits',
  ]);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value || 0)));

  function eventWeight(event, context = {}) {
    const id = String(event?.id || '');
    if (!id) return 0;
    const minute = Number(context.minute || 0);
    const prematch = Boolean(context.prematch);
    const chaos = Boolean(context.chaos);
    const scoreDiff = Number(context.scoreDiff || 0);

    if (PREMATCH_IDS.has(id)) return prematch ? (chaos ? 7 : 5.5) : 0;
    if (prematch) return 0;

    let weight = 1;
    if (id === 'no_light') weight = minute >= 70 ? 7 : minute >= 58 ? 3 : 0.15;
    else if (id === 'downpour') weight = 2.1;
    else if (id === 'uneven_pitch') weight = 1.7;
    else if (id === 'ball_in_river') weight = 1.35;
    else if (id === 'grill_behind_goal') weight = 1.45;
    else if (id === 'fan_keeps_ball') weight = minute >= 55 ? 1.8 : 1.25;
    else if (id === 'dog_on_pitch') weight = 1.5;
    else if (id === 'coach_vs_ref') weight = minute >= 50 ? 2 : 1.25;
    else if (id === 'ref_no_cards') weight = 1.15;
    else if (id === 'megaphone_fan') weight = 1.25;
    else if (id === 'wasps_at_bench') weight = minute <= 65 ? 1.15 : 0.65;
    else if (id === 'flat_ball') weight = 1.35;
    else if (id === 'torn_net') weight = 1.15;

    if (minute >= 70 && Math.abs(scoreDiff) <= 1 && ['fan_keeps_ball', 'coach_vs_ref', 'megaphone_fan'].includes(id)) {
      weight *= 1.4;
    }
    if (chaos) weight *= 1.35;
    return weight;
  }

  function pickWeighted(events, context = {}, usedIds = new Set(), rng = Math.random) {
    const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);
    const weighted = (events || [])
      .filter(event => event?.id && !used.has(event.id))
      .map(event => ({ event, weight: eventWeight(event, context) }))
      .filter(item => item.weight > 0);
    if (!weighted.length) return null;
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = clamp(rng(), 0, 0.999999) * total;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll < 0) return item.event;
    }
    return weighted[weighted.length - 1].event;
  }

  function shouldGuaranteeEvent({ actionNo = 0, eventCount = 0 } = {}) {
    return Number(eventCount || 0) === 0 && Number(actionNo || 0) >= 5;
  }

  function conditionFor(eventId, choiceIndex) {
    const id = String(eventId || '');
    const choice = Number(choiceIndex);
    const key = `${id}:${choice}`;
    const conditions = {
      'uneven_pitch:0': { id:key, label:'Kartoflisko · gramy górą', actionsLeft:3, longBall:0.06, technical:-0.04, attack:-0.01 },
      'uneven_pitch:1': { id:key, label:'Kartoflisko · klepka na ryzyku', actionsLeft:3, technical:-0.05, attack:-0.02 },
      'uneven_pitch:2': { id:key, label:'Murawa poprawiona butem', actionsLeft:2, attack:0.02 },
      'downpour:0': { id:key, label:'Ulewa · upraszczamy grę', actionsLeft:3, attack:-0.03, defense:0.04, longBall:0.04 },
      'downpour:1': { id:key, label:'Ulewa · pressing na chaos', actionsLeft:3, attack:0.03, defense:-0.03 },
      'downpour:2': { id:key, label:'Ulewa słabnie', actionsLeft:2, attack:0.01, defense:0.01 },
      'no_light:0': { id:key, label:'Zmrok · gramy szybciej', actionsLeft:2, attack:-0.04, defense:-0.02 },
      'no_light:1': { id:key, label:'Pomarańczowa piłka', actionsLeft:2, attack:0.02, shot:0.02 },
      'no_light:2': { id:key, label:'Latarki z trybun', actionsLeft:2, attack:0.01, defense:-0.03 },
      'flat_ball:0': { id:key, label:'Miękka piłka', actionsLeft:2, shot:-0.05, longBall:-0.03 },
      'flat_ball:1': { id:key, label:'Pompowanie przy linii', actionsLeft:1, attack:0.01 },
      'forgotten_kits:0': { id:key, label:'Znaczniki zamiast strojów', actionsLeft:2, attack:-0.02, defense:-0.02 },
      'forgotten_kits:1': { id:key, label:'Awaryjny komplet pożyczony', actionsLeft:2, attack:0.01, defense:0.01 },
    };
    return conditions[key] ? { ...conditions[key] } : null;
  }

  function looksLikeShot(action) {
    const kind = String(action?.kind || '');
    const id = String(action?.id || '');
    return kind.includes('shot') || kind.includes('finish') || kind.includes('penalty') ||
      ['long_shot', 'placed_shot', 'power_shot', 'arcade_bomb', 'counter_finish'].includes(id);
  }

  function looksTechnical(action) {
    const id = String(action?.id || '');
    return ['short_build', 'carry', 'safe_pass', 'vertical', 'through_ball', 'combination', 'killer_pass', 'cutback', 'placed_shot'].includes(id);
  }

  function isLongBall(action) {
    const id = String(action?.id || '');
    return ['long_ball', 'fk_cross', 'corner_far', 'counter_wing'].includes(id);
  }

  function chanceModifier(condition, action, possession = 'player') {
    if (!condition || Number(condition.actionsLeft || 0) <= 0) return 0;
    let delta = possession === 'opponent' ? Number(condition.defense || 0) : Number(condition.attack || 0);
    if (looksLikeShot(action)) delta += Number(condition.shot || 0);
    if (looksTechnical(action)) delta += Number(condition.technical || 0);
    if (isLongBall(action)) delta += Number(condition.longBall || 0);
    return clamp(delta, -0.08, 0.08);
  }

  function adjustedChance(baseChance, condition, action, possession = 'player') {
    return clamp(Number(baseChance || 0) + chanceModifier(condition, action, possession), 0.04, 0.97);
  }

  function tickCondition(condition) {
    if (!condition) return null;
    const next = { ...condition, actionsLeft: Math.max(0, Number(condition.actionsLeft || 0) - 1) };
    return next.actionsLeft > 0 ? next : null;
  }

  function modifierLabel(value) {
    const points = Math.round(Number(value || 0) * 100);
    if (!points) return '0 pp';
    return `${points > 0 ? '+' : ''}${points} pp`;
  }

  return Object.freeze({
    PREMATCH_IDS,
    clamp,
    eventWeight,
    pickWeighted,
    shouldGuaranteeEvent,
    conditionFor,
    looksLikeShot,
    looksTechnical,
    isLongBall,
    chanceModifier,
    adjustedChance,
    tickCondition,
    modifierLabel,
  });
}));
