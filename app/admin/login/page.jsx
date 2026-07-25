'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
    <main style={{ maxWidth: 380, margin: '0 auto', padding: '80px 20px' }}>
      <div className="card">
        <h1 className="card-title">Admin access</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
          Enter the 6-digit code from your authenticator app.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            className="input mono"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ textAlign: 'center', letterSpacing: '0.4em', fontSize: 20 }}
            autoFocus
          />

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || code.length !== 6}
            style={{ width: '100%', marginTop: 16 }}
          >
            {loading ? 'Checking...' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
