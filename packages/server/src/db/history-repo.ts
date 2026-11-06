/**
 * 牌谱持久化：hands 表（config/initialDeck/log/result 存 jsonb）。
 */
import { desc, eq } from 'drizzle-orm';
import type { Card, ActionLogEntry, GameConfig } from '@poker/core';
import type { Db } from './client';
import { hands } from './schema';

export interface HandResult {
  winners: number[];
  net: Record<string, number>;
}

export interface HandRecord {
  id: string;
  engineVersion: number;
  config: Omit<GameConfig, 'deck'>;
  initialDeck: Card[];
  log: ActionLogEntry[];
  result: HandResult;
  createdAt: Date;
}

export class HistoryRepo {
  constructor(private db: Db) {}

  async save(rec: Omit<HandRecord, 'createdAt'>): Promise<void> {
    await this.db
      .insert(hands)
      .values({
        id: rec.id,
        engineVersion: rec.engineVersion,
        config: rec.config,
        initialDeck: rec.initialDeck,
        log: rec.log,
        result: rec.result,
      })
      .onConflictDoNothing()
      .execute();
  }

  async list(): Promise<HandRecord[]> {
    const rows = await this.db.select().from(hands).orderBy(desc(hands.createdAt)).limit(100).execute();
    return rows.map((r) => ({
      id: r.id,
      engineVersion: r.engineVersion,
      config: r.config as HandRecord['config'],
      initialDeck: r.initialDeck as HandRecord['initialDeck'],
      log: r.log as HandRecord['log'],
      result: r.result as HandRecord['result'],
      createdAt: r.createdAt,
    }));
  }

  async get(id: string): Promise<HandRecord | null> {
    const rows = await this.db.select().from(hands).where(eq(hands.id, id)).execute();
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      engineVersion: r.engineVersion,
      config: r.config as HandRecord['config'],
      initialDeck: r.initialDeck as HandRecord['initialDeck'],
      log: r.log as HandRecord['log'],
      result: r.result as HandRecord['result'],
      createdAt: r.createdAt,
    };
  }
}
