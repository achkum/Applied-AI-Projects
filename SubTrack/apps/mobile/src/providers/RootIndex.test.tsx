import { act, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import IndexRoute from '../../app/index';
import { RootProvider } from './RootProvider';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock(
  '@subtrack/ui-tokens/generated/theme.native.json',
  () => ({
    __esModule: true,
    default: jest.requireActual('@subtrack/ui-tokens'),
  }),
  { virtual: true },
);

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => (
      <Text testID="redirect-target">{href}</Text>
    ),
  };
});

const mockStorage = jest.mocked(AsyncStorage);

describe('root onboarding landing route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getItem.mockResolvedValue(null);
  });

  // The first cold native/Babel provider mount measured 4.1–4.9s, so only this test gets headroom.
  it.each(['sv', 'en', null, 'de'])(
    'redirects stored locale %s to the welcome route',
    async storedLocale => {
      let resolveStoredTheme: (value: string | null) => void = () => {};
      let resolveStoredLocale: (value: string | null) => void = () => {};
      mockStorage.getItem.mockImplementation(key => {
        if (key === 'theme-mode-preference') {
          return new Promise(resolve => {
            resolveStoredTheme = resolve;
          });
        }
        if (key === 'locale-preference') {
          return new Promise(resolve => {
            resolveStoredLocale = resolve;
          });
        }
        return Promise.resolve(null);
      });

      render(
        <RootProvider>
          <IndexRoute />
        </RootProvider>,
      );

      expect(mockStorage.getItem).toHaveBeenCalledWith('theme-mode-preference');
      expect(screen.queryByTestId('redirect-target')).toBeNull();

      await act(async () => {
        resolveStoredTheme(null);
      });

      expect(mockStorage.getItem).toHaveBeenCalledWith('locale-preference');
      expect(screen.queryByTestId('redirect-target')).toBeNull();

      await act(async () => {
        resolveStoredLocale(storedLocale);
      });

      expect(screen.getByTestId('redirect-target').props.children).toBe('/welcome');
    },
    15_000,
  );
});
