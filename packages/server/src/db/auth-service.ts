/**
 * 登录服务：@poker/auth 领域逻辑 + Drizzle 持久化 + JWT 会话。
 */
import type { Db } from './client';
import { DrizzleAuthRepo } from './auth-repo';
import { register, login, type AuthStore } from '@poker/auth';
import { signToken, verifyToken } from './token';

export type AuthResult = { ok: true; token: string } | { ok: false; error: string };

export class AuthService {
  private constructor(
    private store: AuthStore,
    private repo: DrizzleAuthRepo,
    private secret: string,
  ) {}

  static async init(db: Db, secret = process.env.JWT_SECRET ?? 'dev-secret', defaultInvite = 'POKER-DEMO'): Promise<AuthService> {
    const repo = new DrizzleAuthRepo(db);
    const store = await repo.loadStore();
    if (store.inviteCodes.size === 0) {
      store.inviteCodes.set(defaultInvite, -1); // 默认无限邀请码
      await repo.saveInviteCode(defaultInvite, -1);
    }
    return new AuthService(store, repo, secret);
  }

  async register(username: string, password: string, inviteCode: string): Promise<AuthResult> {
    try {
      const rec = register(this.store, { username, password, inviteCode });
      await this.repo.saveUser(rec);
      await this.repo.saveInviteCode(inviteCode, this.store.inviteCodes.get(inviteCode) ?? 0);
      return { ok: true, token: signToken({ sub: username }, this.secret) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async login(username: string, password: string): Promise<AuthResult> {
    if (login(this.store, { username, password })) {
      return { ok: true, token: signToken({ sub: username }, this.secret) };
    }
    return { ok: false, error: 'invalid credentials' };
  }

  verify(token: string): string | null {
    const payload = verifyToken(token, this.secret);
    return payload && typeof payload.sub === 'string' ? payload.sub : null;
  }
}
