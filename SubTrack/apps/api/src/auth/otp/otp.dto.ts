import { z } from 'zod';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE  = /^\+[1-9]\d{7,14}$/;

export const RequestOtpSchema = z.object({
  identifier: z
    .string()
    .min(1)
    .refine(
      (v) => EMAIL_RE.test(v) || E164_RE.test(v),
      { message: 'identifier must be a valid email or E.164 phone number' },
    ),
});

export const VerifyOtpSchema = z.object({
  identifier: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/, 'code must be exactly 6 digits'),
});

export type RequestOtpDto = z.infer<typeof RequestOtpSchema>;
export type VerifyOtpDto  = z.infer<typeof VerifyOtpSchema>;
