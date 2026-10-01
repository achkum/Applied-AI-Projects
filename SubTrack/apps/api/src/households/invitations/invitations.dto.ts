import { z } from 'zod';

export const INVITATION_CHANNELS = ['LINK', 'CODE', 'EMAIL', 'SMS'] as const;
export type InvitationChannel = (typeof INVITATION_CHANNELS)[number];

// ─── Request bodies ───────────────────────────────────────────────────────────

export const CreateInvitationBodySchema = z
  .object({
    channel: z.enum(INVITATION_CHANNELS),
    /** Required for EMAIL/SMS; must be absent for LINK/CODE. */
    recipient: z.string().min(1).max(320).optional(),
  })
  .superRefine((val, ctx) => {
    if ((val.channel === 'EMAIL' || val.channel === 'SMS') && !val.recipient) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'recipient is required for EMAIL and SMS channels',
        path: ['recipient'],
      });
    }
    if ((val.channel === 'LINK' || val.channel === 'CODE') && val.recipient) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'recipient must not be provided for LINK and CODE channels',
        path: ['recipient'],
      });
    }
  });

export type CreateInvitationBody = z.infer<typeof CreateInvitationBodySchema>;

export const RespondInvitationBodySchema = z.object({
  /** 64-character hex opaque invite token (raw, not hashed). */
  token: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/, 'token must be a 64-character lowercase hex string'),
});

export type RespondInvitationBody = z.infer<typeof RespondInvitationBodySchema>;

// ─── Response shapes ──────────────────────────────────────────────────────────

export type InvitationPreviewStatus =
  | 'VALID'
  | 'EXPIRED'
  | 'REVOKED'
  | 'USED'
  | 'NOT_FOUND';

export interface InvitationPreview {
  status: InvitationPreviewStatus;
  householdName?: string;
  /** Derived from inviter email prefix or phone suffix; never raw PII. */
  adminHandle?: string;
  memberCount?: number;
}

export interface InvitationResponse {
  id: string;
  channel: InvitationChannel;
  recipient: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  /** Only present for LINK/CODE channels on create — omitted afterwards. */
  token?: string;
}
