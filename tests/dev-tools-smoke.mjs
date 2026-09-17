import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/dev-tools.js', import.meta.url), 'utf8');

function makeContext(search = '?dev=1') {
  const logs = [];
  const mediaCalls = [];
  const lifeCalls = [];
  const ctx = {
    console,
    URLSearchParams,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    window: { location: { search } },
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; },
      createElement() { throw new Error('DOM panel should not be created during VM smoke test'); },
      head: { appendChild() {} },
      body: { appendChild() {} },
    },
    state: {
      rpgEnded: false,
      rpgAwaitingAction: true,
      rpgMomentum: 0,
      rpgZone: 2,
      rpgPossession: 'player',
      rpgSetPiece: null,
      rpgClearChance: false,
    },
    rpgActive: () => true,
    addRpgLog: (text, tone = '') => logs.push({ text, tone }),
    arcadeEvent: (icon, label, desc, type) => ({ icon, label, desc, type }),
    resetArcadeCombo: () => { ctx.state.rpgCombo = []; },
    renderRpgBoard: () => { ctx.renderBoardCalls += 1; },
    hideQuestionUi: () => {},
    renderActionPanel: () => { ctx.renderPanelCalls += 1; },
    localRefereeRobberyRoll: () => false,
    resetRpgState: () => {
      ctx.state.rpgEnded = false;
      ctx.state.rpgAwaitingAction = true;
      ctx.state.rpgMomentum = 0;
      ctx.state.rpgSetPiece = null;
      ctx.state.rpgZone = 2;
      ctx.state.rpgPossession = 'player';
    },
    arcadeMomentum: delta => {
      ctx.state.rpgMomentum = Math.max(0, Math.min(100, Number(ctx.state.rpgMomentum || 0) + delta));
      return ctx.state.rpgMomentum;
    },
    renderArcadeHud: () => { ctx.renderHudCalls += 1; },
    LOCAL_MATCH_AMBIENT: [['📣 TEST', 'TESTOWY OKRZYK']],
    localMediaForce: sourceId => {
      mediaCalls.push(sourceId);
      return { source: sourceId, effect: 'test_effect' };
    },
    localLifeForce: eventId => {
      lifeCalls.push(eventId);
      return { id:eventId || 'random_event', title:eventId || 'Losowy event' };
    },
    renderBoardCalls: 0,
    renderPanelCalls: 0,
    renderHudCalls: 0,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'web/dev-tools.js' });
  return { ctx, logs, mediaCalls, lifeCalls };
}

