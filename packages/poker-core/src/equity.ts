/**
 * 蒙特卡洛胜率（equity）估算。
 * 给定自己的底牌、公共牌与对手数量，随机补齐对手底牌与剩余公共牌，
 * 用评估器比大小，估计胜率（平局算 0.5）。
 */
import type { Card, Rng } from './cards';
import { createDeck, shuffle } from './cards';
import type { HandRank } from './evaluator';
import { compareHandRanks, evaluate } from './evaluator';

export function monteCarloEquity(
  holeCards: Card[],
  board: Card[],
  opponentCount: number,
  iterations: number,
  rng: Rng,
): number {
  if (opponentCount <= 0) return 1;
  const used = new Set<Card>([...holeCards, ...board]);
  const deck = createDeck().filter((c) => !used.has(c));

  let wins = 0;
  for (let i = 0; i < iterations; i++) {
    const rem = shuffle(deck, rng);
    let idx = 0;
    const oppHands: Card[][] = [];
    for (let o = 0; o < opponentCount; o++) {
      oppHands.push([rem[idx], rem[idx + 1]]);
      idx += 2;
    }
    // 补齐公共牌到 5 张（所有对手共享同一副公共牌）
    const fullBoard = board.slice();
    while (fullBoard.length < 5) fullBoard.push(rem[idx++]);

    const myRank = evaluate([...holeCards, ...fullBoard]);
    let bestOpp: HandRank | null = null;
    for (const h of oppHands) {
      const r = evaluate([...h, ...fullBoard]);
      if (!bestOpp || compareHandRanks(r, bestOpp) > 0) bestOpp = r;
    }
    const cmp = compareHandRanks(myRank, bestOpp!);
    if (cmp > 0) wins += 1;
    else if (cmp === 0) wins += 0.5;
  }
  return wins / iterations;
}
