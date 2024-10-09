import { Room, Client, matchMaker } from "colyseus";
import { Card, Player, GameState } from "./gameState";
import { ArraySchema } from "@colyseus/schema";

const diseases = [
  'cancer du fion',
  'cancer de l\'anus',
  'cancer généralisé',
  'cancer du gland',
  'cancer du prépuce',
  'cancer du cerveau',
  'cancer du prout',
  'cancer du caca avec une métastase au cucu',
];

export class UnoRoom extends Room<GameState> {
  maxClients = 6;
  private noClientTimeout: NodeJS.Timeout | null = null;
  private readonly autoDisposeTimeout = 3600000; // 1 hour in milliseconds

  currentTurnTimeout: any;
  pocTimeout: any;

  constructor() {
    super();
    this.autoDispose = false;
  }

  async onCreate(options: any) {
    const rooms = await matchMaker.query({ name: 'uno_room' });
    if (rooms.length === 0) {
      this.roomId = 'onche';
    }

    console.log("Room created with name:", this.roomId);
    this.setState(new GameState());

    this.onMessage("preplay_wild", (client, message) => {
      if (this.state.currentPlayerId !== client.sessionId) return;
      const player = this.state.players.get(client.sessionId);
      if (!player || !message || isNaN(message.cardIndex) || message.cardIndex >= player.hand.length) return;
      const card = player.hand[message.cardIndex].clone();

      if (card.color !== 'wild') return;
      if (!this.isCardPlayable(player, card)) return;

      client.send('choose_color', { cardIndex: message.cardIndex });
    });

    this.onMessage("play_card", (client, message) => {
      if (this.state.currentPlayerId !== client.sessionId) return;
      const player = this.state.players.get(client.sessionId);
      if (!player || !message || isNaN(message.cardIndex) || message.cardIndex >= player.hand.length) return;
      const card = player.hand[message.cardIndex].clone();
      const nextColor = message.nextColor;

      if (card.color === 'wild' && !['red','green','blue','yellow'].includes(nextColor)) return;

      if (!this.isCardPlayable(player, card)) return;

      player.hand.splice(message.cardIndex, 1);
      player.handSize--;
      this.state.discardPile.push(card);

      const nextPlayer = this.getNextPlayer();

      if (nextPlayer) {
        if (card.color === 'wild') this.state.nextColor = nextColor;

        if (card.value === 'skip') {
          this.nextTurn();
          if (nextPlayer) this.sendSystemMsg(`${nextPlayer.name} se fait niquer son tour (merci ${player.name})`);
        } else if (card.value === 'reverse') {
          this.state.reversedPlayerOrder = !this.state.reversedPlayerOrder;
          this.sendSystemMsg(`${player.name} inverse l'ordre du jeu`);
        } else if (card.value === 'draw_two') {
          this.drawCard(nextPlayer, 2);
          this.sendSystemMsg(`${player.name} fait piocher deux cartes à ${nextPlayer.name}`);
        } else if (card.value === 'draw_four') {
          this.drawCard(nextPlayer, 4);
          if (nextPlayer) this.sendSystemMsg(`${player.name} ATOMISE ${nextPlayer.name} et lui fait piocher QUATRE cartes`);
        } else if (card.value === 'poc') {
          this.sendSystemMsg(`${player.name} lance un POST OU CANCER, vous avez 5 secondes pour poster`);
        }
      }

      this.broadcast("play_card", {
        playerId: client.id,
        cardIndex: message.cardIndex,
        card,
        nextColor: this.state.nextColor
      });

      if (player.hand.length <= 0) {
        this.win(player);
        return;
      }

      if (card.value === 'poc') {
        this.startPOC();
      } else {
        this.nextTurn();
      }
    });

    this.onMessage("chat_msg", (client, message) => {
      if (this.pocTimeout) {
        const index = this.state.pocList.indexOf(client.id);
        if (index >= 0) {
          this.state.pocList.splice(index, 1);
        }
      }
      this.broadcast("chat_msg", {
        playerId: client.id,
        text: message.text
      });
    });
    this.onMessage("start", (client, message) => {
      if (this.state.playing) return;
      if (this.state.kingPlayerId !== client.sessionId) return;
      if (this.state.players.size <= 1) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.startGame();
    });

    this.onMessage("draw_card", (client, message) => {
      if (this.state.currentPlayerId !== client.sessionId) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const cards = this.drawCard(player);
      if (cards.length > 0) this.nextTurn();
    });

    this.onMessage("say_uno", (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const playerIds = Array.from(this.state.players.keys());
      for (let i = 0; i < playerIds.length; i++) {
        const p = this.state.players.get(playerIds[i]);
        if (!p) continue;

        if (p.hand.length === 1 && !p.saidUno && p.id !== player.id) {
          this.drawCard(p, 2);
          this.sendSystemMsg(`${player.name} crie UNONCHE avant ${p.name} et lui fait piocher deux cartes sans vergogne`);
        }
      }

      if (player.hand.length === 1 && !player.saidUno) {
        player.saidUno = true;

        this.broadcast("sayUno", {
          playerId: player.id
        });
        this.sendSystemMsg(`${player.name} crie UNONCHE`);
      }
    });
  }

