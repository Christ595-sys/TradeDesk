'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', startingBalance: '10000' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); setLoading(false); return; }
      router.push('/login');
    } catch { setError('Could not reach the server. Try again.'); setLoading(false); }
  }
  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-logo"><Activity size={25} /></div>
      <h1 className="auth-title">Create trader profile</h1>
      <p className="auth-copy">Your trades and account balance will be secured under your own database account.</p>
      <form onSubmit={handleSubmit}>
        <input className="auth-field" type="text" autoComplete="name" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="auth-field" type="email" autoComplete="email" placeholder="Email" value={form.email} required onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <div className="auth-password-wrap">
          <input className="auth-field auth-password-field" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Password (minimum 8 characters)" value={form.password} required onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button type="button" className="auth-password-toggle" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <input className="auth-field" type="number" min="0" step="0.01" placeholder="Starting balance" value={form.startingBalance} required onChange={(e) => setForm({ ...form, startingBalance: e.target.value })} />
        {error && <p style={{ color: '#ff6474', fontSize: 13 }}>{error}</p>}
        <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'CREATING PROFILE…' : 'INITIALISE ACCOUNT'}</button>
      </form>
      <p className="auth-copy" style={{ marginTop: 17, marginBottom: 0 }}>Already registered? <Link className="auth-link" href="/login">Log in</Link></p>
    </section>
  </main>;
}
