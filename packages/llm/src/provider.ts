/**
 * LLM Provider 抽象：可插拔的人格/解说来源。
 * - MockProvider：本地固定台词（无需 API Key，用于测试与默认）
 * - HttpProvider：OpenAI 兼容接口（DeepSeek / 通义千问 / 智谱 等）
 */

export interface LlmProvider {
  chat(system: string, user: string): Promise<string>;
}

const DEFAULT_LINES = [
  '这把牌有点意思。',
  '我看看局势再说。',
  '跟一手，不多也不少。',
  '这桌面越来越紧了。',
  '你吓不到我的。',
  '运气好像站在我这边。',
];

export class MockProvider implements LlmProvider {
  private i = 0;
  constructor(private lines: string[] = DEFAULT_LINES) {}
  async chat(_system: string, _user: string): Promise<string> {
    const line = this.lines[this.i % this.lines.length];
    this.i++;
    return line;
  }
}

export interface HttpProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export class HttpProvider implements LlmProvider {
  private opts: Required<HttpProviderOptions>;
  constructor(opts: HttpProviderOptions) {
    this.opts = { timeoutMs: 5000, ...opts };
  }
  async chat(system: string, user: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const res = await fetch(this.opts.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }
}
