/**
 * PGlite 数据目录启动锁：一个数据目录同一时间只能被一个进程打开。
 * 锁文件记 PID；旧进程已死（ESRCH 等）则视为陈旧锁覆盖。
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_FILE = '.pglite.lock';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function acquireLock(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
  const lockPath = join(dataDir, LOCK_FILE);
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0 && isProcessAlive(pid)) {
      throw new Error(`数据库目录 ${dataDir} 正被进程 ${pid} 使用，请勿同时启动多个实例`);
    }
    // 陈旧锁（进程已退出或内容无效）：覆盖
  }
  writeFileSync(lockPath, String(process.pid));
}
