/**
 * 位置推算：按本手实际人数把座位映射到 Position。
 */

export type Position = 'UTG' | 'UTG1' | 'MP' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export type TableFormat = 'hu' | '6max' | '9max';

export function tableFormat(players: number): TableFormat {
  if (players <= 2) return 'hu';
  if (players <= 6) return '6max';
  return '9max';
}

// 早期位置（除 UTG 外，从「离按钮最远」到「离按钮最近」）
const EARLY_REST = ['UTG1', 'MP', 'LJ', 'HJ', 'CO'] as const;

/** 由座位与按钮推算每个座位的 Position（按钮/SB/BB 由 buttonSeat 与人数推导） */
export function positionsOf(view: { players: { seat: number }[]; buttonSeat: number }): Map<number, Position> {
  const n = view.players.length;
  const map = new Map<number, Position>();
  if (n === 2) {
    const button = view.buttonSeat;
    const other = (button + 1) % n;
    map.set(button, 'SB'); // 单挑时按钮即小盲
    map.set(other, 'BB');
    return map;
  }

  const button = view.buttonSeat;
  const sb = (button + 1) % n;
  const bb = (button + 2) % n;
  map.set(button, 'BTN');
  map.set(sb, 'SB');
  map.set(bb, 'BB');

  const k = n - 3; // 早期座位数
  if (k > 0) {
    const earlyNames: Position[] = ['UTG', ...EARLY_REST.slice(EARLY_REST.length - (k - 1))];
    for (let i = 0; i < k; i++) {
      const seat = (bb + 1 + i) % n;
      map.set(seat, earlyNames[i]);
    }
  }
  return map;
}
