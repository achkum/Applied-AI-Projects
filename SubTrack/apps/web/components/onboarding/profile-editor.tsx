'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@subtrack/ui';
import { catalogs, type Locale } from '@subtrack/i18n';
import { type ProfilePatch, type ProfileView } from '@subtrack/contracts';
import { parseProfilePatch } from '@subtrack/contracts/profile';
import styles from './profile-editor.module.css';

export function ProfileEditor({ locale, view, busy, saved, uncertain, onSave }: {
  locale: Locale;
  view: ProfileView;
  busy: boolean;
  saved: boolean;
  uncertain: boolean;
  onSave: (patch: ProfilePatch) => void;
}) {
  const copy = catalogs[locale].onboarding.profile;
  const [name, setName] = useState(view.displayName ?? '');
  const [colour, setColour] = useState(view.avatarColourToken ?? '');
  const [emoji, setEmoji] = useState(view.avatarEmoji ?? '');
  const [language, setLanguage] = useState(view.language);
  const [theme, setTheme] = useState(view.theme);
  const [error, setError] = useState('');

  function candidate(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    if (name !== (view.displayName ?? '')) changes.displayName = name;
    if (colour !== (view.avatarColourToken ?? '')) changes.avatarColourToken = colour || null;
    if (emoji !== (view.avatarEmoji ?? '')) changes.avatarEmoji = emoji || null;
    if (language !== view.language) changes.language = language;
    if (theme !== view.theme) changes.theme = theme;
    return changes;
  }
  const changes = candidate();
  let valid = false;
  try { parseProfilePatch(changes); valid = true; } catch { /* disabled until valid */ }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const patch = parseProfilePatch(changes);
      setError('');
      onSave(patch);
    } catch {
      setError(Object.keys(changes).length ? copy.invalid : copy.unchanged);
    }
  }

  return <section className={styles.root} aria-labelledby="profile-title">
    <h2 id="profile-title">{copy.title}</h2>
    <p>{copy.introduction}</p>
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor="profile-name">{copy.displayName}</label>
      <input id="profile-name" autoComplete="name" value={name} onChange={(event) => { setName(event.currentTarget.value); setError(''); }}
        onBlur={() => { if (name !== (view.displayName ?? '')) { try { parseProfilePatch({ displayName: name }); } catch { setError(copy.invalid); } } }}
        aria-invalid={Boolean(error)} aria-describedby={error ? 'profile-validation' : undefined} />
      <label htmlFor="profile-colour">{copy.avatarColour}</label>
      <select id="profile-colour" value={colour} onChange={(event) => setColour(event.currentTarget.value)}>
        <option value="">{copy.none}</option>
        {Array.from({ length: 8 }, (_, index) => {
          const token = `member.accent.0${index + 1}`;
          return <option key={token} value={token}>{copy.colour} {index + 1}</option>;
        })}
      </select>
      <label htmlFor="profile-emoji">{copy.avatarEmoji}</label>
      <select id="profile-emoji" value={emoji} onChange={(event) => setEmoji(event.currentTarget.value)}>
        <option value="">{copy.none}</option>
        {['🙂', '😀', '😎', '🌟', '🌿', '🐱', '🦊', '🦉'].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <label htmlFor="profile-language">{copy.language}</label>
      <select id="profile-language" value={language} onChange={(event) => setLanguage(event.currentTarget.value as 'sv' | 'en')}>
        <option value="sv">{copy.swedish}</option><option value="en">{copy.english}</option>
      </select>
      <label htmlFor="profile-theme">{copy.theme}</label>
      <select id="profile-theme" value={theme} onChange={(event) => setTheme(event.currentTarget.value as 'system' | 'light' | 'dark')}>
        <option value="system">{copy.system}</option><option value="light">{copy.light}</option><option value="dark">{copy.dark}</option>
      </select>
      <p className={styles.readOnly}>{copy.currency}: {view.defaultCurrency}</p>
      <Button type="submit" disabled={busy || !valid}>{busy ? copy.saving : copy.save}</Button>
    </form>
    {error ? <p id="profile-validation" role="alert">{error}</p> : null}
    {uncertain ? <p role="alert">{copy.uncertain}</p> : null}
    {saved ? <p role="status">{copy.saved}</p> : null}
  </section>;
}
