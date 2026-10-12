
import { useState, type FormEvent } from 'react';
import './Login.css';
import { api } from './api';
import logo from './assets/friday-f-logo.png';

type LoginResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: { id: string; email?: string };
};

type Props = {
  onSuccess: (session: LoginResponse) => void;
};

export default function Login({ onSuccess }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      const session = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        headers: {},
        body: JSON.stringify({
          email: identifier.trim(),
          password: accessKey,
        }),
      });

      if (!session.access_token) {
        throw new Error('Authentication did not return an access token.');
      }

      onSuccess(session);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please check your credentials.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="friday-login-page">
      <div className="fl-background-glow fl-glow-left" aria-hidden="true" />
      <div className="fl-background-glow fl-glow-right" aria-hidden="true" />

      <div className="fl-background-mark" aria-hidden="true">
        <div className="fl-mark-outer">
          <div className="fl-mark-middle">
            <div className="fl-mark-core" />
            <div className="fl-mark-cut" />
          </div>
        </div>
      </div>

      <div className="fl-bottom-wave fl-wave-one" aria-hidden="true" />
      <div className="fl-bottom-wave fl-wave-two" aria-hidden="true" />
      <div className="fl-bottom-wave fl-wave-three" aria-hidden="true" />

      <section className="fl-login-shell">
        <header className="fl-brand" aria-label="Friday AI">
          <img src={logo} alt="" className="fl-brand-logo" />
          <span className="fl-brand-word">Friday</span>
          <span className="fl-ai-badge">AI</span>
        </header>

        <section className="fl-login-card" aria-label="Owner Login">
          <h1>Owner Login</h1>
          <p className="fl-subtitle">
            Authenticate your credentials to access the dashboard.
          </p>

          <form onSubmit={submit}>
            <label htmlFor="fl-identifier">Identifier</label>
            <div className="fl-field">
              <span className="fl-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18" />
                  <path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9" />
                  <path d="M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9" />
                </svg>
              </span>
              <input
                id="fl-identifier"
                name="identifier"
                type="email"
                autoComplete="username"
                placeholder="admin@telecmi.com"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
              />
            </div>

            <label htmlFor="fl-access-key">Access Key</label>
            <div className="fl-field">
              <span className="fl-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="8.5" cy="15.5" r="3.5" />
                  <path d="M11 13l9-9M17 7l2 2M14.5 9.5l2 2" />
                </svg>
              </span>
              <input
                id="fl-access-key"
                name="accessKey"
                type={showKey ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Access Key"
                value={accessKey}
                onChange={(event) => setAccessKey(event.target.value)}
                required
              />
              <button
                type="button"
                className="fl-visibility"
                aria-label={showKey ? 'Hide access key' : 'Show access key'}
                title={showKey ? 'Hide access key' : 'Show access key'}
                onClick={() => setShowKey((visible) => !visible)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.2 12s3.1-5 8.8-5 8.8 5 8.8 5-3.1 5-8.8 5-8.8-5-8.8-5Z" />
                  <circle cx="12" cy="12" r="2.1" />
                  {showKey && <path d="M4 4l16 16" />}
                </svg>
              </button>
            </div>

            {error && <p className="fl-status fl-error" role="alert">{error}</p>}

            <button className="fl-login-button" type="submit" disabled={busy}>
              <span>{busy ? 'Signing in…' : 'Login'}</span>
              <svg className="fl-button-arrow" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
