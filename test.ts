import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "./app.config";
import { GameState } from "./state";
import sinon from 'sinon'

sinon.stub(console, "log")
sinon.stub(console, "info")
sinon.stub(console, "warn")

describe("testing your Colyseus app", () => {
  let colyseus: ColyseusTestServer;

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());

  beforeEach(async () => await colyseus.cleanup());

  it("start playing", async () => {
    const room = await colyseus.createRoom<GameState>("uno_room", {});

    const alice = await colyseus.connectTo(room, { name: 'alice', avatar: 'rire' });

    assert.strictEqual(room.state.deck.length, 120);
    assert.strictEqual(room.state.deck.length, room.state.deckSize);

    alice.send('start');
    await room.waitForNextPatch();
    assert.strictEqual(room.state.playing, false);

    await colyseus.connectTo(room, { name: 'bob', avatar: 'mickey' });

    alice.send('start');
    await room.waitForNextPatch();
    assert.strictEqual(room.state.playing, true);
    assert.notStrictEqual(room.state.deck.length, 120);
    assert.strictEqual(room.state.deck.length, room.state.deckSize);
  });

  it("draw card", async () => {
    const room = await colyseus.createRoom<GameState>("uno_room", {});

    const alice = await colyseus.connectTo(room, { name: 'alice', avatar: 'rire' });
    const bob = await colyseus.connectTo(room, { name: 'bob', avatar: 'mickey' });

    alice.send('start');
    await room.waitForNextPatch();

    assert.strictEqual(room.state.deck.length, room.state.deckSize);
    const previousDeckSize = room.state.deckSize;

    const currentClient = room.state.currentPlayerId === alice.sessionId ? alice : bob;

    currentClient.send('draw_card');
    await room.waitForNextPatch();

    assert.strictEqual(room.state.deck.length, room.state.deckSize);
    assert.strictEqual(room.state.deckSize === previousDeckSize - 1, true);
  });

  it("handle player leaving", async () => {
    const room = await colyseus.createRoom<GameState>("uno_room", {});

    const alice = await colyseus.connectTo(room, { name: 'alice', avatar: 'rire' });
    const bob = await colyseus.connectTo(room, { name: 'bob', avatar: 'mickey' });
    const charlie = await colyseus.connectTo(room, { name: 'charlie', avatar: 'pepe' });

    alice.send('start');
    await room.waitForNextPatch();

    assert.strictEqual(room.state.playing, true);
    assert.deepEqual(Array.from(room.state.players.keys()), [alice.sessionId, bob.sessionId, charlie.sessionId]);
    assert.strictEqual(Array.from(room.state.players.values()).filter(p => p.spectator).length, 0);

    bob.leave();
    await room.waitForNextPatch();

    assert.strictEqual(room.state.playing, true);
    assert.deepEqual(Array.from(room.state.players.keys()), [alice.sessionId, charlie.sessionId]);
    assert.strictEqual(Array.from(room.state.players.values()).filter(p => p.spectator).length, 0);
  });

  // it("handle afk player", async function() {
  //   this.timeout(35000);
  //   const room = await colyseus.createRoom<GameState>("uno_room", {});
  //
  //   const alice = await colyseus.connectTo(room, { name: 'alice', avatar: 'rire' });
  //   const bob = await colyseus.connectTo(room, { name: 'bob', avatar: 'mickey' });
  //   const charlie = await colyseus.connectTo(room, { name: 'charlie', avatar: 'pepe' });
  //
  //   alice.send('start');
  //   await room.waitForNextPatch();
  //
  //   alice.send('draw_card');
  //   await room.waitForNextPatch();
  //   bob.send('draw_card');
  //   await room.waitForNextPatch();
  //   charlie.send('draw_card');
  //   await room.waitForNextPatch();
  //
  //   const afkPlayerId = room.state.currentPlayerId;
  //
  //   assert.strictEqual(room.state.playing, true);
  //   assert.deepEqual(Array.from(room.state.players.keys()), [alice.sessionId, bob.sessionId, charlie.sessionId]);
  //   assert.strictEqual(Array.from(room.state.players.values()).filter(p => p.spectator).length, 0);
  //
  //   return new Promise((resolve, reject) => {
  //     setTimeout(async function() {
  //       try {
  //         await room.waitForNextPatch();
  //
  //         const playerState = room.state.players.get(afkPlayerId);
  //         if(!playerState) throw Error('Player not in `players`');
  //
  //         assert.strictEqual(playerState.spectator, true);
  //
  //         resolve();
  //       } catch (e) {
  //         reject(e);
  //       }
  //     }, 31000);
  //   });
  // });

  it("handle unonche", async function() {
    const room = await colyseus.createRoom<GameState>("uno_room", {});

    const alice = await colyseus.connectTo(room, { name: 'alice', avatar: 'rire' });
    const bob = await colyseus.connectTo(room, { name: 'bob', avatar: 'mickey' });

    alice.send('start');
    await room.waitForNextPatch();
    room.state.currentPlayerId = alice.sessionId;

    const playerA = room.state.players.get(alice.sessionId);
    const playerB = room.state.players.get(bob.sessionId);

    if (!playerA || !playerB) throw Error();

    playerA.hand.splice(2);
    playerA.handSize = playerA.hand.length;

    playerA.hand[0].color = 'wild';
    playerA.hand[0].value = 'wild';
    playerA.hand[1].color = 'wild';
    playerA.hand[1].value = 'wild';

    alice.send('say_uno');
    await room.waitForNextPatch();
    assert.strictEqual(playerA.saidUno, true);
    assert.strictEqual(playerA.handSize, 2);
    assert.strictEqual(room.state.currentPlayerId, alice.sessionId);

    alice.send('play_card', { cardIndex: 0, nextColor: 'red' });
    await room.waitForNextPatch();
    assert.strictEqual(playerA.handSize, 1);
    assert.strictEqual(room.state.currentPlayerId, bob.sessionId);

    bob.send('say_uno');
    await room.waitForNextPatch();
    assert.strictEqual(playerB.saidUno, true);

    bob.send('draw_card');
    await room.waitForNextPatch();
    assert.strictEqual(playerB.saidUno, false);
    assert.strictEqual(room.state.currentPlayerId, alice.sessionId);

    assert.strictEqual(playerA.saidUno, true);

    alice.send('play_card', { cardIndex: 0, nextColor: 'red' });
    await room.waitForNextPatch();

    assert.strictEqual(room.state.playing, false);
  });

  it("handle counter-unonche", async function() {
    const room = await colyseus.createRoom<GameState>("uno_room", {});

    const alice = await colyseus.connectTo(room, { name: 'alice', avatar: 'rire' });
    const bob = await colyseus.connectTo(room, { name: 'bob', avatar: 'mickey' });

    alice.send('start');
    await room.waitForNextPatch();
    room.state.currentPlayerId = alice.sessionId;

    const playerA = room.state.players.get(alice.sessionId);
    const playerB = room.state.players.get(bob.sessionId);

    if (!playerA || !playerB) throw Error();

    playerA.hand.splice(2);
    playerA.handSize = playerA.hand.length;

    playerA.hand[0].color = 'wild';
    playerA.hand[0].value = 'wild';
    playerA.hand[1].color = 'wild';
    playerA.hand[1].value = 'wild';

    bob.send('say_uno');
    await room.waitForNextPatch();
    assert.strictEqual(playerB.saidUno, false);
    assert.strictEqual(playerA.handSize, 2);
    assert.strictEqual(room.state.currentPlayerId, alice.sessionId);

    alice.send('play_card', { cardIndex: 0, nextColor: 'red' });
    await room.waitForNextPatch();
    assert.strictEqual(playerB.saidUno, false);
    assert.strictEqual(playerA.handSize, 1);
    assert.strictEqual(room.state.currentPlayerId, bob.sessionId);

    bob.send('say_uno');
    await room.waitForNextPatch();
    assert.strictEqual(playerB.saidUno, false);
    assert.strictEqual(playerA.handSize, 3);
  });

  it("handle sleep", async function() {
    const room = await colyseus.createRoom<GameState>("uno_room", {});

    const alice = await colyseus.connectTo(room, { name: 'alice', avatar: 'rire' });
    await colyseus.connectTo(room, { name: 'bob', avatar: 'mickey' });
    await colyseus.connectTo(room, { name: 'charlie', avatar: 'pepe' });

    alice.send('start');
    await room.waitForNextPatch();
    room.state.currentPlayerId = alice.sessionId;

    const playerA = room.state.players.get(alice.sessionId);

    if (!playerA) throw Error();

    playerA.hand[0].color = 'wild';
    playerA.hand[0].value = 'sleep';

    alice.send('play_card', { cardIndex: 0, nextColor: 'red' });
    await room.waitForNextPatch();
    assert.strictEqual(room.state.currentPlayerId, alice.sessionId); // Alice is still playing
  });
});
