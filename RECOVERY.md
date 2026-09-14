# FINEXJ Production Database Backup, Disaster Recovery & Financial Reconciliation Runbook

> **Audit & Revision Status**: STEP 37 Final Production Readiness + Launch Audit (September 2026)  
> **Classification**: Authoritative System Runbook & Recovery Specifications  
> **Environment**: Supabase Managed PostgreSQL (v15+) / Express / Vite / Node.js  

---

## 1. Overview & Recovery Architecture

FINEXJ operates as a high-integrity, double-entry financial platform. All asset mutations (deposits, yield distributions, referral commissions, withdrawals, fee retentions, operational allocations) are authored and verified against an authoritative relational database in Supabase PostgreSQL.

### Core Architectural Components
1. **14 Core Relational Tables**:
   - `users`: Investor profiles, roles, security credentials (bcrypt hashes, TOTP 2FA), account status, voluntary/mandatory fund locks.
   - `deposits`: Blockchain deposit records with verified BEP-20 transaction hashes, block numbers, confirmation counts, and lock periods.
   - `withdrawals`: Withdrawal requests, destination BEP-20 addresses, fee deductions, terminal statuses (`pending`, `under_review`, `approved`, `processing`, `paid`, `rejected`, `cancelled`), and payout transaction hashes.
   - `earnings`: Daily yield distributions with date, compounding principal base, rate, and credited amounts.
   - `daily_performances`: Authoritative daily rate records, audited fund figures, and distribution execution timestamps with `UNIQUE(date)`.
   - `referrals`: 2-level referral relationship hierarchy (`referrer_id`, `referred_id`, `level`).
   - `referral_rewards`: L1 (5%) and L2 (2%) commission credits with unique constraint `(deposit_id, reward_level)`.
   - `ledger`: Immutable double-entry financial journal. All user balance changes have an exact corresponding entry.
   - `finexj_operational_ledger`: Immutable ledger tracking company retained withdrawal fees, operational inflows, and corporate capital movements.
   - `system_settings`: Platform-wide configurations (fee percentages, minimum deposit, required confirmations, wallet addresses).
   - `audit_logs`: Immutable forensic trail of all administrative and system events.
   - `fraud_signals`: Automated fraud heuristics (multi-accounting, rapid withdrawal cycling, wallet collisions).
   - `system_logs`: Diagnostic and application-level event logs.
   - `admin_messages`: Secure internal administrative and investor communications.

2. **15 Stored Procedures & Atomic Financial RPCs**:
   - `confirm_deposit_atomic`: Locks deposit and user records `FOR UPDATE`, verifies anti-replay, credits ledger, updates deposit status.
   - `create_withdrawal_atomic`: Locks user record `FOR UPDATE`, verifies available balance against active pending holds, creates withdrawal, journals negative hold.
   - `process_withdrawal_status_atomic`: Strictly enforces state machine transitions, locks withdrawal row `FOR UPDATE`, registers payout tx hash, collects operational fee.
   - `credit_referral_reward_atomic`: Atomically verifies eligibility, locks referrer `FOR UPDATE`, credits commission, journals ledger entry with duplicate suppression.
   - `distribute_daily_performance_atomic`: Acquires transaction advisory lock `pg_try_advisory_xact_lock`, computes point-in-time compounding base, credits earnings and ledger entries across all qualifying investors in a single ACID transaction.
   - `adjust_user_balance_atomic`: Exclusive user row-locking balance correction with immutable audit trail.
   - `adjust_finexj_operational_fund_atomic`: Atomic operational capital adjustment with double-entry journal records.
   - Analytical & Aggregation RPCs: `get_admin_accounting_summary`, `get_referral_accounting_summary`, `get_operational_fund_summary_aggregate`, `get_admin_dashboard_stats_aggregate`, `get_user_referral_eligibility`.
   - Tamper-Proofing Triggers: `prevent_ledger_tampering`, `prevent_operational_ledger_tampering`, `prevent_audit_log_tampering`.

3. **Sequential Migration Pipeline**:
   - Version-controlled across 22 sequential migrations (`supabase/migrations/001_initial_schema.sql` through `022_finexj_final_state_machine_rpc_hardening.sql`).
   - Purely additive and idempotent schema migrations ensuring deterministic reconstitution from bare metal.

---

## 2. Backup Strategy: Verified vs Documented Status

