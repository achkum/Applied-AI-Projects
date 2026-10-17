import * as privateApi from './privateMobileApi';
import { sandboxMobileApi } from './sandboxMobileApi';
import { createNativeAnalyticsReader } from './nativeAnalyticsReader';
import { syntheticComparisonCatalogue } from './syntheticComparisonCatalogue';
import { sandboxHouseholdApi } from './sandboxHouseholdApi';

export const privateAnalyticsReader = createNativeAnalyticsReader(privateApi);
export const sandboxAnalyticsReader = createNativeAnalyticsReader(sandboxMobileApi, {
  catalogue: syntheticComparisonCatalogue,
  history: (token, signal) => sandboxMobileApi.readNativeBankHistory(token, signal),
  household: (token, signal) => sandboxHouseholdApi.read(token, signal),
});
