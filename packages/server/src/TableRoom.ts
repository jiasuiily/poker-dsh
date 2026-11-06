import { Room, type Client } from '@colyseus/core';
import {
  createGame,
  applyAction,
  validateAction,
  projectView,
  decideBeginner,
  decideAdvanced,
  decideTop,
  secureRng,
  potOf,
  newPlayerStats,
  updateStats,
  type PlayerStats,
  type GameState,
  type Action,
  type Street,
} from '@poker/core';
import { buyIn, aiBuyIn, settle, dailyGrant, ACCOUNTS } from '@poker/wallet';
import type { PersistentLedger } from '@poker/storage';
import type { PersonalityEngine, PersonalityContext } from '@poker/llm';

const AI_COUNT = 3;
const AI_DELAY_MS = 900;
const BUY_IN = 1000; // 人类每手买入
const AI_TOTAL = AI_COUNT * 1000;
const START_BALANCE = 10000; // 余额不足时的免费补充
const HUMAN_ACCOUNT = 'player:human';

type Difficulty = 'beginner' | 'advanced' | 'top';

export class TableRoom extends Room {
  private game!: GameState;
  private readonly humanSeat = 0;
  private readonly aiSeats = Array.from({ length: AI_COUNT }, (_, i) => i + 1);
  private aiTimer: ReturnType<typeof setTimeout> | undefined;
  private difficulty: Difficulty = 'advanced';
  private stats = new Map<number, PlayerStats>();
  private ledger!: PersistentLedger;
  private personality!: PersonalityEngine;
  private seq = 0;

  onCreate(options: { ledger: PersistentLedger; personality: PersonalityEngine }): void {
    this.ledger = options.ledger;
    this.personality = options.personality;
    this.maxClients = 1;
    for (let seat = 0; seat < 1 + AI_COUNT; seat++) this.stats.set(seat, newPlayerStats());
    this.onMessage('act', (_client, message) => this.handleAct(message));
    this.onMessage('new_hand', () => this.newHand());
  }

  onJoin(_client: Client, options?: { difficulty?: string }): void {
    if (options?.difficulty === 'beginner' || options?.difficulty === 'advanced' || options?.difficulty === 'top') {
      this.difficulty = options.difficulty;
    }
    this.ensureBalance();
    this.newHand();
  }

  onLeave(_client: Client): void {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    // 牌局未结束就离开：把桌上剩余筹码清算回账户
    if (this.game && this.game.phase !== 'complete') this.cashOut();
  }

  private seats() {
    return [
      { id: HUMAN_ACCOUNT, stack: BUY_IN },
      ...this.aiSeats.map((_, i) => ({ id: `ai-${i}`, stack: BUY_IN })),
    ];
  }

  private ensureBalance(): void {
    if (this.ledger.balance(HUMAN_ACCOUNT) < BUY_IN) {
      dailyGrant(this.ledger, { playerId: HUMAN_ACCOUNT, seq: Date.now(), amount: START_BALANCE });
    }
  }

  private newHand(): void {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.ensureBalance();
    // 买入：人类钱包→托管，AI 资金→托管
    buyIn(this.ledger, { playerId: HUMAN_ACCOUNT, tableId: this.roomId, seq: this.seq++, amount: BUY_IN });
    aiBuyIn(this.ledger, { tableId: this.roomId, seq: this.seq++, amount: AI_TOTAL });
    for (const [seat, st] of this.stats) {
      this.stats.set(seat, { ...st, hands: st.hands + 1 });
    }
    this.game = createGame({
      seats: this.seats(),
      smallBlind: 10,
      bigBlind: 20,
      buttonSeat: 0,
    });
    this.broadcastState();
    this.pump();
  }

  private handleAct(raw: unknown): void {
    if (this.game.phase !== 'betting') return;
    if (this.game.currentSeat !== this.humanSeat) return;
    const action = raw as Action;
    if (!action || typeof action !== 'object' || validateAction(this.game, action) !== null) return;
    this.applyTracked(this.humanSeat, action);
  }

