import type { Action, PlayerView, Rng } from '@poker/core';
import type { StyleId } from './styles';

export type BotLevel = 'beginner' | 'advanced';

export interface Bot {
  level: BotLevel;
  style: StyleId;
  decide(view: PlayerView, rng: Rng): Action;
}
