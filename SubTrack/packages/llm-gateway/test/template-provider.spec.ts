import { describe, it, expect } from 'vitest';
import { TemplateProvider } from '../src/providers/template.js';
import type { LlmRequest } from '../src/types.js';

const baseRequest: LlmRequest = {
  provider: 'template',
  model: 'test-model-v1',
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('TemplateProvider', () => {
  it('returns the default fixed response', async () => {
    const p = new TemplateProvider();
    const r = await p.complete(baseRequest);
    expect(r.content).toBe('Template response.');
  });

  it('returns a custom fixed response when constructed with one', async () => {
    const p = new TemplateProvider('Custom answer');
    const r = await p.complete(baseRequest);
    expect(r.content).toBe('Custom answer');
  });

  it('sets provider to "template"', async () => {
    const p = new TemplateProvider();
    const r = await p.complete(baseRequest);
    expect(r.provider).toBe('template');
  });

  it('sets cached to false', async () => {
    const p = new TemplateProvider();
    const r = await p.complete(baseRequest);
    expect(r.cached).toBe(false);
  });

  it('sets latencyMs to 0', async () => {
    const p = new TemplateProvider();
    const r = await p.complete(baseRequest);
    expect(r.latencyMs).toBe(0);
  });

  it('echoes the model from the request', async () => {
    const p = new TemplateProvider();
    const r = await p.complete({ ...baseRequest, model: 'my-model-xyz' });
    expect(r.model).toBe('my-model-xyz');
  });

  it('content is a string', async () => {
    const p = new TemplateProvider();
    const r = await p.complete(baseRequest);
    expect(typeof r.content).toBe('string');
  });

  it('multiple calls return the same content', async () => {
    const p = new TemplateProvider('stable');
    const r1 = await p.complete(baseRequest);
    const r2 = await p.complete(baseRequest);
    expect(r1.content).toBe(r2.content);
  });

  it('readonly provider field matches the string literal', () => {
    const p = new TemplateProvider();
    expect(p.provider).toBe('template');
  });
});
