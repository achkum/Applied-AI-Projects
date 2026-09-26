# LLM Providers for the product runtime (not the dev agents)

The dev agents use Codex (Sol/Luna) through OpenClaw. The **app** uses free-tier LLMs through `packages/llm-gateway`.

| Provider | Why | Must verify before enabling (the architect records the findings here with a date) |
|---|---|---|
| Google AI Studio (Gemini) | Generous free tier, good multilingual (Swedish) quality | Current free quotas; whether free-tier inputs may be used for training (they may be; so send no PII, which we don't anyway); EU availability |
| Groq | Very fast open-weight models, free tier | Quotas, model list, ToS |
| OpenRouter `:free` models | Fallback variety | Daily caps, model availability churn |
| TemplateProvider | Always works; deterministic | – |

Configure the order with `LLM_PROVIDER_ORDER=gemini,groq,openrouter,template`. The gateway must fall through on error, timeout, or quota.
