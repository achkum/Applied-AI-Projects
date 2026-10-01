import type { LlmAdapter } from '../provider.js';
import type { LlmRequest, LlmResponse } from '../types.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider implements LlmAdapter {
  readonly provider = 'openrouter' as const;

  constructor(private readonly apiKey: string) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (!request.model.endsWith(':free')) {
      throw new Error(
        `OpenRouterProvider: only ":free" suffix models are allowed. Got: "${request.model}". ` +
          `Use a model like "meta-llama/llama-3.1-8b-instruct:free".`,
      );
    }

    const t0 = performance.now();
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://subtrack.app',
        'X-Title': 'SubTrack',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });
    const latencyMs = performance.now() - t0;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string | null } }>;
      model: string;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const content = data.choices[0]?.message.content ?? '';

    return {
      content,
      model: data.model,
      provider: 'openrouter',
      ...(data.usage
        ? {
            usage: {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            },
          }
        : {}),
      cached: false,
      latencyMs,
    };
  }
}