To uphold absolute audit integrity, backup mechanisms are categorized by what has been independently tested in code versus managed cloud platform capabilities:

| Backup Component | Implementation / Tool | Target SLA / Policy | Audit Verification Status |
|---|---|---|---|
| **Schema DDL & Stored Logic** | Git repository (`/supabase/migrations/001` - `022`) | Immutable, version-controlled | **VERIFIED**: 22 migrations parse cleanly and contain full schema definitions. |
| **Point-in-Time Recovery (PITR)** | Supabase Managed Continuous WAL Archival | Continuous streaming; target RPO <= 5m, RTO <= 60m | **DOCUMENTED (CLOUD DEPENDENCY)**: Managed by Supabase platform. Direct cloud snapshot hypervisor/console could not be independently verified from local container sandbox. |
| **Daily Physical Snapshots** | Supabase Automated Daily Backups | Nightly snapshot, 7 to 30 days retention | **DOCUMENTED (CLOUD DEPENDENCY)**: Managed by Supabase infrastructure. |
| **Logical Dumps (`pg_dump`)** | PostgreSQL Client Tools / Supabase CLI | On-demand / pre-deployment archive | **DOCUMENTED**: Standard PostgreSQL tool; requires external `pg_dump` client. |
| **Ledger Immutability** | Database Triggers (`trg_enforce_ledger_immutability`) | Immediate abort on `UPDATE` or `DELETE` | **VERIFIED**: Triggers reject destructive modifications to financial records. |
| **Anti-Replay Constraints** | Database Unique Indexes (`uq_deposits_tx_hash`, `uq_referral_rewards_deposit_level`) | Zero duplicate blockchain hashes or commissions | **VERIFIED**: Unique constraints prevent duplicate financial events at the database level. |

> **Audit Note on RPO and RTO**: Target metrics (RPO <= 5 minutes, RTO <= 60 minutes) are cloud vendor architectural objectives for Supabase Pro/Enterprise Point-in-Time Recovery. They have **not** been empirically measured via a live simulated failover drill in this environment and must be treated as architectural targets until an active production disaster drill is executed.

---

## 3. Step-by-Step Restoration Procedures

### Scenario A: Supabase Point-in-Time Recovery (PITR)
*Used in the event of catastrophic data corruption, malicious intrusion, or catastrophic accidental administrative data modification.*

1. **Declare Incident & Stop Ingress**:
   - Set application maintenance mode or route ingress traffic to a maintenance screen.
   - Halt scheduled workers and background cron jobs to prevent new ledger mutations.
2. **Determine Incident Timestamp ($T_{incident}$)**:
   - Query `audit_logs` or `system_logs` to find the exact UTC timestamp of the erroneous event:
     ```sql
     SELECT id, action, actor_id, reason, timestamp 
     FROM audit_logs 
     ORDER BY timestamp DESC 
     LIMIT 50;
     ```
   - Target recovery point: $T_{restore} = T_{incident} - 1 \text{ minute}$.
3. **Execute PITR via Supabase Console**:
   - Open **Supabase Dashboard** > Select Project > **Settings** > **Database** > **Backups**.
   - Select **Point-in-Time Recovery**.
   - Input the target UTC timestamp ($T_{restore}$).
   - Initiate the restore to a fresh database branch or the primary instance according to the cloud plan.
