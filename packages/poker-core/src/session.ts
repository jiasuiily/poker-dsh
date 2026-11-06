/**
 * 牌局会话层：把「单手牌」串成一场现金局或锦标赛。
 * - 盲注结构（levels）+ 按手数升级（时间到后下一手才生效）
 * - 按钮逐手移动（跳过已淘汰座位）
 * - 淘汰判定（stack 归零即淘汰；锦标赛剩 1 人结束）
 *
 * 单手牌的规则仍在 game.ts（createGame / applyAction），本层只管「手与手之间」。
 */
import type { Rng } from './cards';
import { secureRng } from './cards';
import type { GameState } from './game';
import { createGame } from './game';

export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
}

export interface SessionConfig {
  /** 各座位初始筹码（>0 表示该座位有人，0 表示空/已淘汰） */
  stacks: number[];
  startingButtonSeat: number;
  /** 盲注结构：现金局给一个级别；锦标赛给递增的多个级别 */
  levels: BlindLevel[];
  /** 每多少手升一级（现金局无所谓，锦标赛用） */
  handsPerLevel: number;
  rng?: Rng;
  handIdPrefix?: string;
}

export interface SessionState {
  config: SessionConfig;
  stacks: number[];
  buttonSeat: number;
  /** 已发到第几手（从 1 开始） */
  handNumber: number;
}

export interface DealResult {
  game: GameState;
  /** 紧凑座位 i -> 原始座位号 */
  seatMap: number[];
}

export function createSession(config: SessionConfig): SessionState {
  if (config.levels.length === 0) throw new Error('need at least one blind level');
  if (config.stacks.length < 2) throw new Error('need at least 2 seats');
  if (config.stacks[config.startingButtonSeat] <= 0) throw new Error('button seat must be occupied');
  return {
    config,
    stacks: config.stacks.slice(),
    buttonSeat: config.startingButtonSeat,
    handNumber: 1,
  };
}

/** 当前盲注（按已发手数自动升级，升级只在下一手生效） */
export function currentBlinds(session: SessionState): BlindLevel {
  const { levels, handsPerLevel } = session.config;
  const idx = Math.min(levels.length - 1, Math.floor((session.handNumber - 1) / handsPerLevel));
  return levels[idx];
}

/** 当前盲注级别索引 */
export function currentLevelIndex(session: SessionState): number {
  return Math.min(session.config.levels.length - 1, Math.floor((session.handNumber - 1) / session.config.handsPerLevel));
}

/** 存活座位（stack > 0） */
export function survivors(session: SessionState): number[] {
  return session.stacks.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0);
}

/** 锦标赛是否结束（只剩 1 人） */
export function isTournamentOver(session: SessionState): boolean {
  return survivors(session).length <= 1;
}

/** 发一手牌：只用存活座位，按当前盲注与按钮（返回座位映射以便结算回写） */
export function dealHand(session: SessionState, rng: Rng = secureRng): DealResult {
  const active = survivors(session);
  if (active.length < 2) throw new Error('game is already over');
  const blinds = currentBlinds(session);
  const seats = active.map((origSeat) => ({ id: `p${origSeat}`, stack: session.stacks[origSeat] }));
  const buttonSeat = active.indexOf(session.buttonSeat);
  if (buttonSeat < 0) throw new Error('button seat is eliminated');
  const game = createGame({
    seats,
    smallBlind: blinds.smallBlind,
    bigBlind: blinds.bigBlind,
    buttonSeat,
    rng,
    handId: `${session.config.handIdPrefix ?? 'hand'}-${session.handNumber}`,
  });
  return { game, seatMap: active };
}

function nextActiveSeat(stacks: number[], fromSeat: number): number {
  const n = stacks.length;
  for (let i = 1; i <= n; i++) {
    const seat = (fromSeat + i) % n;
    if (stacks[seat] > 0) return seat;
  }
  return -1;
}

/** 一手牌结束后：回写筹码、标记淘汰、推进按钮与手数 */
export function commitHand(session: SessionState, result: DealResult): SessionState {
  const { game, seatMap } = result;
  if (game.phase !== 'complete') throw new Error('hand is not complete yet');
  const stacks = session.stacks.slice();
  game.players.forEach((p, i) => {
    stacks[seatMap[i]] = p.stack;
  });
  return {
    config: session.config,
    stacks,
    buttonSeat: nextActiveSeat(stacks, session.buttonSeat),
    handNumber: session.handNumber + 1,
  };
}
