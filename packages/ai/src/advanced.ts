/**
 * 高级 AI（Task 7 将改为基于 @poker/strategy 的范围/胜率实现）。
 * 当前保留原 decideAdvanced 作为占位，接口统一为 makeAdvancedBot(style)。
 */
import type { Action, PlayerView, Rng } from '@poker/core';
import { monteCarloEquity } from '@poker/core';
import { preflopStrength } from './beginner';
import type { BotStyle } from './styles';
import type { Bot } from './types';

export function decideAdvanced(view: PlayerView, rng: Rng): Action {
  const opponents = view.players.filter((p) => p.seat !== view.seat && p.status !== 'folded').length;
  const iterations = 300;
  let strength: number;
  let equity = 0;
  if (view.board.length === 0) {
    strength = preflopStrength(view.holeCards);
  } else {
    equity = monteCarloEquity(view.holeCards, view.board, opponents, iterations, rng);
    strength = Math.round(equity * 10);
  }

  const toCall = view.toCall;
  const maxTotal = view.stack + view.streetBet;

  if (toCall === 0) {
    if (strength >= 6) {
      const bet = Math.min(view.bigBlind * (1 + Math.floor(strength / 3)), view.stack);
      if (bet > 0 && bet <= view.stack) return { type: 'bet', amount: bet };
    }
    if (strength <= 3 && rng(100) < 15) {
      const bet = Math.min(view.bigBlind * 2, view.stack);
      if (bet > 0 && bet <= view.stack) return { type: 'bet', amount: bet };
    }
    return { type: 'check' };
  }

  if (view.board.length > 0) {
    const potOdds = toCall / (view.pot + toCall);
    if (equity < potOdds - 0.05 && rng(100) < 80) return { type: 'fold' };
    if (equity >= 0.7) {
      const minRaiseTo = view.highestBet + view.minRaiseIncrement;
      if (maxTotal >= minRaiseTo) return { type: 'raise', amount: minRaiseTo };
    }
    return { type: 'call' };
  }

  if (strength <= 2 && rng(100) < 70) return { type: 'fold' };
  if (strength >= 6) {
    const minRaiseTo = view.highestBet + view.minRaiseIncrement;
    if (maxTotal >= minRaiseTo && rng(100) < 60) return { type: 'raise', amount: minRaiseTo };
  }
  return { type: 'call' };
}

/** 高级 AI（当前忽略风格，Task 7 加入风格缩放） */
export function makeAdvancedBot(style: BotStyle): Bot {
  return { level: 'advanced', style: style.id, decide: decideAdvanced };
}
