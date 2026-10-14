export type SandboxPreparation = Readonly<{
  variant: 'sandbox';
  apiBaseUrl: string;
  runtimeEnabled: false;
  publicationEnabled: false;
  privateDiagnosticsEnabled: false;
}>;

type SandboxInput = Readonly<{
  variant?: string | undefined;
  apiBaseUrl?: string | undefined;
  platform: string;
  development: boolean;
}>;

/** Candidate configuration, not an available endpoint or adopted guest authority. */
export function resolveSandboxPreparation(input: SandboxInput): SandboxPreparation | null {
  if (input.variant !== 'sandbox' || (input.platform !== 'ios' && input.platform !== 'android') ||
      input.apiBaseUrl !== 'https://198.44.116.159') return null;
  return Object.freeze({
    variant: 'sandbox', apiBaseUrl: input.apiBaseUrl, runtimeEnabled: false,
    publicationEnabled: false, privateDiagnosticsEnabled: false,
  });
}

/** Publication/identity remains disabled even in a correctly configured release build. */
export function resolveSandboxRuntime(input: SandboxInput): null {
  resolveSandboxPreparation(input);
  return null;
}
