import { useState, type FormEvent } from 'react';
import { api } from './api';
import logo from './assets/friday-f-logo.png';
import './Login.css';
import './InviteActivation.css';

export type OwnerInvitation = {
  accessToken: string;
  refreshToken?: string;
  error?: string;
};

type Props = {
  invitation: OwnerInvitation;
  onActivated: (session: { access_token: string; refresh_token?: string }) => void;
  onCancel: () => void;
  mode?: 'invitation' | 'first-login';
};

export default function InviteActivation({ invitation, onActivated, onCancel, mode = 'invitation' }: Props) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(invitation.error || '');

  const activate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invitation.accessToken || busy) return;
    if (password.length < 10) {
      setError('Choose a password with at least 10 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api<{ success: boolean }>('/auth/change-password', {
        method: 'POST',
        // This invite-scoped token is verified by Supabase on the Owner API.
        // It is not added to local storage until the password change succeeds.
        headers: { Authorization: 'Bearer ' + invitation.accessToken },
        body: JSON.stringify({ password }),
      });
      onActivated({
        access_token: invitation.accessToken,
        refresh_token: invitation.refreshToken,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="friday-login-page ia-page">
    <div className="fl-background-glow fl-glow-left" aria-hidden="true" />
    <div className="fl-background-glow fl-glow-right" aria-hidden="true" />
    <section className="fl-login-shell">
      <header className="fl-brand" aria-label="Engage AI">
        <img src={logo} alt="" className="fl-brand-logo" />
        <span className="fl-brand-word">Engage</span>
        <span className="fl-ai-badge">AI</span>
      </header>
      <section className="fl-login-card" aria-label={mode === 'first-login' ? 'Set your employee password' : 'Activate Owner Console invitation'}>
        <h1>{mode === 'first-login' ? 'Set your password' : 'Activate your account'}</h1>
        <p className="fl-subtitle">{mode === 'first-login'
          ? 'Your administrator created this account directly. Change the temporary password before accessing your Owner workspace.'
          : 'Welcome to Engagehubs Owner Console. Set a personal password to activate your invited account.'}</p>
        {invitation.accessToken ? <form onSubmit={activate}>
          <label htmlFor="ia-password">New password</label>
          <div className="fl-field">
            <input
              id="ia-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 10 characters"
              minLength={10}
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={busy}
            />
          </div>
          <label htmlFor="ia-confirm">Confirm new password</label>
          <div className="fl-field">
            <input
              id="ia-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Confirm your password"
              minLength={10}
              required
              value={confirmation}
              onChange={event => setConfirmation(event.target.value)}
              disabled={busy}
            />
          </div>
          {error && <p className="fl-status fl-error" role="alert">{error}</p>}
          <button className="fl-login-button" type="submit" disabled={busy}>
            <span>{busy ? 'Saving password…' : 'Set password & continue'}</span>
          </button>
        </form> : (
          <p className="fl-status fl-error" role="alert">
            {error || 'This invitation link is invalid or expired. Ask your Owner administrator to invite you again.'}
          </p>
        )}
        <button type="button" className="ia-back-link" onClick={onCancel} disabled={busy}>Return to login</button>
      </section>
    </section>
  </main>;
}
