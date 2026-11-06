/**
 * 起手牌类别（169 类）与组合展开。
 * 类别字符串：对子 'AA'、同花 'AKs'、杂色 'AKo'。
 */
import type { Card } from '@poker/core';
import { RANK_NAMES, rankOf, suitOf } from '@poker/core';

export type HandClass = string;

export function handClassOf(a: Card, b: Card): HandClass {
  const r1 = rankOf(a);
  const r2 = rankOf(b);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  if (hi === lo) return RANK_NAMES[hi] + RANK_NAMES[lo];
  const suited = suitOf(a) === suitOf(b);
  return RANK_NAMES[hi] + RANK_NAMES[lo] + (suited ? 's' : 'o');
}

export const ALL_CLASSES: HandClass[] = (() => {
  const classes: HandClass[] = [];
  for (let r = 0; r < 13; r++) classes.push(RANK_NAMES[r] + RANK_NAMES[r]);
  for (let hi = 1; hi < 13; hi++) {
    for (let lo = 0; lo < hi; lo++) {
      classes.push(RANK_NAMES[hi] + RANK_NAMES[lo] + 's');
      classes.push(RANK_NAMES[hi] + RANK_NAMES[lo] + 'o');
    }
  }
  return classes;
})();

/** 展开某类的所有组合：对子 6、同花 4、杂色 12 */
export function combosOfClass(c: HandClass): [Card, Card][] {
  const combos: [Card, Card][] = [];
  const RANKS: readonly string[] = RANK_NAMES;
  const hi = RANKS.indexOf(c[0]);
  const lo = RANKS.indexOf(c[1]);
  if (hi < 0 || lo < 0) throw new Error(`invalid hand class: ${c}`);
  if (c.length === 2) {
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = s1 + 1; s2 < 4; s2++) {
        combos.push([s1 * 13 + hi, s2 * 13 + hi]);
      }
    }
  } else if (c[2] === 's') {
    for (let s = 0; s < 4; s++) combos.push([s * 13 + hi, s * 13 + lo]);
  } else {
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = 0; s2 < 4; s2++) {
        if (s1 !== s2) combos.push([s1 * 13 + hi, s2 * 13 + lo]);
      }
    }
  }
  return combos;
}
