import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
export function flowEnvironment(locale = 'en') {
  const catalog = JSON.parse(
    readFileSync(
      new URL(
        `../../../packages/i18n/catalogs/${locale}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const onboarding = catalog.onboarding;
  const swedish=JSON.parse(readFileSync(new URL('../../../packages/i18n/catalogs/sv.json',import.meta.url),'utf8'));
  const bank = onboarding.nativeBank;
  const bankLabels = Object.fromEntries(Object.entries(bank).map(([key,value]) => [`MAESTRO_BANK_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`,value]));
  bankLabels.MAESTRO_BANK_LAST_SYNC_NEVER=bank.lastSync.replace('%{date}',bank.never);
  bankLabels.MAESTRO_BANK_LAST_SYNC_PRESENT=bank.lastSync.replace('%{date}','.+');
  return {
    ...bankLabels,
    MAESTRO_SWEDISH: catalog.preferences.languageName.sv,
    MAESTRO_DARK: catalog.preferences.themes.dark,
    MAESTRO_SAVE_PREFERENCES: onboarding.nativePersonal.savePreferences,
    MAESTRO_SV_SAVE_PREFERENCES: swedish.onboarding.nativePersonal.savePreferences,
    MAESTRO_SV_ENGLISH: swedish.preferences.languageName.en,
    MAESTRO_SV_MONTH_TITLE: swedish.onboarding.productNav.home,
    MAESTRO_PROFILE_PAGE_TITLE: onboarding.productNav.profile,
    MAESTRO_DATE_CLEAR: onboarding.datePicker.clear,
    MAESTRO_DATE_TODAY: onboarding.datePicker.today,

    MAESTRO_MONTH_OPEN: onboarding.productNav.home,
    MAESTRO_MANAGE: onboarding.productNav.manage,
    MAESTRO_PROFILE_TITLE: onboarding.profile.title,
    MAESTRO_MONTH_TITLE: onboarding.productNav.home,
    MAESTRO_MONTH_NEXT: onboarding.billingMonth.next,
    MAESTRO_MONTH_REFRESH: onboarding.billingMonth.refresh,
    MAESTRO_MONTH_EMPTY: onboarding.billingMonth.empty,
    MAESTRO_MONTH_DAY_EMPTY: onboarding.billingMonth.dayEmpty,
    MAESTRO_MONTH_DAY_TEMPLATE: onboarding.billingMonth.day,
    MAESTRO_MONTH_DETAIL: onboarding.billingMonth.details.replace('%{name}', 'Example streaming'),
    // Native detail now renders the ISO date as a separate key-value value.
    MAESTRO_MONTH_SAVED_DATE_TEMPLATE: '%{date}',
    MAESTRO_MONTH_MANUAL: onboarding.billingMonth.manual,
    MAESTRO_MONTH_CLOSE: catalog.actions.close,
    MAESTRO_MONTH_AMOUNT: String.raw`129,90[ \u00a0\u202f]+SEK`,
    MAESTRO_DATE: onboarding.nativePersonal.date,
    MAESTRO_RENEWALS_OPEN: onboarding.productNav.upcoming,
    MAESTRO_RENEWALS_TITLE: onboarding.nativeRenewals.title,
    MAESTRO_RENEWALS_REFRESH: onboarding.nativeRenewals.refresh,
    MAESTRO_RENEWALS_EMPTY: onboarding.nativeRenewals.empty,
    MAESTRO_EDIT: onboarding.nativeSubscriptionEdit.edit,
    MAESTRO_SAVE_EDIT: onboarding.nativeSubscriptionEdit.save,
    MAESTRO_EDIT_SAVED: onboarding.nativeSubscriptionEdit.saved,
    MAESTRO_PAUSE: onboarding.nativeSubscriptionEdit.pause,
    MAESTRO_RESUME: onboarding.nativeSubscriptionEdit.resume,
    MAESTRO_MARK_CANCELLED: onboarding.nativeSubscriptionEdit.cancelled,
    MAESTRO_ARCHIVE: onboarding.nativeSubscriptionEdit.archive,
    MAESTRO_STATUS_SAVED: onboarding.nativeSubscriptionEdit.statusSaved,
    MAESTRO_CREATE_ACCOUNT: onboarding.welcome.createAccount,
    MAESTRO_EMAIL_LABEL: onboarding.identifier.emailLabel,
    MAESTRO_CONTINUE: onboarding.identifier.continueLabel,
    MAESTRO_OTP_LABEL: onboarding.registration.otpLabel,
    MAESTRO_REQUEST_UNAVAILABLE: onboarding.registration.requestUnavailable,
    MAESTRO_IDENTIFIER_LOADING: onboarding.registration.loading,
    MAESTRO_VERIFY_OTP: onboarding.registration.verifyLabel,
    MAESTRO_VERIFY_BANKID: onboarding.nativePersonal.verify,
    MAESTRO_PROFILE_NAME: onboarding.nativePersonal.name,
    MAESTRO_ENGLISH: catalog.preferences.languageName.en,
    MAESTRO_SAVE_PROFILE: onboarding.nativePersonal.saveProfile,
    MAESTRO_JUST_ME: onboarding.mode.choose,
    MAESTRO_ADD: onboarding.manualSubscription.title,
    MAESTRO_SUBSCRIPTION_NAME: onboarding.manualSubscription.name,
    MAESTRO_CATEGORY: onboarding.ownerSubscriptions.category.VIDEO_STREAMING,
    MAESTRO_AMOUNT: onboarding.nativePersonal.amount,
    MAESTRO_SAVE_SUBSCRIPTION: onboarding.manualSubscription.save,
    MAESTRO_SAVED: onboarding.nativePersonal.saved,
    MAESTRO_SAVE_INVALID: onboarding.nativePersonal.invalid,
    MAESTRO_SAVE_INVALID_NAME: onboarding.manualSubscription.invalidName,
    MAESTRO_SAVE_INVALID_CATEGORY: onboarding.manualSubscription.invalidCategory,
    MAESTRO_SAVE_INVALID_CADENCE: onboarding.manualSubscription.invalidCadence,
    MAESTRO_SAVE_INVALID_AMOUNT: onboarding.manualSubscription.invalidAmount,
    MAESTRO_SAVE_INVALID_DATE: onboarding.manualSubscription.invalidDate,
    MAESTRO_SAVE_UNAVAILABLE: onboarding.nativePersonal.unavailable,
    MAESTRO_READBACK_UNAVAILABLE: onboarding.nativePersonal.readbackUnavailable,
    MAESTRO_PERSONAL_LOADING: onboarding.nativePersonal.loading,
    MAESTRO_PERSONAL_TITLE: onboarding.productNav.manage,
    MAESTRO_LOGOUT: onboarding.nativePersonal.logout,
    MAESTRO_LOGOUT_CONFIRMED: onboarding.nativePersonal.logoutConfirmed,
    MAESTRO_EXPECTED_AMOUNT_LABEL: onboarding.manualSubscription.expectedAmount,
    MAESTRO_EXPECTED_AMOUNT: String.raw`129,90[ \u00a0\u202f]+SEK`,
  };
}
