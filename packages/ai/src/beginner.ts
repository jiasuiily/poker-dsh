/**
 * 初级 AI：按风格参数缩放的新手玩法。
 */
import type { Action, PlayerView, Rng } from '@poker/core';
import { rankOf, suitOf } from '@poker/core';
import { evaluate } from '@poker/core';
import type { BotStyle } from './styles';
import type { Bot } from './types';

/** 粗略手牌强度 0..10 */
export function handStrength(view: PlayerView): number {
  if (view.board.length === 0) {
    const a = rankOf(view.holeCards[0]);
    const b = rankOf(view.holeCards[1]);
    const pair = a === b;
    const high = Math.max(a, b);
    let s = high;
    if (pair) s += 5;
    if (high >= 10 && !pair) s += 2;
    return Math.max(0, Math.min(10, Math.floor(s / 2)));
  }
  return Math.max(0, Math.min(10, evaluate([...view.holeCards, ...view.board]).category));
}

/** 翻前起手牌强度 0..10（对子整体高于非对子） */
export function preflopStrength(holeCards: number[]): number {
  const r1 = rankOf(holeCards[0]);
  const r2 = rankOf(holeCards[1]);
  const suited = suitOf(holeCards[0]) === suitOf(holeCards[1]);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  let score: number;
  if (r1 === r2) {
    score = 30 + high * 2;
  } else {
    score = high * 2 + low / 5;
    if (high - low <= 2) score += 1;
    if (suited) score += 1;
    if (high >= 12 && low >= 10) score += 2;
  }
  return Math.max(0, Math.min(10, Math.floor(score / 5)));
}

/** 按风格缩放：入池阈值 ÷ looseness、加注概率 × aggression、诈唬 × bluff、跟注 × stickiness、尺度 × sizing */
export function makeBeginnerBot(style: BotStyle): Bot {
  const decide = (view: PlayerView, rng: Rng): Action => {
    const strength = handStrength(view);
    const roll = rng(100);
    const toCall = view.toCall;

    if (toCall === 0) {
      if (strength <= 2 && roll < 10 * style.bluff) {
        const bet = Math.min(Math.floor(view.bigBlind * 2 * style.sizing), view.stack);
        if (bet > 0) return { type: 'bet', amount: bet };
      }
      if (roll < (55 + strength * 2) / style.looseness) return { type: 'check' };
      const bet = Math.min(
        Math.floor(view.bigBlind * (1 + Math.floor(strength / 4)) * style.sizing),
        view.stack,
      );
      if (bet <= 0 || bet > view.stack) return { type: 'check' };
      return { type: 'bet', amount: bet };
    }

    if (strength <= 2 && roll < 40 / style.looseness) return { type: 'fold' };
    const minRaiseTo = view.highestBet + view.minRaiseIncrement;
    const maxTotal = view.stack + view.streetBet;
    if (maxTotal >= minRaiseTo && roll < Math.min(95, 15 * style.aggression)) {
      return { type: 'raise', amount: Math.min(minRaiseTo, maxTotal) };
    }
    if (roll < Math.min(95, 70 * style.stickiness)) return { type: 'call' };
    return { type: 'fold' };
  };

  return { level: 'beginner', style: style.id, decide };
}
