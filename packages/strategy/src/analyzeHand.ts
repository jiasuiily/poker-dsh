/**
 * 整手分析：重放事件日志，对主角每个决策点调用 evaluateDecision。
 */
import type { Card, GameConfig, ActionLogEntry, Rng } from '@poker/core';
import { createGame, applyAction, actionFromLogEntry, projectView } from '@poker/core';
import { evaluateDecision, type DecisionReport } from './evaluate';

function seededRandomInt(seed: number): Rng {
  let a = seed >>> 0;
  return (maxExclusive: number) => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}

export function analyzeHand(
  config: Omit<GameConfig, 'deck'>,
  initialDeck: Card[],
  log: ActionLogEntry[],
  heroSeat: number,
  opts?: { iterations?: number; seed?: number },
): DecisionReport[] {
  const randomInt = seededRandomInt(opts?.seed ?? 1);
  let state = createGame({ ...config, deck: initialDeck });
  const reports: DecisionReport[] = [];

  for (const entry of log) {
    if (entry.seat === heroSeat && state.phase === 'betting') {
      const view = projectView(state, heroSeat);
      const action = actionFromLogEntry(entry);
      reports.push(evaluateDecision(view, action, { iterations: opts?.iterations, randomInt }));
    }
    state = applyAction(state, actionFromLogEntry(entry));
    if (state.phase !== 'betting') break;
  }
  return reports;
}
