import { describe, it, expect } from 'vitest';
import { positionsOf, tableFormat } from '../src/positions';

function view(n: number, button: number) {
  return { players: Array.from({ length: n }, (_, i) => ({ seat: i })), buttonSeat: button };
}

describe('位置推算', () => {
  it('6 人桌映射', () => {
    const m = positionsOf(view(6, 0));
    expect(m.get(0)).toBe('BTN');
    expect(m.get(1)).toBe('SB');
    expect(m.get(2)).toBe('BB');
    expect(m.get(3)).toBe('UTG');
    expect(m.get(4)).toBe('HJ');
    expect(m.get(5)).toBe('CO');
  });

  it('9 人桌映射', () => {
    const m = positionsOf(view(9, 0));
    expect(m.get(0)).toBe('BTN');
    expect(m.get(1)).toBe('SB');
    expect(m.get(2)).toBe('BB');
    expect(m.get(3)).toBe('UTG');
    expect(m.get(4)).toBe('UTG1');
    expect(m.get(5)).toBe('MP');
    expect(m.get(6)).toBe('LJ');
    expect(m.get(7)).toBe('HJ');
    expect(m.get(8)).toBe('CO');
  });

  it('单挑时按钮为 SB', () => {
    const m = positionsOf(view(2, 0));
    expect(m.get(0)).toBe('SB');
    expect(m.get(1)).toBe('BB');
  });

  it('tableFormat', () => {
    expect(tableFormat(2)).toBe('hu');
    expect(tableFormat(3)).toBe('6max');
    expect(tableFormat(6)).toBe('6max');
    expect(tableFormat(7)).toBe('9max');
    expect(tableFormat(9)).toBe('9max');
  });
});
