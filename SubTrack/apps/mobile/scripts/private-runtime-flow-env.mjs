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
  return {
    MAESTRO_DATE: onboarding.nativePersonal.date,
    MAESTRO_RENEWALS_OPEN: onboarding.nativeRenewals.open,
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
    MAESTRO_SAVE_UNAVAILABLE: onboarding.nativePersonal.unavailable,
    MAESTRO_READBACK_UNAVAILABLE: onboarding.nativePersonal.readbackUnavailable,
    MAESTRO_PERSONAL_LOADING: onboarding.nativePersonal.loading,
    MAESTRO_PERSONAL_TITLE: onboarding.nativePersonal.title,
    MAESTRO_LOGOUT: onboarding.nativePersonal.logout,
    MAESTRO_LOGOUT_CONFIRMED: onboarding.nativePersonal.logoutConfirmed,
    MAESTRO_EXPECTED_AMOUNT: `${onboarding.manualSubscription.expectedAmount}: 129,90\\s+SEK`,
  };
}
