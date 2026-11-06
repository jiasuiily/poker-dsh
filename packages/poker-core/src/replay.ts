/**
 * 牌谱回放：给定完整初始牌序 + 公开动作日志，按观看者视角生成逐步回放帧。
 * 帧分为 start（发完底牌下完盲注）/ action（每个动作后）/ street（发新街）。
 * 观战者（viewerSeat = null）看不到任何底牌，只在摊牌后看到亮出的牌。
 */
import type { Card } from './cards';
import type { Action, ActionLogEntry, GameConfig } from './game';
import { applyAction, createGame } from './game';
import type { PlayerView } from './view';
import { projectView } from './view';

export type ReplayFrame =
  | { kind: 'start'; view: PlayerView }
  | { kind: 'action'; entry: ActionLogEntry; view: PlayerView }
  | { kind: 'street'; street: 'flop' | 'turn' | 'river'; cards: Card[]; view: PlayerView };

/** 由公开日志条目重建可重放的 Action（all-in 统一用全下） */
export function actionFromLogEntry(entry: ActionLogEntry): Action {
  if (entry.allIn) return { type: 'allin' };
  switch (entry.kind) {
    case 'fold':
      return { type: 'fold' };
    case 'check':
      return { type: 'check' };
    case 'call':
      return { type: 'call' };
    case 'bet':
      return { type: 'bet', amount: entry.to };
    case 'raise':
      return { type: 'raise', amount: entry.to };
  }
}

export function buildReplayFrames(
  config: Omit<GameConfig, 'deck'>,
  initialDeck: Card[],
  log: ActionLogEntry[],
  viewerSeat: number | null,
): ReplayFrame[] {
  let state = createGame({ ...config, deck: initialDeck });
  const frames: ReplayFrame[] = [{ kind: 'start', view: projectView(state, viewerSeat) }];
  let prevLen = state.board.length;

  for (const entry of log) {
    state = applyAction(state, actionFromLogEntry(entry));
    const view = projectView(state, viewerSeat);
    frames.push({ kind: 'action', entry, view });

    const newLen = state.board.length;
    if (newLen > prevLen) {
      const board = state.board;
      if (prevLen < 3 && newLen >= 3) {
        frames.push({ kind: 'street', street: 'flop', cards: board.slice(0, 3), view });
      }
      if (prevLen < 4 && newLen >= 4) {
        frames.push({ kind: 'street', street: 'turn', cards: board.slice(3, 4), view });
      }
      if (prevLen < 5 && newLen >= 5) {
        frames.push({ kind: 'street', street: 'river', cards: board.slice(4, 5), view });
      }
    }
    prevLen = newLen;
  }
  return frames;
}
