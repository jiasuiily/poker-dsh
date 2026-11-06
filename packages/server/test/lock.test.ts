import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock } from '../src/db/lock';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'pglite-lock-'));
}

describe('PGlite 启动锁', () => {
  it('锁被存活进程占用时抛错', () => {
    const dir = tempDir();
    writeFileSync(join(dir, '.pglite.lock'), String(process.pid));
    expect(() => acquireLock(dir)).toThrow(/正被进程/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('陈旧锁（进程已死）被覆盖', () => {
    const dir = tempDir();
    writeFileSync(join(dir, '.pglite.lock'), '999999999');
    expect(() => acquireLock(dir)).not.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });
});
