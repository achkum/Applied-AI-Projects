export default {
  input: './openapi.yaml',
  output: './generated',
  plugins: ['@hey-api/client-fetch', '@hey-api/sdk', { name: 'zod', compatibilityVersion: 4 }],
};
