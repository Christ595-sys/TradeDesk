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
      ("screenshot" IS NOT NULL) AS "hasScreenshot"
    FROM "Trade"
    WHERE "userId" = ${userId}
    ORDER BY "date" DESC
  `;

  return rows.map((trade) => ({
    ...trade,
    date: trade.date instanceof Date ? trade.date.toISOString() : trade.date,
    createdAt: trade.createdAt instanceof Date ? trade.createdAt.toISOString() : trade.createdAt,
    updatedAt: trade.updatedAt instanceof Date ? trade.updatedAt.toISOString() : trade.updatedAt,
  }));
}
