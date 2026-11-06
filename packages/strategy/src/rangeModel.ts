/**
 * 对手范围推断：翻前按动作查表取范围，翻后按动作调整权重；bucketize 把范围按强度分档。
 */
import type { Card, PlayerView } from '@poker/core';
import { rankOf, suitOf, evaluate, compareHandRanks } from '@poker/core';
import { parseRange, rangeCombos, type Range, type WeightedCombo } from './range';
import { positionsOf, tableFormat } from './positions';
import { chartFor } from './charts';

const LIMPED =
  '22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, A9o+, KTo+, QTo+, JTo';

export interface StrengthBucket {
  combo: WeightedCombo;
  /** 强度百分位 0（最弱）..1（最强） */
  pct: number;
  /** 是否有同花/顺子听牌 */
  draw: boolean;
}

function hasDraw(cards: Card[]): boolean {
  const suits = [0, 0, 0, 0];
  for (const c of cards) suits[suitOf(c)]++;
  if (suits.some((s) => s >= 4)) return true;
  const ranks = new Set(cards.map(rankOf));
  for (let hi = 12; hi >= 3; hi--) {
    let count = 0;
    for (let k = 0; k < 4; k++) if (ranks.has(hi - k)) count++;
    if (count === 4) return true;
  }
  return ranks.has(12) && ranks.has(0) && ranks.has(1) && ranks.has(2);
}

export function bucketize(combos: WeightedCombo[], board: Card[]): StrengthBucket[] {
  const scored = combos.map((c) => ({
    combo: c,
    rank: evaluate([...c.cards, ...board]),
    draw: hasDraw([...c.cards, ...board]),
  }));
  scored.sort((a, b) => compareHandRanks(a.rank, b.rank));
  const n = scored.length;
  return scored.map((s, i) => ({ combo: s.combo, pct: n <= 1 ? 0.5 : i / (n - 1), draw: s.draw }));
}

function adjustByAction(
  combos: WeightedCombo[],
  board: Card[],
  kind: string,
  to: number,
  pot: number,
): WeightedCombo[] {
  const buckets = bucketize(combos, board);
  const scale = pot > 0 ? to / pot : 1;
  let keepAbove: number;
  let weakMul: number;
  if (scale <= 0.5) {
    keepAbove = 1 - 0.45;
    weakMul = 0.25;
  } else if (scale <= 1) {
    keepAbove = 1 - 0.35;
    weakMul = 0.2;
  } else {
    keepAbove = 1 - 0.25;
    weakMul = 0.15;
  }

  return buckets
    .map((b) => {
      let w = b.combo.w;
      if (kind === 'bet' || kind === 'raise') {
        if (b.pct < keepAbove && !b.draw) w *= weakMul;
      } else if (kind === 'call') {
        if (b.pct < 0.3 || b.pct > 0.85) w *= 0.4;
      } else if (kind === 'check') {
        if (b.pct > 0.8) w *= 0.3;
      }
      return { cards: b.combo.cards, w };
    })
    .filter((c) => c.w > 0.001);
}

/** 推断每个未弃牌对手的当前范围 */
export function inferRanges(view: PlayerView, heroSeat: number): Map<number, WeightedCombo[]> {
  const result = new Map<number, WeightedCombo[]>();
  const format = tableFormat(view.players.length);
  const dead = [...view.holeCards, ...view.board];

  for (const p of view.players) {
    if (p.seat === heroSeat || p.status === 'folded') continue;
    const pre = view.history.filter((e) => e.seat === p.seat && e.street === 'preflop');
    const raised = pre.some((e) => e.kind === 'raise' || e.kind === 'bet');
    const called = pre.some((e) => e.kind === 'call');
    const pos = positionsOf(view).get(p.seat) ?? 'UTG';

    let range: Range;
    if (raised) {
      const e = chartFor(format, { kind: 'rfi', pos });
      range = e ? e.raise : parseRange(LIMPED);
    } else if (called) {
      const e = chartFor(format, { kind: 'vsOpen', pos, opener: 'CO' });
      range = e ? e.call : parseRange(LIMPED);
    } else {
      range = parseRange(LIMPED);
    }

    let combos = rangeCombos(range, dead);
    const post = view.history.filter((e) => e.seat === p.seat && e.street !== 'preflop');
    for (const a of post) {
      combos = adjustByAction(combos, view.board, a.kind, a.to, view.pot);
    }
    if (combos.length > 0) result.set(p.seat, combos);
  }
  return result;
}
