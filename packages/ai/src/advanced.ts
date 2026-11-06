/**
 * 高级 AI：翻前查近似 GTO 表按频率随机，翻后用 scoreOptions 选 EV 最优动作；按风格缩放。
 */
import type { Action, PlayerView, Rng } from '@poker/core';
import {
  handClassOf,
  tableFormat,
  preflopSituation,
  chartFor,
  chartFreq,
  inferRanges,
  scoreOptions,
} from '@poker/strategy';
import { preflopStrength } from './beginner';
import type { BotStyle } from './styles';
import type { Bot } from './types';

export function makeAdvancedBot(style: BotStyle): Bot {
  const decide = (view: PlayerView, rng: Rng): Action => {
    const format = tableFormat(view.players.length);

    if (view.street === 'preflop') {
      const situation = preflopSituation(view, view.seat);
      const chart = chartFor(format, situation);
      if (chart) {
        const cls = handClassOf(view.holeCards[0], view.holeCards[1]);
        const f = chartFreq(chart, cls);
        const raise = Math.min(1, f.raise * style.aggression);
        const call = Math.min(1, f.call * style.stickiness);
        const roll = rng(1000) / 1000;

        if (view.toCall === 0) {
          if (roll < raise) {
            const bet = Math.min(Math.floor(view.bigBlind * 2.5 * style.sizing), view.stack);
            if (bet > 0) return { type: 'bet', amount: bet };
          }
          return { type: 'check' };
        }

        if (roll < raise) {
          const raiseTo = Math.min(
            Math.floor(view.highestBet + view.minRaiseIncrement * 2 * style.sizing),
            view.stack + view.streetBet,
          );
          if (raiseTo > view.highestBet) return { type: 'raise', amount: raiseTo };
          return { type: 'call' };
        }
        if (roll < raise + call) return { type: 'call' };
        return { type: 'fold' };
      }

      // 无表（溜入池等）：按起手牌强度简单决策
      const strength = preflopStrength(view.holeCards);
      if (view.toCall === 0) return { type: 'check' };
      if (strength <= 2) return { type: 'fold' };
      const minRaiseTo = view.highestBet + view.minRaiseIncrement;
      if (strength >= 6 && view.stack + view.streetBet >= minRaiseTo) {
        return { type: 'raise', amount: minRaiseTo };
      }
      return { type: 'call' };
    }

    // 翻后：按 EV 选最优
    const ranges = inferRanges(view, view.seat);
    const { options } = scoreOptions(view, ranges, { iterations: 1500, randomInt: rng });
    const best = options.reduce((a, b) => ((a.ev ?? -Infinity) >= (b.ev ?? -Infinity) ? a : b));
    return best.action;
  };

  return { level: 'advanced', style: style.id, decide };
}
