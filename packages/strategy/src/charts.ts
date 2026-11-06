/**
 * 翻前近似 GTO 表与情境判定。
 * 表按「桌型 × 位置 × 情境」组织，范围用字符串表达，宽度由测试校准（±0.04）。
 * 数据为「近似」，非求解器输出。
 */
import type { PlayerView } from '@poker/core';
import { parseRange, type Range } from './range';
import type { HandClass } from './handClass';
import { positionsOf, tableFormat, type Position, type TableFormat } from './positions';

export type PreflopSituation =
  | { kind: 'rfi'; pos: Position }
  | { kind: 'vsOpen'; pos: Position; opener: Position }
  | { kind: 'vs3bet'; pos: Position }
  | { kind: 'other' };

export interface ChartEntry {
  raise: Range;
  call: Range;
}

// ---- 范围数据（字符串）----
const RFI_6MAX: Record<string, string> = {
  UTG: '22+, A2s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo',
  HJ: '22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, ATo+, KJo+, QJo',
  CO: '22+, A2s+, K5s+, Q8s+, J8s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, ATo+, KTo+, QTo+, JTo',
  BTN: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 53s+, 43s, A2o+, K7o+, Q9o+, J9o+, T9o',
  SB: '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T9o',
};

const RFI_9MAX: Record<string, string> = {
  UTG: '22+, A2s+, KTs+, QTs+, JTs, AQo+',
  UTG1: '22+, A2s+, KTs+, QTs+, JTs, T9s, AJo+, KQo',
  MP: '22+, A2s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo',
  LJ: '22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, ATo+, KJo+, QJo',
  HJ: '22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, ATo+, KJo+, QJo',
  CO: '22+, A2s+, K5s+, Q8s+, J8s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, ATo+, KTo+, QTo+, JTo',
  BTN: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 53s+, 43s, A2o+, K7o+, Q9o+, J9o+, T9o',
  SB: '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T9o',
};

const RFI_HU_SB =
  '22+, A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s, A2o+, K2o+, Q2o+, J5o+, T6o+, 96o+, 86o+, 75o+, 64o+, 54o';

// vsOpen：按开池者分组。raise = 3bet 范围，call = 跟注范围（与 raise 互斥）。
const VS_OPEN: Record<string, { raise: string; call: string }> = {
  early: {
    raise: 'TT+, AQs+, AKo',
    call: '22-99, A2s-AJs, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, AQo, KQo',
  },
  middle: {
    raise: '99+, AJs+, KQs, AQo+',
    call: '22-88, A2s-ATs, K9s-KJs, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, AJo, KJo+, QJo',
  },
  late: {
    raise: '77+, ATs+, A5s-A2s, KQs, AJo+, KQo',
    call: '22-66, A6s-A9s, K2s-KJs, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 53s+, 43s, ATo, KTo+, QTo+, JTo',
  },
  sb: {
    raise: '66+, AJs+, AQo+',
    call: '22-55, A2s-ATs, K2s+, Q5s+, J7s+, T7s+, 97s+, 86s+, 76s+, 65s+, 54s, ATo, KTo+, QTo+, JTo',
  },
};

// vs3bet：每种桌型一张（4bet / 跟注，互斥）
const VS_3BET: Record<TableFormat, { raise: string; call: string }> = {
  hu: { raise: 'QQ+, AKs, AKo', call: 'JJ-99, AQs, AJs, KQs, AQo' },
  '6max': { raise: 'KK+, AKs', call: 'QQ-JJ, AQs, AKo' },
  '9max': { raise: 'KK+, AKs', call: 'QQ-JJ, AQs, AKo' },
};

// ---- 解析缓存 ----
const cache = new Map<string, Range>();
function r(s: string): Range {
  let v = cache.get(s);
  if (!v) {
    v = parseRange(s);
    cache.set(s, v);
  }
  return v;
}

/** 判断翻前情境（只看 preflop 的公开动作历史） */
export function preflopSituation(view: PlayerView, seat: number): PreflopSituation {
  const pre = view.history.filter((e) => e.street === 'preflop');
  const raises = pre.filter((e) => e.kind === 'raise' || e.kind === 'bet');
  const calls = pre.filter((e) => e.kind === 'call');
  const pos = positionsOf(view).get(seat) ?? 'BB';

  if (raises.length === 0 && calls.length === 0) {
    return { kind: 'rfi', pos };
  }
  if (raises.length === 1) {
    const opener = positionsOf(view).get(raises[0].seat) ?? 'UTG';
    return { kind: 'vsOpen', pos, opener };
  }
  const heroRaiseIdx = pre.findIndex((e) => e.seat === seat && (e.kind === 'raise' || e.kind === 'bet'));
  const heroRaised = heroRaiseIdx >= 0;
  const someoneRaisedAfter = pre.some(
    (e, i) => i > heroRaiseIdx && (e.kind === 'raise' || e.kind === 'bet'),
  );
  if (heroRaised && someoneRaisedAfter) {
    return { kind: 'vs3bet', pos };
  }
  return { kind: 'other' };
}

function openerGroup(opener: Position): keyof typeof VS_OPEN {
  if (opener === 'UTG' || opener === 'UTG1' || opener === 'MP') return 'early';
  if (opener === 'LJ' || opener === 'HJ') return 'middle';
  if (opener === 'SB') return 'sb';
  return 'late'; // CO / BTN
}

/** 查表得到某情境的 ChartEntry；无表时返回 null */
export function chartFor(format: TableFormat, s: PreflopSituation): ChartEntry | null {
  if (s.kind === 'rfi') {
    if (format === 'hu') {
      if (s.pos === 'SB') return { raise: r(RFI_HU_SB), call: new Map() };
      return null; // BB 面对开池是 vsOpen，不是 rfi
    }
    const table = format === '6max' ? RFI_6MAX : RFI_9MAX;
    const str = table[s.pos];
    if (!str) return null;
    return { raise: r(str), call: new Map() };
  }
  if (s.kind === 'vsOpen') {
    const group = VS_OPEN[openerGroup(s.opener)];
    return { raise: r(group.raise), call: r(group.call) };
  }
  if (s.kind === 'vs3bet') {
    const t = VS_3BET[format];
    return { raise: r(t.raise), call: r(t.call) };
  }
  return null;
}

/** 某类别在某表中的频率（raise / call / fold，合计 1） */
export function chartFreq(e: ChartEntry, cls: HandClass): { raise: number; call: number; fold: number } {
  const raise = e.raise.get(cls) ?? 0;
  const call = e.call.get(cls) ?? 0;
  return { raise, call, fold: Math.max(0, 1 - raise - call) };
}

export { tableFormat };
