/**
 * 德州扑克下注状态机（纯函数、不可变）。
 *
 * 设计要点：
 * - 事件溯源：一手牌 = 洗牌后的牌序 + 动作日志，可重放。
 * - 边池：由各玩家累计投入（committed）分层计算，天然处理「未被跟注退还」。
 * - 不完整加注：不足额全下不重开加注权（minRaiseIncrement 不变）。
 * - 摊牌：最后进攻者先亮牌；无人进攻时按按钮左侧依次；平分余数给按钮左侧第一位。
 */
import type { Card, Rng } from './cards';
import { createDeck, secureRng, shuffle } from './cards';
import type { HandRank } from './evaluator';
import { compareHandRanks, evaluate } from './evaluator';

export type PlayerStatus = 'active' | 'folded' | 'allin';

export interface Player {
  id: string;
  seat: number;
  /** 桌上可用筹码（不含本街已下注） */
  stack: number;
  status: PlayerStatus;
  /** 两张底牌（引擎内部可见；对外需投影为 PlayerView） */
  holeCards: Card[];
  /** 本街已下注 */
  streetBet: number;
  /** 本手累计投入（跨街） */
  committed: number;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }
  | { type: 'allin' };

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise';

/** 公开动作日志条目（不含底牌，可安全发给前端/大模型） */
export interface ActionLogEntry {
  seq: number;
  street: Street;
  seat: number;
  kind: ActionKind;
  /** 动作后该玩家本街的总投入 */
  to: number;
  allIn: boolean;
}

export interface SidePot {
  amount: number;
  eligibleSeats: number[];
}

export interface Award {
  seat: number;
  amount: number;
}

export interface RevealedHand {
  seat: number;
  rank: HandRank;
}

export interface GameState {
  handId: string;
  players: Player[];
  deck: Card[];
  /** 完整初始牌序（发牌前，52 张），用于牌谱回放 */
  initialDeck: Card[];
  board: Card[];
  street: Street;
  smallBlind: number;
  bigBlind: number;
  buttonSeat: number;
  /** 当前行动座位（-1 表示无，牌局已结束） */
  currentSeat: number;
  /** 本街最高总下注 */
  highestBet: number;
  /** 最小加注增量（不足额全下不变） */
  minRaiseIncrement: number;
  /** 本街最后一个做出完整下注/加注的座位（-1 表示无） */
  lastAggressorSeat: number;
  /** 最后一次进攻性动作是否是不足额全下（不足额不重开加注权） */
  lastRaiseIncomplete: boolean;
  /** 本街已经行动过的座位（用于判断下注轮是否结束） */
  actedSeats: number[];
  phase: 'betting' | 'complete';
  winners: Award[];
  revealed: RevealedHand[];
  log: ActionLogEntry[];
  seq: number;
}

export interface SeatConfig {
  id: string;
  stack: number;
}

export interface GameConfig {
  /** 座位按座位号（index）排列 */
  seats: SeatConfig[];
  smallBlind: number;
  bigBlind: number;
  buttonSeat: number;
  rng?: Rng;
  handId?: string;
  /** 预定的整副牌序（52 张，用于重放；缺省则用 rng 洗牌） */
  deck?: Card[];
}

function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, holeCards: p.holeCards.slice() })),
    deck: s.deck.slice(),
    initialDeck: s.initialDeck.slice(),
    board: s.board.slice(),
    winners: s.winners.map((w) => ({ ...w })),
    revealed: s.revealed.map((r) => ({ ...r })),
    actedSeats: s.actedSeats.slice(),
    log: s.log.map((e) => ({ ...e })),
  };
}

function postBlind(p: Player, amount: number): void {
  const pay = Math.min(amount, p.stack);
  p.stack -= pay;
  p.streetBet += pay;
  p.committed += pay;
  if (p.stack === 0) p.status = 'allin';
}

function contenders(s: GameState): Player[] {
  return s.players.filter((p) => p.status !== 'folded');
}

function activeSeats(s: GameState): Player[] {
  return s.players.filter((p) => p.status === 'active');
}

function nextActiveAfter(s: GameState, fromSeat: number): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (fromSeat + i) % n;
    if (s.players[seat].status === 'active') return seat;
  }
  return -1;
}

function bettingRoundDone(s: GameState): boolean {
  const c = contenders(s);
  if (c.length <= 1) return true;
  const a = activeSeats(s);
  if (a.length === 0) return true;
  return a.every((p) => s.actedSeats.includes(p.seat) && p.streetBet === s.highestBet);
}