4. **Execute Post-Restoration Verification** (Section 4).
5. **Switch Connection Strings & Re-enable Services**:
   - Update `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in server environment configuration.
   - Restart backend instances.

---

### Scenario B: Clean Bare-Metal Migration Restoration (`psql`)
*Used to bring up a disaster recovery standby or reconstitute the database from zero.*

1. Create a fresh PostgreSQL 15+ database instance with the `uuid-ossp` and `pgcrypto` extensions enabled.
2. Execute all migrations strictly in sequential order:
   ```bash
   export PGDATABASE_URL="postgres://postgres:<PASSWORD>@<HOST>:5432/postgres"

   psql $PGDATABASE_URL -f supabase/migrations/001_initial_schema.sql
   psql $PGDATABASE_URL -f supabase/migrations/002_auth_security.sql
   psql $PGDATABASE_URL -f supabase/migrations/003_financial_constraints.sql
   psql $PGDATABASE_URL -f supabase/migrations/004_rls_policies.sql
   psql $PGDATABASE_URL -f supabase/migrations/005_atomic_functions.sql
   psql $PGDATABASE_URL -f supabase/migrations/006_production_hardening.sql
   psql $PGDATABASE_URL -f supabase/migrations/007_deposit_earnings_wallet_hardening.sql
   psql $PGDATABASE_URL -f supabase/migrations/008_fraud_referral_audit_hardening.sql
   psql $PGDATABASE_URL -f supabase/migrations/009_test_user_flag.sql
   psql $PGDATABASE_URL -f supabase/migrations/010_finexj_referral_accounting_hardening.sql
   psql $PGDATABASE_URL -f supabase/migrations/011_finexj_atomic_financial_logic.sql
   psql $PGDATABASE_URL -f supabase/migrations/012_finexj_final_financial_consistency.sql
   psql $PGDATABASE_URL -f supabase/migrations/013_finexj_atomic_referral_reward.sql
   psql $PGDATABASE_URL -f supabase/migrations/014_finexj_admin_accounting_aggregation.sql
   psql $PGDATABASE_URL -f supabase/migrations/015_finexj_atomic_daily_performance.sql
   psql $PGDATABASE_URL -f supabase/migrations/016_finexj_atomic_withdrawal_state_machine.sql
   psql $PGDATABASE_URL -f supabase/migrations/017_finexj_withdrawal_cancellation_and_perf_eligibility.sql
   psql $PGDATABASE_URL -f supabase/migrations/018_finexj_daily_compounding_base.sql
   psql $PGDATABASE_URL -f supabase/migrations/019_finexj_referral_eligibility_hardening.sql
   psql $PGDATABASE_URL -f supabase/migrations/020_finexj_confirm_deposit_eligibility_alignment.sql
   psql $PGDATABASE_URL -f supabase/migrations/021_finexj_database_rls_rpc_security_audit.sql
   psql $PGDATABASE_URL -f supabase/migrations/022_finexj_final_state_machine_rpc_hardening.sql
   ```
3. If restoring data from a logical backup dump:
   ```bash
   pg_restore --data-only --disable-triggers -h <HOST> -U postgres -d postgres finexj_data.dump
   ```
4. Execute Post-Restoration Financial Reconciliation (Section 4).

---

## 4. Post-Restoration Data Verification & Financial Reconciliation

Before reopening traffic to investors, the system must prove that the restored database is balanced to the fourth decimal digit (`0.0001` precision).

### A. Authoritative SQL Reconciliation Script
Execute the following query directly in `psql` or the Supabase SQL Editor:

```sql
WITH 
-- 1. Total Confirmed Inflows from Deposits
deposit_summary AS (
  SELECT 
    COALESCE(SUM(COALESCE(actual_amount, amount)), 0.0000) AS total_deposits
  FROM deposits
  WHERE status = 'confirmed'
),

-- 2. Total Net Payouts Dispatched on Blockchain
withdrawal_summary AS (
  SELECT 
    COALESCE(SUM(requested_amount), 0.0000) AS total_requested_wd,
    COALESCE(SUM(net_amount), 0.0000) AS total_net_payout,
    COALESCE(SUM(fee_amount), 0.0000) AS total_fees_collected
  FROM withdrawals
  WHERE status = 'paid'
),

-- 3. Operational Fund State
operational_summary AS (
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'withdrawal_fee' OR amount > 0 THEN amount ELSE 0 END), 0.0000) AS op_inflow,
    COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0.0000) AS op_outflow,
    COALESCE(SUM(amount), 0.0000) AS operational_fund_balance
  FROM finexj_operational_ledger
),

-- 4. User Available Balances Calculated via Ledger
user_balances AS (
  SELECT 
    user_id,
    COALESCE(SUM(amount), 0.0000) AS current_balance
  FROM ledger
  GROUP BY user_id
),
total_user_equity AS (
  SELECT 
    COALESCE(SUM(current_balance), 0.0000) AS total_user_available_balances
  FROM user_balances
),

-- 5. Anti-Replay Uniqueness Verification
hash_uniqueness AS (
  SELECT 
    (SELECT COUNT(*) FROM deposits GROUP BY LOWER(TRIM(tx_hash)) HAVING COUNT(*) > 1) AS duplicate_deposit_hashes,
    (SELECT COUNT(*) FROM withdrawals WHERE tx_hash IS NOT NULL GROUP BY LOWER(TRIM(tx_hash)) HAVING COUNT(*) > 1) AS duplicate_withdrawal_hashes
)

