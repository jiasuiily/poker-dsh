/**
 * 决策评估：给定决策时刻的 PlayerView 与推断出的对手范围，评估主角的动作。
 * - 翻前：查表（chart 法），按频率判定
 * - 翻后：按 EV 公式比较（ev 法）
 * EV 单位 bb。
 */
import type { Card, PlayerView, Rng, Action, Street } from '@poker/core';
import { handClassOf } from './handClass';
import { type WeightedCombo } from './range';
import { bucketize, inferRanges } from './rangeModel';
import { tableFormat } from './positions';
import { chartFor, chartFreq, preflopSituation } from './charts';
import { equityVsRanges } from './equity';

export const ENGINE_VERSION = 1;

export interface OptionScore {
  action: Action;
  ev?: number;
  freq?: number;
}

export interface DecisionReport {
  street: Street;
  actionSeq: number;
  heroAction: Action;
  recommended: Action;
  options: OptionScore[];
  equity?: number;
  potOdds?: number;
  mdf?: number;
  evLossBb: number;
  verdict: 'good' | 'ok' | 'mistake';
  reasons: string[];
  method: 'chart' | 'ev' | 'fallback';
}

function actionToOption(action: Action): OptionScore {
  return { action };
}

function evOfRaise(view: PlayerView, ranges: Map<number, WeightedCombo[]>, equity: number, extra: number): number {
  const pot = view.pot;
  let fe = 0;
  let totalW = 0;
  for (const combos of ranges.values()) {
    for (const b of bucketize(combos, view.board)) {
      totalW += b.combo.w;
      if (b.pct < 1 - 0.5 * (extra / Math.max(pot, 1))) fe += b.combo.w;
    }
  }
  fe = totalW > 0 ? fe / totalW : 0;
  return fe * pot + (1 - fe) * (equity * (pot + 2 * extra) - extra);
}

/** 计算各候选动作的 EV 与主角胜率 */
export function scoreOptions(
  view: PlayerView,
  ranges: Map<number, WeightedCombo[]>,
  opts: { iterations: number; randomInt: Rng },
): { options: OptionScore[]; equity: number } {
  const hero = view.holeCards as [Card, Card];
  const villains = [...ranges.values()];
  const equity = equityVsRanges(hero, view.board, villains, {
    iterations: opts.iterations,
    randomInt: opts.randomInt,
  });
  const pot = view.pot;
  const toCall = view.toCall;
  const bb = view.bigBlind;

  const options: OptionScore[] = [actionToOption({ type: 'fold' })];
  options[0].ev = 0;

  if (toCall === 0) {
    options.push(actionToOption({ type: 'check' }));
    options[options.length - 1].ev = equity * pot * 0.9;
    for (const frac of [0.5, 2 / 3, 1]) {
      const bet = Math.min(Math.max(Math.floor(pot * frac), bb), view.stack);
      if (bet > 0 && bet <= view.stack) {
        const o = actionToOption({ type: 'bet', amount: bet });
        o.ev = evOfRaise(view, ranges, equity, bet);
        options.push(o);
      }
    }
  } else {
    const o = actionToOption({ type: 'call' });
    o.ev = equity * (pot + toCall) - toCall;
    options.push(o);
    const minRaiseTo = view.highestBet + view.minRaiseIncrement;
    for (const frac of [0.5, 2 / 3, 1]) {
      const raiseTo = Math.min(Math.max(view.highestBet + Math.floor(pot * frac), minRaiseTo), view.stack + view.streetBet);
      if (raiseTo > view.highestBet && raiseTo <= view.stack + view.streetBet) {
        const ro = actionToOption({ type: 'raise', amount: raiseTo });
        ro.ev = evOfRaise(view, ranges, equity, raiseTo - view.streetBet);
        options.push(ro);
      }
    }
  }
  return { options, equity };
}

function actionKey(a: Action): string {
  return a.type === 'bet' || a.type === 'raise' ? `${a.type}:${a.amount}` : a.type;
}

