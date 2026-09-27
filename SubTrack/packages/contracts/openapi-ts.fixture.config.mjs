export default {
  input: './fixtures/zod-openapi.yaml',
  output: './fixtures/generated',
  plugins: [{ name: 'zod', compatibilityVersion: 4 }],
};
