import { NativeStorageError, validateNativeCredentials, type NativeBundleStore, type NativeCredentials } from '@/utils/secureSessionBundle';

export type NativePhase = 'verification-required' | 'busy' | 'active' | 'storage-error';
export class NativeSessionError extends Error {
  constructor() { super('Fresh verification required'); this.name = 'NativeSessionError'; }
}
/** Serializes credential mutations; logout invalidates live authority before awaiting anything. */
export class NativeSessionCore {
  private credentials: NativeCredentials | null = null;
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private controller: AbortController | null = null;
  private phase: NativePhase = 'verification-required';
  constructor(private readonly store: NativeBundleStore, private readonly changed: (phase: NativePhase) => void) {}
  private update(phase: NativePhase) { this.phase = phase; this.changed(phase); }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation); this.queue = result.then(() => undefined, () => undefined); return result;
  }
  private invalidate() { this.generation++; this.controller?.abort(); this.credentials = null; }
  private async clear(phase: NativePhase, ticket: number): Promise<boolean> {
    try {
      await this.store.clear();
      if (ticket !== this.generation) return false;
      this.update(phase); return true;
    } catch {
      if (ticket !== this.generation) return false;
      this.update('storage-error'); throw new NativeStorageError();
    }
  }
  initialize(): Promise<void> {
    this.invalidate(); const ticket = this.generation; this.update('busy');
    return this.serial(async () => {
      if (ticket !== this.generation) return;
      try { await this.store.read(); if (ticket !== this.generation) return; await this.clear('verification-required', ticket); }
      catch {
        if (ticket !== this.generation) return;
        this.credentials = null; this.update('storage-error');
        try { await this.store.clear(); } catch { /* No credentials remain usable in this process. */ }
        if (ticket !== this.generation) return;
        throw new NativeStorageError();
      }
    });
  }
  establish(verify: (signal: AbortSignal) => Promise<NativeCredentials>): Promise<void> {
    this.invalidate(); const ticket = this.generation; this.update('busy');
    return this.serial(async () => {
      if (ticket !== this.generation) return;
      try {
        await this.store.clear();
        if (ticket !== this.generation) return;
        this.controller = new AbortController(); const next = validateNativeCredentials(await verify(this.controller.signal));
        if (ticket !== this.generation) return;
        await this.store.write(next);
        if (ticket !== this.generation) { await this.store.clear(); return; }
        this.credentials = next; this.update('active');
      } catch (error) {
        if (ticket !== this.generation) return;
        this.invalidate(); const cleanup = this.generation;
        if (!await this.clear(error instanceof NativeStorageError ? 'storage-error' : 'verification-required', cleanup)) return;
        throw error instanceof NativeStorageError ? new NativeStorageError() : new NativeSessionError();
      }
    });
  }
  rotate(refresh: (credentials: NativeCredentials, signal: AbortSignal) => Promise<NativeCredentials>): Promise<void> {
    const ticket = this.generation;
    return this.serial(async () => {
      if (ticket !== this.generation || !this.credentials || this.phase !== 'active') throw new NativeSessionError();
      const previous = this.credentials; this.credentials = null; this.update('busy'); this.controller = new AbortController();
      try {
        const next = validateNativeCredentials(await refresh(previous, this.controller.signal));
        if (ticket !== this.generation) return;
        if (next.sessionId !== previous.sessionId || next.refreshToken === previous.refreshToken) throw new NativeSessionError();
        await this.store.write(next);
        if (ticket !== this.generation) { await this.store.clear(); return; }
        this.credentials = next; this.update('active');
      } catch (error) {
        if (ticket !== this.generation) return;
        this.invalidate(); const cleanup = this.generation;
        if (!await this.clear(error instanceof NativeStorageError ? 'storage-error' : 'verification-required', cleanup)) return;
        throw error instanceof NativeStorageError ? new NativeStorageError() : new NativeSessionError();
      }
    });
  }
  run<T>(operation: (accessToken: string, signal: AbortSignal) => Promise<T>): Promise<T> {
    const ticket = this.generation;
    return this.serial(async () => {
      if (ticket !== this.generation || !this.credentials || this.phase !== 'active') throw new NativeSessionError();
      this.controller = new AbortController();
      try {
        const value = await operation(this.credentials.accessToken, this.controller.signal);
        if (ticket !== this.generation) throw new NativeSessionError();
        return value;
      } catch {
        if (ticket === this.generation) { this.invalidate(); await this.clear('verification-required', this.generation); }
        throw new NativeSessionError();
      }
    });
  }
  logout(revoke?: (credentials: NativeCredentials, signal: AbortSignal) => Promise<void>): Promise<boolean> {
    const previous = this.credentials; this.invalidate(); const ticket = this.generation; this.update('verification-required');
    return this.serial(async () => {
      await this.clear('verification-required', ticket);
      if (!previous || !revoke) return false;
      try { await revoke(previous, new AbortController().signal); return true; } catch { return false; }
    });
  }
  dispose() { this.invalidate(); this.update('verification-required'); }
}
