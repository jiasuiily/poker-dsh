import type { DatabaseSync } from 'node:sqlite';
import type { UserRecord } from '@poker/auth';

/** 用户仓库 */
export class AuthRepo {
  constructor(private db: DatabaseSync) {}

  saveUser(user: UserRecord): void {
    this.db
      .prepare('INSERT OR REPLACE INTO users(username, password_hash, salt) VALUES (?, ?, ?)')
      .run(user.username, user.passwordHash, user.salt);
  }

  getUser(username: string): UserRecord | undefined {
    const r = this.db
      .prepare('SELECT username, password_hash, salt FROM users WHERE username = ?')
      .get(username) as { username: string; password_hash: string; salt: string } | undefined;
    return r ? { username: r.username, passwordHash: r.password_hash, salt: r.salt } : undefined;
  }

  loadUsers(): UserRecord[] {
    const rows = this.db.prepare('SELECT username, password_hash, salt FROM users').all() as Array<{
      username: string;
      password_hash: string;
      salt: string;
    }>;
    return rows.map((r) => ({ username: r.username, passwordHash: r.password_hash, salt: r.salt }));
  }
}
