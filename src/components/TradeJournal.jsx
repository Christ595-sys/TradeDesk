'use client';

import React, { useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { signOut } from 'next-auth/react';
import {
  TrendingUp, TrendingDown, Plus, X, Trash2, Pencil, ArrowUp, ArrowDown,
  Circle, Activity, Target, Flame, Image as ImageIcon, Upload, LogOut,
  WalletCards, Settings2, Zap, ShieldCheck, ArrowLeft
} from 'lucide-react';

const EquityChart = dynamic(() => import('./EquityChart'), {
  ssr: false,
  loading: () => <div className="mono" style={{ color: '#3E4753', fontSize: 11, textAlign: 'center', paddingTop: 70 }}>LOADING CHART…</div>,
});

const emptyForm = {
  symbol: '',
  direction: 'long',
  date: new Date().toISOString().slice(0, 10),
  entryPrice: '',
  stopLoss: '',
  size: '',
  pnl: '',
  notes: '',
  screenshot: null,
};

function fmtMoney(n, withSign = true) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n).toFixed(2);
  const sign = withSign ? (n > 0 ? '+' : n < 0 ? '-' : '') : (n < 0 ? '-' : '');
  return `${sign}$${abs}`;
}

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n) || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function getPnl(t) {
  if (t.pnl === '' || t.pnl === null || t.pnl === undefined) return null;
  const n = parseFloat(t.pnl);
  return Number.isNaN(n) ? null : n;
}

function toFormShape(t) {
  return {
    ...emptyForm,
    ...t,
    date: t.date ? String(t.date).slice(0, 10) : emptyForm.date,
    entryPrice: t.entryPrice ?? '',
    stopLoss: t.stopLoss ?? '',
    size: t.size ?? '',
    pnl: t.pnl ?? '',
  };
}

