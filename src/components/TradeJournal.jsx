'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  beforeScreenshotUrl: null,
  afterScreenshotUrl: null,
  beforeScreenshotPreviewUrl: null,
  afterScreenshotPreviewUrl: null,
  beforeScreenshotPreview: null,
  afterScreenshotPreview: null,
  beforeScreenshotFullLocal: null,
  afterScreenshotFullLocal: null,
  beforeScreenshotPreviewAccessUrl: null,
  afterScreenshotPreviewAccessUrl: null,
  beforeScreenshotFullAccessUrl: null,
  afterScreenshotFullAccessUrl: null,
  screenshotAccessExpiresAt: null,
  hasLegacyScreenshot: false,
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

function fmtRawNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
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
  const [screenshotUploads, setScreenshotUploads] = useState({
    before: { status: 'idle', progress: 0 },
    after: { status: 'idle', progress: 0 },
  });
  const [startingBalance, setStartingBalance] = useState(Number(initialStartingBalance) || 0);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(Number(initialStartingBalance) || 0));
  const [balanceError, setBalanceError] = useState('');
  const [balanceSaving, setBalanceSaving] = useState(false);
  const beforeFileInputRef = useRef(null);
  const afterFileInputRef = useRef(null);
  const screenshotUploadIds = useRef({ before: 0, after: 0 });
  const screenshotAccessCache = useRef(new Map());
  const pendingScreenshotBlobs = useRef({ before: null, after: null });

  function pendingReferences(kind = null) {
    const entries = kind
      ? [pendingScreenshotBlobs.current[kind]]
      : [pendingScreenshotBlobs.current.before, pendingScreenshotBlobs.current.after];
    return [...new Set(entries.flatMap((entry) => entry ? [entry.fullUrl, entry.previewUrl].filter(Boolean) : []))];
  }

  async function cleanupScreenshotReferences(references, keepalive = false) {
    const unique = [...new Set((references || []).filter(Boolean))];
    if (!unique.length) return;
    try {
      await fetch('/api/blob/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ references: unique }),
        keepalive,
      });
    } catch (error) {
      console.warn('Could not clean up unused screenshot files.', error);
    }
  }

  function cleanupPendingScreenshotBlobs(kind = null, keepalive = false) {
    const references = pendingReferences(kind);
    if (kind) pendingScreenshotBlobs.current[kind] = null;
    else pendingScreenshotBlobs.current = { before: null, after: null };
    if (references.length) void cleanupScreenshotReferences(references, keepalive);
  }

  function rememberPendingScreenshotBlobs(kind, uploaded) {
    pendingScreenshotBlobs.current[kind] = {
      fullUrl: uploaded?.fullUrl || null,
      previewUrl: uploaded?.previewUrl || null,
    };
  }

  function markPendingScreenshotsCommitted() {
    pendingScreenshotBlobs.current = { before: null, after: null };
  }

  useEffect(() => {
    const cleanupOnPageHide = () => {
      const references = pendingReferences();
      if (!references.length) return;
      pendingScreenshotBlobs.current = { before: null, after: null };
      try {
        void fetch('/api/blob/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ references }),
          keepalive: true,
        });
      } catch {}
    };
    window.addEventListener('pagehide', cleanupOnPageHide);
    return () => window.removeEventListener('pagehide', cleanupOnPageHide);
  }, []);

  function getCachedScreenshotAccess(tradeId) {
    const cached = screenshotAccessCache.current.get(tradeId);
    if (!cached) return null;
    if (cached.screenshotAccessExpiresAt && cached.screenshotAccessExpiresAt <= Date.now() + 60 * 1000) {
      screenshotAccessCache.current.delete(tradeId);
      return null;
    }
    return cached;
  }

  function rememberScreenshotAccess(tradeId, data) {
    if (!tradeId || !data) return;
    const access = {
      beforeScreenshotPreviewAccessUrl: data.beforeScreenshotPreviewAccessUrl || null,
      beforeScreenshotFullAccessUrl: data.beforeScreenshotFullAccessUrl || null,
      afterScreenshotPreviewAccessUrl: data.afterScreenshotPreviewAccessUrl || null,
      afterScreenshotFullAccessUrl: data.afterScreenshotFullAccessUrl || null,
      screenshotAccessExpiresAt: data.screenshotAccessExpiresAt || null,
    };
    if (Object.values(access).some(Boolean)) screenshotAccessCache.current.set(tradeId, access);
    else screenshotAccessCache.current.delete(tradeId);
  }

  function resetScreenshotUploads() {
    screenshotUploadIds.current.before += 1;
    screenshotUploadIds.current.after += 1;
    setScreenshotUploads({
      before: { status: 'idle', progress: 0 },
      after: { status: 'idle', progress: 0 },
    });
  }

  function setScreenshotUpload(kind, patch) {
    setScreenshotUploads((current) => ({
      ...current,
      [kind]: { ...current[kind], ...patch },
    }));
  }

  function openAdd() {
    if (readOnly) return;
    cleanupPendingScreenshotBlobs();
    setForm(emptyForm);
    setEditingId(null);
    setDetailLoading(false);
    setDetailLoadFailed(false);
    setFormError('');
    resetScreenshotUploads();
    setShowForm(true);
  }

  async function restoreLegacyScreenshotForOpen(tradeId) {
    setScreenshotUpload('before', { status: 'restoring', progress: 0 });
    try {
      const res = await fetch(`${tradeDetailBasePath}/${tradeId}/restore-legacy-screenshot`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not restore old screenshot');
      rememberScreenshotAccess(tradeId, data);
      setForm((current) => ({
        ...current,
        beforeScreenshotUrl: data.beforeScreenshotUrl || current.beforeScreenshotUrl,
        beforeScreenshotPreviewAccessUrl: data.beforeScreenshotPreviewAccessUrl || data.beforeScreenshotFullAccessUrl || current.beforeScreenshotPreviewAccessUrl,
        beforeScreenshotFullAccessUrl: data.beforeScreenshotFullAccessUrl || current.beforeScreenshotFullAccessUrl,
        screenshotAccessExpiresAt: data.screenshotAccessExpiresAt || current.screenshotAccessExpiresAt,
        hasLegacyScreenshot: false,
      }));
      if (data.beforeScreenshotUrl) {
        setTrades((current) => current.map((trade) =>
          trade.id === tradeId
            ? { ...trade, hasBeforeScreenshot: true, hasScreenshot: true }
            : trade
        ));
      }
      setScreenshotUpload('before', { status: 'uploaded', progress: 100 });
    } catch (error) {
      console.error(error);
      setScreenshotUpload('before', { status: 'restore-error', progress: 0 });
    }
  }

  async function openEdit(t) {
    cleanupPendingScreenshotBlobs();
    const cachedAccess = getCachedScreenshotAccess(t.id);
    setForm(toFormShape(cachedAccess ? { ...t, ...cachedAccess } : t));
    setEditingId(t.id);
    setFormError('');
    setDetailLoadFailed(false);
    resetScreenshotUploads();
    setDetailLoading(true);
    setShowForm(true);

    try {
      const res = await fetch(`${tradeDetailBasePath}/${t.id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load trade details');
      const detail = await res.json();
      rememberScreenshotAccess(t.id, detail);
      setForm(toFormShape(detail));
      if (detail.hasLegacyScreenshot && !detail.beforeScreenshotUrl) {
        restoreLegacyScreenshotForOpen(t.id);
      }
    } catch {
      setDetailLoadFailed(true);
      setFormError('Could not load this trade. Close the window and try again.');
    } finally {
      setDetailLoading(false);
    }
  }

  function closeForm() {
    cleanupPendingScreenshotBlobs(null, true);
    [
      form.beforeScreenshotPreview,
      form.afterScreenshotPreview,
      form.beforeScreenshotFullLocal,
      form.afterScreenshotFullLocal,
    ].forEach((value) => {
      if (value?.startsWith('blob:')) URL.revokeObjectURL(value);
    });
    setShowForm(false);
    setEditingId(null);
    setDetailLoading(false);
    setDetailLoadFailed(false);
    setForm(emptyForm);
    setFormError('');
    resetScreenshotUploads();
  }

  async function prepareScreenshotFiles(file) {
    if (!file.type.startsWith('image/')) throw new Error('Invalid screenshot type.');

    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = sourceUrl;
      });

      const render = async (maxWidth, maxHeight, quality, suffix) => {
        const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob) throw new Error('Could not optimize screenshot.');
        const base = file.name.replace(/\.[^.]+$/, '') || 'trade-screenshot';
        return new File([blob], `${base}-${suffix}.webp`, { type: 'image/webp' });
      };

      
      let fullFile = await render(1600, 1200, 0.76, 'full');
      if (fullFile.size > 1200 * 1024) fullFile = await render(1400, 1050, 0.66, 'full');
      if (fullFile.size > 1200 * 1024) fullFile = await render(1200, 900, 0.58, 'full');

      let previewFile = await render(800, 600, 0.58, 'preview');
      if (previewFile.size > 350 * 1024) previewFile = await render(680, 510, 0.5, 'preview');

      return { fullFile, previewFile };
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  async function handleScreenshotChange(e, kind) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Screenshots must be JPG, PNG, or WebP images.');
      e.target.value = '';
      return;
    }

    // A previously uploaded-but-unsaved replacement is no longer needed.
    cleanupPendingScreenshotBlobs(kind);
    const requestId = screenshotUploadIds.current[kind] + 1;
    screenshotUploadIds.current[kind] = requestId;
    setFormError('');
    setScreenshotUpload(kind, { status: 'preparing', progress: 0 });

    const fullUrlKey = kind === 'before' ? 'beforeScreenshotUrl' : 'afterScreenshotUrl';
    const previewUrlKey = kind === 'before' ? 'beforeScreenshotPreviewUrl' : 'afterScreenshotPreviewUrl';
    const localPreviewKey = kind === 'before' ? 'beforeScreenshotPreview' : 'afterScreenshotPreview';
    const localFullKey = kind === 'before' ? 'beforeScreenshotFullLocal' : 'afterScreenshotFullLocal';
    const previewAccessKey = kind === 'before' ? 'beforeScreenshotPreviewAccessUrl' : 'afterScreenshotPreviewAccessUrl';
    const fullAccessKey = kind === 'before' ? 'beforeScreenshotFullAccessUrl' : 'afterScreenshotFullAccessUrl';

    try {
      const { fullFile, previewFile } = await prepareScreenshotFiles(file);
      if (screenshotUploadIds.current[kind] !== requestId) return;

      const localPreview = URL.createObjectURL(previewFile);
      const localFull = URL.createObjectURL(fullFile);
      setForm((current) => {
        if (current[localPreviewKey]?.startsWith('blob:')) URL.revokeObjectURL(current[localPreviewKey]);
        if (current[localFullKey]?.startsWith('blob:')) URL.revokeObjectURL(current[localFullKey]);
        return {
          ...current,
          [localPreviewKey]: localPreview,
          [localFullKey]: localFull,
          [previewAccessKey]: null,
          [fullAccessKey]: null,
        };
      });

      setScreenshotUpload(kind, { status: 'uploading', progress: 1 });
      const uploaded = await uploadScreenshotFiles(
        fullFile,
        previewFile,
        kind,
        (percentage) => {
          if (screenshotUploadIds.current[kind] === requestId) {
            setScreenshotUpload(kind, { status: 'uploading', progress: Math.max(1, Math.round(percentage || 0)) });
          }
        },
        () => {
          if (screenshotUploadIds.current[kind] === requestId) {
            setScreenshotUpload(kind, { status: 'finalizing', progress: 100 });
          }
        }
      );

      if (screenshotUploadIds.current[kind] !== requestId) {
        void cleanupScreenshotReferences([uploaded.fullUrl, uploaded.previewUrl]);
        return;
      }
      rememberPendingScreenshotBlobs(kind, uploaded);
      setForm((current) => ({
        ...current,
        [fullUrlKey]: uploaded.fullUrl,
        [previewUrlKey]: uploaded.previewUrl,
      }));
      setScreenshotUpload(kind, { status: 'uploaded', progress: 100 });
    } catch (error) {
      console.error(error);
      if (screenshotUploadIds.current[kind] === requestId) {
        setScreenshotUpload(kind, { status: 'error', progress: 0 });
        setFormError(`Could not upload the ${kind} screenshot. Remove it or choose it again.`);
      }
    } finally {
      e.target.value = '';
    }
  }

  async function requestScreenshotUploadUrls(fullFile, previewFile, kind) {
    const response = await fetch('/api/blob/presign-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        full: { contentType: fullFile.type, size: fullFile.size },
        preview: { contentType: previewFile.type, size: previewFile.size },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.full?.uploadUrl || !data.preview?.uploadUrl) {
      throw new Error(data.error || 'Could not prepare screenshot upload.');
    }
    return data;
  }

  function uploadFileToSignedUrl(file, uploadUrl, onProgress, onBodySent) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.timeout = 45000;
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded, event.total);
      };
      xhr.upload.onload = () => onBodySent?.();
      xhr.onerror = () => reject(new Error('Screenshot upload failed.'));
      xhr.ontimeout = () => reject(new Error('Screenshot upload timed out.'));
      xhr.onabort = () => reject(new Error('Screenshot upload was cancelled.'));
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || '{}'); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data);
        else reject(new Error(data.error || `Screenshot upload failed (${xhr.status}).`));
      };
      xhr.send(file);
    });
  }

  function uploadFileViaServer(file, kind, onProgress, onBodySent) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const data = new FormData();
      data.append('file', file);
      data.append('kind', kind);
      xhr.open('POST', '/api/blob/server-upload');
      xhr.timeout = 60000;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded, event.total);
      };
      xhr.upload.onload = () => onBodySent?.();
      xhr.onerror = () => reject(new Error('Fallback screenshot upload failed.'));
      xhr.ontimeout = () => reject(new Error('Fallback screenshot upload timed out.'));
      xhr.onabort = () => reject(new Error('Fallback screenshot upload was cancelled.'));
      xhr.onload = () => {
        let result = {};
        try { result = JSON.parse(xhr.responseText || '{}'); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && result.url) resolve(result);
        else reject(new Error(result.error || `Fallback screenshot upload failed (${xhr.status}).`));
      };
      xhr.send(data);
    });
  }

  async function uploadScreenshotFiles(fullFile, previewFile, kind, onProgress, onFinalizing) {
    if (fullFile.size > 2 * 1024 * 1024 || previewFile.size > 600 * 1024) {
      throw new Error('Screenshot is still too large after optimization.');
    }

    const totals = { full: fullFile.size, preview: previewFile.size };
    const loaded = { full: 0, preview: 0 };
    const totalBytes = totals.full + totals.preview;
    const report = () => {
      const current = loaded.full + loaded.preview;
      onProgress?.(Math.min(98, Math.max(1, (current / totalBytes) * 100)));
    };

    try {
      const targets = await requestScreenshotUploadUrls(fullFile, previewFile, kind);
      const sent = { full: false, preview: false };
      const bodySent = (which) => {
        sent[which] = true;
        if (sent.full && sent.preview) onFinalizing?.();
      };

      const directResults = await Promise.allSettled([
        uploadFileToSignedUrl(
          fullFile,
          targets.full.uploadUrl,
          (value) => { loaded.full = value; report(); },
          () => bodySent('full')
        ),
        uploadFileToSignedUrl(
          previewFile,
          targets.preview.uploadUrl,
          (value) => { loaded.preview = value; report(); },
          () => bodySent('preview')
        ),
      ]);

      if (directResults.every((result) => result.status === 'fulfilled')) {
        const [fullResult, previewResult] = directResults.map((result) => result.value);
        onFinalizing?.();
        return { fullUrl: fullResult.url, previewUrl: previewResult.url };
      }

  
      await cleanupScreenshotReferences([targets.full.pathname, targets.preview.pathname]);
      const firstFailure = directResults.find((result) => result.status === 'rejected');
      throw firstFailure?.reason || new Error('Direct screenshot upload failed.');
    } catch (directError) {
      console.warn('Direct signed screenshot upload failed; using server fallback.', directError);
      loaded.full = 0;
      loaded.preview = 0;
      onProgress?.(1);

      const sent = { full: false, preview: false };
      const bodySent = (which) => {
        sent[which] = true;
        if (sent.full && sent.preview) onFinalizing?.();
      };
      const fallbackResults = await Promise.allSettled([
        uploadFileViaServer(
          fullFile,
          kind,
          (value) => { loaded.full = value; report(); },
          () => bodySent('full')
        ),
        uploadFileViaServer(
          previewFile,
          kind,
          (value) => { loaded.preview = value; report(); },
          () => bodySent('preview')
        ),
      ]);

      if (!fallbackResults.every((result) => result.status === 'fulfilled')) {
        const completedUrls = fallbackResults
          .filter((result) => result.status === 'fulfilled')
          .map((result) => result.value?.url)
          .filter(Boolean);
        await cleanupScreenshotReferences(completedUrls);
        const firstFailure = fallbackResults.find((result) => result.status === 'rejected');
        throw firstFailure?.reason || new Error('Fallback screenshot upload failed.');
      }

      const [fullResult, previewResult] = fallbackResults.map((result) => result.value);
      onFinalizing?.();
      return { fullUrl: fullResult.url, previewUrl: previewResult.url };
    }
  }

  function removeScreenshot(kind) {
    screenshotUploadIds.current[kind] += 1;
    cleanupPendingScreenshotBlobs(kind);
    const fullUrlKey = kind === 'before' ? 'beforeScreenshotUrl' : 'afterScreenshotUrl';
    const previewUrlKey = kind === 'before' ? 'beforeScreenshotPreviewUrl' : 'afterScreenshotPreviewUrl';
    const localPreviewKey = kind === 'before' ? 'beforeScreenshotPreview' : 'afterScreenshotPreview';
    const localFullKey = kind === 'before' ? 'beforeScreenshotFullLocal' : 'afterScreenshotFullLocal';
    const previewAccessKey = kind === 'before' ? 'beforeScreenshotPreviewAccessUrl' : 'afterScreenshotPreviewAccessUrl';
    const fullAccessKey = kind === 'before' ? 'beforeScreenshotFullAccessUrl' : 'afterScreenshotFullAccessUrl';
    setForm((current) => {
      if (current[localPreviewKey]?.startsWith('blob:')) URL.revokeObjectURL(current[localPreviewKey]);
      if (current[localFullKey]?.startsWith('blob:')) URL.revokeObjectURL(current[localFullKey]);
      return {
        ...current,
        [fullUrlKey]: null,
        [previewUrlKey]: null,
        [localPreviewKey]: null,
        [localFullKey]: null,
        [previewAccessKey]: null,
        [fullAccessKey]: null,
        ...(kind === 'before' ? { hasLegacyScreenshot: false } : {}),
      };
    });
    setScreenshotUpload(kind, { status: 'idle', progress: 0 });
    setFormError('');
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

    const blockingScreenshot = ['before', 'after'].find((kind) =>
      ['preparing', 'uploading', 'finalizing', 'error'].includes(screenshotUploads[kind].status)
    );
    if (blockingScreenshot) {
      const status = screenshotUploads[blockingScreenshot].status;
      setFormError(status === 'error'
        ? `Fix or remove the ${blockingScreenshot} screenshot before saving.`
        : `The ${blockingScreenshot} screenshot is still uploading. You can keep editing while it finishes.`);
      setSaving(false);
      return;
    }

    try {
      const beforeScreenshotUrl = form.beforeScreenshotUrl || null;
      const afterScreenshotUrl = form.afterScreenshotUrl || null;
      const beforeScreenshotPreviewUrl = form.beforeScreenshotPreviewUrl || null;
      const afterScreenshotPreviewUrl = form.afterScreenshotPreviewUrl || null;

      const payload = {
        symbol: form.symbol.trim().toUpperCase(),
        direction: form.direction,
        date: form.date,
        entryPrice: form.entryPrice,
        stopLoss: form.stopLoss,
        size: form.size,
        pnl: form.pnl,
        notes: form.notes,
        beforeScreenshotUrl,
        afterScreenshotUrl,
        beforeScreenshotPreviewUrl,
        afterScreenshotPreviewUrl,
      };

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
      
      markPendingScreenshotsCommitted();
      const saved = await res.json();
      if (editingId) screenshotAccessCache.current.delete(editingId);
      setTrades((prev) =>
        editingId ? prev.map((t) => (t.id === editingId ? saved : t)) : [saved, ...prev]
      );
      setSaving(false);
      closeForm();
    } catch (err) {
      console.error(err);
      setFormError('Could not save the trade. Check your connection and try again.');
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (readOnly) return;
    try {
      const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
      if (res.ok) {
        screenshotAccessCache.current.delete(id);
        setTrades((prev) => prev.filter((t) => t.id !== id));
      }
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

  const screenshotSaveBlocked = ['before', 'after'].some((kind) =>
    ['preparing', 'uploading', 'finalizing', 'error'].includes(screenshotUploads[kind].status)
  );

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
                                {t.hasScreenshot && <ImageIcon size={11} color="#3E4753" title={`${t.hasBeforeScreenshot ? 'Before ' : ''}${t.hasAfterScreenshot ? 'After' : ''} screenshot`} />}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: t.direction === 'long' ? 'rgba(0,217,163,0.12)' : 'rgba(255,77,94,0.12)', color: t.direction === 'long' ? '#00D9A3' : '#FF4D5E' }}>
                                {t.direction === 'long' ? 'LONG' : 'SHORT'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>{t.entryPrice !== null && t.entryPrice !== undefined ? `$${fmtRawNumber(t.entryPrice)}` : '—'}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>{t.stopLoss !== null && t.stopLoss !== undefined ? `$${fmtRawNumber(t.stopLoss)}` : '—'}</td>
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
          <form onSubmit={readOnly ? (e) => e.preventDefault() : handleSubmit} style={{ background: '#0B0F16', border: '1px solid #1E2630', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '88vh', overflowY: 'auto', padding: 22 }}>
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
                <input className="td-input" disabled={readOnly} type="number" step="any" placeholder="0.00000" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} />
              </div>
              <div>
                <label className="td-label">Stop loss</label>
                <input className="td-input" disabled={readOnly} type="number" step="any" placeholder="0.00000" value={form.stopLoss} onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} />
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
              <textarea className="td-input" disabled={readOnly} rows={3} placeholder="What was the thesis? How did it play out?" style={{ resize: 'vertical', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginBottom: 18 }}>
              <ScreenshotField
                label="Before trade screenshot"
                previewImageUrl={form.beforeScreenshotPreview || form.beforeScreenshotPreviewAccessUrl || (form.beforeScreenshotUrl && form.beforeScreenshotUrl.includes('.private.blob.vercel-storage.com') && editingId ? `${tradeDetailBasePath}/${editingId}/screenshot/before` : (form.beforeScreenshotPreviewUrl || form.beforeScreenshotUrl))}
                fullImageUrl={form.beforeScreenshotFullLocal || form.beforeScreenshotFullAccessUrl || (form.beforeScreenshotUrl && form.beforeScreenshotUrl.includes('.private.blob.vercel-storage.com') && editingId ? `${tradeDetailBasePath}/${editingId}/screenshot/before` : form.beforeScreenshotUrl)}
                inputRef={beforeFileInputRef}
                readOnly={readOnly}
                legacyPending={form.hasLegacyScreenshot && !form.beforeScreenshotUrl && !form.beforeScreenshotPreview}
                onChange={(e) => handleScreenshotChange(e, 'before')}
                onRemove={() => removeScreenshot('before')}
                uploadState={screenshotUploads.before}
              />
              <ScreenshotField
                label="After trade screenshot"
                previewImageUrl={form.afterScreenshotPreview || form.afterScreenshotPreviewAccessUrl || (form.afterScreenshotUrl && form.afterScreenshotUrl.includes('.private.blob.vercel-storage.com') && editingId ? `${tradeDetailBasePath}/${editingId}/screenshot/after` : (form.afterScreenshotPreviewUrl || form.afterScreenshotUrl))}
                fullImageUrl={form.afterScreenshotFullLocal || form.afterScreenshotFullAccessUrl || (form.afterScreenshotUrl && form.afterScreenshotUrl.includes('.private.blob.vercel-storage.com') && editingId ? `${tradeDetailBasePath}/${editingId}/screenshot/after` : form.afterScreenshotUrl)}
                inputRef={afterFileInputRef}
                readOnly={readOnly}
                onChange={(e) => handleScreenshotChange(e, 'after')}
                onRemove={() => removeScreenshot('after')}
                uploadState={screenshotUploads.after}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={closeForm} className="mono" style={{ flex: 1, padding: '11px 0', borderRadius: 7, border: '1px solid #1E2630', background: 'transparent', color: '#8A94A3', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{readOnly ? 'CLOSE' : 'CANCEL'}</button>
              {!readOnly && (
                <button type="submit" disabled={saving || detailLoading || detailLoadFailed || screenshotSaveBlocked} className="mono" style={{ flex: 1, padding: '11px 0', borderRadius: 7, border: 'none', background: '#00D9A3', color: '#04241C', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', opacity: (saving || detailLoading || detailLoadFailed || screenshotSaveBlocked) ? 0.7 : 1 }}>
                  {detailLoadFailed ? 'LOAD FAILED' : detailLoading ? 'LOADING…' : screenshotSaveBlocked ? 'WAIT FOR SCREENSHOT' : saving ? 'SAVING…' : editingId ? 'SAVE CHANGES' : 'LOG TRADE'}
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


function ScreenshotLightbox({ src, placeholderSrc, alt, onClose }) {
  const [scale, setScale] = useState(1);
  const [fullLoaded, setFullLoaded] = useState(!placeholderSrc || placeholderSrc === src);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef({ mode: null, startDistance: 0, startScale: 1, startMidpoint: null, startPosition: { x: 0, y: 0 }, startPointer: null });

  useEffect(() => {
    setFullLoaded(!placeholderSrc || placeholderSrc === src);
  }, [src, placeholderSrc]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  function clampScale(value) {
    return Math.min(5, Math.max(1, value));
  }

  function resetView() {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }

  function setZoom(nextScale) {
    const clamped = clampScale(nextScale);
    setScale(clamped);
    if (clamped === 1) setPosition({ x: 0, y: 0 });
  }

  function zoomBy(amount) {
    setZoom(scale * amount);
  }

  function handleWheel(event) {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.16 : 1 / 1.16);
  }

  function handleDoubleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (scale > 1.15) resetView();
    else setZoom(2.5);
  }

  function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function midpointBetween(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function handlePointerDown(event) {
    event.stopPropagation();
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const active = [...pointers.current.values()];
    if (active.length === 1) {
      gesture.current = {
        ...gesture.current,
        mode: 'pan',
        startPointer: point,
        startPosition: { ...position },
      };
    } else if (active.length === 2) {
      gesture.current = {
        mode: 'pinch',
        startDistance: distanceBetween(active[0], active[1]),
        startScale: scale,
        startMidpoint: midpointBetween(active[0], active[1]),
        startPosition: { ...position },
        startPointer: null,
      };
    }
  }

  function handlePointerMove(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = [...pointers.current.values()];

    if (active.length >= 2 && gesture.current.mode === 'pinch') {
      const currentDistance = distanceBetween(active[0], active[1]);
      const currentMidpoint = midpointBetween(active[0], active[1]);
      const ratio = gesture.current.startDistance > 0 ? currentDistance / gesture.current.startDistance : 1;
      const nextScale = clampScale(gesture.current.startScale * ratio);
      setScale(nextScale);
      if (nextScale <= 1) {
        setPosition({ x: 0, y: 0 });
      } else {
        setPosition({
          x: gesture.current.startPosition.x + (currentMidpoint.x - gesture.current.startMidpoint.x),
          y: gesture.current.startPosition.y + (currentMidpoint.y - gesture.current.startMidpoint.y),
        });
      }
      return;
    }

    if (active.length === 1 && gesture.current.mode === 'pan' && scale > 1 && gesture.current.startPointer) {
      setPosition({
        x: gesture.current.startPosition.x + (active[0].x - gesture.current.startPointer.x),
        y: gesture.current.startPosition.y + (active[0].y - gesture.current.startPointer.y),
      });
    }
  }

  function handlePointerEnd(event) {
    pointers.current.delete(event.pointerId);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch (_) {}
    const active = [...pointers.current.values()];
    if (active.length === 1) {
      gesture.current = {
        ...gesture.current,
        mode: 'pan',
        startPointer: active[0],
        startPosition: { ...position },
      };
    } else if (active.length === 0) {
      gesture.current = { ...gesture.current, mode: null, startPointer: null };
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} enlarged view`}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.94)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close enlarged screenshot"
        title="Close"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 1003, width: 42, height: 42,
          borderRadius: '50%', border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(8,12,18,0.9)',
          color: '#E8ECF1', display: 'grid', placeItems: 'center', cursor: 'pointer',
        }}
      >
        <X size={22} />
      </button>

      <div
        style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' }}
      >
        {!fullLoaded && placeholderSrc && (
          <img
            src={placeholderSrc}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              position: 'absolute', maxWidth: '96vw', maxHeight: '88vh', objectFit: 'contain',
              filter: 'blur(2px)', opacity: 0.78, borderRadius: 8, pointerEvents: 'none',
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
        )}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setFullLoaded(true)}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{
            maxWidth: '96vw', maxHeight: '88vh', objectFit: 'contain', userSelect: 'none', WebkitUserDrag: 'none',
            touchAction: 'none', pointerEvents: 'auto', cursor: scale > 1 ? 'grab' : 'zoom-in',
            opacity: fullLoaded ? 1 : 0,
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            transformOrigin: 'center center', transition: pointers.current.size ? 'none' : 'transform 120ms ease-out, opacity 140ms ease',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7)', borderRadius: 8,
          }}
        />
        {!fullLoaded && (
          <div className="mono" style={{ position: 'fixed', bottom: 70, color: '#A8B3C0', fontSize: 10, pointerEvents: 'none' }}>
            LOADING FULL RESOLUTION…
          </div>
        )}

        <div
          className="mono"
          onClick={(event) => event.stopPropagation()}
          style={{
            position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 1002,
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 10,
            background: 'rgba(8,12,18,0.9)', border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)', pointerEvents: 'auto',
          }}
        >
          <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out" style={lightboxControlStyle}>−</button>
          <span style={{ minWidth: 52, textAlign: 'center', color: '#B9C4D0', fontSize: 10 }}>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in" style={lightboxControlStyle}>+</button>
          <button type="button" onClick={resetView} aria-label="Reset zoom" title="Reset zoom" style={{ ...lightboxControlStyle, width: 'auto', padding: '0 10px', fontSize: 9 }}>RESET</button>
        </div>

        <div className="mono" style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', color: '#7F8B98', fontSize: 9.5, letterSpacing: '0.04em', textAlign: 'center', pointerEvents: 'none' }}>
          PINCH · MOUSE WHEEL · DOUBLE-CLICK TO ZOOM
        </div>
      </div>
    </div>
  );
}