  onJoin(client: Client, options: any) {
    if (!/^[-_a-zA-Z0-9]{3,15}$/.test(options.name) || !['rire','jesus','magalax','mickey','zidane','fatigue','pepe','chat'].includes(options.avatar))
      return client.leave(4000, 'Pseudo ou avatar incorrect');

    this.state.addPlayer(client.sessionId, options.name, options.avatar);
    const player = this.state.players.get(client.sessionId);
    if (player) {
      this.broadcast("chat_msg", {
        playerId: null,
        text: `${player.name} a rejoint la partie`
      });
    }
    if (this.noClientTimeout) {
      clearTimeout(this.noClientTimeout);
      this.noClientTimeout = null;
    }
  }

  onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      this.sendSystemMsg(`${player.name} a quitté la partie`);
    }
    this.state.players.delete(client.sessionId);

    const playersArray = Array.from(this.state.players.keys()).filter(id => !this.state.players.get(id)?.spectator);
    if (client.sessionId === this.state.kingPlayerId) {
      if (playersArray.length > 0)
        this.state.kingPlayerId = playersArray[0];
      else
        this.state.kingPlayerId = 'NOPE';
    }

    this.onPlayersUpdate();

    if (client.sessionId === this.state.currentPlayerId) {
      this.nextTurn();
    }

    if (this.roomId !== 'onche' && this.clients.length === 0) {
      this.noClientTimeout = setTimeout(() => {
        console.log("No clients for 1 hour. Disposing room.");
        this.disconnect();
      }, this.autoDisposeTimeout);
    }
  }

  onPlayersUpdate() {
    const playersArray = Array.from(this.state.players.keys()).filter(id => !this.state.players.get(id)?.spectator);
    this.broadcast("players_update", {
      players: this.state.players
    });

    if (playersArray.length === 1) {
      this.sendSystemMsg('Il n\'y a plus assez de joueur, la partie est FINITO');
      this.broadcast("end");
      this.reset();
      return;
    }
  }

  onDispose() {
    if (this.noClientTimeout) {
      clearTimeout(this.noClientTimeout);
    }
  }

  setTurn(playerId: string) {
    clearTimeout(this.currentTurnTimeout);
    this.state.currentPlayerId = playerId;
    this.state.turnStartTime = Date.now();
    this.currentTurnTimeout = setTimeout(() => {
      if (!this.state.playing) return;
      const player = this.state.players.get(playerId);
      if (!player) return;
      if (!this.state.lastPlayAfk.includes(player.id)) {
        this.sendSystemMsg(`${player.name} n'a pas joué et devient spectateur`);
        player.spectator = true;
      } else {
        this.sendSystemMsg(`${player.name} n'a pas joué pendant deux parties et est kick`);
        const client = this.clients.find(c => c.id === player.id);
        client?.leave();
      }
      this.onPlayersUpdate();
      this.nextTurn();
    }, 30000);
  }

  startGame() {
    this.state.playing = true;
    this.sendSystemMsg(`La partie commence !`);
    this.state.dealCards();

    const playerIds = Array.from(this.state.players.keys());
    this.setTurn(playerIds[Math.floor(Math.random()*playerIds.length)]);

    this.clients.forEach((client) => {
      const player = this.state.players.get(client.id);
      if (!player) return;
      client.send("start", {
        cards: player.hand,
        currentPlayerId: this.state.currentPlayerId,
        turnStartTime: this.state.turnStartTime,
        deckSize: this.state.deckSize,
      });
    });
  }

  sendSystemMsg(msg: string) {
    this.broadcast("chat_msg", {
      playerId: null,
      text: msg,
    });
  }

  nextTurn() {
    const nextPlayer = this.getNextPlayer();
    if (nextPlayer) {
      this.setTurn(nextPlayer.id);
      this.broadcast("new_turn", {
        playerId: nextPlayer.id,
        startTime: this.state.turnStartTime
      });
    }
  }

  getNextPlayer(): Player|null {
    if (!this.state.playing) return null;
    const playerIds = Array.from(this.state.players.keys()).filter(id => !this.state.players.get(id)?.spectator);
    const currentIndex = playerIds.indexOf(this.state.currentPlayerId);
    const offset = this.state.reversedPlayerOrder ? -1 : 1;
    let nextIndexRaw = (currentIndex + offset);
    if (nextIndexRaw < 0) nextIndexRaw = playerIds.length+nextIndexRaw;
    const nextIndex = nextIndexRaw % playerIds.length;
    return this.state.players.get(playerIds[nextIndex]) || null;
  }

  isCardPlayable(player: Player, card: Card) {
    if (this.state.discardPile.length <= 0) return true;

    const lastCard = this.state.discardPile[this.state.discardPile.length-1];

    if (card.value === 'draw_four') {
      const colorsInHand = player.hand.filter((c: Card) => c.color !== 'wild').map((c: Card) => c.color);
      if (colorsInHand.includes(lastCard.color === 'wild' ? this.state.nextColor : lastCard.color)) return false;
      return true;
    }

    if (card.color === 'wild')
      return true;

    if (card.color === lastCard.color || card.value === lastCard.value)
      return true;

    if (lastCard.color === 'wild' && card.color === this.state.nextColor)
      return true;

    return false;
  }

  drawCard(player: Player, number: number = 1) {
    const cards = [];
    for (let i = 0; i < number; i++) {
      const card = this.state.drawCard(player);
      if (!card) break;
      cards.push(card);
      this.clients.forEach((client) => {
        client.send("draw", { playerId: player.id, card: client.id === player.id ? card : null });
      });
    }
    return cards;
  }

  startPOC() {
    clearTimeout(this.currentTurnTimeout);
    for (const client of this.clients) {
      const player = this.state.players.get(client.id);
      if (!player) continue;
      if (player.spectator || player.id === this.state.currentPlayerId) continue;

      this.state.pocList.push(player.id);
      client.send("poc");
    }
    this.state.beforeEffectPlayerId = this.state.currentPlayerId;
    this.state.currentPlayerId = 'NOPE';
    this.broadcast("new_turn", {
      playerId: 'NOPE',
      startTime: 0
    });
    this.pocTimeout = setTimeout(() => this.endPOC(), 5000);
  }

  endPOC() {
    clearTimeout(this.pocTimeout);
    for (const playerId of this.state.pocList) {
      const player = this.state.players.get(playerId);
      if (!player) continue;

      this.drawCard(player, 2);
      const disease = diseases[Math.floor(Math.random()*(diseases.length-1))]
      this.sendSystemMsg(`${player.name} pioche deux cartes et choppe un ${disease}`);
    }
    this.state.pocList.clear();
    this.state.currentPlayerId = this.state.beforeEffectPlayerId;
    this.nextTurn();
    this.state.beforeEffectPlayerId = 'NOPE';
  }

  reset() {
    clearTimeout(this.currentTurnTimeout);
    this.state.playing = false;
    this.state.currentPlayerId = 'NOPE';
    this.state.reversedPlayerOrder = false;
    this.state.nextColor = 'red';
    this.state.deck.clear();
    this.state.deckSize = 0;
    this.state.discardPile.clear();
    this.state.deck = this.state.generateDeck();
    this.state.shuffleDeck();
    for (const [_, player] of this.state.players) {
      player.spectator = false;
      player.hand.clear();
      player.handSize = 0;
      player.saidUno = false;
    }
  }

  win(player: Player) {
    this.sendSystemMsg(`${player.name} a gagné !`);
    this.broadcast("win", {
      playerId: player.id,
    });
    this.state.lastPlayAfk = new ArraySchema<string>(...Array.from(this.state.players.values()).filter(p => p.spectator).map(p => p.id));
    this.reset();
  }
}