function dealNextStreet(s: GameState): void {
  switch (s.street) {
    case 'preflop':
      s.board.push(s.deck.pop()!, s.deck.pop()!, s.deck.pop()!);
      s.street = 'flop';
      break;
    case 'flop':
      s.board.push(s.deck.pop()!);
      s.street = 'turn';
      break;
    case 'turn':
      s.board.push(s.deck.pop()!);
      s.street = 'river';
      break;
    default:
      throw new Error('cannot deal beyond river');
  }
}

function resetStreet(s: GameState): void {
  for (const p of s.players) if (p.status !== 'folded') p.streetBet = 0;
  s.highestBet = 0;
  s.minRaiseIncrement = s.bigBlind;
  s.lastAggressorSeat = -1;
  s.lastRaiseIncomplete = false;
  s.actedSeats = [];
}

/** 让目标座位在本街的总投入达到 targetBet */
function commit(s: GameState, p: Player, targetBet: number): void {
  const pay = targetBet - p.streetBet;
  p.stack -= pay;
  p.committed += pay;
  p.streetBet = targetBet;
  if (p.stack === 0) p.status = 'allin';
  if (targetBet > s.highestBet) {
    const inc = targetBet - s.highestBet;
    const isFull = s.highestBet === 0 ? targetBet >= s.bigBlind : inc >= s.minRaiseIncrement;
    if (isFull) {
      s.minRaiseIncrement = s.highestBet === 0 ? targetBet : inc;
      s.lastRaiseIncomplete = false;
    } else {
      s.lastRaiseIncomplete = true;
    }
    s.highestBet = targetBet;
    s.lastAggressorSeat = p.seat;
  }
}

function awardAllTo(s: GameState, seat: number): void {
  const total = s.players.reduce((sum, p) => sum + p.committed, 0);
  s.players[seat].stack += total;
  s.winners.push({ seat, amount: total });
  for (const p of s.players) p.committed = 0;
  s.phase = 'complete';
  s.currentSeat = -1;
}

/** 按按钮左侧第一位优先排列（平分余数用） */
function orderFromButton(seats: number[], buttonSeat: number, seatCount: number): number[] {
  return [...seats].sort((a, b) => {
    const da = (a - buttonSeat + seatCount) % seatCount;
    const db = (b - buttonSeat + seatCount) % seatCount;
    const na = da === 0 ? seatCount : da;
    const nb = db === 0 ? seatCount : db;
    return na - nb;
  });
}

/** 由累计投入分层计算边池 */
export function computeSidePots(players: Player[]): SidePot[] {
  const levels = [...new Set(players.filter((p) => p.committed > 0).map((p) => p.committed))].sort(
    (a, b) => a - b,
  );
  const pots: SidePot[] = [];
  let prev = 0;
  for (const L of levels) {
    const contributors = players.filter((p) => p.committed >= L).length;
    const eligibleSeats = players
      .filter((p) => p.committed >= L && p.status !== 'folded')
      .map((p) => p.seat);
    const amount = (L - prev) * contributors;
    if (amount > 0) pots.push({ amount, eligibleSeats });
    prev = L;
  }
  return pots;
}

function runShowdown(s: GameState): void {
  const board = s.board;
  const ranks = new Map<number, HandRank>();
  for (const p of s.players) {
    if (p.status !== 'folded') ranks.set(p.seat, evaluate([...p.holeCards, ...board]));
  }
  s.revealed = [...ranks.entries()].map(([seat, rank]) => ({ seat, rank }));

  const pots = computeSidePots(s.players);
  let carry = 0;
  for (let i = pots.length - 1; i >= 0; i--) {
    const pot = pots[i];
    const amount = pot.amount + carry;
    if (pot.eligibleSeats.length === 0) {
      carry = amount;
      continue;
    }
    carry = 0;
    let bestSeats: number[] = [];
    let bestRank: HandRank | null = null;
    for (const seat of pot.eligibleSeats) {
      const r = ranks.get(seat);
      if (!r) continue;
      if (bestRank === null || compareHandRanks(r, bestRank) > 0) {
        bestRank = r;
        bestSeats = [seat];
      } else if (compareHandRanks(r, bestRank) === 0) {
        bestSeats.push(seat);
      }
    }
    const ordered = orderFromButton(bestSeats, s.buttonSeat, s.players.length);
    const base = Math.floor(amount / ordered.length);
    const rem = amount % ordered.length;
    ordered.forEach((seat, j) => {
      const win = base + (j < rem ? 1 : 0);
      s.players[seat].stack += win;
      s.winners.push({ seat, amount: win });
    });
  }
  for (const p of s.players) p.committed = 0;
  s.phase = 'complete';
  s.currentSeat = -1;
}

