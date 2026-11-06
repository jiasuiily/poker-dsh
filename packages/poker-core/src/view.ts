/**
 * 玩家视角投影：把牌局状态投影成「某个座位可见的信息」。
 * 关键：只包含该座位自己的底牌，绝不含其他玩家底牌（从结构上杜绝信息泄漏）。
 * 观战者（seat 为 null）看不到任何底牌，只在摊牌后看到亮出的牌。
 */
import type { Card } from './cards';
import type { ActionLogEntry, GameState, PlayerStatus, Street } from './game';
import { potOf } from './game';

export interface PlayerPublicInfo {
  seat: number;
  stack: number;
  streetBet: number;
  committed: number;
  status: PlayerStatus;
}

/** 摊牌时亮出的底牌 */
export interface ShownHand {
  seat: number;
  holeCards: Card[];
}

export interface PlayerView {
  /** 观看者座位（观战者为 -1） */
  seat: number;
  /** 自己的底牌（观战者为空；其余玩家底牌不在此结构中） */
  holeCards: Card[];
  /** 自己的筹码 */
  stack: number;
  /** 自己本街已下注 */
  streetBet: number;
  /** 自己本手累计投入 */
  committed: number;
  /** 所有玩家的公开信息（无底牌） */
  players: PlayerPublicInfo[];
  board: Card[];
  street: Street;
  pot: number;
  smallBlind: number;
  bigBlind: number;
  buttonSeat: number;
  currentSeat: number;
  highestBet: number;
  minRaiseIncrement: number;
  /** 自己还需跟注多少（观战者为 0） */
  toCall: number;
  /** 牌局阶段 */
  phase: 'betting' | 'complete';
  /** 公开动作历史（谁在哪条街做了什么） */
  history: ActionLogEntry[];
  /** 摊牌后亮出的底牌（仅牌局结束时非空） */
  shown: ShownHand[];
}

/** 将状态投影为 seat 的可见视图（seat 为 null 表示观战者） */
export function projectView(state: GameState, seat: number | null): PlayerView {
  const me = seat !== null ? state.players[seat] : undefined;
  if (seat !== null && !me) throw new Error(`invalid seat: ${seat}`);
  return {
    seat: seat ?? -1,
    holeCards: me ? me.holeCards.slice() : [],
    stack: me ? me.stack : 0,
    streetBet: me ? me.streetBet : 0,
    committed: me ? me.committed : 0,
    players: state.players.map((p) => ({
      seat: p.seat,
      stack: p.stack,
      streetBet: p.streetBet,
      committed: p.committed,
      status: p.status,
    })),
    board: state.board.slice(),
    street: state.street,
    pot: potOf(state),
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    buttonSeat: state.buttonSeat,
    currentSeat: state.currentSeat,
    highestBet: state.highestBet,
    minRaiseIncrement: state.minRaiseIncrement,
    toCall: me ? state.highestBet - me.streetBet : 0,
    phase: state.phase,
    history: state.log.map((e) => ({ ...e })),
    shown:
      state.phase === 'complete'
        ? state.revealed.map((r) => ({ seat: r.seat, holeCards: state.players[r.seat].holeCards.slice() }))
        : [],
  };
}
