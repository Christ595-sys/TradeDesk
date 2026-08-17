'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const value = Number(n);
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export default function EquityChart({ data, positive }) {
  const accent = positive ? '#00D9A3' : '#FF4D5E';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#161C25" vertical={false} />
        <XAxis dataKey="idx" tick={{ fill: '#6B7684', fontSize: 10 }} axisLine={{ stroke: '#161C25' }} tickLine={false} />
        <YAxis tick={{ fill: '#6B7684', fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
        <ReferenceLine y={0} stroke="#232A35" />
        <Tooltip
          contentStyle={{ background: '#0D1219', border: '1px solid #1E2630', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#6B7684' }}
          formatter={(value) => [fmtMoney(value), 'Equity']}
          labelFormatter={(_, payload) => (payload && payload[0] ? `${payload[0].payload.symbol} · ${payload[0].payload.date}` : '')}
        />
        <Area type="monotone" dataKey="equity" stroke={accent} strokeWidth={2} fill="url(#eqFill)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
