import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { catalogs } from '@subtrack/i18n';
import LoginPage from '../app/[locale]/login/page';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('next/font/local', () => ({ default: () => ({ variable: 'font-variable' }) }));
vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));

describe('returning login route', () => {
  it.each(['en', 'sv'] as const)('mounts a fresh %s login entry', async (locale) => {
    render(await LoginPage({ params: Promise.resolve({ locale }) }));
    expect(screen.getByRole('heading', { name: catalogs[locale].onboarding.login.title })).toBeTruthy();
    expect(screen.getByRole('button', { name: catalogs[locale].onboarding.login.simulatorAction })).toBeTruthy();
  });
  it('rejects unsupported locale', async () => {
    await expect(LoginPage({ params: Promise.resolve({ locale: 'fr' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
