import { describe, it, expect } from 'vitest';
import { createDb } from '../src/db/client';
import { DrizzleAuthRepo } from '../src/db/auth-repo';
import { DrizzleLedgerRepo } from '../src/db/ledger-repo';
import { AuthService } from '../src/db/auth-service';
import { createAuthStore, register, login } from '@poker/auth';

describe('Drizzle + PGlite 持久化', () => {
  it('注册 + 登录 跨重启持久化', async () => {
    const db = await createDb('memory://');
    const repo = new DrizzleAuthRepo(db);
    const store = createAuthStore({ 'test-invite': 5 });
    await repo.saveInviteCode('test-invite', 5);
    register(store, { username: 'alice', password: 'secret123', inviteCode: 'test-invite' });
    await repo.saveUser(store.users.get('alice')!);

    // 重新加载（模拟重启）
    const loaded = await repo.loadStore();
    expect(login(loaded, { username: 'alice', password: 'secret123' })).toBe(true);
    expect(login(loaded, { username: 'alice', password: 'wrong' })).toBe(false);
  });

  it('账本 append/load + 幂等', async () => {
    const db = await createDb('memory://');
    const repo = new DrizzleLedgerRepo(db);
    const txn = {
      type: 'buyin',
      refId: 'h1',
      entries: [
        { accountId: 'alice', amount: -1000 },
        { accountId: 'sys:escrow', amount: 1000 },
      ],
    };
    await repo.append(txn);
    await repo.append(txn); // 幂等，不应重复
    const loaded = await repo.load();
    expect(loaded.length).toBe(1);
    expect(loaded[0].entries.length).toBe(2);
  });

  it('AuthService 注册 + 登录 + 校验 token', async () => {
    const db = await createDb('memory://');
    const svc = await AuthService.init(db);
    const reg = await svc.register('bob', 'pw123', 'POKER-DEMO');
    expect(reg.ok).toBe(true);
    if (reg.ok) {
      expect(svc.verify(reg.token)).toBe('bob');
    }
    const okLogin = await svc.login('bob', 'pw123');
    expect(okLogin.ok).toBe(true);
    const badLogin = await svc.login('bob', 'wrong');
    expect(badLogin.ok).toBe(false);
  });
});
