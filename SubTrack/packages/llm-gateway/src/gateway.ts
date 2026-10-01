import type {
  LlmGatewayConfig,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from './types.js';
import type { LlmAdapter } from './provider.js';
import { LlmCache } from './cache.js';
import { RateLimiter } from './rate-limiter.js';
import { TemplateProvider } from './providers/template.js';
import { GeminiProvider } from './providers/gemini.js';
import { GroqProvider } from './providers/groq.js';
import { OpenRouterProvider } from './providers/openrouter.js';

export class LlmGateway {
  private readonly adapters: Map<LlmProvider, LlmAdapter>;
  private readonly cache: LlmCache;
  private readonly rateLimiter: RateLimiter;

  constructor(config: LlmGatewayConfig = {}) {
    this.cache = new LlmCache(config.cache);
    this.rateLimiter = new RateLimiter(config.rateLimits ?? {});

    this.adapters = new Map<LlmProvider, LlmAdapter>();
    if (config.geminiApiKey) {
      this.adapters.set('gemini', new GeminiProvider(config.geminiApiKey));
    }
    if (config.groqApiKey) {
      this.adapters.set('groq', new GroqProvider(config.groqApiKey));
    }
    if (config.openrouterApiKey) {
      this.adapters.set('openrouter', new OpenRouterProvider(config.openrouterApiKey));
    }
    this.adapters.set('template', new TemplateProvider());
  }

  register(provider: LlmProvider, adapter: LlmAdapter): void {
    this.adapters.set(provider, adapter);
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (!request.bypassCache) {
      const cached = this.cache.get(request);
      if (cached) return cached;
    }

    if (!this.rateLimiter.tryConsume(request.provider)) {
      throw new Error(`Rate limit exceeded for provider: ${request.provider}`);
    }

    const adapter = this.adapters.get(request.provider);
    if (!adapter) {
      throw new Error(
        `Provider "${request.provider}" is not configured. ` +
          `Pass the API key in LlmGatewayConfig or use register().`,
      );
    }

    const response = await adapter.complete(request);
    this.cache.set(request, response);
    return response;
  }
}
