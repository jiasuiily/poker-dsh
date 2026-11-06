/**
 * 对局模拟：一组 bot 自对弈，返回每手净输赢与统计。
 */
import type { Rng } from '@poker/core';
import { createGame, applyAction, projectView, validateAction } from '@poker/core';
import type { Bot } from './types';
import { newPlayerStats, updateStats, type PlayerStats } from './stats';

export interface SimOptions {
  bots: Bot[];
  hands: number;
  rng?: Rng;
  smallBlind?: number;
  bigBlind?: number;
  startingStack?: number;
}

export interface SimResult {
  perHandNet: number[][];
  stats: Map<number, PlayerStats>;
}

export function simulate(opts: SimOptions): SimResult {
  const rng = opts.rng ?? ((m: number) => Math.floor(Math.random() * m));
  const smallBlind = opts.smallBlind ?? 5;
  const bigBlind = opts.bigBlind ?? 10;
  const startingStack = opts.startingStack ?? 1000;
  const n = opts.bots.length;
  const perHandNet = opts.bots.map(() => [] as number[]);
  const stats = new Map<number, PlayerStats>();
  for (let i = 0; i < n; i++) stats.set(i, newPlayerStats());

  for (let hand = 0; hand < opts.hands; hand++) {
    const button = hand % n;
    const seats = opts.bots.map((_, i) => ({ id: `bot${i}`, stack: startingStack }));
    let state = createGame({ seats, smallBlind, bigBlind, buttonSeat: button, rng });
    const startStacks = state.players.map((p) => p.stack);
    for (let i = 0; i < n; i++) {
      const s = stats.get(i)!;
      stats.set(i, { ...s, hands: s.hands + 1 });
    }
    let guard = 0;
    while (state.phase === 'betting' && guard < 500) {
      const seat = state.currentSeat;
      const view = projectView(state, seat);
      let action = opts.bots[seat].decide(view, rng);
      if (validateAction(state, action) !== null) {
        const toCall = state.highestBet - state.players[seat].streetBet;
        action = toCall === 0 ? { type: 'check' } : { type: 'call' };
      }
      const street = state.street;
      state = applyAction(state, action);
      const s = stats.get(seat)!;
      stats.set(seat, updateStats(s, action, street));
      guard++;
    }
    for (let i = 0; i < n; i++) {
      perHandNet[i].push(state.players[i].stack - startStacks[i]);
    }
  }
  return { perHandNet, stats };
}
