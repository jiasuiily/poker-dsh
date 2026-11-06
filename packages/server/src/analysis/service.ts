/**
 * 复盘分析服务：analyzeHand 得到判定 + LLM 生成解说 + 缓存 + 每日限流。
 */
import { eq } from 'drizzle-orm';
import { analyzeHand, type DecisionReport } from '@poker/strategy';
import type { LlmProvider } from '@poker/llm';
import type { Db } from '../db/client';
import { handAnalyses, llmUsage } from '../db/schema';
import type { HandRecord } from '../db/history-repo';
import { buildAnalysisPrompt } from './prompt';

const LLM_DAILY_LIMIT = 30;
const SYSTEM_PROMPT = '你是德州扑克复盘教练，用中文简洁点评，只依据公开信息，绝不透露任何底牌。';

export interface AnalysisResult {
  verdicts: DecisionReport[];
  summary: string;
  cached: boolean;
}

export class AnalysisService {
  constructor(
    private db: Db,
    private provider: LlmProvider,
    private dailyLimit = LLM_DAILY_LIMIT,
  ) {}

  async analyze(hand: HandRecord, heroSeat: number): Promise<AnalysisResult> {
    const cachedRows = await this.db
      .select()
      .from(handAnalyses)
      .where(eq(handAnalyses.handId, hand.id))
      .execute();
    if (cachedRows.length > 0) {
      return {
        verdicts: cachedRows[0].verdicts as DecisionReport[],
        summary: cachedRows[0].summary,
        cached: true,
      };
    }

    const verdicts = analyzeHand(hand.config, hand.initialDeck, hand.log, heroSeat, {
      iterations: 4000,
      seed: 1,
    });

    let summary: string;
    if (await this.canUseLlm()) {
      try {
        const raw = await this.provider.chat(SYSTEM_PROMPT, buildAnalysisPrompt(verdicts));
        summary = raw.replace(/<[^>]*>/g, '').slice(0, 2000).trim() || buildAnalysisPrompt(verdicts);
      } catch {
        summary = buildAnalysisPrompt(verdicts);
      }
    } else {
      summary = buildAnalysisPrompt(verdicts);
    }

    await this.db
      .insert(handAnalyses)
      .values({ handId: hand.id, verdicts: verdicts as never, summary })
      .onConflictDoNothing()
      .execute();
    return { verdicts, summary, cached: false };
  }

  private async canUseLlm(): Promise<boolean> {
    const date = new Date().toISOString().slice(0, 10);
    const rows = await this.db.select().from(llmUsage).where(eq(llmUsage.date, date)).execute();
    const count = rows[0]?.count ?? 0;
    if (count >= this.dailyLimit) return false;
    await this.db
      .insert(llmUsage)
      .values({ date, count: count + 1 })
      .onConflictDoUpdate({ target: llmUsage.date, set: { count: count + 1 } })
      .execute();
    return true;
  }
}
