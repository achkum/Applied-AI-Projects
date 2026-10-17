import * as privateApi from './privateMobileApi';
import { sandboxMobileApi } from './sandboxMobileApi';
import { createNativeAnalyticsReader } from './nativeAnalyticsReader';
import { syntheticComparisonCatalogue } from './syntheticComparisonCatalogue';

export const privateAnalyticsReader = createNativeAnalyticsReader(privateApi);
export const sandboxAnalyticsReader = createNativeAnalyticsReader(sandboxMobileApi, {
  catalogue: syntheticComparisonCatalogue,
  history: (token, signal) => sandboxMobileApi.readNativeBankHistory(token, signal),
});
