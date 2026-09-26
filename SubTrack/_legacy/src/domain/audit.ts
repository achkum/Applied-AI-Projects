import { createHash, randomUUID } from "node:crypto";
export interface AuditInput { actorId: string; action: string; subjectType: string; subjectId: string; metadata?: Readonly<Record<string, string | number | boolean | null>> }
export interface AuditEvent extends AuditInput { id: string; occurredAt: string; previousHash: string | null; hash: string }
export interface AuditStore { last(): Promise<AuditEvent | undefined>; append(event: AuditEvent): Promise<void> }
function canonical(input: Omit<AuditEvent, "hash">): string {
  return JSON.stringify({ ...input, metadata: Object.fromEntries(Object.entries(input.metadata ?? {}).sort(([a], [b]) => a.localeCompare(b))) });
}
export class AuditService {
  constructor(private readonly store: AuditStore, private readonly now = () => new Date()) {}
  async record(input: AuditInput): Promise<AuditEvent> {
    const previousHash = (await this.store.last())?.hash ?? null;
    const body = { ...input, id: randomUUID(), occurredAt: this.now().toISOString(), previousHash };
    const event = { ...body, hash: createHash("sha256").update(canonical(body)).digest("hex") };
    await this.store.append(event); return event;
  }
}
