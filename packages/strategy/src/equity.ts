/**
 * 带权范围的蒙特卡洛胜率估算。
 * 主角手牌 vs 多个带权范围，按权重抽样对手组合，随机发完剩余公共牌。
 */
import type { Card, Rng } from '@poker/core';
import { createDeck, shuffle, evaluate, compareHandRanks, secureRng, type HandRank } from '@poker/core';
import type { WeightedCombo } from './range';

function sampleCombo(combos: WeightedCombo[], used: Set<Card>, rng: Rng): [Card, Card] | null {
  const available = combos.filter((c) => !used.has(c.cards[0]) && !used.has(c.cards[1]));
  if (available.length === 0) return null;
  const total = available.reduce((s, c) => s + c.w, 0);
  if (total <= 0) return null;
  const target = (rng(1000000) / 1000000) * total;
  let acc = 0;
  for (const c of available) {
    acc += c.w;
    if (target <= acc) {
      used.add(c.cards[0]);
      used.add(c.cards[1]);
      return c.cards;
    }
  }
  const last = available[available.length - 1];
  used.add(last.cards[0]);
  used.add(last.cards[1]);
  return last.cards;
}

export function equityVsRanges(
  hero: [Card, Card],
  board: Card[],
  villains: WeightedCombo[][],
  opts: { iterations?: number; randomInt?: Rng } = {},
): number {
  const iterations = opts.iterations ?? 4000;
  const rng = opts.randomInt ?? secureRng;
  let wins = 0;
  let played = 0;

  for (let i = 0; i < iterations; i++) {
    const used = new Set<Card>([...hero, ...board]);
    const oppHands: [Card, Card][] = [];
    let ok = true;
    for (const v of villains) {
      const h = sampleCombo(v, used, rng);
      if (!h) {
        ok = false;
        break;
      }
      oppHands.push(h);
    }
    if (!ok) continue;

    const remaining = shuffle(
      createDeck().filter((c) => !used.has(c)),
      rng,
    );
    const fullBoard = board.slice();
    let bi = 0;
    while (fullBoard.length < 5) fullBoard.push(remaining[bi++]);

    const myRank = evaluate([...hero, ...fullBoard]);
    let bestOpp: HandRank | null = null;
    for (const h of oppHands) {
      const r = evaluate([...h, ...fullBoard]);
      if (!bestOpp || compareHandRanks(r, bestOpp) > 0) bestOpp = r;
    }
    const cmp = compareHandRanks(myRank, bestOpp!);
    if (cmp > 0) {
      wins += 1;
    } else if (cmp === 0) {
      const tied = oppHands.filter(
        (h) => compareHandRanks(evaluate([...h, ...fullBoard]), myRank) === 0,
      ).length;
      wins += 1 / (tied + 1);
    }
    played++;
  }
  return played > 0 ? wins / played : 0;
}
