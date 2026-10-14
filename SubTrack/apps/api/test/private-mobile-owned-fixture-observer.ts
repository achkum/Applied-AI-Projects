import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:https';

type Bucket = 'zero' | 'one' | 'multiple';
type Status = 'accepted202' | 'rejected4xx' | 'failed5xx' | 'other' | 'incomplete';
export type OwnedOtpStartObservation = Readonly<Record<Status | 'arrivals', Bucket>>;
const bucket = (count: number): Bucket => count === 0 ? 'zero' : count === 1 ? 'one' : 'multiple';

/** Passive owned-fixture diagnostics only. Never reads bodies, headers or identifiers. */
export function createOwnedOtpStartObserver() {
  let generation = 0;
  let server: Server | undefined;
  let requestListener: ((input: IncomingMessage, response: ServerResponse) => void) | undefined;
  let arrivals = 0;
  const counts: Record<Status, number> = { accepted202: 0, rejected4xx: 0, failed5xx: 0, other: 0, incomplete: 0 };
  // Response handles exist solely to remove these two listeners during teardown.
  const pending = new Map<ServerResponse, () => void>();
  function stop() {
    generation++;
    if (server && requestListener) server.removeListener('request', requestListener);
    requestListener = undefined;
    server = undefined;
    for (const remove of pending.values()) remove();
    pending.clear();
    arrivals = 0;
    for (const status of Object.keys(counts) as Status[]) counts[status] = 0;
  }
  function request(ticket: number, input: IncomingMessage, response: ServerResponse) {
    if (!server || ticket !== generation || input.method !== 'POST' || input.url !== '/v2/auth/otp/start') return;
    arrivals++;
    function remove() {
      response.removeListener('finish', finish);
      response.removeListener('close', close);
    }
    function record(status: Status) {
      if (!server || ticket !== generation || !pending.has(response)) return;
      remove();
      pending.delete(response);
      counts[status]++;
    }
    function finish() {
      const status = response.statusCode;
      record(status === 202 ? 'accepted202' : status >= 400 && status <= 499 ? 'rejected4xx' : status >= 500 && status <= 599 ? 'failed5xx' : 'other');
    }
    function close() { record('incomplete'); }
    pending.set(response, remove);
    response.on('finish', finish);
    response.on('close', close);
  }
  return Object.freeze({
    attach(next: Server) {
      stop(); server = next; const ticket = generation;
      requestListener = (input, response) => request(ticket, input, response);
      server.on('request', requestListener);
    },
    stop,
    observation(): OwnedOtpStartObservation {
      return Object.freeze({ arrivals: bucket(arrivals), accepted202: bucket(counts.accepted202), rejected4xx: bucket(counts.rejected4xx), failed5xx: bucket(counts.failed5xx), other: bucket(counts.other), incomplete: bucket(counts.incomplete + pending.size) });
    },
  });
}
