'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setLoading(true);
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) return setError('Invalid email or password.');
    router.replace('/dashboard');
  }
  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-logo"><Activity size={25} /></div>
      <h1 className="auth-title">Access TradeDesk</h1>
      <p className="auth-copy">Connect to your private trading terminal and synchronised journal.</p>
      <form onSubmit={handleSubmit}>
        <input className="auth-field" type="email" autoComplete="email" placeholder="Email" value={email} required onChange={(e) => setEmail(e.target.value)} />
        <div className="auth-password-wrap">
          <input className="auth-field auth-password-field" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" value={password} required onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="auth-password-toggle" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {error && <p style={{ color: '#ff6474', fontSize: 13 }}>{error}</p>}
        <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'CONNECTING…' : 'ENTER TERMINAL'}</button>
      </form>
      <p className="auth-copy" style={{ marginTop: 17, marginBottom: 0 }}>No account? <Link className="auth-link" href="/register">Create one</Link></p>
    </section>
  </main>;
}