export default function TradeJournal({ userLabel, initialTrades = [], initialStartingBalance = 0, readOnly = false, adminBackHref = null, tradeDetailBasePath = '/api/trades' }) {
  const [trades, setTrades] = useState(initialTrades);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadFailed, setDetailLoadFailed] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [formError, setFormError] = useState('');
  const [startingBalance, setStartingBalance] = useState(Number(initialStartingBalance) || 0);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(Number(initialStartingBalance) || 0));
  const [balanceError, setBalanceError] = useState('');
  const [balanceSaving, setBalanceSaving] = useState(false);
  const fileInputRef = useRef(null);

  function openAdd() {
    if (readOnly) return;
    setForm(emptyForm);
    setEditingId(null);
    setDetailLoading(false);
    setDetailLoadFailed(false);
    setFormError('');
    setShowForm(true);
  }

  async function openEdit(t) {
    setForm(toFormShape(t));
    setEditingId(t.id);
    setFormError('');
    setDetailLoadFailed(false);
    setDetailLoading(true);
    setShowForm(true);

    try {
      const res = await fetch(`${tradeDetailBasePath}/${t.id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load trade details');
      const detail = await res.json();
      setForm(toFormShape(detail));
    } catch {
      setDetailLoadFailed(true);
      setFormError('Could not load this trade. Close the window and try again.');
    } finally {
      setDetailLoading(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setDetailLoading(false);
    setDetailLoadFailed(false);
    setForm(emptyForm);
    setFormError('');
  }

  function handleScreenshotChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const readOriginal = () => {
      const reader = new FileReader();
      reader.onload = () => setForm((current) => ({ ...current, screenshot: reader.result }));
      reader.readAsDataURL(file);
    };

    if (file.size <= 900 * 1024) {
      readOriginal();
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const maxWidth = 1600;
      const maxHeight = 1000;
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/webp', 0.82);
      URL.revokeObjectURL(objectUrl);
      setForm((current) => ({ ...current, screenshot: compressed }));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      readOriginal();
    };
    image.src = objectUrl;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (readOnly) return;
    if (detailLoading || detailLoadFailed) return;
    if (!form.symbol.trim()) { setFormError('Symbol / market is required.'); return; }
    if (!form.entryPrice) { setFormError('Entry price is required.'); return; }
    if (!form.size) { setFormError('Size (lots) is required.'); return; }

    setFormError('');
    setSaving(true);
    const payload = { ...form, symbol: form.symbol.trim().toUpperCase() };

    try {
      let res;
      if (editingId) {
        res = await fetch(`/api/trades/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || 'Could not save the trade. Try again.');
        setSaving(false);
        return;
      }
      const saved = await res.json();
      const listItem = { ...saved, hasScreenshot: Boolean(form.screenshot) };
      setTrades((prev) =>
        editingId ? prev.map((t) => (t.id === editingId ? listItem : t)) : [listItem, ...prev]
      );
      setSaving(false);
      closeForm();
    } catch (err) {
      setFormError('Network error — could not reach the server.');
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (readOnly) return;
    try {
      const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
      if (res.ok) setTrades((prev) => prev.filter((t) => t.id !== id));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  async function handleBalanceSave(e) {
    e.preventDefault();
    if (readOnly) return;
    setBalanceError('');
    const value = Number(balanceInput);
    if (!Number.isFinite(value) || value < 0) {
      setBalanceError('Enter a valid starting balance.');
      return;
    }
    setBalanceSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startingBalance: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBalanceError(data.error || 'Could not update the starting balance.');
        return;
      }
      setStartingBalance(Number(data.startingBalance));
      setBalanceInput(String(data.startingBalance));
      setShowBalanceModal(false);
    } catch (e) {
      setBalanceError('Network error — could not reach the server.');
    } finally {
      setBalanceSaving(false);
    }
  }

  const closedTrades = useMemo(
    () =>
      trades
        .filter((t) => getPnl(t) !== null)
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [trades]
  );

  const stats = useMemo(() => {
    if (closedTrades.length === 0) {
      return { totalPnl: 0, winRate: 0, streak: 0, streakType: null };
    }
    let totalPnl = 0, wins = 0;
    closedTrades.forEach((t) => {
      const pnl = getPnl(t);
      totalPnl += pnl;
      if (pnl > 0) wins += 1;
    });
    let streak = 0, streakType = null;
    for (let i = closedTrades.length - 1; i >= 0; i -= 1) {
      const pnl = getPnl(closedTrades[i]);
      const type = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : null;
      if (!type) break;
      if (streakType === null) { streakType = type; streak = 1; }
      else if (type === streakType) streak += 1;
      else break;
    }
    return {
      totalPnl,
      winRate: (wins / closedTrades.length) * 100,
      streak,
      streakType,
    };
  }, [closedTrades]);

  const account = useMemo(() => ({
    startingBalance,
    totalPnl: stats.totalPnl,
    currentBalance: startingBalance + stats.totalPnl,
  }), [startingBalance, stats.totalPnl]);

  const equityCurve = useMemo(() => {
    let cum = 0;
    return closedTrades.map((t, i) => {
      cum += getPnl(t);
      return { idx: i + 1, date: String(t.date).slice(0, 10), equity: Math.round(cum * 100) / 100, symbol: t.symbol };
    });
  }, [closedTrades]);

  const openPositions = trades.filter((t) => getPnl(t) === null);

  const sortedTrades = useMemo(() => {
    const arr = trades.slice();
    arr.sort((a, b) => {
      let av, bv;
      if (sortKey === 'pnl') { av = getPnl(a) ?? -Infinity; bv = getPnl(b) ?? -Infinity; }
      else { av = a[sortKey] || ''; bv = b[sortKey] || ''; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [trades, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const tickerItems = useMemo(() => {
    const uniqueTrades = Array.from(new Map(closedTrades.map((trade) => [trade.id, trade])).values());
    return uniqueTrades
      .slice()
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
      .slice(0, 10);
  }, [closedTrades]);
  const equityPositive = stats.totalPnl >= 0;

  return (
    <div className="trade-shell" style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#080B10', color: '#E8ECF1', minHeight: '100vh', padding: '0 0 48px',
    }}>
      <style>{`
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; }
        * { box-sizing: border-box; }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .td-input {
          width: 100%; background: #0D1219; border: 1px solid #1E2630; color: #E8ECF1;
          padding: 9px 11px; border-radius: 6px; font-size: 13px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; outline: none;
        }
        .td-input:focus { border-color: #00D9A3; }
        .td-input:disabled { opacity: 1; color: #AAB3BF; cursor: default; background: #0A0F15; }
        .td-btn-toggle:disabled { cursor: default; opacity: 0.92; }
        .td-input::placeholder { color: #3E4753; }
        .td-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6B7684; margin-bottom: 6px; display: block; font-weight: 600; }
        .td-btn-toggle {
          flex: 1; padding: 9px 0; border-radius: 6px; border: 1px solid #1E2630; background: #0D1219;
          color: #6B7684; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; cursor: pointer;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
        }
        .td-row:hover { background: #0D131B !important; }
        .td-th { cursor: pointer; user-select: none; white-space: nowrap; }
        .td-th:hover { color: #E8ECF1 !important; }
        .td-upload {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          border: 1px dashed #232A35; border-radius: 8px; padding: 16px; cursor: pointer; color: #6B7684; font-size: 12px;
        }
        .td-upload:hover { border-color: #00D9A3; color: #00D9A3; }
      `}</style>

      <div style={{ borderBottom: '1px solid #161C25', background: '#0B0F16', overflow: 'hidden', padding: '9px 0' }}>
        {tickerItems.length === 0 ? (
          <div className="mono" style={{ textAlign: 'center', fontSize: 12, color: '#3E4753', letterSpacing: '0.08em' }}>
            AWAITING TRADES — LOG YOUR FIRST POSITION TO START THE TAPE
          </div>
        ) : (
          <div className="ticker-track" style={{ display: 'flex', width: 'max-content', animation: 'marquee 30s linear infinite' }}>
            {[0, 1].map((rep) => (
              <div key={rep} style={{ display: 'flex' }}>
                {tickerItems.map((t) => {
                  const pnl = getPnl(t);
                  const up = pnl >= 0;
                  return (
                    <div key={`${rep}-${t.id}`} className="mono" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 22px', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#E8ECF1', fontWeight: 700 }}>{t.symbol}</span>
                      {up ? <ArrowUp size={12} color="#00D9A3" /> : <ArrowDown size={12} color="#FF4D5E" />}
                      <span style={{ color: up ? '#00D9A3' : '#FF4D5E', fontWeight: 600 }}>{fmtMoney(pnl)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-stage" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 0 22px', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#0D1219', border: '1px solid #1E2630', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={18} color="#00D9A3" />
            </div>
            <div>
              <h1 className="mono" style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '0.03em' }}>TRADEDESK</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                <Circle size={7} fill="#00D9A3" color="#00D9A3" style={{ animation: 'blink 1.6s ease-in-out infinite' }} />
                <span className="mono" style={{ fontSize: 10.5, color: '#6B7684', letterSpacing: '0.08em' }}>
                  {userLabel} · {trades.length} LOGGED
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {readOnly ? (
              <>
                {adminBackHref && (
                  <a href={adminBackHref} className="mono cyber-button" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none', background: 'transparent', color: '#8A94A3', border: '1px solid #1E2630', borderRadius: 7, padding: '10px 14px', fontWeight: 700, fontSize: 12.5 }}>
                    <ArrowLeft size={14} /> USERS
                  </a>
                )}
                <button onClick={() => signOut({ callbackUrl: '/login' })} className="mono cyber-button" style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', color: '#6B7684', border: '1px solid #1E2630', borderRadius: 7, padding: '10px 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  <LogOut size={14} />
                </button>
              </>
            ) : (
              <>
                <button onClick={openAdd} className="mono cyber-button cyber-button-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#00D9A3', color: '#04241C', border: 'none', borderRadius: 7, padding: '10px 16px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', letterSpacing: '0.03em' }}>
                  <Plus size={15} /> LOG TRADE
                </button>
                <button onClick={() => signOut({ callbackUrl: '/login' })} className="mono cyber-button" style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', color: '#6B7684', border: '1px solid #1E2630', borderRadius: 7, padding: '10px 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  <LogOut size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {readOnly && (
          <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'rgba(0,217,163,0.07)', border: '1px solid rgba(0,217,163,0.22)', color: '#9EEBD7', borderRadius: 8, padding: '10px 13px', marginBottom: 14, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em' }}>
            <ShieldCheck size={15} color="#00D9A3" /> ADMIN VIEW · READ ONLY · NO ACCOUNT DATA CAN BE CHANGED
          </div>
        )}

        <section className={`balance-core ${account.currentBalance >= account.startingBalance ? 'balance-positive' : 'balance-negative'}`}>
          <div className="balance-grid-overlay" />
          <div className="balance-orbit balance-orbit-one" />
          <div className="balance-orbit balance-orbit-two" />
          <div className="balance-content">
            <div className="balance-heading">
              <span className="balance-icon"><WalletCards size={22} /></span>
              <div>
                <span className="mono balance-kicker">LIVE ACCOUNT EQUITY</span>
                <div className="mono balance-status"><Zap size={11} /> DATABASE SYNCED</div>
              </div>
            </div>
            {!readOnly ? (
              <button className="mono balance-settings" onClick={() => setShowBalanceModal(true)}>
                <Settings2 size={14} /> STARTING BALANCE
              </button>
            ) : (
              <div className="mono balance-settings" style={{ cursor: 'default' }}>
                <ShieldCheck size={14} /> READ ONLY
              </div>
            )}
          </div>
          <div className="balance-value-row">
            <div>
              <div className="mono balance-main-value">
                {fmtMoney(account.currentBalance, false)}
              </div>
              <div className="mono balance-delta">
                {fmtMoney(account.totalPnl)} from ${Number(account.startingBalance).toFixed(2)} start
              </div>
            </div>
            <div className="balance-signal" aria-hidden="true">
              <span /><span /><span /><span /><span />
            </div>
          </div>
        </section>


        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
              <StatCard label="TOTAL P&L" value={fmtMoney(stats.totalPnl)} tone={stats.totalPnl >= 0 ? 'up' : 'down'} icon={stats.totalPnl >= 0 ? TrendingUp : TrendingDown} />
              <StatCard label="WIN RATE" value={fmtPct(stats.winRate)} tone="neutral" icon={Target} />
              <StatCard label="STREAK" value={stats.streak > 0 ? `${stats.streak} ${stats.streakType === 'win' ? 'W' : 'L'}` : '—'} tone={stats.streakType === 'win' ? 'up' : stats.streakType === 'loss' ? 'down' : 'neutral'} icon={Flame} />
              <StatCard label="OPEN POSITIONS" value={String(openPositions.length)} tone="amber" icon={Circle} />
              <StatCard label="CLOSED TRADES" value={String(closedTrades.length)} tone="neutral" icon={Activity} />
            </div>

            <div className="cyber-panel" style={{ background: '#0B0F16', border: '1px solid #161C25', borderRadius: 10, padding: '16px 18px 6px', marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 11.5, color: '#6B7684', letterSpacing: '0.06em', fontWeight: 700 }}>EQUITY CURVE</span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: equityPositive ? '#00D9A3' : '#FF4D5E' }}>{fmtMoney(stats.totalPnl)}</span>
              </div>
              {equityCurve.length === 0 ? (
                <div className="mono" style={{ textAlign: 'center', color: '#3E4753', fontSize: 12, padding: '50px 0' }}>NO CLOSED TRADES YET</div>
              ) : (
                <div style={{ height: 190 }}>
                  <EquityChart data={equityCurve} positive={equityPositive} />
                </div>
              )}
            </div>

            <div className="cyber-panel trade-log-panel" style={{ background: '#0B0F16', border: '1px solid #161C25', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #161C25' }}>
                <span className="mono" style={{ fontSize: 11.5, color: '#6B7684', letterSpacing: '0.06em', fontWeight: 700 }}>TRADE LOG</span>
              </div>
              {trades.length === 0 ? (
                <div className="mono" style={{ textAlign: 'center', color: '#3E4753', fontSize: 12.5, padding: '46px 20px' }}>
                  {readOnly ? 'No trades logged for this user yet.' : <>No trades logged yet.<br />Click "LOG TRADE" to add your first position.</>}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr className="mono" style={{ color: '#6B7684', textAlign: 'left', fontSize: 10.5, letterSpacing: '0.05em' }}>
                        <Th label="DATE" onClick={() => toggleSort('date')} active={sortKey === 'date'} dir={sortDir} />
                        <Th label="SYMBOL" onClick={() => toggleSort('symbol')} active={sortKey === 'symbol'} dir={sortDir} />
                        <th style={{ padding: '9px 14px' }}>DIR</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right' }}>ENTRY</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right' }}>STOP LOSS</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right' }}>LOTS</th>
                        <Th label="P&L" onClick={() => toggleSort('pnl')} active={sortKey === 'pnl'} dir={sortDir} align="right" />
                        <th style={{ padding: '9px 14px' }}>STATUS</th>
                        {!readOnly && <th style={{ padding: '9px 14px', width: 112, minWidth: 112 }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTrades.map((t) => {
                        const pnl = getPnl(t);
                        const isOpen = pnl === null;
                        return (
                          <tr key={t.id} className="td-row mono" style={{ borderTop: '1px solid #161C25', cursor: 'pointer' }} onClick={() => openEdit(t)}>
                            <td style={{ padding: '10px 14px', color: '#8A94A3' }}>{String(t.date).slice(0, 10)}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {t.symbol}
                                {t.hasScreenshot && <ImageIcon size={11} color="#3E4753" />}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: t.direction === 'long' ? 'rgba(0,217,163,0.12)' : 'rgba(255,77,94,0.12)', color: t.direction === 'long' ? '#00D9A3' : '#FF4D5E' }}>
                                {t.direction === 'long' ? 'LONG' : 'SHORT'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>{t.entryPrice !== null && t.entryPrice !== undefined ? `$${parseFloat(t.entryPrice).toFixed(2)}` : '—'}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>{t.stopLoss !== null && t.stopLoss !== undefined ? `$${parseFloat(t.stopLoss).toFixed(2)}` : '—'}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>{t.size ?? '—'}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: isOpen ? '#F5A623' : pnl >= 0 ? '#00D9A3' : '#FF4D5E' }}>
                              {isOpen ? 'OPEN' : fmtMoney(pnl)}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: isOpen ? 'rgba(245,166,35,0.12)' : 'rgba(107,118,132,0.12)', color: isOpen ? '#F5A623' : '#8A94A3' }}>
                                {isOpen ? 'OPEN' : 'CLOSED'}
                              </span>
                            </td>
                            {!readOnly && (
                              <td style={{ padding: '10px 14px', width: 112, minWidth: 112 }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', width: 84, marginLeft: 'auto' }}>
                                  {confirmDeleteId === t.id ? (
                                    <>
                                      <button onClick={() => handleDelete(t.id)} style={confirmDeleteBtnStyle} className="mono" aria-label="Confirm delete trade">
                                        CONFIRM
                                      </button>
                                      <button onClick={() => setConfirmDeleteId(null)} style={iconBtnStyle} aria-label="Cancel delete"><X size={13} color="#6B7684" /></button>
                                    </>
                                  ) : (
                                    <>
                                      <button onClick={() => openEdit(t)} style={iconBtnStyle} aria-label="Edit trade"><Pencil size={13} color="#6B7684" /></button>
                                      <button onClick={() => setConfirmDeleteId(t.id)} style={iconBtnStyle} aria-label="Delete trade"><Trash2 size={13} color="#6B7684" /></button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,6,9,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <form onSubmit={readOnly ? (e) => e.preventDefault() : handleSubmit} style={{ background: '#0B0F16', border: '1px solid #1E2630', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 className="mono" style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '0.03em' }}>{readOnly ? 'TRADE DETAILS' : editingId ? 'EDIT TRADE' : 'LOG NEW TRADE'}</h2>
              <button type="button" onClick={closeForm} style={iconBtnStyle} aria-label="Close"><X size={16} color="#6B7684" /></button>
            </div>

            {formError && (
              <div className="mono" style={{ background: '#2A1518', border: '1px solid #4A1B1E', color: '#FF9DA6', padding: '9px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                {formError}
              </div>
            )}

            {detailLoading && (
              <div className="mono" style={{ color: '#6B7684', padding: '8px 0 14px', fontSize: 11.5 }}>LOADING TRADE DETAILS…</div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label className="td-label">Symbol / market</label>
              <input className="td-input" disabled={readOnly} placeholder="EURUSD, AAPL, BTCUSD…" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button type="button" disabled={readOnly} onClick={() => setForm({ ...form, direction: 'long' })} className="td-btn-toggle" style={form.direction === 'long' ? { borderColor: '#00D9A3', color: '#00D9A3', background: 'rgba(0,217,163,0.08)' } : {}}>LONG</button>
              <button type="button" disabled={readOnly} onClick={() => setForm({ ...form, direction: 'short' })} className="td-btn-toggle" style={form.direction === 'short' ? { borderColor: '#FF4D5E', color: '#FF4D5E', background: 'rgba(255,77,94,0.08)' } : {}}>SHORT</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="td-label">Entry price</label>
                <input className="td-input" disabled={readOnly} type="number" step="0.01" placeholder="0.00" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} />
              </div>
              <div>
                <label className="td-label">Stop loss</label>
                <input className="td-input" disabled={readOnly} type="number" step="0.01" placeholder="0.00" value={form.stopLoss} onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="td-label">Size (lots)</label>
                <input className="td-input" disabled={readOnly} type="number" step="any" placeholder="1.0" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
              </div>
              <div>
                <label className="td-label">Date</label>
                <input className="td-input" disabled={readOnly} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="td-label">Profit / loss</label>
              <input className="td-input" disabled={readOnly} type="number" step="0.01" placeholder="Leave blank while the trade is still open" value={form.pnl} onChange={(e) => setForm({ ...form, pnl: e.target.value })} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="td-label">Notes</label>
              <textarea className="td-input" disabled={readOnly} rows={3} placeholder="What was the thesis? How did it play out?" style={{ resize: 'vertical', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label className="td-label">Chart screenshot</label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleScreenshotChange} style={{ display: 'none' }} />
              {form.screenshot ? (
                <div style={{ position: 'relative' }}>
                  <img src={form.screenshot} alt="Trade screenshot" style={{ width: '100%', borderRadius: 8, border: '1px solid #1E2630', display: 'block' }} />
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} className="mono" style={smallBtnStyle}>REPLACE</button>
                      <button type="button" onClick={() => setForm({ ...form, screenshot: null })} className="mono" style={{ ...smallBtnStyle, color: '#FF4D5E' }}>REMOVE</button>
                    </div>
                  )}
                </div>
              ) : readOnly ? (
                <div className="mono" style={{ color: '#3E4753', border: '1px dashed #232A35', borderRadius: 8, padding: 16, textAlign: 'center', fontSize: 11.5 }}>NO SCREENSHOT ATTACHED</div>
              ) : (
                <div className="td-upload mono" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                  <Upload size={14} /> UPLOAD CHART SCREENSHOT
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={closeForm} className="mono" style={{ flex: 1, padding: '11px 0', borderRadius: 7, border: '1px solid #1E2630', background: 'transparent', color: '#8A94A3', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{readOnly ? 'CLOSE' : 'CANCEL'}</button>
              {!readOnly && (
                <button type="submit" disabled={saving || detailLoading || detailLoadFailed} className="mono" style={{ flex: 1, padding: '11px 0', borderRadius: 7, border: 'none', background: '#00D9A3', color: '#04241C', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', opacity: (saving || detailLoading || detailLoadFailed) ? 0.7 : 1 }}>
                  {detailLoadFailed ? 'LOAD FAILED' : detailLoading ? 'LOADING…' : saving ? 'SAVING…' : editingId ? 'SAVE CHANGES' : 'LOG TRADE'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {showBalanceModal && !readOnly && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(4,6,9,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
          <form onSubmit={handleBalanceSave} className="cyber-modal" style={{ width: '100%', maxWidth: 430, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className="mono" style={{ margin: 0, fontSize: 15 }}>ACCOUNT BASELINE</h2>
              <button type="button" onClick={() => setShowBalanceModal(false)} style={iconBtnStyle}><X size={16} /></button>
            </div>
            <p className="mono" style={{ fontSize: 11.5, color: '#7f91a6', lineHeight: 1.6 }}>
              This value is stored in your user account. Your live balance is calculated from this baseline plus every closed trade P&amp;L in the database.
            </p>
            <label className="td-label" htmlFor="starting-balance">STARTING BALANCE</label>
            <input id="starting-balance" className="td-input" type="number" min="0" step="0.01" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} />
            {balanceError && <p className="mono" style={{ color: '#ff6b7a', fontSize: 11.5 }}>{balanceError}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => setShowBalanceModal(false)} className="mono cyber-button" style={{ flex: 1, padding: 11 }}>CANCEL</button>
              <button type="submit" disabled={balanceSaving} className="mono cyber-button cyber-button-primary" style={{ flex: 1, padding: 11 }}>
                {balanceSaving ? 'SYNCING…' : 'SAVE TO DATABASE'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon }) {
  const colorMap = { up: '#00D9A3', down: '#FF4D5E', amber: '#F5A623', neutral: '#E8ECF1' };
  const color = colorMap[tone] || '#E8ECF1';
  return (
    <div className="stat-card-3d" style={{ background: '#0B0F16', border: '1px solid #161C25', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10, color: '#6B7684', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</span>
        {Icon && <Icon size={13} color="#3E4753" />}
      </div>
      <div className="mono" style={{ fontSize: 19, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Th({ label, onClick, active, dir, align }) {
  return (
    <th className="td-th" onClick={onClick} style={{ padding: '9px 14px', textAlign: align || 'left', color: active ? '#E8ECF1' : '#6B7684' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {active && (dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
      </span>
    </th>
  );
}

const iconBtnStyle = {
  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#0D1219', border: '1px solid #1E2630', borderRadius: 6, cursor: 'pointer',
};
const confirmDeleteBtnStyle = {
  minWidth: 52, height: 26, padding: '0 7px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,77,94,0.15)', border: '1px solid rgba(255,77,94,0.28)', borderRadius: 6,
  color: '#FF4D5E', fontSize: 9, lineHeight: 1, fontWeight: 700, letterSpacing: '0.01em', cursor: 'pointer', whiteSpace: 'nowrap',
};
const smallBtnStyle = {
  flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid #1E2630',
  background: '#0D1219', color: '#8A94A3', fontWeight: 700, fontSize: 11, cursor: 'pointer',
};
