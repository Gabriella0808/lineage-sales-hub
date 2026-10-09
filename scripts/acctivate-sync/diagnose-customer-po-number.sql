-- ============================================================================
-- DIAGNOSTIC ONLY — read-only, makes no changes. Safe to run directly in SSMS
-- against the Acctivate SQL Server, or via the same connection the sync
-- scripts use (see sync.config.json's sql.server / sql.database).
--
-- Goal: find the exact table + column that holds "Customer PO Number" as
-- shown on the Acctivate Sales Order screen, Reference tab, for order
-- 0181740 (expected value: "73469 Freight"), and confirm against two more
-- known orders (0181414, 0179723).
-- ============================================================================

-- Step 1: list every column on dbo.Orders whose name suggests "PO" or
-- "Reference" — narrows down candidates without guessing blind.
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'Orders'
  AND (
    COLUMN_NAME LIKE '%PO%'
    OR COLUMN_NAME LIKE '%Reference%'
    OR COLUMN_NAME LIKE '%Ref%'
  )
ORDER BY COLUMN_NAME;

-- Step 2: same search across ALL tables, in case it's not on dbo.Orders
-- itself (e.g. a separate SalesOrderReference-style table) — the task brief
-- says it's likely header-level but let's not assume which table.
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND (
    COLUMN_NAME LIKE '%PONumber%'
    OR COLUMN_NAME LIKE '%CustomerPO%'
    OR COLUMN_NAME LIKE '%Cust_PO%'
    OR COLUMN_NAME = 'PO'
  )
ORDER BY TABLE_NAME, COLUMN_NAME;

-- Step 3: pull every "PO"/"Reference"-looking column's actual value for the
-- known order, so we can eyeball which one literally says "73469 Freight".
-- Edit the SELECT list below to match whatever Step 1 actually returned on
-- your install, then run it. (This is intentionally written as dynamic SQL
-- so you don't have to hand-edit column names — it builds the SELECT from
-- whatever Step 1 found.)
DECLARE @cols NVARCHAR(MAX) = (
  SELECT STRING_AGG(QUOTENAME(COLUMN_NAME), ', ')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'Orders'
    AND (COLUMN_NAME LIKE '%PO%' OR COLUMN_NAME LIKE '%Reference%' OR COLUMN_NAME LIKE '%Ref%')
);
DECLARE @sql NVARCHAR(MAX) = N'
SELECT OrderNumber, ' + @cols + N'
FROM dbo.Orders
WHERE OrderNumber IN (''0181740'', ''181740'', ''0181414'', ''181414'', ''0179723'', ''179723'')
ORDER BY OrderNumber;';
PRINT @sql;
EXEC sp_executesql @sql;

-- Step 4 (fallback, only if Steps 1-3 found nothing convincing): same idea,
-- but searching OrderDetail in case it's actually stored per-line rather
-- than per-header, despite the task brief's expectation.
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'OrderDetail'
  AND (COLUMN_NAME LIKE '%PO%' OR COLUMN_NAME LIKE '%Reference%' OR COLUMN_NAME LIKE '%Ref%');
