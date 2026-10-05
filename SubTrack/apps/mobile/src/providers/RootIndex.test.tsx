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
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => (
      <Native.Text testID="redirect-target">{href}</Native.Text>
    ),
  };
});

const mockStorage = jest.mocked(AsyncStorage);

describe('root locale landing route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getItem.mockResolvedValue(null);
  });

  it.each([
    ['sv', '/sv'],
    ['en', '/en'],
    [null, '/en'],
    ['de', '/en'],
  ])('redirects stored locale %s to %s', async (storedLocale, target) => {
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

    expect(screen.getByTestId('redirect-target').props.children).toBe(target);
  });
});
