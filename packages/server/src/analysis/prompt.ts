/**
 * 复盘解说提示词：由 DecisionReport[] 生成简洁中文点评（不透露底牌）。
 */
import type { DecisionReport } from '@poker/strategy';

function actionLabel(a: { type: string; amount?: number }): string {
  switch (a.type) {
    case 'fold':
      return '弃牌';
    case 'check':
      return '过牌';
    case 'call':
      return '跟注';
    case 'bet':
      return `下注 ${a.amount ?? ''}`;
    case 'raise':
      return `加注到 ${a.amount ?? ''}`;
    case 'allin':
      return '全下';
    default:
      return a.type;
  }
}

export function buildAnalysisPrompt(verdicts: DecisionReport[]): string {
  const mistakes = verdicts.filter((v) => v.verdict === 'mistake');
  if (mistakes.length === 0) {
    return `这手牌共 ${verdicts.length} 个决策点，没有明显失误。`;
  }
  const lines = mistakes.map(
    (m) => `- ${m.street} 街${actionLabel(m.heroAction)}：EV 损失约 ${m.evLossBb.toFixed(1)}bb`,
  );
  return `这手牌有 ${mistakes.length} 处失误：\n${lines.join('\n')}`;
}
