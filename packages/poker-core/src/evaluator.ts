/**
 * 7 张牌评估器：直接按统计求最优 5 张牌型（不枚举 21 种组合），
 * 供比牌、摊牌与后续蒙特卡洛高频调用。
 */
import type { Card } from './cards';
import { rankOf, suitOf } from './cards';

export const CATEGORY = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
} as const;

export type HandCategory = (typeof CATEGORY)[keyof typeof CATEGORY];

export interface HandRank {
  category: HandCategory;
  /** 用于比较的次序值（从大到小）；同类别长度固定，缺失位比较时按 -1 处理 */
  tiebreakers: number[];
}

/** 在布尔集合上找顺子的最高点；找不到返回 -1（轮子 A2345 返回 3，即 5 高） */
function straightHighFromSet(has: boolean[]): number {
  for (let high = 12; high >= 4; high--) {
    if (has[high] && has[high - 1] && has[high - 2] && has[high - 3] && has[high - 4]) {
      return high;
    }
  }
  if (has[12] && has[3] && has[2] && has[1] && has[0]) return 3;
  return -1;
}

/** 评估 5~7 张牌，返回最优 5 张的牌型 */
export function evaluate(cards: Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluate expects 5..7 cards, got ${cards.length}`);
  }
  const rankCount = new Array<number>(13).fill(0);
  const suitCount = new Array<number>(4).fill(0);
  for (const c of cards) {
    rankCount[rankOf(c)]++;
    suitCount[suitOf(c)]++;
  }

  // 同花花色
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] >= 5) {
      flushSuit = s;
      break;
    }
  }

  // 同花顺
  if (flushSuit >= 0) {
    const has = new Array<boolean>(13).fill(false);
    for (const c of cards) if (suitOf(c) === flushSuit) has[rankOf(c)] = true;
    const sfHigh = straightHighFromSet(has);
    if (sfHigh >= 0) return { category: CATEGORY.STRAIGHT_FLUSH, tiebreakers: [sfHigh] };
  }

  // 四条
  for (let r = 12; r >= 0; r--) {
    if (rankCount[r] === 4) {
      let kicker = -1;
      for (let k = 12; k >= 0; k--) if (k !== r && rankCount[k] > 0) { kicker = k; break; }
      return { category: CATEGORY.FOUR_OF_A_KIND, tiebreakers: [r, kicker] };
    }
  }

  // 最高三条、最高（且不同）对子
  let trips = -1;
  for (let r = 12; r >= 0; r--) if (rankCount[r] >= 3) { trips = r; break; }
  let pair = -1;
  for (let r = 12; r >= 0; r--) if (r !== trips && rankCount[r] >= 2) { pair = r; break; }

  // 葫芦
  if (trips >= 0 && pair >= 0) {
    return { category: CATEGORY.FULL_HOUSE, tiebreakers: [trips, pair] };
  }

  // 同花
  if (flushSuit >= 0) {
    const ranks: number[] = [];
    for (const c of cards) if (suitOf(c) === flushSuit) ranks.push(rankOf(c));
    ranks.sort((a, b) => b - a);
    return { category: CATEGORY.FLUSH, tiebreakers: ranks.slice(0, 5) };
  }

  // 顺子
  const hasAll = new Array<boolean>(13).fill(false);
  for (const c of cards) hasAll[rankOf(c)] = true;
  const straightHigh = straightHighFromSet(hasAll);
  if (straightHigh >= 0) {
    return { category: CATEGORY.STRAIGHT, tiebreakers: [straightHigh] };
  }

  // 三条
  if (trips >= 0) {
    const kickers: number[] = [];
    for (let r = 12; r >= 0 && kickers.length < 2; r--) {
      if (r !== trips && rankCount[r] > 0) kickers.push(r);
    }
    return { category: CATEGORY.THREE_OF_A_KIND, tiebreakers: [trips, ...kickers] };
  }

  // 两对
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) if (rankCount[r] >= 2) pairs.push(r);
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    let kicker = -1;
    for (let r = 12; r >= 0; r--) {
      if (r !== p1 && r !== p2 && rankCount[r] > 0) { kicker = r; break; }
    }
    return { category: CATEGORY.TWO_PAIR, tiebreakers: [p1, p2, kicker] };
  }

  // 一对
  if (pairs.length === 1) {
    const p = pairs[0];
    const kickers: number[] = [];
    for (let r = 12; r >= 0 && kickers.length < 3; r--) {
      if (r !== p && rankCount[r] > 0) kickers.push(r);
    }
    return { category: CATEGORY.ONE_PAIR, tiebreakers: [p, ...kickers] };
  }

  // 高牌
  const high: number[] = [];
  for (let r = 12; r >= 0 && high.length < 5; r--) {
    if (rankCount[r] > 0) high.push(r);
  }
  return { category: CATEGORY.HIGH_CARD, tiebreakers: high };
}

/** 比较两个牌型：>0 表示 a 大，<0 表示 b 大，0 平 */
export function compareHandRanks(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  const n = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < n; i++) {
    const av = a.tiebreakers[i] ?? -1;
    const bv = b.tiebreakers[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** 把牌型编码成一个可比较的整数（供蒙特卡洛等高频比较） */
export function handScore(hr: HandRank): number {
  let s = hr.category;
  for (let i = 0; i < 5; i++) {
    s = s * 13 + (hr.tiebreakers[i] ?? 0);
  }
  return s;
}

/** 便捷比较：直接比较两组牌 */
export function compareCards(a: Card[], b: Card[]): number {
  return compareHandRanks(evaluate(a), evaluate(b));
}
