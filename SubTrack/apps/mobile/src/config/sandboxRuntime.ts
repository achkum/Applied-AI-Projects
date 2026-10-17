export type SandboxPreparation = Readonly<{
  variant: 'sandbox'; apiBaseUrl: string; runtimeEnabled: false;
  publicationEnabled: false; privateDiagnosticsEnabled: false;
}>;
export type SandboxRuntime = Readonly<Omit<SandboxPreparation, 'runtimeEnabled'> & { runtimeEnabled: true }>;
type SandboxInput = Readonly<{ variant?: string | undefined; apiBaseUrl?: string | undefined;
  marker?: unknown; platform: string; development?: boolean }>;
const origin = 'https://198.44.116.159';
const fields = ['variant', 'apiBaseUrl', 'runtimeEnabled', 'publicationEnabled', 'privateDiagnosticsEnabled'];
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Presence is separate from validity. Hostile inspection always stays isolated. */
export function sandboxConfigurationSelected(config: unknown): boolean {
  try {
    if (config === null || config === undefined) return false;
    if (!record(config)) return true;
    const extra = Object.getOwnPropertyDescriptor(config, 'extra');
    if (!extra) return 'extra' in config;
    if (!('value' in extra)) return true;
    if (extra.value === null || extra.value === undefined) return false;
    if (!record(extra.value)) return true;
    return Object.getOwnPropertyDescriptor(extra.value, 'subtrackSandbox') !== undefined || 'subtrackSandbox' in extra.value;
  } catch { return true; }
}
/** Data-only retrieval never evaluates a configuration or marker getter. */
export function readSandboxMarker(config: unknown): unknown {
  try {
    if (!record(config)) return undefined;
    const extra = Object.getOwnPropertyDescriptor(config, 'extra');
    if (!extra || !('value' in extra) || !record(extra.value)) return undefined;
    const marker = Object.getOwnPropertyDescriptor(extra.value, 'subtrackSandbox');
    return marker && 'value' in marker ? marker.value : undefined;
  } catch { return undefined; }
}
/** Disabled preparation remains distinct from the active guest runtime. */
export function resolveSandboxPreparation(input: SandboxInput): SandboxPreparation | null {
  if (input.variant !== 'sandbox' || (input.platform !== 'ios' && input.platform !== 'android') || input.apiBaseUrl !== origin) return null;
  return Object.freeze({ variant: 'sandbox', apiBaseUrl: input.apiBaseUrl, runtimeEnabled: false,
    publicationEnabled: false, privateDiagnosticsEnabled: false });
}
/** A reviewed build marker enables only the isolated native guest namespace. */
export function resolveSandboxRuntime(input: SandboxInput): SandboxRuntime | null {
  try {
    if (input.platform !== 'ios' && input.platform !== 'android') return null;
    const marker = input.marker;
    if (!record(marker) || Object.getPrototypeOf(marker) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(marker);
    if (Reflect.ownKeys(marker).length !== fields.length || fields.some(key => {
      const descriptor = descriptors[key];
      return !descriptor || !('value' in descriptor) || !descriptor.enumerable;
    })) return null;
    if (descriptors.variant!.value !== 'sandbox' || descriptors.apiBaseUrl!.value !== origin || descriptors.runtimeEnabled!.value !== true ||
      descriptors.publicationEnabled!.value !== false || descriptors.privateDiagnosticsEnabled!.value !== false) return null;
    return Object.freeze({ variant: 'sandbox', apiBaseUrl: origin, runtimeEnabled: true,
      publicationEnabled: false, privateDiagnosticsEnabled: false });
  } catch { return null; }
}