SELECT 
  d.total_deposits,
  w.total_net_payout,
  w.total_fees_collected,
  o.operational_fund_balance,
  u.total_user_available_balances,
  -- Net System Capital = Deposits + OpInflow - NetPayouts - OpOutflow
  (d.total_deposits + o.op_inflow - w.total_net_payout - o.op_outflow) AS net_system_capital,
  -- Recorded Liabilities & Equity = User Balances + Operational Fund Balance
  (u.total_user_available_balances + o.operational_fund_balance) AS recorded_liabilities_and_equity,
  -- Reconciliation Difference (MUST BE 0.0000)
  ((d.total_deposits + o.op_inflow - w.total_net_payout - o.op_outflow) - (u.total_user_available_balances + o.operational_fund_balance)) AS reconciliation_difference,
  CASE 
    WHEN ABS((d.total_deposits + o.op_inflow - w.total_net_payout - o.op_outflow) - (u.total_user_available_balances + o.operational_fund_balance)) <= 0.0001
    THEN 'BALANCED' 
    ELSE 'REQUIRES_REVIEW' 
  END AS financial_integrity_status,
  COALESCE(h.duplicate_deposit_hashes, 0) AS duplicate_deposit_hashes,
  COALESCE(h.duplicate_withdrawal_hashes, 0) AS duplicate_withdrawal_hashes
FROM deposit_summary d
CROSS JOIN withdrawal_summary w
CROSS JOIN operational_summary o
CROSS JOIN total_user_equity u
CROSS JOIN hash_uniqueness h;
```

### B. Programmatic API Health Check
Invoke the administrative reconciliation endpoint:
```bash
curl -X GET https://<API_HOST>/api/admin/accounting/summary \
  -H "Authorization: Bearer <ADMIN_SESSION_TOKEN>"