{
  const { ctx, logs, mediaCalls, lifeCalls } = makeContext('?dev=1');
  assert.equal(vm.runInContext('RPG_DEV_ENABLED', ctx), true, 'dev mode should be enabled');
  assert.ok(ctx.window.RPG_DEV, 'public developer API should exist in dev mode');

  const expected = {
    penalty: ['player', 4, 'penalty'],
    corner: ['player', 4, 'corner'],
    free_kick: ['player', 3, 'free_kick'],
    counter_3v2: ['player', 2, 'counter_3v2'],
    opponent_corner: ['opponent', 0, 'opponent_corner'],
    opponent_free_kick: ['opponent', 1, 'opponent_free_kick'],
  };
  for (const [key, [possession, zone, type]] of Object.entries(expected)) {
    assert.equal(vm.runInContext(`rpgDevApply(${JSON.stringify(key)}, false)`, ctx), true, `${key} should apply`);
    assert.equal(ctx.state.rpgPossession, possession, `${key} possession`);
    assert.equal(ctx.state.rpgZone, zone, `${key} zone`);
    assert.equal(ctx.state.rpgSetPiece?.type, type, `${key} type`);
  }

  const mediaExpected = {
    media_koneserzy: 'koneserzy',
    media_fotopstryki: 'fotopstryki',
    media_zatrzymaj: 'zatrzymaj',
    media_futmal: 'futmal',
  };
  for (const [key, sourceId] of Object.entries(mediaExpected)) {
    assert.equal(vm.runInContext(`rpgDevApply(${JSON.stringify(key)}, false)`, ctx), true, `${key} should apply`);
    assert.equal(mediaCalls.at(-1), sourceId, `${key} should force ${sourceId}`);
    assert.ok(ctx.window.RPG_DEV.events.includes(key), `${key} should be exposed in developer API`);
  }

  const lifeExpected = {
    life_random: null,
    life_linesman: 'no_linesman',
    life_river: 'ball_in_river',
    life_late: 'late_player',
    life_dog: 'dog_on_pitch',
    life_coach: 'coach_vs_ref',
  };
  for (const [key, eventId] of Object.entries(lifeExpected)) {
    assert.equal(vm.runInContext(`rpgDevApply(${JSON.stringify(key)}, false)`, ctx), true, `${key} should apply`);
    assert.equal(lifeCalls.at(-1), eventId, `${key} should force ${eventId || 'a random event'}`);
    assert.equal(ctx.window.RPG_DEV.events.includes(key), true, `${key} should be exposed in developer API`);
  }

  ctx.state.rpgMomentum = 17;
  assert.equal(vm.runInContext("rpgDevApply('fire', false)", ctx), true);
  assert.equal(ctx.state.rpgMomentum, 100, 'fire should set momentum to 100%');

  const logCountBeforeAmbient = logs.length;
  assert.equal(vm.runInContext("rpgDevApply('ambient', false)", ctx), true);
  assert.equal(logs.length, logCountBeforeAmbient + 1, 'ambient should add exactly one log line');
  assert.match(logs.at(-1).text, /TESTOWY OKRZYK/);

  assert.equal(vm.runInContext("rpgDevApply('robbery', false)", ctx), true);
  assert.equal(ctx.state.rpgDevForceRefereeRobbery, true, 'robbery flag should be armed');
  assert.equal(vm.runInContext('localRefereeRobberyRoll({id:"safe_pass"}, true)', ctx), true, 'forced robbery should trigger on next correct answer');
  assert.equal(ctx.state.rpgDevForceRefereeRobbery, false, 'forced robbery should be one-shot');
  assert.equal(vm.runInContext('localRefereeRobberyRoll({id:"safe_pass"}, true)', ctx), false, 'second roll should return to normal behavior');
}

{
  const { ctx } = makeContext('?dev=1&event=corner');
  vm.runInContext('resetRpgState()', ctx);
  assert.equal(ctx.state.rpgDevQueuedEvent, 'corner', 'URL event should be queued on match reset');
  vm.runInContext('renderActionPanel()', ctx);
  assert.equal(ctx.state.rpgDevQueuedEvent, null, 'queued event should be consumed');
  assert.equal(ctx.state.rpgSetPiece?.type, 'corner', 'queued corner should be injected before action panel renders');
}

{
  const { ctx, mediaCalls } = makeContext('?dev=1&event=media_futmal');
  vm.runInContext('resetRpgState()', ctx);
  vm.runInContext('renderActionPanel()', ctx);
  assert.equal(mediaCalls.at(-1), 'futmal', 'URL should be able to queue a Futmal media event');
}

{
  const { ctx, lifeCalls } = makeContext('?dev=1&event=life_dog');
  vm.runInContext('resetRpgState()', ctx);
  vm.runInContext('renderActionPanel()', ctx);
  assert.equal(lifeCalls.at(-1), 'dog_on_pitch', 'URL should be able to queue a dog-on-pitch event');
}

{
  const { ctx } = makeContext('');
  assert.equal(vm.runInContext('RPG_DEV_ENABLED', ctx), false, 'dev mode must be off by default');
  assert.equal(ctx.window.RPG_DEV, undefined, 'developer API must not leak into normal mode');
  assert.equal(vm.runInContext("rpgDevApply('penalty', false)", ctx), false, 'normal mode must reject forced events');
  assert.equal(vm.runInContext("rpgDevApply('media_koneserzy', false)", ctx), false, 'normal mode must reject forced media events');
  assert.equal(vm.runInContext("rpgDevApply('life_dog', false)", ctx), false, 'normal mode must reject forced life events');
}

console.log('dev-tools smoke: OK');
