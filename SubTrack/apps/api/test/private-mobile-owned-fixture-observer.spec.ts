import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:https';
import { describe, expect, it } from 'vitest';
import { createOwnedOtpStartObserver } from './private-mobile-owned-fixture-observer';

function fixture() {
  const server = new EventEmitter();
  const observer = createOwnedOtpStartObserver();
  observer.attach(server as Server);
  const response = (statusCode = 202) => Object.assign(new EventEmitter(), { statusCode }) as ServerResponse;
  const request = (output: ServerResponse, method = 'POST', url = '/v2/auth/otp/start') =>
    server.emit('request', { method, url } as IncomingMessage, output);
  return { server, observer, response, request };
}

describe('passive owned OTP start observations', () => {
  it('ignores every non-exact method/path and never accesses private request fields', () => {
    const f = fixture();
    for (const [method, url] of [['GET', '/v2/auth/otp/start'], ['POST', '/v2/auth/otp/start?secret=private-canary'], ['POST', '/v2/auth/otp/verify']])
      f.request(f.response(), method, url);
    const input = { method: 'POST', url: '/v2/auth/otp/start', get headers() { throw Error('private-canary'); }, get body() { throw Error('private-canary'); } };
    const output = f.response();
    f.server.emit('request', input, output);
    expect(f.observer.observation().arrivals).toBe('one');
    expect(f.observer.observation().incomplete).toBe('one');
    expect(JSON.stringify(f.observer.observation())).not.toContain('private-canary');
    output.emit('finish');
    expect(f.observer.observation().accepted202).toBe('one');
    expect(f.observer.observation().incomplete).toBe('zero');
  });

  it('counts finish once, removes listeners and reports only closed status buckets', () => {
    const f = fixture();
    const statuses = [202, 202, 400, 499, 500, 599, 200, 399, 600];
    for (const code of statuses) {
      const output = f.response(code);
      f.request(output);
      output.emit('finish'); output.emit('close'); output.emit('finish');
      expect(output.listenerCount('finish')).toBe(0);
      expect(output.listenerCount('close')).toBe(0);
    }
    expect(f.observer.observation()).toEqual({ arrivals: 'multiple', accepted202: 'multiple', rejected4xx: 'multiple', failed5xx: 'multiple', other: 'multiple', incomplete: 'zero' });
    expect(Object.isFrozen(f.observer.observation())).toBe(true);
  });

  it('pending or aborted response is incomplete and duplicate late callbacks cannot count twice', () => {
    const f = fixture();
    const output = f.response(); f.request(output);
    const finish = output.listeners('finish')[0] as () => void;
    const close = output.listeners('close')[0] as () => void;
    close(); finish(); close();
    expect(f.observer.observation()).toEqual({ arrivals: 'one', accepted202: 'zero', rejected4xx: 'zero', failed5xx: 'zero', other: 'zero', incomplete: 'one' });
    f.request(f.response());
    expect(f.observer.observation().incomplete).toBe('multiple');
  });

  it('stop and restart remove housekeeping listeners, reset buckets and fence stale callbacks', () => {
    const f = fixture();
    const first = f.response(); f.request(first);
    const finish = first.listeners('finish')[0] as () => void;
    const close = first.listeners('close')[0] as () => void;
    const oldRequest = f.server.listeners('request')[0] as (input: IncomingMessage, output: ServerResponse) => void;
    f.observer.stop();
    oldRequest({ method: 'POST', url: '/v2/auth/otp/start' } as IncomingMessage, f.response());
    finish(); close();
    expect(f.server.listenerCount('request')).toBe(0);
    expect(first.listenerCount('finish') + first.listenerCount('close')).toBe(0);
    expect(f.observer.observation().arrivals).toBe('zero');
    f.observer.attach(f.server as Server);
    oldRequest({ method: 'POST', url: '/v2/auth/otp/start' } as IncomingMessage, f.response());
    finish(); close();
    expect(f.observer.observation().arrivals).toBe('zero');
    expect(f.observer.observation().accepted202).toBe('zero');
    const second = f.response(404); f.request(second); second.emit('finish');
    expect(f.observer.observation().rejected4xx).toBe('one');
    f.observer.attach(f.server as Server);
    expect(f.server.listenerCount('request')).toBe(1);
    expect(f.observer.observation().arrivals).toBe('zero');
    f.observer.stop(); f.observer.stop();
  });
});
