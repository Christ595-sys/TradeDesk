import Link from 'next/link';
import { Activity, Database, LineChart, ShieldCheck } from 'lucide-react';
export default function Home() {
  return <main className="auth-page">
    <section className="auth-card" style={{ width: 'min(100%, 620px)' }}>
      <div className="auth-logo"><Activity size={26} /></div>
      <div style={{ color: '#00d9a3', fontSize: 11, letterSpacing: '.14em', fontWeight: 800 }}>TRADING INTELLIGENCE TERMINAL</div>
      <h1 style={{ fontSize: 40, margin: '10px 0 12px', letterSpacing: '-.04em' }}>TradeDesk</h1>
      <p className="auth-copy" style={{ fontSize: 15 }}>A database-backed trading journal with live equity tracking, performance analytics, and a focused electronic workspace.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, margin: '22px 0' }}>
        {[['Live equity', LineChart], ['Private data', ShieldCheck], ['Cloud ready', Database]].map(([label, Icon]) => <div key={label} className="stat-card-3d" style={{ padding: 15, border: '1px solid #1b2731', borderRadius: 10 }}><Icon size={17} color="#00d9a3" /><div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>{label}</div></div>)}
      </div>
      <div style={{ display: 'flex', gap: 11, flexWrap: 'wrap' }}>
        <Link href="/login" className="cyber-button" style={{ padding: '11px 20px' }}>LOG IN</Link>
        <Link href="/register" className="cyber-button cyber-button-primary" style={{ padding: '11px 20px' }}>CREATE ACCOUNT</Link>
      </div>
    </section>
  </main>;
}
