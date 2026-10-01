import type { LlmAdapter } from '../provider.js';
import type { LlmRequest, LlmResponse } from '../types.js';

export class GeminiProvider implements LlmAdapter {
  readonly provider = 'gemini' as const;

  constructor(private readonly apiKey: string) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: request.model });

    const systemParts = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');

    const chatHistory = request.messages
      .filter((m) => m.role !== 'system')
      .slice(0, -1)
      .map((m) => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: m.content }],
      }));

    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');
    const lastMsg = nonSystemMessages[nonSystemMessages.length - 1];
    const prompt = lastMsg?.content ?? '';

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
      },
      ...(systemParts ? { systemInstruction: systemParts } : {}),
    });

    const t0 = performance.now();
    const result = await chat.sendMessage(prompt);
    const latencyMs = performance.now() - t0;
    const text = result.response.text();

    const meta = result.response.usageMetadata;
    return {
      content: text,
      model: request.model,
      provider: 'gemini',
      ...(meta
        ? {
            usage: {
              ...(meta.promptTokenCount !== undefined
                ? { promptTokens: meta.promptTokenCount }
                : {}),
              ...(meta.candidatesTokenCount !== undefined
                ? { completionTokens: meta.candidatesTokenCount }
                : {}),
              ...(meta.totalTokenCount !== undefined
                ? { totalTokens: meta.totalTokenCount }
                : {}),
            },
          }
        : {}),
      cached: false,
      latencyMs,
    };
  }
}
