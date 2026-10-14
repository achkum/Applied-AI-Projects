import { parseSandboxCredentials, type SandboxCredentials } from '@subtrack/contracts/sandbox-mobile';
import { SandboxStorageError, validateSandboxBundle, type SandboxBundleStore } from '@/utils/secureSandboxBundle';
import type { SandboxMobileApi } from '@/api/sandboxMobileApi';

export type SandboxPhase = 'verification-required' | 'busy' | 'active' | 'storage-error';
export class SandboxSessionError extends Error { constructor() { super('Sandbox session unavailable'); this.name = 'SandboxSessionError'; } }
type Api = Pick<SandboxMobileApi, 'bootstrap' | 'resume' | 'refresh' | 'logout'>;
/** Process-private capability, serial persistence barrier and immediate generation retirement. */
export class SandboxSessionCore {
  private capability: string | null = null;
  private credentials: SandboxCredentials | null = null;
  // Revocation custody only: never read by run/refresh or exposed through the facade.
  private revocationCredentials: SandboxCredentials | null = null;
  private storageFailed = false;
  private phase: SandboxPhase = 'verification-required';
  private generation = 0;
  private controller: AbortController | null = null;
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly store: SandboxBundleStore, private readonly api: Api,
    private readonly changed: (phase: SandboxPhase, resumable: boolean) => void) {}
  private update(phase: SandboxPhase) { this.phase = phase; this.changed(phase, this.capability !== null); }
  private serial<T>(work: () => Promise<T>): Promise<T> { const result = this.queue.then(work); this.queue = result.then(() => undefined, () => undefined); return result; }
  private retire() { this.generation++; this.controller?.abort(); this.credentials = null; }
  private storageFailure() { this.storageFailed = true; this.controller?.abort(); this.credentials = null; this.capability = null; this.update('storage-error'); }
  private storageHealthy() { if (this.storageFailed) { this.update('storage-error'); throw new SandboxStorageError(); } }
  private async persist(session: SandboxCredentials | null) {
    this.storageHealthy();
    try { await this.store.write(validateSandboxBundle({ version: 1, installationCapability: this.capability, session })); }
    catch { this.storageFailure(); throw new SandboxStorageError(); }
  }
  private async inactive(ticket: number) {
    this.storageHealthy();
    this.credentials = null;
    try { if (this.capability) await this.persist(null); else await this.store.clear();
      if (ticket === this.generation) this.update('verification-required');
    } catch { this.storageFailure(); throw new SandboxStorageError(); }
  }
  initialize(): Promise<void> {
    if (this.storageFailed) return Promise.reject(new SandboxStorageError());
    this.retire(); const ticket = this.generation; this.update('busy');
    return this.serial(async () => {
      this.storageHealthy();
      if (ticket !== this.generation) return;
      try { const bundle = await this.store.read().catch(() => { this.storageFailure(); throw new SandboxStorageError(); }); if (ticket !== this.generation) return;
        this.capability = bundle ? validateSandboxBundle(bundle).installationCapability : null;
        if (!this.capability) { this.update('verification-required'); return; }
        this.controller = new AbortController(); const next = parseSandboxCredentials(await this.api.resume(this.capability, this.controller.signal), false);
        if (ticket !== this.generation) return; this.revocationCredentials = next; await this.persist(next); if (ticket !== this.generation) return;
        this.credentials = next; this.update('active');
      } catch { if (ticket !== this.generation) return; await this.inactive(ticket); throw new SandboxSessionError(); }
    });
  }
  bootstrap(locale: 'sv' | 'en'): Promise<void> {
    if (this.storageFailed) return Promise.reject(new SandboxStorageError());
    if (this.capability || this.phase === 'storage-error') return Promise.reject(new SandboxSessionError());
    this.retire(); const ticket = this.generation; this.update('busy');
    return this.serial(async () => {
      this.storageHealthy();
      if (ticket !== this.generation) return;
      try { this.controller = new AbortController(); const created = parseSandboxCredentials(await this.api.bootstrap(locale, this.controller.signal), true);
        if (ticket !== this.generation) return; this.capability = created.installationCapability;
        const next = parseSandboxCredentials({ transport: created.transport, sessionId: created.sessionId,
          accessToken: created.accessToken, refreshToken: created.refreshToken, sessionExpiresAt: created.sessionExpiresAt }, false);
        this.revocationCredentials = next; await this.persist(next); if (ticket !== this.generation) return;
        this.credentials = next; this.update('active');
      } catch { if (ticket !== this.generation) return; await this.inactive(ticket); throw new SandboxSessionError(); }
    });
  }
  resume(): Promise<void> {
    if (this.storageFailed) return Promise.reject(new SandboxStorageError());
    if (!this.capability || this.phase === 'storage-error') return Promise.reject(new SandboxSessionError());
    this.retire(); const ticket = this.generation; this.update('busy');
    return this.serial(async () => {
      this.storageHealthy();
      if (ticket !== this.generation || !this.capability) return;
      try { this.controller = new AbortController(); const next = parseSandboxCredentials(await this.api.resume(this.capability, this.controller.signal), false);
        if (ticket !== this.generation) return; this.revocationCredentials = next; await this.persist(next); if (ticket !== this.generation) return;
        this.credentials = next; this.update('active');
      } catch { if (ticket !== this.generation) return; await this.inactive(ticket); throw new SandboxSessionError(); }
    });
  }
  refresh(): Promise<void> {
    const ticket = this.generation;
    return this.serial(async () => {
      this.storageHealthy();
      if (ticket !== this.generation || !this.credentials || this.phase !== 'active') throw new SandboxSessionError();
      const previous = this.credentials; this.credentials = null; this.update('busy'); this.controller = new AbortController();
      try { const next = parseSandboxCredentials(await this.api.refresh(previous, this.controller.signal), false);
        if (next.sessionId !== previous.sessionId || next.refreshToken === previous.refreshToken) throw new SandboxSessionError();
        if (ticket !== this.generation) return; this.revocationCredentials = next; await this.persist(next); if (ticket !== this.generation) return;
        this.credentials = next; this.update('active');
      } catch { if (ticket !== this.generation) return; this.retire(); await this.inactive(this.generation); throw new SandboxSessionError(); }
    });
  }
  run<T>(work: (token: string, signal: AbortSignal) => Promise<T>): Promise<T> {
    const ticket = this.generation;
    return this.serial(async () => {
      this.storageHealthy();
      if (ticket !== this.generation || !this.credentials || this.phase !== 'active') throw new SandboxSessionError();
      this.controller = new AbortController();
      try { const value = await work(this.credentials.accessToken, this.controller.signal); if (ticket !== this.generation || this.controller.signal.aborted) throw new SandboxSessionError(); return value; }
      catch { if (ticket === this.generation) { this.retire(); await this.inactive(this.generation); } throw new SandboxSessionError(); }
    });
  }
  logout(): Promise<boolean> {
    const previous = this.revocationCredentials; this.revocationCredentials = null;
    this.retire(); const ticket = this.generation; this.capability = null; this.update('verification-required');
    return this.serial(async () => {
      let cleared = false, revoked = false;
      try { await this.store.clear(); cleared = true; this.storageFailed = false; if (ticket === this.generation) this.update('verification-required'); }
      catch { this.storageFailure(); }
      if (previous) { try { await this.api.logout(previous, new AbortController().signal); revoked = true; } catch { /* No acknowledged server revocation. */ } }
      if (!cleared) throw new SandboxStorageError();
      return revoked;
    });
  }
  dispose() { this.retire(); this.capability = null; this.revocationCredentials = null; this.update(this.storageFailed ? 'storage-error' : 'verification-required'); }
}
