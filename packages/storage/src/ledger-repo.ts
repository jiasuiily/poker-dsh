import type { DatabaseSync } from 'node:sqlite';
import type { Transaction } from '@poker/wallet';

/** 复式账本流水仓库：append 幂等落库，load 按序读回用于重放 */
export class LedgerRepo {
  constructor(private db: DatabaseSync) {}

  append(txn: Transaction): void {
    this.db.exec('BEGIN');
    try {
      const r = this.db
        .prepare('INSERT OR IGNORE INTO transactions(type, ref_id, created_at) VALUES (?, ?, ?)')
        .run(txn.type, txn.refId, Date.now());
      if (Number(r.changes) > 0) {
        const txId = Number(r.lastInsertRowid);
        const ins = this.db.prepare(
          'INSERT INTO ledger_entries(transaction_id, account_id, amount) VALUES (?, ?, ?)',
        );
        for (const e of txn.entries) ins.run(txId, e.accountId, e.amount);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  load(): Transaction[] {
    const rows = this.db
      .prepare(
        `SELECT t.type, t.ref_id, e.account_id, e.amount
         FROM transactions t JOIN ledger_entries e ON e.transaction_id = t.id
         ORDER BY t.id, e.id`,
      )
      .all() as Array<{ type: string; ref_id: string; account_id: string; amount: number }>;

    const map = new Map<string, Transaction>();
    for (const r of rows) {
      const key = `${r.type}:${r.ref_id}`;
      let txn = map.get(key);
      if (!txn) {
        txn = { type: r.type, refId: r.ref_id, entries: [] };
        map.set(key, txn);
      }
      txn.entries.push({ accountId: r.account_id, amount: r.amount });
    }
    return [...map.values()];
  }
}
