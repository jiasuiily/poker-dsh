/**
 * 人格层：为 AI 生成桌边台词 / 复盘解说。
 * - 只使用公开信息（街、底池、动作），绝不引用底牌
 * - 内容过滤：任何台词里的底牌字样都会被替换，防止泄漏
 * - LLM 失败/超时/输出为空时回退到本地模板
 */
import type { Card } from '@poker/core';
import { cardName } from '@poker/core';
import type { LlmProvider } from './provider';

export interface PersonalityContext {
  street: string;
  pot: number;
  /** 本次动作类型（弃牌/过牌/跟注/下注/加注/全下），可为空（如复盘） */
  actionType?: string;
  amount?: number;
  /** 本手赢得多少（牌局结束时） */
  wonAmount?: number;
  /** 自己的底牌（仅用于过滤，绝不用于台词） */
  holeCards: Card[];
}

const SYSTEM_PROMPT =
  '你是德州扑克桌边的一名 AI 玩家，说话简短、口语化、有人格。只依据公共信息（街、底池、动作）发言，绝不透露自己的底牌或任何人的底牌。';

/** 本地模板台词（只用公共信息，不含底牌） */
export function fallbackLine(ctx: PersonalityContext): string {
  if (ctx.wonAmount !== undefined && ctx.wonAmount > 0) {
    return `这手赢得不错，+${ctx.wonAmount}。`;
  }
  switch (ctx.actionType) {
    case 'fold':
      return '这手我不玩了。';
    case 'check':
      return '过。';
    case 'call':
      return `跟注，底池 ${ctx.pot}。`;
    case 'bet':
      return `我下注 ${ctx.amount ?? ''}。`;
    case 'raise':
      return `加注到 ${ctx.amount ?? ''}。`;
    case 'allin':
      return '全下！';
    default:
      return `${ctx.street} 街，慢慢来。`;
  }
}

/** 把台词里出现的底牌字样替换掉，防止泄漏 */
export function sanitizeLine(line: string, holeCards: Card[]): string {
  let out = line;
  for (const c of holeCards) {
    out = out.split(cardName(c)).join('××');
  }
  return out;
}

function describeContext(ctx: PersonalityContext): string {
  const parts = [
    `当前街：${ctx.street}`,
    `底池：${ctx.pot}`,
  ];
  if (ctx.actionType) parts.push(`动作：${ctx.actionType}${ctx.amount !== undefined ? ` ${ctx.amount}` : ''}`);
  if (ctx.wonAmount !== undefined) parts.push(`本手结果：${ctx.wonAmount >= 0 ? `+${ctx.wonAmount}` : ctx.wonAmount}`);
  return parts.join('；') + '。请用一句简短的中文台词回应（不要提到底牌）。';
}

export class PersonalityEngine {
  constructor(private provider: LlmProvider) {}

  async line(ctx: PersonalityContext): Promise<string> {
    try {
      const raw = await this.provider.chat(SYSTEM_PROMPT, describeContext(ctx));
      const cleaned = sanitizeLine(raw.trim(), ctx.holeCards);
      if (cleaned.length > 0) return cleaned;
    } catch {
      // 超时/失败：回退本地模板
    }
    return fallbackLine(ctx);
  }
}
