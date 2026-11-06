/**
 * Drizzle 版认证持久化：把 AuthStore 里的 users / inviteCodes 落到 PostgreSQL。
 */
import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { users, inviteCodes } from './schema';
import type { AuthStore, UserRecord } from '@poker/auth';

export class DrizzleAuthRepo {
  constructor(private db: Db) {}

  async loadStore(): Promise<AuthStore> {
    const userRows = await this.db.select().from(users).execute();
    const inviteRows = await this.db.select().from(inviteCodes).execute();
    const store: AuthStore = { users: new Map(), inviteCodes: new Map() };
    for (const u of userRows) {
      store.users.set(u.username, { username: u.username, passwordHash: u.passwordHash, salt: u.salt });
    }
    for (const c of inviteRows) {
      store.inviteCodes.set(c.code, c.remaining);
    }
    return store;
  }

  async saveUser(rec: UserRecord): Promise<void> {
    await this.db
      .insert(users)
      .values({ username: rec.username, passwordHash: rec.passwordHash, salt: rec.salt })
      .onConflictDoUpdate({
        target: users.username,
        set: { passwordHash: rec.passwordHash, salt: rec.salt },
      })
      .execute();
  }

  async saveInviteCode(code: string, remaining: number): Promise<void> {
    await this.db
      .insert(inviteCodes)
      .values({ code, remaining })
      .onConflictDoUpdate({ target: inviteCodes.code, set: { remaining } })
      .execute();
  }

  async getInviteCode(code: string): Promise<number | undefined> {
    const rows = await this.db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).execute();
    return rows[0]?.remaining;
  }
}
