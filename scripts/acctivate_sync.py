#!/usr/bin/env python3
"""
Acctivate SQL Server -> Supabase PostgreSQL daily sync
Replaces Skyvia for: dbo.Invoice, dbo.InvoiceDetail, dbo.OrderDetail, dbo.Orders
Run nightly via Windows Task Scheduler.
"""

import json
import logging
import os
from datetime import datetime
from decimal import Decimal

import psycopg2
from psycopg2.extras import execute_values
import pyodbc

# ── Configuration ──────────────────────────────────────────────────────────────

MSSQL_SERVER   = "data-east3.acctivate.com,51924"
MSSQL_DATABASE = "LineageCollectionsAcctivate$LineageCollections"
MSSQL_USER     = "LineageCollections"
MSSQL_PASSWORD = "tbGfHq835xumUwX7"

PG_DSN = "postgresql://postgres:fvXCMRhuJBEWgYXu@db.tcqpseblcwqjopbocfmr.supabase.co:5432/postgres"

SYNC_DIR   = r"C:\sync"
STATE_FILE = os.path.join(SYNC_DIR, "last_sync.json")
LOG_FILE   = os.path.join(SYNC_DIR, "sync.log")
BATCH_SIZE = 500

# updated_col: column used for incremental sync. None = truncate + full reload every night.
# InvoiceDetail and OrderDetail have no UpdatedDate, so they reload nightly.
TABLES = [
    {"schema": "dbo", "table": "Invoice",               "pg_table": "dbo_Invoice",               "updated_col": "UpdatedDate"},
    {"schema": "dbo", "table": "InvoiceDetail",         "pg_table": "dbo_InvoiceDetail",         "updated_col": None},
    {"schema": "dbo", "table": "OrderDetail",           "pg_table": "dbo_OrderDetail",           "updated_col": None},
    {"schema": "dbo", "table": "Orders",                "pg_table": "dbo_Orders",                "updated_col": "UpdatedDate"},
    # OrderManagementSummary is a view (no PK) so the script does a full reload every run.
    # This keeps dbo_OrderManagementSummary current with all open orders for the booking rollup.
    {"schema": "dbo", "table": "OrderManagementSummary","pg_table": "dbo_OrderManagementSummary","updated_col": None},
]

MSSQL_TO_PG = {
    "uniqueidentifier": "text",
    "varchar": "text",   "nvarchar": "text",  "char": "text",    "nchar": "text",
    "text":    "text",   "ntext":    "text",
    "int":     "integer","bigint":   "bigint", "smallint": "smallint", "tinyint": "smallint",
    "bit":     "boolean",
    "decimal": "numeric","numeric":  "numeric","money":    "numeric",  "smallmoney": "numeric",
    "float":   "double precision",             "real":     "real",
    "datetime":"timestamp","datetime2":"timestamp","date": "date",    "time": "time",
    "xml":     "text",
    "image":   "bytea",  "varbinary":"bytea",  "binary":   "bytea",
}

# ── Logging ────────────────────────────────────────────────────────────────────

os.makedirs(SYNC_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)

# ── Connections ────────────────────────────────────────────────────────────────

def connect_mssql():
    last_error = None
    for driver in ["ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server", "SQL Server"]:
        try:
            conn = pyodbc.connect(
                f"DRIVER={{{driver}}};"
                f"SERVER={MSSQL_SERVER};"
                f"UID={MSSQL_USER};PWD={MSSQL_PASSWORD};"
                "TrustServerCertificate=yes;Encrypt=yes;",
                timeout=30,
            )
            cur = conn.cursor()
            cur.execute(f"USE [{MSSQL_DATABASE}]")
            cur.close()
            log.info(f"SQL Server: connected via '{driver}', database: {MSSQL_DATABASE}")
            return conn
        except Exception as e:
            log.warning(f"Driver '{driver}' failed: {e}")
            last_error = e
    raise RuntimeError(f"All SQL Server drivers failed. Last error: {last_error}")

# ── Schema helpers ─────────────────────────────────────────────────────────────

def get_table_info(ms_cur, schema, table):
    ms_cur.execute("""
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
    """, schema, table)
    columns = [(row[0], MSSQL_TO_PG.get(row[1].lower(), "text")) for row in ms_cur.fetchall()]

    # Try INFORMATION_SCHEMA first
    ms_cur.execute("""
        SELECT kcu.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         AND tc.TABLE_SCHEMA    = kcu.TABLE_SCHEMA
         AND tc.TABLE_NAME      = kcu.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          AND tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
        ORDER BY kcu.ORDINAL_POSITION
    """, schema, table)
    pk_cols = [row[0] for row in ms_cur.fetchall()]

    # Fallback: use sys.indexes (catches PKs not exposed via INFORMATION_SCHEMA)
    if not pk_cols:
        ms_cur.execute("""
            SELECT col.name
            FROM sys.indexes idx
            JOIN sys.index_columns ic
              ON idx.object_id = ic.object_id AND idx.index_id = ic.index_id
            JOIN sys.columns col
              ON ic.object_id = col.object_id AND ic.column_id = col.column_id
            WHERE idx.is_primary_key = 1
              AND idx.object_id = OBJECT_ID(?)
            ORDER BY ic.key_ordinal
        """, f"{schema}.{table}")
        pk_cols = [row[0] for row in ms_cur.fetchall()]

    return columns, pk_cols

