import { describe, it, expect } from 'vitest';
import { createAuthStore, register, login, hashPassword, verifyPassword } from '../src/auth';

describe('密码哈希', () => {
  it('哈希后校验正确、不存明文', () => {
    const { hash, salt } = hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(salt).toBeTruthy();
    expect(verifyPassword('secret123', hash, salt)).toBe(true);
    expect(verifyPassword('wrong', hash, salt)).toBe(false);
  });
});

describe('注册与登录', () => {
  it('用有效邀请码注册成功并可登录', () => {
    const store = createAuthStore({ 'INVITE-1': 1 });
    const rec = register(store, { username: 'alice', password: 'pw', inviteCode: 'INVITE-1' });
    expect(rec.passwordHash).not.toBe('pw');
    expect(login(store, { username: 'alice', password: 'pw' })).toBe(true);
    expect(login(store, { username: 'alice', password: 'bad' })).toBe(false);
    expect(login(store, { username: 'nobody', password: 'pw' })).toBe(false);
  });

  it('邀请码一次性：用完不能再注册', () => {
    const store = createAuthStore({ 'INVITE-1': 1 });
    register(store, { username: 'a', password: 'pw', inviteCode: 'INVITE-1' });
    expect(() => register(store, { username: 'b', password: 'pw', inviteCode: 'INVITE-1' })).toThrow(/invite/);
  });

  it('用户名重复抛错', () => {
    const store = createAuthStore({ 'INVITE-1': 5 });
    register(store, { username: 'alice', password: 'pw', inviteCode: 'INVITE-1' });
    expect(() => register(store, { username: 'alice', password: 'pw', inviteCode: 'INVITE-1' })).toThrow(/taken/);
  });

  it('无限邀请码（-1）可重复使用', () => {
    const store = createAuthStore({ FAMILY: -1 });
    register(store, { username: 'a', password: 'pw', inviteCode: 'FAMILY' });
    register(store, { username: 'b', password: 'pw', inviteCode: 'FAMILY' });
    expect(store.users.size).toBe(2);
  });
});
