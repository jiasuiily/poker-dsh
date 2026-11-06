/**
 * 高级 vs 初级验收脚本：`pnpm sim:ai 20000`
 * 6 人桌一半高级一半初级，统计每组 bb/100 及 95% 置信区间。
 */
import type { Rng } from '@poker/core';
import { getBot } from '../src/index';
import { simulate } from '../src/simulate';

function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (maxExclusive: number) => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}

const hands = Number(process.argv[2] ?? 20000);
const BIG_BLIND = 10;

const advanced = Array.from({ length: 3 }, () => getBot('advanced', 'tag'));
const beginner = Array.from({ length: 3 }, () => getBot('beginner', 'tag'));
const bots = [...advanced, ...beginner];

console.log(`跑 ${hands} 手（3 高级 tag vs 3 初级 tag）...`);
const { perHandNet } = simulate({ bots, hands, smallBlind: 5, bigBlind: BIG_BLIND, rng: seededRng(42) });

function summary(indices: number[], label: string) {
  const nets = indices.flatMap((i) => perHandNet[i]);
  const mean = nets.reduce((s, x) => s + x, 0) / nets.length;
  const variance = nets.reduce((s, x) => s + (x - mean) ** 2, 0) / nets.length;
  const se = Math.sqrt(variance / nets.length);
  const bb100 = (mean / BIG_BLIND) * 100;
  const ciLo = ((mean - 1.96 * se) / BIG_BLIND) * 100;
  const ciHi = ((mean + 1.96 * se) / BIG_BLIND) * 100;
  console.log(`${label}: bb/100 = ${bb100.toFixed(2)}, 95% CI = [${ciLo.toFixed(2)}, ${ciHi.toFixed(2)}]`);
  return { bb100, ciLo };
}

const adv = summary([0, 1, 2], '高级');
const beg = summary([3, 4, 5], '初级');
console.log(`差值 = ${(adv.bb100 - beg.bb100).toFixed(2)} bb/100`);
if (adv.ciLo > 0) {
  console.log('✅ 高级 AI 95% 置信区间下限 > 0');
} else {
  console.log('❌ 高级 AI 置信区间下限未 > 0，需调参或更多手数');
  process.exitCode = 1;
}
