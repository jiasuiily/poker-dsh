/**
 * 对手建模统计：跨手牌持久化每个玩家的行为特征（供顶级 AI 调整策略、也用于战绩展示）。
 * - VPIP：主动入池率（翻前主动投入筹码的频率）
 * - PFR：翻前加注率
 * - 激进度：翻后下注/加注频率
 */
import type { Action, Street } from './game';

export interface PlayerStats {
  /** 参与的手数（被发到底牌） */
  hands: number;
  /** 翻前主动入池次数 */
  vpipCount: number;
  /** 翻前加注次数 */
  pfrCount: number;
  /** 翻后进攻次数（下注/加注/全下） */
  aggressionCount: number;
  /** 翻后行动总次数 */
  postflopCount: number;
}

export function newPlayerStats(): PlayerStats {
  return { hands: 0, vpipCount: 0, pfrCount: 0, aggressionCount: 0, postflopCount: 0 };
}

/** 根据一次动作更新统计（返回新对象，不修改原对象） */
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
