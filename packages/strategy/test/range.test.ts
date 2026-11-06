import { describe, it, expect } from 'vitest';
import { cardFromString } from '@poker/core';
import { ALL_CLASSES, handClassOf, combosOfClass } from '../src/handClass';
import { parseRange, mergeRanges, rangeCombos, rangeWidth } from '../src/range';

describe('起手牌类别', () => {
  it('共 169 类，组合总数 1326', () => {
    expect(ALL_CLASSES.length).toBe(169);
    const total = ALL_CLASSES.reduce((s, c) => s + combosOfClass(c).length, 0);
    expect(total).toBe(1326);
  });

  it('handClassOf 正确', () => {
    expect(handClassOf(cardFromString('As'), cardFromString('Ks'))).toBe('AKs');
    expect(handClassOf(cardFromString('Kd'), cardFromString('As'))).toBe('AKo');
    expect(handClassOf(cardFromString('7h'), cardFromString('7c'))).toBe('77');
  });

  it('组合数：对子 6、同花 4、杂色 12', () => {
    expect(combosOfClass('AA').length).toBe(6);
    expect(combosOfClass('AKs').length).toBe(4);
    expect(combosOfClass('AKo').length).toBe(12);
  });
});

describe('范围解析', () => {
  it("parseRange('TT+') 含 TT..AA，不含 99", () => {
    const r = parseRange('TT+');
    expect(r.has('TT')).toBe(true);
    expect(r.has('JJ')).toBe(true);
    expect(r.has('QQ')).toBe(true);
    expect(r.has('KK')).toBe(true);
    expect(r.has('AA')).toBe(true);
    expect(r.has('99')).toBe(false);
  });

  it("'A5s-A2s' 恰好 4 类", () => {
    const r = parseRange('A5s-A2s');
    expect(r.size).toBe(4);
    for (const c of ['A5s', 'A4s', 'A3s', 'A2s']) expect(r.has(c)).toBe(true);
  });

  it("'KJo' 只含杂色；'AQs+' = AQs, AKs", () => {
    expect(parseRange('KJo').size).toBe(1);
    expect(parseRange('KJo').has('KJo')).toBe(true);
    const r = parseRange('AQs+');
    expect(r.size).toBe(2);
    expect(r.has('AQs')).toBe(true);
    expect(r.has('AKs')).toBe(true);
  });

  it("非法字符串 'ZZ' 抛错", () => {
    expect(() => parseRange('ZZ')).toThrow();
  });

  it('rangeCombos 去除死牌', () => {
    const r = parseRange('AA');
    const combos = rangeCombos(r, [cardFromString('As')]);
    expect(combos.length).toBe(3); // 去掉含 As 的组合
  });

  it('mergeRanges 取 max；rangeWidth 正确', () => {
    const a = parseRange('AA', 1);
    const b = parseRange('AA', 0.5);
    const m = mergeRanges(a, b);
    expect(m.get('AA')).toBe(1);
    // AA 宽度 = 6/1326
    expect(rangeWidth(m)).toBeCloseTo(6 / 1326);
  });
});
