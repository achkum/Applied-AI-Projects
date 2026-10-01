import type { LlmRequest, LlmResponse } from './types.js';

export interface LlmAdapter {
  readonly provider: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}
