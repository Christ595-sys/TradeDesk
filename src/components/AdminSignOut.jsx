'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export default function AdminSignOut() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="mono cyber-button"
      style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', color: '#8A94A3', border: '1px solid #1E2630', borderRadius: 7, padding: '9px 13px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
    >
      <LogOut size={14} /> LOG OUT
    </button>
  );
}