```
Verify that `verify_data_integrity` confirms `reconciliationStatus === "BALANCED"` and `reconciliationDifference === 0.0000`.

---

## 5. Failure Modes & State Recovery

### A. Withdrawal Recovery Across Payout Phases
When recovering during withdrawal operations, the system enforces non-ambiguous state transitions:

1. **Failure BEFORE On-Chain Payout**:
   - *State*: Withdrawal record is `pending`, `under_review`, `approved`, or `processing`. The requested funds are held in `ledger` (`withdrawal_request`), reducing available balance.
   - *Treasury Status*: Funds remain in the treasury wallet.
   - *Recovery*: System restarts. Payout has not occurred. The withdrawal remains safely in its pre-payout state until an administrator processes or cancels it. No money is lost.
2. **Failure DURING On-Chain Payout (Broadcast in-flight)**:
   - *State*: Transaction broadcast to BSC nodes, but node response or confirmation was interrupted.
   - *Recovery*: The treasury administrator inspects the treasury wallet on BscScan using the destination address and exact amount.
     - If the transaction confirmed on BSC: Copy the on-chain `txHash` and update the withdrawal status to `paid`.
     - If the transaction was never broadcast or dropped: Retry broadcast or reject the request.
3. **Failure AFTER Payout, BEFORE Database Confirmation**:
   - *State*: The on-chain payout succeeded with a valid TxID, but the database connection failed before `process_withdrawal_status_atomic` could transition the record to `paid`.
   - *Recovery*: Administrator enters the TxID into `updateWithdrawalStatusAsync`. The verification service executes `verifyBEP20PayoutTx`, validating that the TxID is valid on BSC, sent `net_amount` USDT to the exact destination wallet, and has not been used anywhere else. `process_withdrawal_status_atomic` atomically transitions the status to `paid`, writes the operational fee entry (`WD-FEE-<id>`), and commits. The payout record is preserved and double payment is blocked.
4. **Failure AFTER Payout and AFTER Database Confirmation**:
   - *State*: `status = 'paid'`, `tx_hash` recorded, fee collected.
   - *Recovery*: The record is in a terminal immutable state. Replays or duplicates are rejected immediately with an HTTP 400 error.

### B. Daily Earnings Yield Recovery & Backfills
If the daily performance distribution fails midway due to a server crash, database outage, or worker interruption:
- **Transaction Rollback**: `distribute_daily_performance_atomic` runs in a single ACID transaction protected by `pg_try_advisory_xact_lock(hashtext('finexj_daily_perf_' || p_date))`. If an outage occurs midway, PostgreSQL rolls back all partial insertions automatically.
- **Duplicate Prevention**: If the distribution completed before the crash, `daily_performances` enforces `UNIQUE(date)`. Any subsequent worker invocation aborts with `"A performance record already exists for date..."`.
- **Missed Day Recovery (Backfill)**: To catch up on missed days after prolonged outages, administrators invoke the daily performance endpoint with the historical date:
  ```bash
  POST /api/admin/daily-performance
  {
    "date": "YYYY-MM-DD",
    "applicableRate": 0.0050,
    "overwriteExisting": false
  }
  ```
  The function computes compounding principal bases using balances strictly prior to that calendar date, ensuring retroactively accurate yield distribution.

### C. Referral Reward Recovery
- **Constraint-Enforced Idempotency**: `referral_rewards` enforces `CONSTRAINT uq_referral_rewards_deposit_level UNIQUE (deposit_id, reward_level)`.
- **Deduplicated Credit**: `credit_referral_reward_atomic` handles `unique_violation` gracefully. If a deposit confirmation is retried during recovery, existing rewards are returned idempotently without double-crediting balances or creating redundant ledger rows.

### D. Blockchain Deposit Reconciliation
- If an investor deposited funds to FINEXJ's treasury wallet but the database was offline or the browser crashed before submission:
  - The transaction remains permanently recorded on BNB Smart Chain.
  - When the user or administrator submits the TxID upon recovery, `verifyBEP20Deposit` queries BSC RPC, decodes the `Transfer` log, verifies destination wallet and USDT contract, and confirms the deposit atomically.
  - `uq_deposits_tx_hash` prevents any other user from claiming the same transaction hash.

---

## 6. Disaster Scenarios & Incident Response Matrix

| Scenario | Detection Mechanism | Recovery Action | Financial Risk | Manual Intervention Required? |
|---|---|---|---|---|
| **A. Database Corruption** | PostgreSQL connection errors, I/O errors in `system_logs` | Execute Supabase Point-in-Time Recovery (PITR) to pre-corruption timestamp | Zero (immutable WAL roll forward) | **Yes**: Trigger PITR in Supabase console; execute reconciliation query |
| **B. Accidental Record Deletion** | Audit log alerts, user balance discrepancy in `/api/admin/accounting/summary` | Query PITR or audit logs; restore via PITR branch or insert corrective ledger entry | Low (ledger has immutability triggers preventing raw deletes) | **Yes**: Database admin investigation; reconciliation audit |
| **C. Bad Migration Execution** | Schema migration failure, API 500 errors on atomic RPCs | Apply forward-fix migration (`022_...sql`) or rollback stored procedure definition | Low (financial tables are not dropped by migrations) | **Yes**: Deploy corrective migration script |
| **D. Application Deployment Failure** | Container startup crash, health check failure on `/api/health` | Roll back Cloud Run / Vercel container to previous build artifact | Zero (database state remains isolated and untouched) | **Yes**: Re-deploy previous Git commit |
| **E. Supabase Infrastructure Outage** | 502/503 HTTP responses on all API routes | Platform auto-recovery; if prolonged, restore logical dump to standby PostgreSQL instance | Zero (ACID persistence ensures no half-written transactions) | **Yes** (if switching connection strings to standby DB) |
| **F. Blockchain RPC Outage** | RPC timeout warnings in `logger`, deposit verification timeouts | System fails over automatically to backup RPC endpoints configured in `BSC_FALLBACK_RPC_URLS` | Zero (unconfirmed deposits remain pending until verified) | **No** (automatic fallback; manual if all public RPCs fail) |
| **G. Duplicate Worker Execution** | Concurrent requests detected in application logs | Blocked by PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) and `UNIQUE` constraints | Zero (concurrency locks abort duplicate runs) | **No** (automatically rejected by database engine) |
| **H. Lost Application Deployment** | Deployment deleted in cloud console | Re-build directly from GitHub repository main branch (`npm run build`) | Zero (code is fully version-controlled; secrets stored in env) | **Yes**: Trigger deployment from CI/CD or cloud console |
| **I. Compromised Credential** | Unauthorized logins in `audit_logs`, abnormal admin adjustments | Rotate `SUPABASE_SERVICE_ROLE_KEY` and `SESSION_SECRET` immediately; terminate active sessions | High if undetected; contained by immutable audit logs and 2FA | **Yes**: Rotate cloud secrets; audit transactions |
| **J. Partial Payout Failure** | On-chain transfer broadcast fails or drops from mempool | Re-verify on BscScan. If failed, cancel/refund withdrawal in system. If confirmed, update status with TxID | Zero (funds are either on-chain or held in system) | **Yes**: Admin verifies on BscScan and updates status |

---

## 7. 14-Step Incident Response & Disaster Recovery Runbook

When a critical production failure occurs, follow this sequence strictly:

1. **Detect Incident**: Identify the anomaly via automated monitoring, failed reconciliation checks (`reconciliationStatus: REQUIRES_REVIEW`), or infrastructure alerts.
2. **Stop Unsafe Financial Processing**:
   - If active financial corruption is occurring, immediately restrict ingress traffic or pause background processors to halt further ledger entries.
3. **Identify Recovery Point**:
   - Review `audit_logs` to establish the precise UTC timestamp prior to the incident ($T_{restore}$).
4. **Restore Database**:
   - Execute Point-in-Time Recovery in the Supabase management console or apply sequential migrations to a standby database.
5. **Verify Schema & Migrations**:
   - Ensure all 22 migrations are present and all 15 atomic RPCs are registered with correct permissions.
6. **Verify Financial Reconciliation**:
   - Execute the SQL Reconciliation Script (Section 4A). Confirm `reconciliation_difference = 0.0000` and `financial_integrity_status = 'BALANCED'`.
7. **Verify Blockchain Transactions**:
   - Check `deposits` and `withdrawals` for transaction hash uniqueness and confirmation status.
8. **Verify Balances**:
   - Confirm that sum of ledger entries equals user available balances across all active accounts.
9. **Verify Withdrawal State**:
   - Audit all withdrawals in `processing` or `pending` state; verify whether any corresponding on-chain payouts were executed during the incident window.
10. **Verify Referral & Earnings State**:
    - Confirm continuity of `daily_performances` dates. If any dates were missed during downtime, schedule sequential backfills.
11. **Deploy Application**:
    - Deploy the verified stable application build to production with restored connection strings.
12. **Run Smoke Tests**:
    - Execute the automated test suite (`POST /api/tests/run`) and verify core authentication, deposit submission, and withdrawal flows.
13. **Re-enable Financial Processing**:
    - Lift maintenance restrictions and restore full platform traffic.
14. **Record Incident & Audit Information**:
    - Document the root cause, recovery timeline, reconciliation delta (if any), and corrective measures in `audit_logs` and post-mortem reports.

---

## 8. Secrets & Environment Configuration Recovery

The following minimum production secrets are required to reconstitute a fully operational FINEXJ instance:

| Variable | Description | Purpose | Exposure Risk |
|---|---|---|---|
| `SUPABASE_URL` | Supabase project API URL | Authoritative database connection | Medium (Server-only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase administrative secret key | Bypasses RLS for secure backend financial RPCs | **CRITICAL (Server-only)** |
| `SESSION_SECRET` | Cryptographic secret (minimum 32 characters) | Signs HTTP session cookies | **CRITICAL (Server-only)** |
| `BSC_RPC_URL` | Primary BNB Smart Chain JSON-RPC URL | Real on-chain transfer verification | Low |
| `BSC_FALLBACK_RPC_URLS` | Comma-delimited list of fallback BSC RPCs | Failover resilience during network partitions | Low |
| `BSC_USDT_CONTRACT_ADDRESS` | Canonical BEP-20 USDT contract address | Validates incoming/outgoing token contracts | Low (`0x55d398326f99059fF775485246999027B3197955`) |
| `BSC_DEPOSIT_WALLET_ADDRESS` | FINEXJ Treasury deposit address | Destination validation for investor deposits | Low (Public on-chain address) |
| `NODE_ENV` | Environment flag (`production`) | Enforces production security invariants | Low |

> **Security Mandate**: Never store production secrets in Git, client-side bundles, or unencrypted local files. Secrets must be managed strictly through cloud secrets management or environment variable injection at runtime.