function forceRunout(s: GameState): void {
  while (s.street !== 'river') {
    dealNextStreet(s);
    resetStreet(s);
  }
  runShowdown(s);
}

function settleAfterAction(s: GameState): void {
  const c = contenders(s);
  if (c.length === 1) {
    awardAllTo(s, c[0].seat);
    return;
  }
  if (bettingRoundDone(s)) {
    while (s.street !== 'river') {
      dealNextStreet(s);
      resetStreet(s);
      if (activeSeats(s).length > 0) {
        s.currentSeat = nextActiveAfter(s, s.buttonSeat);
        return;
      }
    }
    runShowdown(s);
    return;
  }
  s.currentSeat = nextActiveAfter(s, s.currentSeat);
}

/** 新建一局：洗牌、发底牌、下盲注、进入翻牌前下注 */
export function createGame(config: GameConfig): GameState {
  const rng = config.rng ?? secureRng;
  const seatCount = config.seats.length;
  if (seatCount < 2) throw new Error('need at least 2 players');
  if (config.buttonSeat < 0 || config.buttonSeat >= seatCount) throw new Error('invalid button seat');
  if (config.bigBlind <= 0 || config.smallBlind <= 0) throw new Error('blinds must be positive');

  const players: Player[] = config.seats.map((sc, seat) => ({
    id: sc.id,
    seat,
    stack: sc.stack,
    status: 'active' as PlayerStatus,
    holeCards: [],
    streetBet: 0,
    committed: 0,
  }));

  const sbSeat = seatCount === 2 ? config.buttonSeat : (config.buttonSeat + 1) % seatCount;
  const bbSeat = seatCount === 2 ? (config.buttonSeat + 1) % seatCount : (config.buttonSeat + 2) % seatCount;

  postBlind(players[sbSeat], config.smallBlind);
  postBlind(players[bbSeat], config.bigBlind);

  const deck = config.deck ? config.deck.slice() : shuffle(createDeck(), rng);
  const initialDeck = deck.slice();
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < seatCount; i++) {
      const seat = (sbSeat + i) % seatCount;
      players[seat].holeCards.push(deck.pop()!);
    }
  }

  const state: GameState = {
    handId: config.handId ?? `hand-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    players,
    deck,
    initialDeck,
    board: [],
    street: 'preflop',
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    buttonSeat: config.buttonSeat,
    currentSeat: -1,
    highestBet: Math.min(config.bigBlind, players[bbSeat].committed),
    minRaiseIncrement: config.bigBlind,
    lastAggressorSeat: bbSeat,
    lastRaiseIncomplete: false,
    actedSeats: [],
    phase: 'betting',
    winners: [],
    revealed: [],
    log: [],
    seq: 0,
  };

  // 翻牌前第一个行动者 = 大盲位之后第一个活跃座位（单挑时即按钮/小盲）
  state.currentSeat = nextActiveAfter(state, bbSeat);
  if (state.currentSeat === -1) forceRunout(state);
  return state;
}

/** 校验动作是否合法，返回 null 表示合法，否则返回原因 */
export function validateAction(state: GameState, action: Action): string | null {
  if (state.phase !== 'betting') return 'game not in betting phase';
  const p = state.players[state.currentSeat];
  if (!p || p.status !== 'active') return 'current seat is not an active player';
  const toCall = state.highestBet - p.streetBet;
  const maxTotal = p.streetBet + p.stack;
  switch (action.type) {
    case 'fold':
      return null;
    case 'check':
      return toCall === 0 ? null : 'cannot check, must call or fold';
    case 'call':
      return toCall > 0 ? null : 'nothing to call';
    case 'bet': {
      if (toCall !== 0) return 'cannot bet, there is a bet to call';
      const a = action.amount;
      if (!Number.isInteger(a) || a <= 0) return 'bet amount must be a positive integer';
      if (a > maxTotal) return 'bet exceeds stack';
      if (a < state.bigBlind && a !== maxTotal) return 'bet must be at least big blind (or all-in)';
      return null;
    }
    case 'raise': {
      if (toCall <= 0) return 'cannot raise, nothing to call';
      if (state.actedSeats.includes(state.currentSeat) && state.lastRaiseIncomplete) {
        return 'cannot re-raise after an incomplete all-in';
      }
      const a = action.amount;
      if (!Number.isInteger(a) || a <= state.highestBet) return 'raise must exceed the current bet';
      if (a > maxTotal) return 'raise exceeds stack';
      const fullMin = state.highestBet + state.minRaiseIncrement;
      if (a < fullMin && a !== maxTotal) return 'raise is too small (incomplete)';
      return null;
    }
    case 'allin':
      return p.stack > 0 ? null : 'already all-in';
  }
}

/** 应用一个合法动作，返回新状态（不修改原状态） */
export function applyAction(state: GameState, action: Action): GameState {
  const err = validateAction(state, action);
  if (err) throw new Error(`illegal action: ${err}`);
  const s = cloneState(state);
  const p = s.players[s.currentSeat];
  const street = s.street;
  const highestBetBefore = s.highestBet;

  if (!s.actedSeats.includes(p.seat)) s.actedSeats.push(p.seat);
  switch (action.type) {
    case 'fold':
      p.status = 'folded';
      break;
    case 'check':
      break;
    case 'call':
      commit(s, p, p.streetBet + Math.min(s.highestBet - p.streetBet, p.stack));
      break;
    case 'bet':
      commit(s, p, action.amount);
      break;
    case 'raise':
      commit(s, p, action.amount);
      break;
    case 'allin':
      commit(s, p, p.streetBet + p.stack);
      break;
  }

  const to = p.streetBet;
  const allIn = p.stack === 0;
  let kind: ActionKind;
  switch (action.type) {
    case 'fold':
      kind = 'fold';
      break;
    case 'check':
      kind = 'check';
      break;
    case 'call':
      kind = 'call';
      break;
    case 'bet':
      kind = 'bet';
      break;
    case 'raise':
      kind = 'raise';
      break;
    case 'allin':
      kind = to > highestBetBefore ? (highestBetBefore === 0 ? 'bet' : 'raise') : 'call';
      break;
  }
  s.log.push({ seq: s.seq, street, seat: p.seat, kind, to, allIn });
  s.seq++;

  settleAfterAction(s);
  return s;
}

/** 当前行动者的一组代表性合法动作（供 AI 与测试） */
export function legalActions(state: GameState): Action[] {
  const p = state.players[state.currentSeat];
  if (state.phase !== 'betting' || !p || p.status !== 'active') return [];
  const toCall = state.highestBet - p.streetBet;
  const maxTotal = p.streetBet + p.stack;
  const acts: Action[] = [{ type: 'fold' }];
  if (toCall === 0) acts.push({ type: 'check' });
  else acts.push({ type: 'call' });
  if (maxTotal > 0) {
    const min = toCall === 0 ? state.bigBlind : state.highestBet + state.minRaiseIncrement;
    if (maxTotal >= min) {
      acts.push(toCall === 0 ? { type: 'bet', amount: min } : { type: 'raise', amount: min });
    }
    acts.push({ type: 'allin' });
  }
  return acts.filter((a) => validateAction(state, a) === null);
}

/** 随机采样一个合法动作（属性测试/随机对局用） */
export function sampleAction(state: GameState, rng: Rng): Action {
  const p = state.players[state.currentSeat];
  const toCall = state.highestBet - p.streetBet;
  const maxTotal = p.streetBet + p.stack;
  const options: Action[] = [{ type: 'fold' }];
  if (toCall === 0) options.push({ type: 'check' });
  else options.push({ type: 'call' });
  if (maxTotal > 0) {
    const min = toCall === 0 ? state.bigBlind : state.highestBet + state.minRaiseIncrement;
    if (maxTotal >= min) {
      const amt = min + rng(maxTotal - min + 1);
      options.push(toCall === 0 ? { type: 'bet', amount: amt } : { type: 'raise', amount: amt });
    }
    options.push({ type: 'allin' });
  }
  const legal = options.filter((a) => validateAction(state, a) === null);
  return legal[rng(legal.length)];
}

/** 底池总额（所有投入之和，展示用） */
export function potOf(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.committed, 0);
}

/** 直接摊牌结算（测试/调试用），返回新状态 */
export function resolveShowdown(state: GameState): GameState {
  const s = cloneState(state);
  runShowdown(s);
  return s;
}

/** 牌谱回放：给定完整初始牌序 + 动作日志，重放出最终状态 */
export function replayHand(
  config: Omit<GameConfig, 'deck'>,
  initialDeck: Card[],
  actions: Action[],
): GameState {
  let state = createGame({ ...config, deck: initialDeck });
  for (const action of actions) {
    if (state.phase === 'betting') state = applyAction(state, action);
  }
  return state;
}
