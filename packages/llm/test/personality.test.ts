import { describe, it, expect } from 'vitest';
import { cardFromString } from '@poker/core';
import { fallbackLine, sanitizeLine, PersonalityEngine } from '../src/personality';
import { MockProvider, type LlmProvider } from '../src/provider';

describe('人格层', () => {
  const hole = [cardFromString('As'), cardFromString('Kd')];

  it('本地模板台词不含底牌', () => {
    for (const actionType of ['fold', 'check', 'call', 'bet', 'raise', 'allin']) {
      const line = fallbackLine({ street: 'flop', pot: 100, actionType, amount: 20, holeCards: hole });
      expect(line).not.toContain('A♠');
      expect(line).not.toContain('K♦');
    }
  });

  it('sanitizeLine 会把底牌字样替换掉', () => {
    expect(sanitizeLine('我有 A♠ K♦，你们看着办。', hole)).toBe('我有 ×× ××，你们看着办。');
  });

  it('PersonalityEngine 用 MockProvider 生成台词（已过滤底牌）', async () => {
    const engine = new PersonalityEngine(new MockProvider(['我有 A♠ 稳赢']));
    const line = await engine.line({
      street: 'preflop',
      pot: 30,
      actionType: 'raise',
      amount: 60,
      holeCards: hole,
    });
    expect(line).not.toContain('A♠');
    expect(line).not.toContain('K♦');
  });

  it('LLM 抛错时回退到本地模板', async () => {
    const bad: LlmProvider = {
      chat: async () => {
        throw new Error('timeout');
      },
    };
    const engine = new PersonalityEngine(bad);
    const line = await engine.line({ street: 'flop', pot: 50, actionType: 'fold', holeCards: hole });
    expect(line).toBe('这手我不玩了。');
  });

  it('LLM 返回空时回退到本地模板', async () => {
    const empty: LlmProvider = { chat: async () => '' };
    const engine = new PersonalityEngine(empty);
    const line = await engine.line({ street: 'river', pot: 80, actionType: 'call', holeCards: hole });
    expect(line.length).toBeGreaterThan(0);
  });
});
