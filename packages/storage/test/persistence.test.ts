import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db';
import { LedgerRepo } from '../src/ledger-repo';
import { PersistentLedger } from '../src/persistent-ledger';
import { AuthRepo } from '../src/auth-repo';
import { dailyGrant, buyIn, aiBuyIn, settle, ACCOUNTS } from '@poker/wallet';
import { createAuthStore, register, login } from '@poker/auth';

function tmpFile(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'poker-db-'));
  return { path: join(dir, 'test.db'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('SQLite 持久化', () => {
  it('复式账本落库后重开，余额一致', () => {
    const t = tmpFile();
    const db = openDb(t.path);
    const repo = new LedgerRepo(db);
    const ledger = PersistentLedger.load(repo);

    dailyGrant(ledger, { playerId: 'p1', seq: 1, amount: 1000 });
    buyIn(ledger, { playerId: 'p1', tableId: 't1', seq: 1, amount: 300 });
    aiBuyIn(ledger, { tableId: 't1', seq: 2, amount: 300 });
    settle(ledger, { tableId: 't1', seq: 3, payouts: [{ accountId: 'p1', amount: 550 }] });

    const expected = ledger.balance('p1');
    expect(ledger.total()).toBe(0);
    db.close();

    // 重开数据库，从流水重放
    const db2 = openDb(t.path);
    const ledger2 = PersistentLedger.load(new LedgerRepo(db2));
    expect(ledger2.balance('p1')).toBe(expected);
    expect(ledger2.balance(ACCOUNTS.escrow)).toBe(ledger.balance(ACCOUNTS.escrow));
    expect(ledger2.total()).toBe(0);
    db2.close();
    t.cleanup();
  });

  it('幂等：重复落库同一交易不重复入账', () => {
    const t = tmpFile();
    const db = openDb(t.path);
    const repo = new LedgerRepo(db);
    const ledger = PersistentLedger.load(repo);

    dailyGrant(ledger, { playerId: 'p1', seq: 1, amount: 1000 });
    buyIn(ledger, { playerId: 'p1', tableId: 't1', seq: 1, amount: 100 });
    // 手动再 append 同一笔（模拟重放/重试）
    repo.append({ type: 'BUYIN', refId: 't1:1', entries: [{ accountId: 'p1', amount: -100 }, { accountId: ACCOUNTS.escrow, amount: 100 }] });
    expect(ledger.balance('p1')).toBe(900);
    db.close();
    t.cleanup();
  });

  it('用户落库后重开可登录', () => {
    const t = tmpFile();
    const db = openDb(t.path);
    const repo = new AuthRepo(db);
    const store = createAuthStore({ INVITE: -1 });
    const rec = register(store, { username: 'alice', password: 'pw123', inviteCode: 'INVITE' });
    repo.saveUser(rec);
    db.close();

    const db2 = openDb(t.path);
    const repo2 = new AuthRepo(db2);
    const loaded = repo2.getUser('alice');
    expect(loaded).toBeTruthy();
    // 用加载出的哈希重建 store 并校验登录
    const store2 = createAuthStore({});
    store2.users.set(loaded!.username, loaded!);
    expect(login(store2, { username: 'alice', password: 'pw123' })).toBe(true);
    expect(login(store2, { username: 'alice', password: 'wrong' })).toBe(false);
    db2.close();
    t.cleanup();
  });
});
