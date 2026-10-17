/** Pure wire declarations: safe for an emitting API build without loading runtime decoders. */
export const SANDBOX_HOUSEHOLD_OPERATIONS = Object.freeze(['household-read','household-create','household-rename','dependant-add','dependant-edit','dependant-remove','household-assign'] as const);
export type SandboxHouseholdOperation = typeof SANDBOX_HOUSEHOLD_OPERATIONS[number];
export type SandboxHouseholdMember = Readonly<{id:string;displayName:string;role:'ADMIN'|'DEPENDANT'}>;
export type SandboxHouseholdAssignment=Readonly<{subscriptionId:string;memberIds:readonly string[];payerMemberId:string|null}>;
export type SandboxHouseholdView = Readonly<{household:Readonly<{id:string;name:string;members:readonly SandboxHouseholdMember[];assignments:readonly SandboxHouseholdAssignment[]}>|null}>;
