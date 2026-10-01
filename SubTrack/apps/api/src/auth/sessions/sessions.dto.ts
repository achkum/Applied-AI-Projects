import { z } from 'zod';

export const CreateSessionBody = z.object({
  identityId: z.string().uuid(),
  deviceName: z.string().min(1).max(120),
});
export type CreateSessionBody = z.infer<typeof CreateSessionBody>;

export const RefreshBody = z.object({
  refreshToken: z.string().length(64).regex(/^[0-9a-f]+$/),
});
export type RefreshBody = z.infer<typeof RefreshBody>;

export interface SessionTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface DeviceInfo {
  id: string;
  deviceName: string;
  createdAt: Date;
  lastUsedAt: Date;
}