# ── PostgreSQL helpers ─────────────────────────────────────────────────────────

def ensure_table(pg_cur, pg_conn, pg_table, columns, pk_cols):
    col_defs = ", ".join(f'"{name}" {pg_type}' for name, pg_type in columns)
    pg_cur.execute(f'CREATE TABLE IF NOT EXISTS public."{pg_table}" ({col_defs})')
    pg_conn.commit()
    if pk_cols:
        pg_cur.execute("SAVEPOINT add_pk")
        try:
            pk_sql = ", ".join(f'"{c}"' for c in pk_cols)
            pg_cur.execute(f'ALTER TABLE public."{pg_table}" ADD PRIMARY KEY ({pk_sql})')
            pg_conn.commit()
        except Exception:
            pg_cur.execute("ROLLBACK TO SAVEPOINT add_pk")
            pg_conn.commit()

def insert_batch(pg_cur, pg_table, col_names, rows):
    cols_sql = ", ".join(f'"{c}"' for c in col_names)
    sql = f'INSERT INTO public."{pg_table}" ({cols_sql}) VALUES %s ON CONFLICT DO NOTHING'
    execute_values(pg_cur, sql, rows, page_size=BATCH_SIZE)

def upsert_batch(pg_cur, pg_table, pk_cols, col_names, rows):
    cols_sql = ", ".join(f'"{c}"' for c in col_names)
    conflict = ", ".join(f'"{c}"' for c in pk_cols)
    non_pk   = [c for c in col_names if c not in pk_cols]
    update   = (
        "DO UPDATE SET " + ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in non_pk)
        if non_pk else "DO NOTHING"
    )
    sql = f'INSERT INTO public."{pg_table}" ({cols_sql}) VALUES %s ON CONFLICT ({conflict}) {update}'
    execute_values(pg_cur, sql, rows, page_size=BATCH_SIZE)

def sanitize(val):
    if isinstance(val, memoryview):
        return bytes(val)
    return val

# ── Sync one table ─────────────────────────────────────────────────────────────

def sync_table(ms_conn, pg_conn, cfg, last_sync):
    schema, table, pg_table, upd_col = (
        cfg["schema"], cfg["table"], cfg["pg_table"], cfg["updated_col"]
    )
    ms_cur = ms_conn.cursor()
    pg_cur = pg_conn.cursor()

    columns, pk_cols = get_table_info(ms_cur, schema, table)
    col_names = [c[0] for c in columns]
    log.info(f"  {len(col_names)} columns | PK: {pk_cols}")

    ensure_table(pg_cur, pg_conn, pg_table, columns, pk_cols)

    # No PK or no update column: truncate and reload the whole table
    if not pk_cols or upd_col is None:
        pg_cur.execute(f'TRUNCATE TABLE public."{pg_table}"')
        pg_conn.commit()
        ms_cur.execute(f"SELECT * FROM [{schema}].[{table}]")
        log.info("  Full reload (truncate + insert)")

        total = 0
        while True:
            batch = ms_cur.fetchmany(BATCH_SIZE)
            if not batch:
                break
            rows = [tuple(sanitize(v) for v in row) for row in batch]
            insert_batch(pg_cur, pg_table, col_names, rows)
            pg_conn.commit()
            total += len(rows)

        log.info(f"  -> {total} rows inserted")
        return total

    # Incremental upsert using UpdatedDate
    if last_sync:
        ms_cur.execute(
            f"SELECT * FROM [{schema}].[{table}] WHERE [{upd_col}] > ? ORDER BY [{upd_col}]",
            last_sync,
        )
        log.info(f"  Incremental from {last_sync}")
    else:
        ms_cur.execute(f"SELECT * FROM [{schema}].[{table}] ORDER BY [{upd_col}]")
        log.info("  Full sync (first run)")

    total = 0
    while True:
        batch = ms_cur.fetchmany(BATCH_SIZE)
        if not batch:
            break
        rows = [tuple(sanitize(v) for v in row) for row in batch]
        upsert_batch(pg_cur, pg_table, pk_cols, col_names, rows)
        pg_conn.commit()
        total += len(rows)

    log.info(f"  -> {total} rows upserted")
    return total

# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    log.info("=" * 60)
    log.info(f"Sync started {datetime.now():%Y-%m-%d %H:%M:%S}")

    state = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}
    new_state = dict(state)
    sync_time = datetime.now().isoformat()

    ms_conn = connect_mssql()
    pg_conn = psycopg2.connect(PG_DSN)

    try:
        for cfg in TABLES:
            name = cfg["table"]
            log.info(f"\n-- dbo.{name} -> {cfg['pg_table']}")
            try:
                n = sync_table(ms_conn, pg_conn, cfg, state.get(name))
                new_state[name] = sync_time
                log.info(f"  OK {name}: {n} rows synced")
            except Exception as e:
                log.error(f"  FAILED {name}: {e}", exc_info=True)
                pg_conn.rollback()
    finally:
        ms_conn.close()
        pg_conn.close()

    with open(STATE_FILE, "w") as f:
        json.dump(new_state, f, indent=2)

    log.info(f"Sync complete {datetime.now():%Y-%m-%d %H:%M:%S}")


if __name__ == "__main__":
    main()
