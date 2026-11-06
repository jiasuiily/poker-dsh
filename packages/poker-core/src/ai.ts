/**
 * 电脑玩家 AI（本地算法）。
 * 决策只接收 PlayerView（与真人同构的视图），看不到对手底牌。
 */
import type { Rng } from './cards';
import { rankOf, suitOf } from './cards';
import { evaluate } from './evaluator';
import { monteCarloEquity } from './equity';
import type { Action } from './game';
import type { PlayerStats } from './stats';
import { aggressionRate } from './stats';
import type { PlayerView } from './view';

export type DecisionFn = (view: PlayerView, rng: Rng) => Action;

/** 粗略手牌强度 0..10（越大越强） */
export function handStrength(view: PlayerView): number {
  if (view.board.length === 0) {
    // 翻牌前：起手牌强度表（对子 + 高点）
    const a = rankOf(view.holeCards[0]);
    const b = rankOf(view.holeCards[1]);
    const pair = a === b;
    const high = Math.max(a, b);
    let s = high;
    if (pair) s += 5;
    if (high >= 10 && !pair) s += 2; // 带 A/K 的高牌略加分
    return Math.max(0, Math.min(10, Math.floor(s / 2)));
  }
  // 翻牌后：直接看牌型类别
  return Math.max(0, Math.min(10, evaluate([...view.holeCards, ...view.board]).category));
}

/**
 * 初级 AI：刻意保留新手毛病——偏被动、爱跟注、少弃牌、下注小、偶尔乱诈。
 * 返回的动作保证合法（跟注/过牌/弃牌）；下注/加注金额按合法区间构造。
 */
export function decideBeginner(view: PlayerView, rng: Rng): Action {
  const strength = handStrength(view);
  const roll = rng(100);

  if (view.toCall === 0) {
    // 可以过牌
    if (roll < 55 + strength * 2) return { type: 'check' };
    const bet = Math.min(view.bigBlind * (1 + Math.floor(strength / 4)), view.stack);
    if (bet <= 0 || bet > view.stack) return { type: 'check' };
    return { type: 'bet', amount: bet };
  }

  // 需要跟注 / 加注 / 弃牌
  if (strength <= 2 && roll < 40) return { type: 'fold' };
  const minRaiseTo = view.highestBet + view.minRaiseIncrement;
  const maxTotal = view.stack + view.streetBet;
  if (roll < 70 || maxTotal < minRaiseTo) return { type: 'call' };
  // 偶尔加注到最小加注额
  return { type: 'raise', amount: Math.min(minRaiseTo, maxTotal) };
}

/** 翻前起手牌强度 0..10（越大越强）：对子整体高于非对子，再按高点/连张/同花微调 */
export function preflopStrength(holeCards: number[]): number {
  const r1 = rankOf(holeCards[0]);
  const r2 = rankOf(holeCards[1]);
  const suited = suitOf(holeCards[0]) === suitOf(holeCards[1]);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  let score: number;
  if (r1 === r2) {
    score = 30 + high * 2; // 对子：22=30 … AA=54
  } else {
    score = high * 2 + low / 5;
    if (high - low <= 2) score += 1; // 连张
    if (suited) score += 1;
    if (high >= 12 && low >= 10) score += 2; // 带 A/K 的双高牌
  }
  return Math.max(0, Math.min(10, Math.floor(score / 5)));
}

/**
 * 高级 AI：翻前用范围表 + 位置，翻后用蒙特卡洛胜率 + 底池赔率，
 * 强牌价值下注、弱牌偶尔平衡诈唬。
 */
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
  const pot = view.pot;
  const maxTotal = view.stack + view.streetBet;

  if (toCall === 0) {
    // 可以过牌：强牌价值下注，弱牌偶尔诈唬
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
    // 翻后按底池赔率决策
    const potOdds = toCall / (pot + toCall);
    if (equity < potOdds - 0.05 && rng(100) < 80) return { type: 'fold' };
    if (equity >= 0.7) {
      const minRaiseTo = view.highestBet + view.minRaiseIncrement;
      if (maxTotal >= minRaiseTo) return { type: 'raise', amount: minRaiseTo };
    }
    return { type: 'call' };
  }

  // 翻前按起手牌强度
  if (strength <= 2 && rng(100) < 70) return { type: 'fold' };
  if (strength >= 6) {
    const minRaiseTo = view.highestBet + view.minRaiseIncrement;
    if (maxTotal >= minRaiseTo && rng(100) < 60) return { type: 'raise', amount: minRaiseTo };
  }
  return { type: 'call' };
}

/**
 * 顶级 AI：在高级 AI 基础上加入对手建模与混合策略。
 * - 更多蒙特卡洛迭代，equity 更准
 * - 根据对手翻后激进度调整弃牌阈值（对凶手下注更谨慎）
 * - 混合策略：价值下注 / 慢打设陷阱 / 平衡诈唬
 */
export function decideTop(
  view: PlayerView,
  rng: Rng,
  opponentStats: Map<number, PlayerStats>,
): Action {
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

  // 对手建模：活跃对手的平均翻后激进度（无数据时默认 0.5）
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
  const pot = view.pot;
  const maxTotal = view.stack + view.streetBet;

  if (toCall === 0) {
    // 慢打设陷阱：偶尔用极强牌过牌
    if (strength >= 8 && rng(100) < 20) return { type: 'check' };
    if (strength >= 6) {
      const bet = Math.min(view.bigBlind * (1 + Math.floor(strength / 3)), view.stack);
      if (bet > 0 && bet <= view.stack) return { type: 'bet', amount: bet };
    }
    // 平衡诈唬
    if (strength <= 3 && rng(100) < 25) {
      const bet = Math.min(view.bigBlind * 2, view.stack);
      if (bet > 0 && bet <= view.stack) return { type: 'bet', amount: bet };
    }
    return { type: 'check' };
  }

  if (view.board.length > 0) {
    const potOdds = toCall / (pot + toCall);
    // 对凶手下注更愿意弃牌
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
