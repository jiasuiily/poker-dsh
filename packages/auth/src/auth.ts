/**
 * 账号认证领域逻辑（纯函数 + 内存存储，可替换为 PostgreSQL）。
 * - 密码哈希：Node 内置 crypto.scrypt（无原生依赖；未来可换 argon2id）
 * - 注册：用户名 + 密码 + 邀请码（邀请码控制谁能注册，自用场景控人）
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export interface UserRecord {
  username: string;
  /** hex 编码的密码哈希 */
  passwordHash: string;
  /** hex 编码的盐 */
  salt: string;
}

export interface AuthStore {
  users: Map<string, UserRecord>;
  /** 邀请码 -> 剩余次数（-1 表示无限） */
  inviteCodes: Map<string, number>;
}

export function createAuthStore(inviteCodes: Record<string, number> = {}): AuthStore {
  return {
    users: new Map(),
    inviteCodes: new Map(Object.entries(inviteCodes)),
  };
}

export function hashPassword(password: string, salt?: Buffer): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16);
  const hash = scryptSync(password, s, 32);
  return { hash: hash.toString('hex'), salt: s.toString('hex') };
}

export function verifyPassword(password: string, hashHex: string, saltHex: string): boolean {
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, 32);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function consumeInviteCode(store: AuthStore, code: string): void {
  const remaining = store.inviteCodes.get(code);
  if (remaining === undefined || remaining === 0) {
    throw new Error('invalid or exhausted invite code');
  }
  if (remaining > 0) store.inviteCodes.set(code, remaining - 1);
}

export function register(
  store: AuthStore,
  opts: { username: string; password: string; inviteCode: string },
): UserRecord {
  consumeInviteCode(store, opts.inviteCode);
  if (store.users.has(opts.username)) throw new Error('username already taken');
  const { hash, salt } = hashPassword(opts.password);
  const rec: UserRecord = { username: opts.username, passwordHash: hash, salt };
  store.users.set(opts.username, rec);
  return rec;
}

export function login(store: AuthStore, opts: { username: string; password: string }): boolean {
  const rec = store.users.get(opts.username);
  if (!rec) return false;
  return verifyPassword(opts.password, rec.passwordHash, rec.salt);
}
