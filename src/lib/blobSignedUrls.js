import { issueSignedToken, presignUrl } from '@vercel/blob';
import { blobPathnameFromReference, isManagedBlobUrl, isOwnedTradeScreenshotReference } from './blobOwnership';

const READ_URL_TTL_MS = 30 * 60 * 1000;
const READ_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
let cachedReadToken = null;

async function getReadToken(urlValidUntil) {
  if (cachedReadToken?.validUntil && cachedReadToken.validUntil > urlValidUntil + 60 * 1000) {
    return cachedReadToken;
  }
  cachedReadToken = await issueSignedToken({
    operations: ['get'],
    validUntil: Date.now() + READ_TOKEN_TTL_MS,
  });
  return cachedReadToken;
}

export function isPrivateBlobUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.private.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

async function signOne(value, ownerUserId, kind, signedToken, validUntil) {
  if (!value || !isManagedBlobUrl(value) || !isOwnedTradeScreenshotReference(value, ownerUserId, kind)) return null;
  if (!isPrivateBlobUrl(value)) return value;

  const pathname = blobPathnameFromReference(value);
  const { presignedUrl } = await presignUrl(signedToken, {
    access: 'private',
    operation: 'get',
    pathname,
    validUntil,
  });
  return presignedUrl;
}

export async function createTradeScreenshotAccess(trade, ownerUserId) {
  if (!ownerUserId) {
    return {
      beforeScreenshotPreviewAccessUrl: null,
      beforeScreenshotFullAccessUrl: null,
      afterScreenshotPreviewAccessUrl: null,
      afterScreenshotFullAccessUrl: null,
      screenshotAccessExpiresAt: null,
    };
  }

  const ownedValues = [
    ['before', trade?.beforeScreenshotUrl],
    ['after', trade?.afterScreenshotUrl],
    ['before', trade?.beforeScreenshotPreviewUrl],
    ['after', trade?.afterScreenshotPreviewUrl],
  ].filter(([kind, value]) => value && isManagedBlobUrl(value) && isOwnedTradeScreenshotReference(value, ownerUserId, kind));

  const hasPrivate = ownedValues.some(([, value]) => isPrivateBlobUrl(value));
  const validUntil = hasPrivate ? Date.now() + READ_URL_TTL_MS : null;
  const signedToken = hasPrivate ? await getReadToken(validUntil) : null;

  const [beforePreview, beforeFull, afterPreview, afterFull] = await Promise.all([
    signOne(trade?.beforeScreenshotPreviewUrl || trade?.beforeScreenshotUrl, ownerUserId, 'before', signedToken, validUntil),
    signOne(trade?.beforeScreenshotUrl, ownerUserId, 'before', signedToken, validUntil),
    signOne(trade?.afterScreenshotPreviewUrl || trade?.afterScreenshotUrl, ownerUserId, 'after', signedToken, validUntil),
    signOne(trade?.afterScreenshotUrl, ownerUserId, 'after', signedToken, validUntil),
  ]);

  return {
    beforeScreenshotPreviewAccessUrl: beforePreview,
    beforeScreenshotFullAccessUrl: beforeFull,
    afterScreenshotPreviewAccessUrl: afterPreview,
    afterScreenshotFullAccessUrl: afterFull,
    screenshotAccessExpiresAt: validUntil,
  };
}
