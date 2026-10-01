import type { LlmAdapter } from '../provider.js';
import type { LlmRequest, LlmResponse } from '../types.js';

export class TemplateProvider implements LlmAdapter {
  readonly provider = 'template' as const;

  constructor(private readonly fixedResponse: string = 'Template response.') {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    return {
      content: this.fixedResponse,
      model: request.model,
      provider: 'template',
      cached: false,
      latencyMs: 0,
    };
  }
}