function freqForAction(heroAction: Action, raise: number, call: number, fold: number): number {
  switch (heroAction.type) {
    case 'fold':
      return fold;
    case 'check':
    case 'call':
      return call;
    case 'bet':
    case 'raise':
    case 'allin':
      return raise;
  }
}

/** 评估主角在某个决策点的动作 */
export function evaluateDecision(
  view: PlayerView,
  heroAction: Action,
  opts?: { iterations?: number; randomInt?: Rng },
): DecisionReport {
  const iterations = opts?.iterations ?? 4000;
  const randomInt = opts?.randomInt ?? ((m: number) => Math.floor(Math.random() * m));
  const hero = view.holeCards as [Card, Card];
  const street = view.street;
  const pot = view.pot;
  const toCall = view.toCall;
  const bb = view.bigBlind;

  // 翻前查表
  if (street === 'preflop') {
    const situation = preflopSituation(view, view.seat);
    const chart = chartFor(tableFormat(view.players.length), situation);
    if (chart) {
      const cls = handClassOf(hero[0], hero[1]);
      const f = chartFreq(chart, cls);
      const freq = freqForAction(heroAction, f.raise, f.call, f.fold);
      let verdict: DecisionReport['verdict'];
      let evLossBb: number;
      if (freq >= 0.3) {
        verdict = 'good';
        evLossBb = 0;
      } else if (freq >= 0.05) {
        verdict = 'ok';
        evLossBb = 0.5;
      } else {
        verdict = 'mistake';
        evLossBb = 1.5;
      }
      const recommended: Action =
        f.raise >= f.call ? { type: 'raise', amount: view.highestBet + 2 * bb } : { type: 'call' };
      return {
        street,
        actionSeq: view.history.length > 0 ? view.history[view.history.length - 1].seq : 0,
        heroAction,
        recommended,
        options: [
          { action: { type: 'raise', amount: view.highestBet + 2 * bb }, freq: f.raise },
          { action: { type: 'call' }, freq: f.call },
          { action: { type: 'fold' }, freq: f.fold },
        ],
        evLossBb,
        verdict,
        reasons:
          verdict === 'good'
            ? [`这个位置的 ${cls} 属于开池/防守范围，动作合理。`]
            : [`这个位置的 ${cls} 通常不在该动作范围里。`],
        method: 'chart',
      };
    }
  }

  // 翻后（或翻前无表）按 EV
  const ranges = inferRanges(view, view.seat);
  const { options, equity } = scoreOptions(view, ranges, { iterations, randomInt });
  const best = options.reduce((a, b) => ((a.ev ?? -Infinity) >= (b.ev ?? -Infinity) ? a : b));
  const heroOption = options.find((o) => actionKey(o.action) === actionKey(heroAction));
  const heroEv = heroOption?.ev ?? 0;
  const evLossBb = Math.max(0, (best.ev ?? 0) - heroEv) / bb;
  const verdict: DecisionReport['verdict'] = evLossBb < 0.5 ? 'good' : evLossBb < 2 ? 'ok' : 'mistake';
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : undefined;
  const mdf = toCall > 0 ? pot / (pot + toCall) : undefined;

  const reasons: string[] = [];
  if (equity !== undefined && potOdds !== undefined) {
    reasons.push(
      equity > potOdds
        ? `胜率 ${(equity * 100).toFixed(0)}%，高于底池赔率 ${(potOdds * 100).toFixed(0)}%，跟注有利。`
        : `胜率 ${(equity * 100).toFixed(0)}%，低于底池赔率 ${(potOdds * 100).toFixed(0)}%。`,
    );
  }
  reasons.push(`最优选项 ${best.action.type}${'amount' in best.action ? ` ${best.action.amount}` : ''} 的 EV 为 ${((best.ev ?? 0) / bb).toFixed(1)}bb。`);

  return {
    street,
    actionSeq: view.history.length > 0 ? view.history[view.history.length - 1].seq : 0,
    heroAction,
    recommended: best.action,
    options,
    equity,
    potOdds,
    mdf,
    evLossBb,
    verdict,
    reasons,
    method: street === 'preflop' ? 'fallback' : 'ev',
  };
}
