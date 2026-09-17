import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/local-media-events.js', import.meta.url), 'utf8');

const deterministicMath = Object.create(Math);
deterministicMath.random = () => 0.99;

function makeContext() {
  const logs = [];
  const ctx = {
    console,
    Math: deterministicMath,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    state: {
      answered: 0,
      rpgEnded: false,
      rpgHalftimePending: false,
      rpgSetPiece: null,
      rpgAwaitingAction: true,
      rpgActionsPlayed: 0,
      rpgMomentum: 0,
      rpgOpponentMomentum: 0,
      rpgZone: 2,
      rpgPossession: 'player',
    },
    rpgActive: () => true,
    arcadeStyle: () => ({ id:'compact' }),
    addRpgLog: (text, tone = '') => logs.push({ text, tone }),
    renderArcadeHud: () => {},
    arcadeMomentum: (delta, opponent = false) => {
      const key = opponent ? 'rpgOpponentMomentum' : 'rpgMomentum';
      ctx.state[key] = Math.max(0, Math.min(100, Number(ctx.state[key] || 0) + delta));
      return ctx.state[key];
    },
    resetRpgState: () => {
      ctx.state.rpgEnded = false;
      ctx.state.rpgHalftimePending = false;
      ctx.state.rpgSetPiece = null;
      ctx.state.rpgAwaitingAction = true;
      ctx.state.rpgActionsPlayed = 0;
      ctx.state.rpgMomentum = 0;
      ctx.state.rpgOpponentMomentum = 0;
      ctx.state.rpgZone = 2;
      ctx.state.rpgPossession = 'player';
    },
    playerActions: () => [
      { id:'safe_pass', label:'Podanie', desc:'Test', dc:3, kind:'advance' },
      { id:'long_shot', label:'Strzał', desc:'Test', dc:4, kind:'shot' },
    ],
    opponentActions: () => [
      { id:'shape', label:'Obrona', desc:'Test', dc:3, kind:'defend_shape' },
    ],
    chooseRpgAction: action => { ctx.chosen = action; return action; },
    narratorText: () => 'bazowy komentarz',
    renderActionPanel: () => {},
    answer: () => { ctx.state.answered += 1; return true; },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename:'web/local-media-events.js' });
  vm.runInContext('resetRpgState()', ctx);
  return { ctx, logs };
}

{
  const { ctx, logs } = makeContext();

  let result = vm.runInContext("localMediaForce('koneserzy', 'showtime')", ctx);
  assert.equal(result.effect, 'showtime');
  assert.equal(ctx.state.rpgMediaNextAttackDc, -1);
  let actions = vm.runInContext('playerActions()', ctx);
  assert.equal(actions[0].dc, 2, 'Koneserzy showtime should make next attack easier');
  vm.runInContext('chooseRpgAction(playerActions()[0])', ctx);
  assert.equal(ctx.state.rpgMediaNextAttackDc, 0, 'attack modifier must be one-shot');

  result = vm.runInContext("localMediaForce('fotopstryki', 'obiektyw')", ctx);
  assert.equal(result.effect, 'obiektyw');
  actions = vm.runInContext('playerActions()', ctx);
  assert.equal(actions[1].dc, 3, 'Fotopstryki lens event should make next shot easier');
  assert.equal(actions[0].dc, 3, 'shot modifier should not change ordinary passing');
  vm.runInContext('chooseRpgAction(playerActions()[1])', ctx);
  assert.equal(ctx.state.rpgMediaNextShotDc, 0, 'shot modifier must be one-shot');

  result = vm.runInContext("localMediaForce('zatrzymaj', 'zamrozenie')", ctx);
  assert.equal(result.effect, 'zamrozenie');
  const defense = vm.runInContext('opponentActions()', ctx);
  assert.equal(defense[0].dc, 2, 'ZatrzymajCzas freeze should make next defense easier');
  vm.runInContext('chooseRpgAction(opponentActions()[0])', ctx);
  assert.equal(ctx.state.rpgMediaNextDefenseDc, 0, 'defense modifier must be one-shot');

  ctx.state.rpgMomentum = 0;
  result = vm.runInContext("localMediaForce('futmal', 'underdog', false)", ctx);
  assert.equal(result.effect, 'underdog');
  assert.equal(ctx.state.rpgMomentum, 15, 'Futmal underdog article should add 15% fire');
  assert.equal(ctx.state.rpgMediaEventCount, 3, 'prematch Futmal should not increment in-match media count');

  assert.ok(logs.some(item => item.text.includes('Koneserzy Życia')));
  assert.ok(logs.some(item => item.text.includes('Fotopstryki')));
  assert.ok(logs.some(item => item.text.includes('ZatrzymajCzas')));
  assert.ok(logs.some(item => item.text.includes('Futmal.pl')));
}

{
  const { ctx } = makeContext();
  ctx.state.rpgActionsPlayed = 4;
  ctx.state.rpgMediaLastEventAction = 0;
  ctx.Math.random = () => 0;
  const triggered = vm.runInContext('maybeTriggerLocalMediaEvent()', ctx);
  assert.equal(triggered, true, 'random scheduler should be able to trigger a media event');
  assert.equal(ctx.state.rpgMediaEventCount, 1);
  assert.ok(ctx.state.rpgMediaUsedSources.has('koneserzy'));
}

console.log('media-events smoke: OK');
