'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockIcon } from '../../components/Icons';
import ThemeShell from '../../components/ThemeShell';

export default function AdminLoginPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      router.replace('/admin/disputes');
      router.refresh();
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemeShell showToggle={false}>
      <main className="admin-auth">
      <div className="admin-auth-card">
        <span className="admin-auth-mark"><LockIcon size={16} /></span>

        <h1 className="admin-auth-title">Admin access</h1>
        <p className="admin-auth-sub">
          Enter the six digit code from your authenticator app.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            className="input mono admin-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            aria-label="Authenticator code"
            autoFocus
          />

          {error && <p className="admin-auth-error mono">{error}</p>}

          <button
            className="btn btn-primary admin-auth-submit"
            type="submit"
            disabled={loading || code.length !== 6}
          >
            <span className="btn-label">
              {loading && <span className="spinner" />}
              {loading ? 'Checking' : 'Sign in'}
            </span>
          </button>
        </form>
      </div>
      </main>
    </ThemeShell>
  );
}
