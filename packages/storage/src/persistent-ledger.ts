import { Ledger, type Transaction } from '@poker/wallet';
import { LedgerRepo } from './ledger-repo';

/** 带持久化的账本：post 先记账后落库（幂等）；load 从流水重放余额 */
export class PersistentLedger extends Ledger {
  private readonly repo: LedgerRepo;
  private replaying = false;

  constructor(repo: LedgerRepo) {
    super();
    this.repo = repo;
  }

  override post(txn: Transaction): void {
    super.post(txn);
    if (!this.replaying) this.repo.append(txn);
  }

  static load(repo: LedgerRepo): PersistentLedger {
    const ledger = new PersistentLedger(repo);
    ledger.replaying = true;
    for (const txn of repo.load()) ledger.post(txn);
    ledger.replaying = false;
    return ledger;
  }
}
