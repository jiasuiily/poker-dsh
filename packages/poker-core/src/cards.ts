/**
 * 牌面与牌堆工具（纯函数，无 IO，可在前后端与 AI 共用）。
 *
 * 一张牌用一个 0..51 的整数表示：card = suit * 13 + rank
 * - 点数 rank：0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 * - 花色 suit：0=黑桃♠, 1=红桃♥, 2=方块♦, 3=梅花♣
 */

export type Suit = 0 | 1 | 2 | 3;
export type Rank = number; // 0..12
export type Card = number; // 0..51

export const SUIT_NAMES = ['♠', '♥', '♦', '♣'] as const;
export const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export function rankOf(card: Card): Rank {
  return card % 13;
}

export function suitOf(card: Card): Suit {
  return Math.floor(card / 13) as Suit;
}

export function cardName(card: Card): string {
  return RANK_NAMES[rankOf(card)] + SUIT_NAMES[suitOf(card)];
}

/** 由 "As" / "Th" / "2d" / "Kc" 这样的字符串构造一张牌（大小写不敏感） */
export function cardFromString(s: string): Card {
  if (s.length !== 2) throw new Error(`bad card string: ${s}`);
  const rankChar = s[0].toUpperCase();
  const suitChar = s[1].toLowerCase();
  const rank = RANK_NAMES.indexOf(rankChar as (typeof RANK_NAMES)[number]);
  const suit = ['s', 'h', 'd', 'c'].indexOf(suitChar);
  if (rank < 0 || suit < 0) throw new Error(`bad card string: ${s}`);
  return suit * 13 + rank;
}

/** 新建一副 52 张牌（0..51） */
export function createDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

/**
 * 随机数发生器：返回 [0, maxExclusive) 内的均匀整数。
 * 可注入以支持确定性测试。
 */
export type Rng = (maxExclusive: number) => number;

/**
 * 无偏安全随机整数 [0, maxExclusive)。
 * 用 Web Crypto（Node 19+ 与浏览器均有 globalThis.crypto）+ 拒绝采样，避免取模偏差。
 * 通过 globalThis 访问并做局部类型断言，避免依赖 DOM lib。
 */
type GetRandomValues = <T extends ArrayBufferView>(array: T) => T;
const webCrypto = (globalThis as { crypto?: { getRandomValues: GetRandomValues } }).crypto;

export function secureRng(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error('maxExclusive must be > 0');
  if (maxExclusive === 1) return 0;
  if (!webCrypto) throw new Error('Web Crypto API not available');
  const maxUint32 = 0xffffffff;
  const limit = Math.floor(maxUint32 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    webCrypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % maxExclusive;
}

/** Fisher-Yates 洗牌（返回新数组，不改原数组） */
export function shuffle<T>(arr: readonly T[], rng: Rng = secureRng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
