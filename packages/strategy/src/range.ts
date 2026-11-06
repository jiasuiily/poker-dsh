/**
 * 范围（Range）：Map<HandClass, 权重 0..1>，缺省 0。
 * 支持解析 'TT+, AQs+, A5s-A2s, KJo, 76s' 等写法。
 */
import type { Card } from '@poker/core';
import { RANK_NAMES } from '@poker/core';
import { combosOfClass, type HandClass } from './handClass';

export type Range = Map<HandClass, number>;

export interface WeightedCombo {
  cards: [Card, Card];
  w: number;
}

function setWeight(out: Range, cls: HandClass, weight: number): void {
  out.set(cls, Math.max(out.get(cls) ?? 0, weight));
}

interface ParsedToken {
  hi: number;
  lo: number;
  suffix: string; // '' 对子，'s' 同花，'o' 杂色
  pair: boolean;
}

function parseSingle(token: string): ParsedToken {
  const chars = token.trim();
  if (chars.length < 2) throw new Error(`invalid range token: ${token}`);
  const RANKS: readonly string[] = RANK_NAMES;
  const hi = RANKS.indexOf(chars[0]);
  const lo = RANKS.indexOf(chars[1]);
  if (hi < 0 || lo < 0) throw new Error(`invalid range token: ${token}`);
  const pair = chars.length === 2;
  const suffix = pair ? '' : chars[2];
  if (!pair && suffix !== 's' && suffix !== 'o') throw new Error(`invalid range token: ${token}`);
  return { hi, lo, suffix, pair };
}

function addPairRange(out: Range, hiFrom: number, hiTo: number, weight: number): void {
  for (let r = hiFrom; r <= hiTo; r++) {
    setWeight(out, RANK_NAMES[r] + RANK_NAMES[r], weight);
  }
}

function addKickerRange(out: Range, hi: number, loFrom: number, loTo: number, suffix: string, weight: number): void {
  const step = loFrom >= loTo ? -1 : 1;
  for (let k = loFrom; k !== loTo + step; k += step) {
    setWeight(out, RANK_NAMES[hi] + RANK_NAMES[k] + suffix, weight);
  }
}

export function parseRange(s: string, weight = 1): Range {
  const out: Range = new Map();
  for (const raw of s.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    if (token.includes('-')) {
      const [left, right] = token.split('-');
      const l = parseSingle(left);
      const r = parseSingle(right);
      if (l.pair && r.pair) {
        addPairRange(out, r.hi, l.hi, weight);
      } else {
        addKickerRange(out, l.hi, l.lo, r.lo, l.suffix, weight);
      }
    } else if (token.endsWith('+')) {
      const p = parseSingle(token.slice(0, -1));
      if (p.pair) addPairRange(out, p.hi, 12, weight);
      else addKickerRange(out, p.hi, p.lo, p.hi - 1, p.suffix, weight);
    } else {
      const p = parseSingle(token);
      if (p.pair) setWeight(out, RANK_NAMES[p.hi] + RANK_NAMES[p.hi], weight);
      else setWeight(out, RANK_NAMES[p.hi] + RANK_NAMES[p.lo] + p.suffix, weight);
    }
  }
  return out;
}

export function mergeRanges(...rs: Range[]): Range {
  const out: Range = new Map();
  for (const r of rs) {
    for (const [cls, w] of r) setWeight(out, cls, w);
  }
  return out;
}

/** 展开范围的所有带权组合（排除死牌） */
export function rangeCombos(r: Range, dead: Iterable<Card> = []): WeightedCombo[] {
  const deadSet = new Set(dead);
  const out: WeightedCombo[] = [];
  for (const [cls, w] of r) {
    if (w <= 0) continue;
    for (const cards of combosOfClass(cls)) {
      if (deadSet.has(cards[0]) || deadSet.has(cards[1])) continue;
      out.push({ cards, w });
    }
  }
  return out;
}

/** 范围宽度 = 加权组合数 / 1326 */
export function rangeWidth(r: Range): number {
  let sum = 0;
  for (const [cls, w] of r) sum += w * combosOfClass(cls).length;
  return sum / 1326;
}
