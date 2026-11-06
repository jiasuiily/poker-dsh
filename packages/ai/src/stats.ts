/**
 * 对手建模统计：跨手牌持久化每个玩家的行为特征。
 * - VPIP：主动入池率；PFR：翻前加注率；激进度：翻后下注/加注频率
 */
import type { Action, Street } from '@poker/core';

export interface PlayerStats {
  hands: number;
  vpipCount: number;
  pfrCount: number;
  aggressionCount: number;
  postflopCount: number;
}

export interface SeatStats {
  hands: number;
  vpip: number;
  pfr: number;
}

export function newPlayerStats(): PlayerStats {
  return { hands: 0, vpipCount: 0, pfrCount: 0, aggressionCount: 0, postflopCount: 0 };
}

export function updateStats(stats: PlayerStats, action: Action, street: Street): PlayerStats {
  const s = { ...stats };
  if (street === 'preflop') {
    if (action.type === 'call' || action.type === 'bet' || action.type === 'raise' || action.type === 'allin') {
      s.vpipCount++;
    }
    if (action.type === 'bet' || action.type === 'raise') {
      s.pfrCount++;
    }
  } else {
    s.postflopCount++;
    if (action.type === 'bet' || action.type === 'raise' || action.type === 'allin') {
      s.aggressionCount++;
    }
  }
  return s;
}

export function vpipRate(stats: PlayerStats): number {
  return stats.hands > 0 ? stats.vpipCount / stats.hands : 0;
}

export function pfrRate(stats: PlayerStats): number {
  return stats.hands > 0 ? stats.pfrCount / stats.hands : 0;
}

export function aggressionRate(stats: PlayerStats): number {
  return stats.postflopCount > 0 ? stats.aggressionCount / stats.postflopCount : 0;
}

/** 把 PlayerStats 汇总为 SeatStats（hands / vpip / pfr 计数） */
export function collectStats(events: { seat: number; street: Street; action: Action }[], into: Map<number, SeatStats>): void {
  for (const e of events) {
    const s = into.get(e.seat) ?? { hands: 0, vpip: 0, pfr: 0 };
    if (e.street === 'preflop') {
      if (e.action.type === 'call' || e.action.type === 'bet' || e.action.type === 'raise' || e.action.type === 'allin') {
        s.vpip++;
      }
      if (e.action.type === 'bet' || e.action.type === 'raise') {
        s.pfr++;
      }
    }
    into.set(e.seat, s);
  }
}
