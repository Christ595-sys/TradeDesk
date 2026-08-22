-- Rules were removed from TradeDesk. This safely drops the historical table
-- for databases that still contain it while remaining harmless on newer DBs.
DROP TABLE IF EXISTS "Rule";
