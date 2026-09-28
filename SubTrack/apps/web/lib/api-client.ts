// Re-export API client from generated contracts package
export { getHealthz, type Options } from '@subtrack/contracts';

// Configuration for API base URL
export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
