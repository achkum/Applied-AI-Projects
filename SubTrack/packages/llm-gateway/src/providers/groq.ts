import type { LlmAdapter } from '../provider.js';
import type { LlmRequest, LlmResponse } from '../types.js';

export class GroqProvider implements LlmAdapter {
  readonly provider = 'groq' as const;

  constructor(private readonly apiKey: string) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const GroqModule = await import('groq-sdk' as any);
    // groq-sdk may export as default or named
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Groq: any = GroqModule.default ?? GroqModule;
    const client = new Groq({ apiKey: this.apiKey });

    const t0 = performance.now();
    const completion = await client.chat.completions.create({
      messages: request.messages,
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    });
    const latencyMs = performance.now() - t0;

    const choice = completion.choices[0] as
      | { message: { content: string | null } }
      | undefined;
    const content = choice?.message.content ?? '';

    const u = completion.usage as
      | { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      | null
      | undefined;

    return {
      content,
      model: completion.model as string,
      provider: 'groq',
      ...(u
        ? {
            usage: {
              promptTokens: u.prompt_tokens,
              completionTokens: u.completion_tokens,
              totalTokens: u.total_tokens,
            },
          }
        : {}),
      cached: false,
      latencyMs,
    };
  }
}
