/**
 * 顶级 AI（阶段 4 已实现，独立导出）：蒙特卡洛 + 对手建模 + 混合策略。
 */
import type { Action, PlayerView, Rng } from '@poker/core';
import { monteCarloEquity } from '@poker/core';
import { preflopStrength } from './beginner';
import { aggressionRate, type PlayerStats } from './stats';

export function decideTop(view: PlayerView, rng: Rng, opponentStats: Map<number, PlayerStats>): Action {
  const opponents = view.players.filter((p) => p.seat !== view.seat && p.status !== 'folded');
  const iterations = 400;
  let strength: number;
  let equity = 0;
  if (view.board.length === 0) {
    strength = preflopStrength(view.holeCards);
  } else {
    equity = monteCarloEquity(view.holeCards, view.board, opponents.length, iterations, rng);
    strength = Math.round(equity * 10);
  }

  let avgAggression = 0.5;
  if (opponents.length > 0) {
    let sum = 0;
    for (const o of opponents) {
      const st = opponentStats.get(o.seat);
      sum += st ? aggressionRate(st) : 0.5;
    }
    avgAggression = sum / opponents.length;
  }

  const toCall = view.toCall;
  const maxTotal = view.stack + view.streetBet;

  if (toCall === 0) {
    if (strength >= 8 && rng(100) < 20) return { type: 'check' };
    if (strength >= 6) {
      const bet = Math.min(view.bigBlind * (1 + Math.floor(strength / 3)), view.stack);
      if (bet > 0 && bet <= view.stack) return { type: 'bet', amount: bet };
    }
    if (strength <= 3 && rng(100) < 25) {
      const bet = Math.min(view.bigBlind * 2, view.stack);
      if (bet > 0 && bet <= view.stack) return { type: 'bet', amount: bet };
    }
    return { type: 'check' };
  }

  if (view.board.length > 0) {
    const potOdds = toCall / (view.pot + toCall);
    const foldThreshold = potOdds - 0.05 + (avgAggression - 0.5) * 0.1;
    if (equity < foldThreshold && rng(100) < 80) return { type: 'fold' };
    if (equity >= 0.68) {
      const minRaiseTo = view.highestBet + view.minRaiseIncrement;
      if (maxTotal >= minRaiseTo) return { type: 'raise', amount: minRaiseTo };
    }
    return { type: 'call' };
  }

  if (strength <= 2 && rng(100) < 70) return { type: 'fold' };
  if (strength >= 6) {
    const minRaiseTo = view.highestBet + view.minRaiseIncrement;
    if (maxTotal >= minRaiseTo && rng(100) < 65) return { type: 'raise', amount: minRaiseTo };
  }
  return { type: 'call' };
}