function ScreenshotField({ label, previewImageUrl, fullImageUrl, inputRef, readOnly, legacyPending = false, onChange, onRemove, uploadState = { status: 'idle', progress: 0 } }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const isWorking = ['preparing', 'uploading', 'finalizing'].includes(uploadState.status);
  const isRestoring = uploadState.status === 'restoring';
  const uploadFailed = uploadState.status === 'error';
  const restoreFailed = uploadState.status === 'restore-error';
  const displayUrl = previewImageUrl || fullImageUrl;
  const zoomUrl = fullImageUrl || displayUrl;

  useEffect(() => {
    if (!displayUrl) setLightboxOpen(false);
    setPreviewLoaded(false);
  }, [displayUrl]);

  function openLightbox() {
    if (zoomUrl) setLightboxOpen(true);
  }

  function preloadFull() {
    if (!zoomUrl || zoomUrl === displayUrl) return;
    const img = new Image();
    img.src = zoomUrl;
  }

  return (
    <div>
      <label className="td-label">{label}</label>
      {!readOnly && <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onChange} style={{ display: 'none' }} />}
      {displayUrl ? (
        <div>
          <div
            role="button"
            tabIndex={0}
            aria-label={`Open ${label} full screen`}
            title="Click to enlarge"
            onClick={openLightbox}
            onMouseEnter={preloadFull}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openLightbox();
              }
            }}
            style={{ position: 'relative', cursor: 'zoom-in', borderRadius: 8, overflow: 'hidden', outline: 'none', minHeight: 150, background: '#070A0E' }}
          >
            {!previewLoaded && (
              <div
                className="screenshot-loading-placeholder"
                style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', minHeight: 150, border: '1px solid #1E2630', borderRadius: 8 }}
              >
                <span className="mono" style={{ color: '#687483', fontSize: 9.5 }}>LOADING PREVIEW…</span>
              </div>
            )}
            <img
              loading="eager"
              decoding="async"
              src={displayUrl}
              alt={label}
              onLoad={() => setPreviewLoaded(true)}
              style={{ width: '100%', maxHeight: 330, objectFit: 'contain', background: '#070A0E', borderRadius: 8, border: '1px solid #1E2630', display: 'block', opacity: previewLoaded ? 1 : 0, transition: 'opacity 140ms ease' }}
            />
            {previewLoaded && (
              <div className="mono" style={{ position: 'absolute', right: 8, bottom: 8, padding: '5px 7px', borderRadius: 6, background: 'rgba(4,7,11,0.78)', border: '1px solid rgba(255,255,255,0.12)', color: '#B9C4D0', fontSize: 8.5, pointerEvents: 'none' }}>
                CLICK TO ENLARGE
              </div>
            )}
          </div>
          {lightboxOpen && <ScreenshotLightbox src={zoomUrl} placeholderSrc={displayUrl} alt={label} onClose={() => setLightboxOpen(false)} />}
          {isWorking && (
            <div style={{ marginTop: 8 }}>
              <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', color: '#00D9A3', fontSize: 10, marginBottom: 5 }}>
                <span>{uploadState.status === 'preparing' ? 'OPTIMIZING…' : uploadState.status === 'finalizing' ? 'FINALIZING…' : 'UPLOADING…'}</span>
                <span>{uploadState.status === 'uploading' ? `${uploadState.progress}%` : uploadState.status === 'finalizing' ? '100%' : ''}</span>
              </div>
              <div style={{ height: 4, background: '#151B23', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ width: `${uploadState.status === 'uploading' ? uploadState.progress : uploadState.status === 'finalizing' ? 100 : 8}%`, height: '100%', background: '#00D9A3', transition: 'width 160ms ease' }} />
              </div>
            </div>
          )}
          {uploadState.status === 'uploaded' && <div className="mono" style={{ color: '#00D9A3', fontSize: 10, marginTop: 7 }}>✓ SCREENSHOT READY</div>}
          {uploadFailed && <div className="mono" style={{ color: '#FF4D5E', fontSize: 10, marginTop: 7 }}>UPLOAD FAILED — REPLACE OR REMOVE</div>}
          {!readOnly && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" disabled={isWorking} onClick={() => inputRef.current && inputRef.current.click()} className="mono" style={{ ...smallBtnStyle, opacity: isWorking ? 0.55 : 1 }}>REPLACE</button>
              <button type="button" disabled={isWorking} onClick={onRemove} className="mono" style={{ ...smallBtnStyle, color: '#FF4D5E', opacity: isWorking ? 0.55 : 1 }}>REMOVE</button>
            </div>
          )}
        </div>
      ) : isRestoring || (legacyPending && !restoreFailed) ? (
        <div className="mono" style={{ color: '#F5A623', border: '1px dashed rgba(245,166,35,0.35)', borderRadius: 8, padding: 16, textAlign: 'center', fontSize: 10.5, lineHeight: 1.5 }}>
          RESTORING YOUR OLD SCREENSHOT…<br />THIS HAPPENS ONLY ONCE FOR THIS TRADE
        </div>
      ) : restoreFailed ? (
        <div className="mono" style={{ color: '#FF4D5E', border: '1px dashed rgba(255,77,94,0.35)', borderRadius: 8, padding: 16, textAlign: 'center', fontSize: 10.5, lineHeight: 1.5 }}>
          OLD SCREENSHOT FOUND, BUT IT COULD NOT BE RESTORED.<br />CHECK BLOB STORAGE CONFIGURATION.
        </div>
      ) : readOnly ? (
        <div className="mono" style={{ color: '#3E4753', border: '1px dashed #232A35', borderRadius: 8, padding: 16, textAlign: 'center', fontSize: 11.5 }}>NO SCREENSHOT ATTACHED</div>
      ) : (
        <div>
          <div className="td-upload mono" onClick={() => inputRef.current && inputRef.current.click()}>
            <Upload size={14} /> UPLOAD {label.toUpperCase()}
          </div>
          {uploadFailed && <div className="mono" style={{ color: '#FF4D5E', fontSize: 10, marginTop: 7 }}>UPLOAD FAILED — CHOOSE THE IMAGE AGAIN</div>}
        </div>
      )}
    </div>
  );
}

const lightboxControlStyle = {
  width: 34, height: 34, borderRadius: 7, border: '1px solid #27313D', background: '#0E141C',
  color: '#E8ECF1', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18, fontWeight: 700,
};

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
