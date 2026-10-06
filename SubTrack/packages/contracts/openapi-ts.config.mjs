// Preserve legacy validator behavior; enforce closed v2 objects from the generator IR.
const legacySchemas = new Set(['ConsentSetting', 'DeleteAccountBody', 'ExportJobResponse',
  'HealthResponse', 'Problem', 'ReadinessResponse', 'SetOpenBookBody',
  'SubscriptionSummary', 'VersionResponse']);

export default {
  input: './openapi.yaml',
  output: './generated',
  plugins: ['@hey-api/client-fetch', '@hey-api/sdk', {
    name: 'zod',
    compatibilityVersion: 4,
    $resolvers: {
      object: (ctx) => {
        const ref = ctx.path['~ref'];
        return ctx.schema.additionalProperties?.type === 'never'
          && ref?.[0] === 'components' && ref?.[1] === 'schemas'
          && !legacySchemas.has(ref[2])
          ? ctx.nodes.base(ctx).attr('strict').call()
          : undefined;
      },
    },
  }],
};
