import { z } from 'zod';

export const CreateHouseholdSchema = z.object({
  name: z.string().min(1).max(120),
});

export const UpdateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

export const AddDependantSchema = z.object({
  name: z.string().min(1).max(120),
});

export type CreateHouseholdDto  = z.infer<typeof CreateHouseholdSchema>;
export type UpdateMemberRoleDto = z.infer<typeof UpdateMemberRoleSchema>;
export type AddDependantDto     = z.infer<typeof AddDependantSchema>;
