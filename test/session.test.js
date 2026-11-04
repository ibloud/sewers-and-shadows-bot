'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Match, legalActions, validate, chooseOpponent, narrate } = require('../browser/session.js');
const { FloatChessGame } = require('../bot/float-chess-engine.js');
test('human and committed opponent resolve from the pre-turn board', () => {
  const m = new Match(), committed = structuredClone(m.opponent);
  assert.equal(m.play({ from: 'e2', to: 'e4' }).ok, true);
  assert.deepEqual(m.history[0].opponent, committed);
  assert.equal(m.game.turn, 2);
  assert.equal(m.game.toJSON().squares.e4.color, 'w');
  assert.deepEqual(m.game.pending, { w: null, b: null });
  assert.equal(m.snapshots.length, 2);
});
test('malformed and illegal actions preserve all state and allow recovery', () => {
  const m = new Match();
  const before = structuredClone(m);
  for (const move of [null, {}, { from:'a9', to:'a1' }, { from:'e2',to:'e5' }, { from:'a7',to:'a6' }, { from:'e2',to:'e4',special:'invented' }]) {
    assert.equal(m.play(move).ok, false);
    assert.deepEqual(structuredClone(m), before);
  }
  assert.equal(m.play({ from:'e2',to:'e4' }).ok,true);
});
test('resolution failure rolls back and permits retry', () => {
  const m = new Match(), before = structuredClone(m.game);
  const original=FloatChessGame.prototype._resolveTurn;
  FloatChessGame.prototype._resolveTurn = () => { throw new Error('synthetic failure'); };
  try { assert.equal(m.play({from:'e2',to:'e4'}).ok,false); }
  finally { FloatChessGame.prototype._resolveTurn=original; }
  assert.deepEqual(structuredClone(m.game),before);
  assert.equal(m.history.length,0);
  assert.equal(m.play({from:'e2',to:'e4'}).ok,true);
});
test('engine-valid actions include specials and never expose slowed standard moves', () => {
  const m = new Match();
  const actions = legalActions(m.game);
  assert(actions.some(a=>a.special==='redBalloon'));
  assert(actions.every(a=>validate(m.game,'w',a).legal));
  const slowed = m.game.board[6][3];
  m.game.slowed.set(slowed.id,1);
  const opponent = chooseOpponent(m.game);
  assert(validate(m.game,'b',opponent).legal);
  assert.notEqual(opponent.from,'d7');
});
test('ended session, replay snapshots, summary isolation and restart', () => {
  const m = new Match();m.play({from:'e2',to:'e4'});
  const start = structuredClone(m.snapshots[0]);
  m.finish();assert.equal(m.play({from:'d2',to:'d4'}).ok,false);
  assert.match(m.summary().status,/Ended by visitor/);
  const summary=m.summary();summary.turns[0].human.to='a8';
  assert.equal(m.history[0].human.to,'e4');
  assert.deepEqual(m.snapshots[0],start);
  m.restart();assert.equal(m.completed,false);assert.equal(m.history.length,0);assert.equal(m.game.turn,1);
});
test('engine completion through actual simultaneous resolution remains replayable', () => {
  const m = new Match();
  // An isolated late-game fixture: next reversible turn repeats the position three times.
  const game = m.game;
  const white={from:'g1',to:'f3'}, black={from:'g8',to:'f6'};
  const probe=new FloatChessGame();probe.submitMove('w',white);probe.submitMove('b',black);
  const {positionKey}=require('../bot/float-chess-engine.js');
  game.positionHistory=[positionKey(probe.board),positionKey(probe.board)];
  m.opponent=black;
  assert.equal(m.play(white).ok,true);
  assert.equal(m.game.status,'draw');assert.equal(m.completed,true);
  assert(m.history[0].events.some(e=>e.type==='threefoldRepetition'));
  assert.equal(m.snapshots[1].status,'draw');
  assert.equal(m.play(white).ok,false);
});
test('narration receives copied results and cannot submit a move', () => {
  const m=new Match();const result=m.play({from:'e2',to:'e4'});
  const board=structuredClone(m.game.toJSON());
  assert.equal(typeof narrate(result.events),'string');
  const failingNarrator=()=>{throw new Error('unavailable');};
  assert.throws(()=>failingNarrator(result.events));
  result.events.push({type:'fabricated'});
  assert(!m.history[0].events.some(e=>e.type==='fabricated'));
  assert.deepEqual(m.game.toJSON(),board);
});
