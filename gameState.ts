import { Schema, ArraySchema, MapSchema, type, filter, filterChildren } from "@colyseus/schema";
import { Client } from "colyseus";

export class Card extends Schema {
  @type("string")
  id: string;

  @type("string")
  color: string;

  @type("string")
  value: string;

  constructor(color: string, value: string) {
    super();
    this.id = color+'_'+value;
    this.color = color;
    this.value = value;
  }
}

export class Player extends Schema {
  @type("string")
  id: string;

  @type("string")
  name: string;

  @type("string")
  avatar: string;

  @filter(function(
    this: Player,
    client: Client,
    value: ArraySchema<Card>,
    root: GameState
  ) {
      const player = root.players.get(client.id);
      if (!player || this.id !== client.id) return false;
      return true;
    })
  @type([Card])
  hand: ArraySchema<Card> = new ArraySchema<Card>();

  @type("number")
  handSize: number = 0;

  @type("boolean")
  saidUno: boolean = false;

  @type("boolean")
  spectator: boolean = false;

  constructor(id: string, name: string, avatar: string) {
    super();
    this.id = id;
    this.name = name;
    this.avatar = avatar;
  }
}

export class GameState extends Schema {
  @type("boolean")
  playing = false;

  @type({ map: Player })
  players = new MapSchema<Player>();

  @filter(function(
    this: Player,
    client: Client,
    value: ArraySchema<Card>,
    root: GameState
  ) {
      return false;
    })
  @type([Card])
  deck: ArraySchema<Card> = new ArraySchema<Card>();

  @type("number")
  deckSize: number = 0;

  @type([Card])
  discardPile: ArraySchema<Card> = new ArraySchema<Card>();

  @type("string")
  currentPlayerId: string = "NOPE";

  @type("number")
  turnStartTime: number = 0;

  @type("string")
  kingPlayerId: string = "NOPE";

  @type("boolean")
  reversedPlayerOrder: boolean = false;

  @type("string")
  nextColor: string = 'red';

  @type(["string"])
  pocList: ArraySchema<string> = new ArraySchema<string>();

  @type(["string"])
  lastPlayAfk: ArraySchema<string> = new ArraySchema<string>();

  @type("string")
  beforeEffectPlayerId: string = "NOPE";

  constructor() {
    super();
    this.deck = this.generateDeck();
    this.shuffleDeck();
  }

  generateDeck(): ArraySchema<Card> {
    const colors = ["red", "yellow", "green", "blue"];
    const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw_two"];
    const deck = new ArraySchema<Card>();

    for (let color of colors) {
      for (let value of values) {
        deck.push(new Card(color, value));
        if (value !== "0") {
          deck.push(new Card(color, value));
        }
      }
    }

    // Add wild cards
    for (let i = 0; i < 4; i++) {
      deck.push(new Card("wild", "wild"));
      deck.push(new Card("wild", "draw_four"));
      deck.push(new Card("wild", "poc"));
    }

    this.deckSize = deck.length;
    return deck;
  }

  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  drawCard(player: Player): Card|null {
    const card = this.deck.shift();
    if (!card) return null;
    player.hand.push(card);
    player.handSize++;
    player.saidUno = false;
    this.deckSize--;
    return card;
  }

  addPlayer(clientId: string, name: string, avatar: string) {
    const newPlayer = new Player(clientId, name, avatar);
    if (this.playing) newPlayer.spectator = true;
    this.players.set(clientId, newPlayer);
    if (this.kingPlayerId === 'NOPE') {
      this.kingPlayerId = clientId;
    }
  }

  dealCards() {
    for (const player of this.players.values()) {
      for (let i = 0; i < 7; i++) {
        this.drawCard(player);
      }
    }
  }
}

