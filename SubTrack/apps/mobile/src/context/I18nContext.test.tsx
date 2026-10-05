import { Button, Text, View } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nProvider, useI18n } from './I18nContext';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const mockStorage = jest.mocked(AsyncStorage);

function LocaleProbe({ testId }: { testId: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <View>
      <Text testID={`${testId}.locale`}>{locale}</Text>
      <Text testID={`${testId}.signature`}>
        {t('receiptCard.priceIncrease', { amount: '10 kr' })}
      </Text>
      <Text testID={`${testId}.shared`}>{t('scope.personal')}</Text>
      <Button title="English" onPress={() => void setLocale('en')} />
      <Button title="Svenska" onPress={() => void setLocale('sv')} />
    </View>
  );
}

function renderProvider(testId = 'first') {
  return render(
    <I18nProvider>
      <LocaleProbe testId={testId} />
    </I18nProvider>,
  );
}

function expectText(testId: string, expected: string): void {
  expect(screen.getByTestId(testId).props.children).toBe(expected);
}

describe('I18nProvider with the installed i18n-js instance API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getItem.mockResolvedValue(null);
    mockStorage.setItem.mockResolvedValue(undefined);
  });

  it('loads stored Swedish and translates shared and mobile-local interpolation strings', async () => {
    let resolveStoredLocale: (value: string | null) => void = () => {};
    mockStorage.getItem.mockReturnValue(
      new Promise(resolve => {
        resolveStoredLocale = resolve;
      }),
    );
    renderProvider();

    expect(mockStorage.getItem).toHaveBeenCalledWith('locale-preference');
    expect(screen.queryByTestId('first.locale')).toBeNull();

    await act(async () => {
      resolveStoredLocale('sv');
    });

    expectText('first.locale', 'sv');
    expectText('first.shared', 'Jag');
    expectText('first.signature', 'Priset höjdes till 10 kr');
  });

  it.each([null, 'de'])('falls back to English when stored locale is %s', async stored => {
    mockStorage.getItem.mockResolvedValue(stored);
    renderProvider();

    await screen.findByTestId('first.locale');
    expectText('first.locale', 'en');
    expectText('first.shared', 'Me');
    expectText('first.signature', 'Price increased to 10 kr');
  });

  it('finishes loading with English when storage read fails without logging the exception payload', async () => {
    const storageFailure = new Error('private storage detail');
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockStorage.getItem.mockRejectedValue(storageFailure);

    renderProvider();

    await screen.findByTestId('first.locale');
    expectText('first.locale', 'en');
    expect(errorLog).toHaveBeenCalledWith('Failed to load locale preference.');
    expect(errorLog).not.toHaveBeenCalledWith(expect.stringContaining('private storage detail'));
    errorLog.mockRestore();
  });

  it('switches language after persistence succeeds and saves the preference', async () => {
    mockStorage.getItem.mockResolvedValue('en');
    renderProvider();
    await screen.findByTestId('first.locale');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Svenska' }));
    });

    await screen.findByTestId('first.locale');
    await waitFor(() => {
      expectText('first.locale', 'sv');
      expectText('first.signature', 'Priset höjdes till 10 kr');
    });
    expect(mockStorage.setItem).toHaveBeenCalledWith('locale-preference', 'sv');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'English' }));
    });
    await waitFor(() => {
      expectText('first.locale', 'en');
      expectText('first.signature', 'Price increased to 10 kr');
    });
    expect(mockStorage.setItem).toHaveBeenLastCalledWith('locale-preference', 'en');
  });

  it('keeps the current language if saving a new preference fails', async () => {
    mockStorage.getItem.mockResolvedValue('en');
    mockStorage.setItem.mockRejectedValue(new Error('private storage detail'));
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderProvider();
    await screen.findByTestId('first.locale');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Svenska' }));
    });

    expectText('first.locale', 'en');
    expect(errorLog).toHaveBeenCalledWith('Failed to save locale preference.');
    expect(errorLog).not.toHaveBeenCalledWith(expect.stringContaining('private storage detail'));
    errorLog.mockRestore();
  });

  it('keeps locale state isolated between provider instances', async () => {
    mockStorage.getItem.mockResolvedValue(null);
    render(
      <>
        <I18nProvider><LocaleProbe testId="first" /></I18nProvider>
        <I18nProvider><LocaleProbe testId="second" /></I18nProvider>
      </>,
    );
    await waitFor(() => expectText('first.locale', 'en'));
    await screen.findByTestId('second.locale');

    await act(async () => {
      fireEvent.press(screen.getAllByRole('button', { name: 'Svenska' })[0]!);
    });

    await waitFor(() => {
      expectText('first.locale', 'sv');
      expectText('first.shared', 'Jag');
    });
    expectText('second.locale', 'en');
    expectText('second.shared', 'Me');
  });
});
