import { describe, it, expect } from 'vitest';
import { Ledger, ACCOUNTS, buyIn, aiBuyIn, settle, dailyGrant } from '../src/ledger';

describe('Ledger 复式记账', () => {
  it('每笔交易后所有账户余额之和恒为 0', () => {
    const ledger = new Ledger();
    dailyGrant(ledger, { playerId: 'p1', seq: 1, amount: 1000 });
    buyIn(ledger, { playerId: 'p1', tableId: 't1', seq: 1, amount: 200 });
    aiBuyIn(ledger, { tableId: 't1', seq: 2, amount: 200 });
    settle(ledger, { tableId: 't1', seq: 3, payouts: [{ accountId: 'p1', amount: 350 }] });
    expect(ledger.total()).toBe(0);
  });

  it('每日赠送：发行账户转出、玩家入账', () => {
    const ledger = new Ledger();
    dailyGrant(ledger, { playerId: 'p1', seq: 1, amount: 1000 });
    expect(ledger.balance('p1')).toBe(1000);
    expect(ledger.balance(ACCOUNTS.issuance)).toBe(-1000);
  });

  it('买入与结算：钱包→托管→钱包', () => {
    const ledger = new Ledger();
    dailyGrant(ledger, { playerId: 'p1', seq: 1, amount: 1000 });
    buyIn(ledger, { playerId: 'p1', tableId: 't1', seq: 1, amount: 300 });
    aiBuyIn(ledger, { tableId: 't1', seq: 2, amount: 300 });
    expect(ledger.balance('p1')).toBe(700);
    expect(ledger.balance(ACCOUNTS.escrow)).toBe(600);
    // 玩家赢 550（本金 300 + 盈利 250），托管还剩 AI 的 50
    settle(ledger, { tableId: 't1', seq: 3, payouts: [{ accountId: 'p1', amount: 550 }] });
    expect(ledger.balance(ACCOUNTS.escrow)).toBe(50);
    expect(ledger.balance('p1')).toBe(1250);
    expect(ledger.total()).toBe(0);
  });

  it('幂等：重复提交同一笔交易不重复入账', () => {
    const ledger = new Ledger();
    dailyGrant(ledger, { playerId: 'p1', seq: 1, amount: 1000 });
    buyIn(ledger, { playerId: 'p1', tableId: 't1', seq: 1, amount: 100 });
    buyIn(ledger, { playerId: 'p1', tableId: 't1', seq: 1, amount: 100 }); // 重复
    expect(ledger.balance('p1')).toBe(900);
  });

  it('余额不足抛错', () => {
    const ledger = new Ledger();
    expect(() => buyIn(ledger, { playerId: 'p1', tableId: 't1', seq: 1, amount: 100 })).toThrow(
      /insufficient balance/,
    );
  });

  it('借贷不平衡抛错', () => {
    const ledger = new Ledger();
    expect(() =>
      ledger.post({
        type: 'BAD',
        refId: 'x',
        entries: [
          { accountId: 'p1', amount: 100 },
          { accountId: 'p2', amount: -50 },
        ],
      }),
    ).toThrow(/unbalanced/);
  });
});
