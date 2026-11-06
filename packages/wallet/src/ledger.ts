/**
 * 复式记账 + 托管（escrow）领域逻辑（纯函数，无数据库依赖）。
 *
 * 复式记账：每笔交易由多条分录组成，借贷之和必须为 0；
 * 系统对手方账户：发行账户（每日赠送）、AI 资金账户、桌面托管账户。
 * 幂等键 (type, refId) 从数据层面杜绝重复入账。
 *
 * 托管模型：入座买入时钱包→托管；牌局中只动桌上筹码；离座/结算时托管→钱包。
 */

export interface Entry {
  accountId: string;
  /** 正数 = 记入该账户（贷方），负数 = 从该账户扣除（借方） */
  amount: number;
}

export interface Transaction {
  type: string;
  refId: string;
  entries: Entry[];
}

export const ACCOUNTS = {
  /** 发行账户：每日赠送从这里出，余额为负表示已发行量 */
  issuance: 'sys:issuance',
  /** AI 资金账户：AI 输赢从这里进出 */
  aiBank: 'sys:ai-bank',
  /** 桌面托管账户：买入的筹码先托管在此 */
  escrow: 'sys:escrow',
} as const;

export class Ledger {
  private balances = new Map<string, number>();
  private processed = new Set<string>();

  balance(accountId: string): number {
    return this.balances.get(accountId) ?? 0;
  }

  /** 记录一笔复式交易：借贷平衡、余额充足、幂等去重 */
  post(txn: Transaction): void {
    const idemKey = `${txn.type}:${txn.refId}`;
    if (this.processed.has(idemKey)) return;
    const sum = txn.entries.reduce((s, e) => s + e.amount, 0);
    if (sum !== 0) throw new Error(`unbalanced transaction ${idemKey}: sum=${sum}`);
    for (const e of txn.entries) {
      this.balances.set(e.accountId, this.balance(e.accountId) + e.amount);
    }
    this.processed.add(idemKey);
  }

  /** 所有账户余额之和（复式记账下恒为 0） */
  total(): number {
    let s = 0;
    for (const v of this.balances.values()) s += v;
    return s;
  }
}

/** 玩家买入：钱包 → 桌面托管 */
export function buyIn(
  ledger: Ledger,
  opts: { playerId: string; tableId: string; seq: number; amount: number },
): void {
  if (ledger.balance(opts.playerId) < opts.amount) {
    throw new Error(`insufficient balance for ${opts.playerId}`);
  }
  ledger.post({
    type: 'BUYIN',
    refId: `${opts.tableId}:${opts.seq}`,
    entries: [
      { accountId: opts.playerId, amount: -opts.amount },
      { accountId: ACCOUNTS.escrow, amount: opts.amount },
    ],
  });
}

/** AI 买入：AI 资金账户 → 桌面托管 */
export function aiBuyIn(
  ledger: Ledger,
  opts: { tableId: string; seq: number; amount: number },
): void {
  ledger.post({
    type: 'AI_BUYIN',
    refId: `${opts.tableId}:${opts.seq}`,
    entries: [
      { accountId: ACCOUNTS.aiBank, amount: -opts.amount },
      { accountId: ACCOUNTS.escrow, amount: opts.amount },
    ],
  });
}

/** 结算：桌面托管 → 各赢家账户（赢家可能是真人或 AI 资金账户） */
export function settle(
  ledger: Ledger,
  opts: { tableId: string; seq: number; payouts: { accountId: string; amount: number }[] },
): void {
  const total = opts.payouts.reduce((s, p) => s + p.amount, 0);
  if (ledger.balance(ACCOUNTS.escrow) < total) {
    throw new Error(`insufficient escrow balance: ${ledger.balance(ACCOUNTS.escrow)} < ${total}`);
  }
  const entries: Entry[] = opts.payouts.map((p) => ({ accountId: p.accountId, amount: p.amount }));
  entries.push({ accountId: ACCOUNTS.escrow, amount: -total });
  ledger.post({ type: 'SETTLE', refId: `${opts.tableId}:${opts.seq}`, entries });
}

/** 每日赠送：发行账户 → 玩家 */
export function dailyGrant(
  ledger: Ledger,
  opts: { playerId: string; seq: number; amount: number },
): void {
  ledger.post({
    type: 'GRANT',
    refId: `grant:${opts.seq}`,
    entries: [
      { accountId: ACCOUNTS.issuance, amount: -opts.amount },
      { accountId: opts.playerId, amount: opts.amount },
    ],
  });
}
