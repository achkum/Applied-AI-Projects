import { z } from 'zod';

// ─── Request schemas ──────────────────────────────────────────────────────────

export const RequestExportSchema = z.object({}).strict();

export const DeleteAccountSchema = z.object({
  // BankID or OTP re-auth credential — required before erasure.
  // With A5 Assumed (dev/simulator): any non-empty string is accepted.
  reAuthToken: z.string().min(1, 'Re-auth token is required for account deletion.'),
}).strict();

export type DeleteAccountBody = z.infer<typeof DeleteAccountSchema>;

// ─── Response interfaces ──────────────────────────────────────────────────────

export interface ExportJobResponse {
  token: string;
  downloadUrl: string;
  expiresAt: string; // ISO-8601
}

export interface ExportTokenEntry {
  callerId: string;
  data: Buffer;
  expiresAt: Date;
}
