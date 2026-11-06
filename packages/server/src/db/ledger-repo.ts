/**
 * Drizzle 版账本持久化：transactions + ledger_entries 落到 PostgreSQL。
 * append 幂等（按 type + ref_id 唯一）。
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from './client';
import { transactions, ledgerEntries } from './schema';
import type { Transaction } from '@poker/wallet';

export class DrizzleLedgerRepo {
  constructor(private db: Db) {}

  async append(txn: Transaction): Promise<void> {
    const existing = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.type, txn.type), eq(transactions.refId, txn.refId)))
      .execute();
    if (existing.length > 0) return; // 幂等

    const inserted = await this.db
      .insert(transactions)
      .values({ type: txn.type, refId: txn.refId })
      .returning({ id: transactions.id })
      .execute();
    const id = inserted[0].id;
    for (const e of txn.entries) {
      await this.db
        .insert(ledgerEntries)
        .values({ transactionId: id, accountId: e.accountId, amount: e.amount })
        .execute();
    }
  }

  async load(): Promise<Transaction[]> {
    const rows = await this.db
      .select({
        type: transactions.type,
        refId: transactions.refId,
        accountId: ledgerEntries.accountId,
        amount: ledgerEntries.amount,
      })
      .from(transactions)
      .innerJoin(ledgerEntries, eq(transactions.id, ledgerEntries.transactionId))
      .orderBy(transactions.id, ledgerEntries.id)
      .execute();

    const map = new Map<string, Transaction>();
    for (const r of rows) {
      const key = `${r.type}:${r.refId}`;
      let t = map.get(key);
      if (!t) {
        t = { type: r.type, refId: r.refId, entries: [] };
        map.set(key, t);
      }
      t.entries.push({ accountId: r.accountId, amount: r.amount });
    }
    return [...map.values()];
  }
}