  private pump(): void {
    if (this.game.phase !== 'betting') return;
    const seat = this.game.currentSeat;
    if (!this.aiSeats.includes(seat)) return;
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = setTimeout(() => {
      this.aiTimer = undefined;
      if (this.game.phase !== 'betting') return;
      const view = projectView(this.game, seat);
      let action: Action;
      if (this.difficulty === 'top') {
        action = decideTop(view, secureRng, this.stats);
      } else if (this.difficulty === 'advanced') {
        action = decideAdvanced(view, secureRng);
      } else {
        action = decideBeginner(view, secureRng);
      }
      if (validateAction(this.game, action) !== null) {
        const toCall = this.game.highestBet - this.game.players[seat].streetBet;
        action = toCall === 0 ? { type: 'check' } : { type: 'call' };
      }
      this.applyTracked(seat, action);
    }, AI_DELAY_MS);
  }

  private applyTracked(seat: number, action: Action): void {
    const street = this.game.street;
    this.game = applyAction(this.game, action);
    const st = this.stats.get(seat) ?? newPlayerStats();
    this.stats.set(seat, updateStats(st, action, street as Street));
    if (this.game.phase === 'complete') this.settleHand();
    if (this.aiSeats.includes(seat)) this.maybeChat(seat, action, street);
    this.broadcastState();
    this.pump();
  }

  /** AI 行动后异步生成一句人格台词并广播（不阻塞、失败静默） */
  private maybeChat(seat: number, action: Action, street: Street): void {
    const view = projectView(this.game, seat);
    const ctx: PersonalityContext = {
      street,
      pot: potOf(this.game),
      actionType: action.type,
      amount: 'amount' in action ? (action as { amount?: number }).amount : undefined,
      holeCards: view.holeCards,
    };
    void this.personality.line(ctx).then((line) => {
      this.broadcast('chat', { seat, line });
    });
  }

  /** 摊牌/结束：托管 → 各赢家账户（人类 → 钱包，AI → AI 资金账户） */
  private settleHand(): void {
    const humanChips = this.game.players[this.humanSeat].stack;
    const aiChips = this.aiSeats.reduce((s, seat) => s + this.game.players[seat].stack, 0);
    settle(this.ledger, {
      tableId: this.roomId,
      seq: this.seq++,
      payouts: [
        { accountId: HUMAN_ACCOUNT, amount: humanChips },
        { accountId: ACCOUNTS.aiBank, amount: aiChips },
      ],
    });
  }

  private cashOut(): void {
    const humanChips =
      this.game.players[this.humanSeat].stack + this.game.players[this.humanSeat].committed;
    const aiChips = this.aiSeats.reduce(
      (s, seat) => s + this.game.players[seat].stack + this.game.players[seat].committed,
      0,
    );
    settle(this.ledger, {
      tableId: this.roomId,
      seq: this.seq++,
      payouts: [
        { accountId: HUMAN_ACCOUNT, amount: humanChips },
        { accountId: ACCOUNTS.aiBank, amount: aiChips },
      ],
    });
  }

  private broadcastState(): void {
    const g = this.game;
    const pub = {
      handId: g.handId,
      street: g.street,
      board: g.board,
      pot: potOf(g),
      smallBlind: g.smallBlind,
      bigBlind: g.bigBlind,
      buttonSeat: g.buttonSeat,
      currentSeat: g.currentSeat,
      highestBet: g.highestBet,
      minRaiseIncrement: g.minRaiseIncrement,
      phase: g.phase,
      wallet: this.ledger.balance(HUMAN_ACCOUNT),
      winners: g.winners,
      showdown:
        g.phase === 'complete'
          ? g.revealed.map((r) => ({
              seat: r.seat,
              holeCards: g.players[r.seat].holeCards,
              rank: r.rank,
            }))
          : null,
      players: g.players.map((p) => ({
        seat: p.seat,
        id: p.id,
        stack: p.stack,
        streetBet: p.streetBet,
        committed: p.committed,
        status: p.status,
      })),
      history: g.log.map((e) => ({ seq: e.seq, street: e.street, seat: e.seat, kind: e.kind, to: e.to, allIn: e.allIn })),
    };
    this.broadcast('state', pub);
    const client = this.clients[0];
    client?.send('private', {
      seat: this.humanSeat,
      holeCards: g.players[this.humanSeat].holeCards,
    });
  }
}
