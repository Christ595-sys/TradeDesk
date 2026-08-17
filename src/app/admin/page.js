import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getVerifiedAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import AdminSignOut from '@/components/AdminSignOut';

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default async function AdminPage() {
  const { session, admin } = await getVerifiedAdmin();
  if (!session) redirect('/login');
  if (!admin) redirect('/dashboard');

  const [users, pnlGroups] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'USER' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        startingBalance: true,
        createdAt: true,
        _count: { select: { trades: true } },
      },
    }),
    prisma.trade.groupBy({
      by: ['userId'],
      _sum: { pnl: true },
    }),
  ]);

  const pnlMap = new Map(pnlGroups.map((row) => [row.userId, Number(row._sum.pnl || 0)]));
  const totalTrades = users.reduce((sum, user) => sum + user._count.trades, 0);

  return (
    <main style={{ minHeight: '100vh', background: '#080B10', color: '#E8ECF1', padding: '0 24px 48px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '26px 0 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: '#0D1219', border: '1px solid #1E2630', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="mono" style={{ color: '#00D9A3', fontSize: 18, fontWeight: 800 }}>A</span>
            </div>
            <div>
              <h1 className="mono" style={{ margin: 0, fontSize: 18, letterSpacing: '0.03em' }}>TRADEDESK ADMIN</h1>
              <p className="mono" style={{ margin: '3px 0 0', color: '#6B7684', fontSize: 10.5, letterSpacing: '0.06em' }}>SIGNED IN AS {admin.email}</p>
            </div>
          </div>
          <AdminSignOut />
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }}>
          <AdminStat label="REGISTERED USERS" value={String(users.length)} />
          <AdminStat label="TOTAL LOGGED TRADES" value={String(totalTrades)} />
          <AdminStat label="ACCESS MODE" value="READ ONLY" />
        </section>

        <section style={{ background: '#0B0F16', border: '1px solid #161C25', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '15px 18px', borderBottom: '1px solid #161C25' }}>
            <div className="mono" style={{ fontSize: 11.5, color: '#8A94A3', fontWeight: 700, letterSpacing: '0.06em' }}>USER ACCOUNTS</div>
          </div>
          {users.length === 0 ? (
            <div className="mono" style={{ textAlign: 'center', color: '#3E4753', fontSize: 12, padding: 48 }}>NO USER ACCOUNTS YET</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr className="mono" style={{ color: '#6B7684', fontSize: 10.5, letterSpacing: '0.05em', textAlign: 'left' }}>
                    <th style={{ padding: '10px 16px' }}>USER</th>
                    <th style={{ padding: '10px 16px' }}>EMAIL</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>TRADES</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>STARTING BALANCE</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>LIVE BALANCE</th>
                    <th style={{ padding: '10px 16px' }}>JOINED</th>
                    <th style={{ padding: '10px 16px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const pnl = pnlMap.get(user.id) || 0;
                    const liveBalance = Number(user.startingBalance || 0) + pnl;
                    return (
                      <tr key={user.id} style={{ borderTop: '1px solid #161C25' }}>
                        <td className="mono" style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 700 }}>{user.name || '—'}</td>
                        <td className="mono" style={{ padding: '12px 16px', fontSize: 12, color: '#8A94A3' }}>{user.email}</td>
                        <td className="mono" style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12 }}>{user._count.trades}</td>
                        <td className="mono" style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12 }}>{money(user.startingBalance)}</td>
                        <td className="mono" style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: pnl >= 0 ? '#00D9A3' : '#FF4D5E' }}>{money(liveBalance)}</td>
                        <td className="mono" style={{ padding: '12px 16px', fontSize: 11, color: '#6B7684' }}>{user.createdAt.toISOString().slice(0, 10)}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                          <Link href={`/admin/users/${user.id}`} className="mono" style={{ display: 'inline-block', textDecoration: 'none', background: 'rgba(0,217,163,0.10)', border: '1px solid rgba(0,217,163,0.24)', color: '#00D9A3', borderRadius: 6, padding: '7px 10px', fontSize: 10.5, fontWeight: 700 }}>VIEW DASHBOARD</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function AdminStat({ label, value }) {
  return (
    <div style={{ background: '#0B0F16', border: '1px solid #161C25', borderRadius: 10, padding: '15px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <span className="mono" style={{ color: '#6B7684', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>{label}</span>
        <span className="mono" style={{ color: '#3E4753', fontSize: 11 }}>●</span>
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
