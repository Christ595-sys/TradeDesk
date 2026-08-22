import { prisma } from './prisma';

export const tradeSummarySelect = {
  id: true,
  symbol: true,
  direction: true,
  date: true,
  entryPrice: true,
  stopLoss: true,
  size: true,
  pnl: true,
  createdAt: true,
  updatedAt: true,
};

function normalizeTradeDates(trade) {
  if (!trade) return null;
  return {
    ...trade,
    date: trade.date instanceof Date ? trade.date.toISOString() : trade.date,
    createdAt: trade.createdAt instanceof Date ? trade.createdAt.toISOString() : trade.createdAt,
    updatedAt: trade.updatedAt instanceof Date ? trade.updatedAt.toISOString() : trade.updatedAt,
  };
}

export async function getTradeSummaries(userId) {
  const rows = await prisma.$queryRaw`
    SELECT
      "id",
      "symbol",
      "direction",
      "date",
      "entryPrice",
      "stopLoss",
      "size",
      "pnl",
      "createdAt",
      "updatedAt",
      ("beforeScreenshotUrl" IS NOT NULL OR "screenshot" IS NOT NULL) AS "hasBeforeScreenshot",
      ("afterScreenshotUrl" IS NOT NULL) AS "hasAfterScreenshot",
      ("beforeScreenshotUrl" IS NOT NULL OR "afterScreenshotUrl" IS NOT NULL OR "screenshot" IS NOT NULL) AS "hasScreenshot"
    FROM "Trade"
    WHERE "userId" = ${userId}
    ORDER BY "date" DESC
  `;

  return rows.map(normalizeTradeDates);
}

export async function getTradeDetail(userId, tradeId) {
  const rows = await prisma.$queryRaw`
    SELECT
      "id",
      "symbol",
      "direction",
      "date",
      "entryPrice",
      "stopLoss",
      "size",
      "pnl",
      "notes",
      "createdAt",
      "updatedAt",
      "beforeScreenshotUrl",
      "afterScreenshotUrl",
      "beforeScreenshotPreviewUrl",
      "afterScreenshotPreviewUrl",
      ("screenshot" IS NOT NULL) AS "hasLegacyScreenshot"
    FROM "Trade"
    WHERE "id" = ${tradeId} AND "userId" = ${userId}
    LIMIT 1
  `;

  return normalizeTradeDates(rows[0] || null);
}
