# FINEXJ Production Database Backup & Disaster Recovery Runbook

## 1. Overview & Architecture

- **Primary Database Engine**: Supabase Managed PostgreSQL (v15+)
- **Architecture**: Single authoritative relational database running full double-entry ledger bookkeeping, row-level locks (`FOR UPDATE`), atomic stored procedures, and audit logging.
- **Financial Source of Truth**: Immutable PostgreSQL `ledger` journal, `deposits` (with on-chain BEP-20 transaction hashes), `withdrawals` (with verified payout hashes), `daily_performances`, `earnings`, and `users`.

---

## 2. Backup Mechanisms & Availability

### A. Point-in-Time Recovery (PITR)
- **Engine**: Continuous Write-Ahead Logging (WAL) streaming and incremental snapshots provided natively by Supabase infrastructure.
- **Granularity**: Second-level recovery capability (up to 7 or 30 days retention).
- **Service Objectives**: Recovery Point Objective (RPO) <= 5m, Recovery Time Objective (RTO) <= 60m.
- **Use Case**: Accidental data corruption, catastrophic administrator error, or faulty deployment.

### B. Automated Daily Physical Backups
- **Schedule**: Nightly automated full snapshots retained across multi-region cloud storage.
- **Scope**: Entire database cluster state, tables, stored functions, indexes, and constraints.

### C. Logical Schema & Data Backups
- **Tool**: Standard PostgreSQL `pg_dump` and versioned migration files located in `/supabase/migrations/` (`001` through `008`).
- **Configuration**: Version-controlled idempotent schema definitions ensuring zero-loss schema reconstitution.

---

## 3. Step-by-Step Restoration Procedures

### Scenario A: Point-in-Time Recovery (PITR) Restoration
1. **Identify Incident Timestamp**:
   - Query `audit_logs` or `system_logs` to find the exact UTC timestamp $T_{incident}$ immediately prior to the erroneous event or migration.
2. **Initiate Restore in Supabase Management Console**:
   - Navigate to **Project Settings** > **Database** > **Backups** > **Point in Time**.
   - Select target recovery point: $T_{restore} = T_{incident} - 1 \text{ minute}$.
   - Confirm restoration target environment.
3. **Verify Restored Instance**:
   - Run the automated reconciliation script (detailed in Section 4).
4. **Switch Ingress / Connection Strings**:
   - Update `SUPABASE_URL` and service role secrets in server configuration and restart API instances.

### Scenario B: Logical Dump Restoration (`pg_restore`)
1. Create a fresh target database if restoring to a standby environment.
2. Apply migrations in sequential order:
   ```bash
   psql -h <SUPABASE_DB_HOST> -U postgres -d postgres -f supabase/migrations/001_initial_schema.sql
   psql -h <SUPABASE_DB_HOST> -U postgres -d postgres -f supabase/migrations/002_auth_security.sql
   ...
   psql -h <SUPABASE_DB_HOST> -U postgres -d postgres -f supabase/migrations/008_fraud_referral_audit_hardening.sql
   ```
3. Restore table data from logical backup dump:
   ```bash
   pg_restore --clean --if-exists -h <SUPABASE_DB_HOST> -U postgres -d postgres finexj_backup.dump
   ```

---

## 4. Post-Restoration Data Verification & Reconciliation

Before reopening user traffic, verify financial and relational integrity:

1. **Reconcile User Balances vs Ledger Journal**:
   - Execute the database audit verification routine `SELECT verify_data_integrity();` or run the automated test suite (`POST /api/tests/run` or via internal CLI) to verify that:
     $$\text{Available Balance} = \sum(\text{Confirmed Deposits}) + \sum(\text{Credited Earnings}) - \sum(\text{Paid/Held Withdrawals}) + \sum(\text{Admin Adjustments})$$
2. **Blockchain Transaction Hash Uniqueness**:
   - Confirm zero duplicate transaction hashes across `deposits` and `withdrawals`.
3. **Daily Performance Sequence Integrity**:
   - Verify date continuity in `daily_performances` with zero missing distribution days.
4. **Ledger Row Count & Hash Verification**:
   - Confirm total ledger entries match recorded financial transactions.

---

## 5. Migration Safety & Bad Migration Rollback

### Migration Safety Rules
- All DDL statements must be wrapped in `DO $$ BEGIN ... END $$;` blocks or use `IF NOT EXISTS` / `IF EXISTS`.
- **Strictly Prohibited in Automated Production Scripts**:
  - `DROP TABLE` without multi-party authorization.
  - `DROP COLUMN` on financial tables (`deposits`, `withdrawals`, `ledger`, `earnings`, `users`).
  - Destructive data truncation or hard deletes on financial journals.

### Rollback Strategy
1. **Forward-Fix Strategy (Preferred)**:
   - For non-destructive schema errors, deploy an incremental additive migration (e.g., `009_fix_...sql`) that safely adjusts constraints, views, or functions without dropping underlying tables.
2. **Targeted DDL Rollback**:
   - Revert stored procedure definitions or drop problematic non-financial indexes using an explicit rollback script.
3. **PITR Rollback**:
   - If destructive data loss occurred, execute PITR to the pre-migration timestamp.

---

## 6. Access Control & Authorization Matrix

- **Disaster Recovery Operations**: Restricted exclusively to **Super Admin** and **Lead Infrastructure Engineer** with Multi-Factor Authentication (MFA/TOTP) enabled.
- **Production Credentials Policy**:
  - Zero hardcoded database passwords or service role keys in source code or documentation.
  - All credentials injected dynamically via secured server environment variables.
