const BLOB_HOST_SUFFIX = '.blob.vercel-storage.com';

export function blobPathnameFromReference(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();

  // Cleanup can safely work with a Blob pathname as well as a full Blob URL.
  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, '');
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || !url.hostname.endsWith(BLOB_HOST_SUFFIX)) return null;
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

export function isManagedBlobUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

function allowedPrefixes(userId, kind = null) {
  if (!userId) return [];
  const prefixes = [];
  if (!kind || kind === 'before') prefixes.push(`trade-screenshots/${userId}/before/`);
  if (!kind || kind === 'after') prefixes.push(`trade-screenshots/${userId}/after/`);
  // Compatibility with screenshots restored by older TradeDesk builds.
  if (!kind || kind === 'before') prefixes.push(`trade-screenshots/legacy-before/${userId}/`);
  return prefixes;
}

export function isOwnedTradeScreenshotReference(value, userId, kind = null) {
  const pathname = blobPathnameFromReference(value);
  if (!pathname) return false;
  return allowedPrefixes(userId, kind).some((prefix) => pathname.startsWith(prefix));
}

export function isAllowedTradeScreenshotValue(value, userId, kind) {
  if (value === undefined || value === null || value === '') return true;
  return isManagedBlobUrl(value) && isOwnedTradeScreenshotReference(value, userId, kind);
}
