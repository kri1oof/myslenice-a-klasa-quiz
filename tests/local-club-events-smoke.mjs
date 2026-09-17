import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/local-club-events.js', import.meta.url), 'utf8');

function makeContext() {
  const logs = [];
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0;
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
      rpgInAddedTime: false,
      rpgSetPiece: null,
      rpgAwaitingAction: true,
      rpgActionsPlayed: 0,
      rpgMomentum: 0,
      rpgOpponentMomentum: 0,
      rpgMinute: 12,
      rpgZone: 2,
      rpgPossession: 'player',
      rpgLastEventAction: -1,
      rpgMediaLastEventAction: -1,
    },
    rpgActive: () => true,
    arcadeStyle: () => ({ id:'compact' }),
    arcadeMomentum: (delta, opponent = false) => {
      const key = opponent ? 'rpgOpponentMomentum' : 'rpgMomentum';
      ctx.state[key] = Math.max(0, Math.min(100, Number(ctx.state[key] || 0) + delta));
      return ctx.state[key];
    },
    addRpgLog: (text, tone = '') => logs.push({ text, tone }),
    resetRpgState: () => {
      ctx.state.rpgEnded = false;
      ctx.state.rpgHalftimePending = false;
      ctx.state.rpgInAddedTime = false;
      ctx.state.rpgSetPiece = null;
      ctx.state.rpgAwaitingAction = true;
      ctx.state.rpgActionsPlayed = 0;
      ctx.state.rpgMomentum = 0;
      ctx.state.rpgOpponentMomentum = 0;
      ctx.state.rpgMinute = 12;
    },
    playerActions: () => [{ id:'pass', label:'Podanie', desc:'Bazowy opis.', dc:3, kind:'advance' }],
    opponentActions: () => [{ id:'shape', label:'Obrona', desc:'Bazowy opis.', dc:3, kind:'defend_shape' }],
    chooseRpgAction: action => { ctx.chosen = action; return action; },
    narratorText: () => 'bazowy komentarz',
    renderActionPanel: () => { ctx.renderPanelCalls += 1; },
    renderRpgBoard: () => { ctx.renderBoardCalls += 1; },
    answer: () => { ctx.state.answered += 1; return true; },
    el: () => null,
    renderPanelCalls: 0,
    renderBoardCalls: 0,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename:'web/local-club-events.js' });
  vm.runInContext('resetRpgState()', ctx);
  return { ctx, logs };
}

{
  const { ctx, logs } = makeContext();
  const count = vm.runInContext('LOCAL_LIFE_EVENTS.length', ctx);
  assert.ok(count >= 15, 'the first event pack should contain at least 15 situations');
  assert.equal(vm.runInContext('Object.keys(LOCAL_LIFE_CATEGORIES).length', ctx), 5);

  const eventId = vm.runInContext("localLifeForce('no_linesman', false).id", ctx);
  assert.equal(eventId, 'no_linesman');
  assert.equal(ctx.state.rpgLifeActiveEvent.title, 'Brak sędziego liniowego');
  assert.match(vm.runInContext('narratorText()', ctx), /Brak sędziego liniowego/);

  assert.equal(vm.runInContext('localLifeChoose(2)', ctx), true);
  assert.equal(ctx.state.rpgLifeActiveEvent, null);
  assert.equal(ctx.state.rpgMinute, 14, 'calling the official should delay the match');
  assert.equal(ctx.state.rpgLifeDelayed.length, 1, 'choice should schedule a delayed consequence');

  ctx.state.rpgActionsPlayed = 2;
  vm.runInContext('localLifeResolveDelayed()', ctx);
  assert.equal(ctx.state.rpgMomentum, 12, 'delayed official arrival should reward momentum');
  assert.ok(logs.some(item => item.text.includes('Znajomy działacza')));
}

{
  const { ctx } = makeContext();
  vm.runInContext("localLifeForce('uneven_pitch', false)", ctx);
  vm.runInContext('localLifeChoose(0)', ctx);
  const attack = vm.runInContext('playerActions()[0]', ctx);
  assert.equal(attack.dc, 2, 'playing over the uneven pitch should ease the next attack');
  vm.runInContext('chooseRpgAction(playerActions()[0])', ctx);
  assert.equal(ctx.state.rpgLifeNextAttackDc, 0, 'attack modifier must be one-shot');

  const defense = vm.runInContext('opponentActions()[0]', ctx);
  assert.equal(defense.dc, 4, 'the same choice should make the next defense harder');
  vm.runInContext('chooseRpgAction(opponentActions()[0])', ctx);
  assert.equal(ctx.state.rpgLifeNextDefenseDc, 0, 'defense modifier must be one-shot');
}

{
  const { ctx } = makeContext();
  ctx.state.rpgActionsPlayed = 4;
  ctx.state.rpgLifeLastEventAction = 0;
  assert.equal(vm.runInContext('maybeTriggerLocalLifeEvent()', ctx), true);
  assert.ok(ctx.state.rpgLifeActiveEvent, 'scheduler should surface a decision event');
  assert.equal(ctx.state.rpgLifeEventCount, 1);
}

console.log('local club events smoke: OK');
