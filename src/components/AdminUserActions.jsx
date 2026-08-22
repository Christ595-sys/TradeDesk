'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminUserActions({ userId, userLabel }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!confirmOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !deleting) setConfirmOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmOpen, deleting]);

  async function deleteAccount() {
    if (deleting) return;
    setDeleting(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not delete this account.');
      }

      setConfirmOpen(false);
      router.refresh();
    } catch (err) {
      setError(err?.message || 'Could not delete this account.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, whiteSpace: 'nowrap' }}>
        <Link
          href={`/admin/users/${userId}`}
          className="mono"
          style={{
            display: 'inline-block',
            textDecoration: 'none',
            background: 'rgba(0,217,163,0.10)',
            border: '1px solid rgba(0,217,163,0.24)',
            color: '#00D9A3',
            borderRadius: 6,
            padding: '7px 10px',
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          VIEW DASHBOARD
        </Link>

        <button
          type="button"
          className="mono"
          onClick={() => {
            setError('');
            setConfirmOpen(true);
          }}
          style={{
            cursor: 'pointer',
            background: 'rgba(255,77,94,0.10)',
            border: '1px solid rgba(255,77,94,0.30)',
            color: '#FF6675',
            borderRadius: 6,
            padding: '7px 10px',
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          DELETE
        </button>
      </div>

      {confirmOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setConfirmOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.76)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-user-title-${userId}`}
            style={{
              width: '100%',
              maxWidth: 460,
              background: '#0B0F16',
              border: '1px solid #252D38',
              borderRadius: 12,
              boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
              padding: 22,
            }}
          >
            <div
              className="mono"
              id={`delete-user-title-${userId}`}
              style={{ color: '#FF6675', fontSize: 15, fontWeight: 800, letterSpacing: '0.03em', marginBottom: 10 }}
            >
              DELETE ACCOUNT?
            </div>

            <p style={{ color: '#CDD4DE', fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
              Are you sure you want to permanently delete <strong>{userLabel}</strong>?
            </p>
            <p style={{ color: '#7D8795', fontSize: 12.5, lineHeight: 1.6, margin: '0 0 18px' }}>
              This permanently deletes the account, all trades, notes, balances and every stored Before/After screenshot. This action cannot be undone.
            </p>

            {error && (
              <div
                className="mono"
                style={{
                  marginBottom: 15,
                  border: '1px solid rgba(255,77,94,0.28)',
                  background: 'rgba(255,77,94,0.08)',
                  color: '#FF8090',
                  borderRadius: 7,
                  padding: '10px 11px',
                  fontSize: 10.5,
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="mono"
                disabled={deleting}
                onClick={() => setConfirmOpen(false)}
                style={{
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.55 : 1,
                  background: '#111720',
                  border: '1px solid #27303B',
                  color: '#AAB3BF',
                  borderRadius: 7,
                  padding: '9px 13px',
                  fontSize: 10.5,
                  fontWeight: 700,
                }}
              >
                CANCEL
              </button>

              <button
                type="button"
                className="mono"
                disabled={deleting}
                onClick={deleteAccount}
                style={{
                  cursor: deleting ? 'wait' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                  background: '#D93649',
                  border: '1px solid #F05A6C',
                  color: '#FFFFFF',
                  borderRadius: 7,
                  padding: '9px 13px',
                  fontSize: 10.5,
                  fontWeight: 800,
                }}
              >
                {deleting ? 'DELETING…' : 'YES, DELETE ACCOUNT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
