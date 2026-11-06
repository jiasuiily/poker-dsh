/**
 * 电脑玩家风格参数与预设。
 */
import type { Rng } from '@poker/core';

export type StyleId = 'tag' | 'lag' | 'nit' | 'station' | 'maniac';

export interface BotStyle {
  id: StyleId;
  /** 入池范围缩放，1 = 标准 */
  looseness: number;
  /** 加注/下注相对跟注的倾向 */
  aggression: number;
  /** 诈唬频率倍数 */
  bluff: number;
  /** 面对下注时跟到底的倾向 */
  stickiness: number;
  /** 下注尺度倍数 */
  sizing: number;
}

export const BOT_STYLES: Record<StyleId, BotStyle> = {
  tag: { id: 'tag', looseness: 0.9, aggression: 1.3, bluff: 1.0, stickiness: 0.9, sizing: 1.0 },
  lag: { id: 'lag', looseness: 1.4, aggression: 1.5, bluff: 1.4, stickiness: 1.0, sizing: 1.1 },
  nit: { id: 'nit', looseness: 0.6, aggression: 0.7, bluff: 0.3, stickiness: 0.7, sizing: 0.9 },
  station: { id: 'station', looseness: 1.5, aggression: 0.5, bluff: 0.4, stickiness: 1.8, sizing: 0.8 },
  maniac: { id: 'maniac', looseness: 2.0, aggression: 2.2, bluff: 2.5, stickiness: 1.2, sizing: 1.4 },
};

export const STYLE_NAMES: Record<StyleId, string> = {
  tag: '紧凶',
  lag: '松凶',
  nit: '岩石',
  station: '跟注站',
  maniac: '疯子',
};

const STYLE_IDS: StyleId[] = ['tag', 'lag', 'nit', 'station', 'maniac'];

export function randomStyle(rng: Rng): StyleId {
  return STYLE_IDS[rng(STYLE_IDS.length)];
}
