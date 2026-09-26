import { randomUUID } from "node:crypto";
export type ConsentPurpose = "bank_data_read" | "recurring_detection" | "household_share";
export interface ConsentRecord { id: string; userId: string; purpose: ConsentPurpose; policyVersion: string; grantedAt: string; revokedAt: string | null }
export interface ConsentStore { append(record: ConsentRecord): Promise<void>; latest(userId: string, purpose: ConsentPurpose): Promise<ConsentRecord | undefined> }
export class ConsentService {
  constructor(private readonly store: ConsentStore, private readonly now = () => new Date()) {}
  async grant(userId: string, purpose: ConsentPurpose, policyVersion: string): Promise<ConsentRecord> {
    const record = { id: randomUUID(), userId, purpose, policyVersion, grantedAt: this.now().toISOString(), revokedAt: null };
    await this.store.append(record); return record;
  }
  async revoke(userId: string, purpose: ConsentPurpose): Promise<ConsentRecord> {
    const current = await this.store.latest(userId, purpose);
    if (!current || current.revokedAt) throw new Error("active consent not found");
    const record = { ...current, id: randomUUID(), revokedAt: this.now().toISOString() };
    await this.store.append(record); return record;
  }
}
