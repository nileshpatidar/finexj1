# FINEXJ Production Database Backup, Disaster Recovery & Financial Reconciliation Runbook

> **Audit & Revision Status**: STEP 49 Final Recovery, Backup & Disaster-Recovery Verification (September 2026)  
> **Classification**: Authoritative System Runbook, Failure Modes & Disaster Recovery Specifications  
> **Environment**: Supabase Managed PostgreSQL (v15+) / Express / Vite / Node.js / BNB Smart Chain (BSC)  

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
   - Version-controlled across 23 sequential migrations (`supabase/migrations/001_initial_schema.sql` through `023_finexj_step48_performance_concurrency_indexes.sql`).
   - Purely additive and idempotent schema migrations ensuring deterministic reconstitution from bare metal.

---

## 2. Backup Strategy: Categorized Verification Matrix

To uphold absolute audit integrity, backup mechanisms are categorized by the four authoritative tiers: **CONFIGURED**, **DOCUMENTED**, **TESTED**, and **UNVERIFIED**.

| Backup Mechanism | Tool / Infrastructure | Configuration Details | Audit Verification Status |
|---|---|---|---|
| **Schema DDL & Stored Logic** | Git repository (`/supabase/migrations/001` - `023`) | 23 version-controlled SQL migrations with deterministic order | **CONFIGURED & TESTED**: All 23 migrations verified non-empty, syntactically valid, and sequential in automated test suite. |
| **Ledger Immutability Engine** | Database Triggers (`trg_immutable_ledger`, `trg_immutable_audit_logs`, `trg_immutable_op_ledger`) | Immediate `RAISE EXCEPTION` on any `UPDATE` or `DELETE` at PostgreSQL engine level | **CONFIGURED & TESTED**: Migration 021 triggers verified to actively block tampering. |
| **Anti-Replay Invariants** | Unique Database Constraints (`uq_deposits_tx_hash`, `uq_withdrawals_tx_hash`, `uq_referral_rewards_deposit_level`) | Enforced by PostgreSQL B-Tree unique indexes | **CONFIGURED & TESTED**: Automated test suite confirms duplicate transactions and commission replay are rejected. |
| **Point-in-Time Recovery (PITR)** | Supabase Continuous WAL Archival | Write-Ahead Log streaming; theoretical RPO <= 5m, RTO <= 60m | **DOCUMENTED (CLOUD PLATFORM DEPENDENCY)**: Configured in Supabase Pro tier; hypervisor snapshot console cannot be directly executed from local development container. |
| **Daily Physical Backups** | Supabase Automated Daily Snapshots | Nightly physical snapshot with 7 to 30 days retention | **DOCUMENTED (CLOUD PLATFORM DEPENDENCY)**: Standard platform feature; snapshot storage managed by Supabase infrastructure. |
| **Logical Dumps (`pg_dump`)** | PostgreSQL Client Tools / Supabase CLI | `pg_dump -Fc` pre-deployment and on-demand cold archive | **DOCUMENTED**: Standard PostgreSQL utility; operational runbook instructions provided. |
| **Backup Encryption & Access** | Supabase AWS KMS / AES-256 at rest | Storage encrypted with customer-isolated keys; restricted IAM roles | **DOCUMENTED (CLOUD PLATFORM DEPENDENCY)**: Standard cloud vendor encryption guarantees. |
| **Backup Failure Alerting** | Supabase Cloud Monitoring & Health Webhooks | Automated notification if WAL archival lag exceeds SLA | **UNVERIFIED**: Vendor webhook alerting cannot be stimulated without simulating infrastructure faults. |

> **Audit Directive**: Target metrics (RPO <= 5 minutes, RTO <= 60 minutes) are cloud vendor architectural objectives for Supabase Point-in-Time Recovery. They have **not** been empirically measured via an unannounced production disaster drill and must be treated as architectural targets.

---

## 3. Step-by-Step Restoration Procedures

### Scenario A: Supabase Point-in-Time Recovery (PITR)
*Used in the event of catastrophic data corruption, malicious intrusion, or catastrophic accidental administrative data modification.*

1. **Declare Incident & Halt Ingress**:
   - Immediately set application maintenance mode or route ingress traffic to a maintenance screen.
   - Stop background workers, cron schedulers, and payment webhooks to freeze state mutations.
2. **Determine Incident Timestamp ($T_{incident}$)**:
   - Query `audit_logs` or `system_logs` to pinpoint the exact UTC timestamp of the erroneous event:
     ```sql
     SELECT id, action, actor_id, reason, created_at 
     FROM audit_logs 
     ORDER BY created_at DESC 
     LIMIT 50;
     ```
   - Target recovery point: $T_{restore} = T_{incident} - 1 \text{ minute}$.
3. **Execute PITR via Supabase Console**:
   - Open **Supabase Dashboard** > Select Project > **Settings** > **Database** > **Backups**.
   - Select **Point-in-Time Recovery**.
   - Input the target UTC timestamp ($T_{restore}$).
   - Initiate the restore to a fresh database branch or the primary instance.
4. **Execute Post-Restoration Verification** (Section 4).
5. **Switch Connection Strings & Re-enable Services**:
   - Update `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in server environment configuration.
   - Restart backend instances.

---

### Scenario B: Clean Bare-Metal Migration Restoration (`psql`)
*Used to bring up a disaster recovery standby or reconstitute the database from zero.*

1. Create a fresh PostgreSQL 15+ database instance with `uuid-ossp` and `pgcrypto` extensions enabled.
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
   psql $PGDATABASE_URL -f supabase/migrations/023_finexj_step48_performance_concurrency_indexes.sql
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
    COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount ELSE 0 END), 0.0000) AS op_inflow,
    COALESCE(SUM(CASE WHEN direction = 'outflow' THEN amount ELSE 0 END), 0.0000) AS op_outflow,
    COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount ELSE -amount END), 0.0000) AS operational_fund_balance
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

## 5. Financial Operation Recovery (Detailed Failure Scenarios A–I)

The following analysis details the exact expected database state, retry behavior, idempotency mechanisms, and reconciliation procedure for all primary financial failure modes:

### Scenario A: Deposit verified on-chain, but DB transaction fails (network split / timeout)
- **Expected Database State**: Deposit record remains in `status = 'pending'`. Ledger has not been credited. Referral rewards have not been created.
- **Retry Behavior**: Investor or background worker re-triggers deposit verification with the existing deposit ID and TxHash.
- **Idempotency**: `confirm_deposit_atomic` executes under an exclusive row lock (`SELECT ... FOR UPDATE`). Since the record is still `pending`, it verifies the on-chain transfer and confirms cleanly on retry.
- **Reconciliation Procedure**: Unconfirmed deposits remain visible in `/admin/deposits` with their on-chain TxHash. Administrators can click "Verify On-Chain" to query the BSC node and complete confirmation.

### Scenario B: DB confirms deposit, but response to client is lost
- **Expected Database State**: Deposit is `status = 'confirmed'`, ledger entry exists (`deposit`, `+amount`), referrer rewards are credited.
- **Retry Behavior**: Client reconnects and retries the confirmation API call with the same deposit ID / TxHash.
- **Idempotency**: `confirm_deposit_atomic` acquires the lock, sees `v_dep.status = 'confirmed'`, and returns `{ success: false, error: 'Deposit is already confirmed', is_duplicate: true }`. The API endpoint intercepts `is_duplicate` and returns `200 OK` with the existing confirmed deposit record.
- **Reconciliation Procedure**: Zero duplicate ledger credits. Unique constraint `uq_deposits_tx_hash` also prevents claiming the TxHash under a separate deposit record.

### Scenario C: Withdrawal created, but response is lost
- **Expected Database State**: Withdrawal record is created in `status = 'pending'`. Hold ledger entry is recorded (`withdrawal_request`, `-amount`). Available balance is decremented by the requested amount.
- **Retry Behavior**: Client retries withdrawal creation.
- **Idempotency**: `create_withdrawal_atomic` locks the user record `FOR UPDATE` and reads the updated balance. If available balance is insufficient, the retry is rejected with `INSUFFICIENT_FUNDS`. In-memory user withdrawal mutex and single-pending policy prevent parallel duplicate submission.
- **Reconciliation Procedure**: User or admin reviews `/account/withdrawals` or `/admin/withdrawals`. If an accidental duplicate was created, admin cancels the redundant pending withdrawal, triggering `process_withdrawal_status_atomic(p_status := 'cancelled')` which refunds the hold via double-entry journal entry (`withdrawal_refund`, `+amount`).

### Scenario D: Payout succeeds on blockchain, but application times out before recording
- **Expected Database State**: Withdrawal remains in `status = 'processing'`. Net funds left treasury on BSC, but database has not recorded `tx_hash` or transitioned to `paid`.
- **Retry Behavior**: Admin verifies the payout on BscScan, copies the confirmed TxID, and submits it in `/admin/withdrawals` -> "Mark Paid".
- **Idempotency**: `verifyBEP20PayoutTx` validates the TxID on BSC (recipient address, token contract, exact net amount), checks anti-replay across existing withdrawals (`uq_withdrawals_tx_hash`), and `process_withdrawal_status_atomic` atomically transitions status from `processing` to `paid`, writes the fee entry `WD-FEE-<id>` to the operational ledger, and commits.
- **Reconciliation Procedure**: Replay attempts with the same TxID are blocked by `uq_withdrawals_tx_hash`. The withdrawal is marked paid exactly once and fee is collected once.

### Scenario E: Payout fails after withdrawal processing begins (dropped mempool / out-of-gas)
- **Expected Database State**: Withdrawal remains in `status = 'processing'`. Funds remain in held state (`withdrawal_request` ledger entry).
- **Retry Behavior**: Admin inspects BSC mempool. If transaction reverted or dropped, admin re-broadcasts with appropriate gas or rejects/cancels the withdrawal.
- **Idempotency**: Transitioning from `processing` to `rejected` or `cancelled` triggers `process_withdrawal_status_atomic` to refund the held amount to user balance via a double-entry refund entry (`withdrawal_refund`, `+amount`).
- **Reconciliation Procedure**: Operational accounting remains balanced; no funds leave treasury on-chain, and user balance is restored.

### Scenario F: Withdrawal cancellation races with payout
- **Expected Database State**: Withdrawal is either `paid` or `cancelled`, strictly mutually exclusive.
- **Retry Behavior**: Whichever transaction acquires `SELECT ... FROM withdrawals WHERE id = p_id FOR UPDATE` commits first.
- **Idempotency**:
  - If payout commits first: status becomes `paid`. The cancellation attempt reads `v_wd.status = 'paid'`, checks allowed state transitions, and throws: `"Invalid status transition from paid to cancelled"`.
  - If cancellation commits first: status becomes `cancelled` and funds are refunded. The payout attempt reads `v_wd.status = 'cancelled'` and throws: `"Invalid status transition from cancelled to paid"`.
- **Reconciliation Procedure**: Zero race condition window; PostgreSQL row locking provides deterministic mutual exclusion.

### Scenario G: Daily earnings job stops midway (server crash / network split during multi-user distribution)
- **Expected Database State**: All partial insertions are automatically aborted by PostgreSQL; zero partial yield rows exist.
- **Retry Behavior**: Worker or administrator re-triggers distribution for that calendar date.
- **Idempotency**: `distribute_daily_performance_atomic` runs in an ACID transaction protected by `pg_try_advisory_xact_lock`. If interrupted, PostgreSQL aborts the transaction. When re-run, if the previous run aborted, no row exists in `daily_performances` and the distribution executes cleanly. If the previous run completed before the crash, `UNIQUE(date)` blocks duplicate execution.
- **Reconciliation Procedure**: Re-run Section 4A reconciliation query. If difference is 0.0000, distribution is either fully committed or cleanly absent.

### Scenario H: Referral reward processing stops midway (L1 credited, L2 fails / crashes)
- **Expected Database State**: L1 reward exists in `referral_rewards` and referrer ledger is credited. L2 record does not yet exist.
- **Retry Behavior**: Confirmation process or reward retry worker executes for that deposit.
- **Idempotency**: `referral_rewards` enforces `CONSTRAINT uq_referral_rewards_deposit_level UNIQUE (deposit_id, reward_level)`. On retry, L1 is detected as existing and skipped without duplicate ledger credit; L2 is evaluated, credited, and recorded cleanly.
- **Reconciliation Procedure**: Audit `/admin/referrals/rewards`. Each qualified downline deposit has at most one L1 row and one L2 row.

### Scenario I: Admin balance adjustment succeeds, but UI times out
- **Expected Database State**: Adjustment is committed in `ledger` or `finexj_operational_ledger`, and an audit log is recorded with actor ID, reason, and reference ID.
- **Retry Behavior**: Administrator checks `/admin/accounting/summary` and `/admin/audit-logs` before taking further action.
- **Idempotency**: Admin adjustments accept an optional idempotency reference key (`ADJ-<timestamp>-<reason>`).
- **Reconciliation Procedure**: If an accidental duplicate adjustment was submitted, an offsetting adjustment (`correction`) is logged with an audit note. Raw deletes of ledger rows are forbidden by database triggers.

---

## 6. Blockchain Reconciliation & Orphan Detection

The system maintains continuous parity between on-chain BNB Smart Chain events and internal ledger state:

1. **Confirmed Depositsparities**:
   - `deposits.tx_hash` is indexed with `LOWER(TRIM(tx_hash))` under unique index `uq_deposits_tx_hash`.
   - BSC RPC node verifies: block confirmations >= `BSC_REQUIRED_CONFIRMATIONS` (12), token contract address matches `BSC_USDT_CONTRACT_ADDRESS`, transfer destination matches `BSC_DEPOSIT_WALLET_ADDRESS`, and transaction receipt status is `1` (success).
2. **Payout Transactions**:
   - `withdrawals.tx_hash` is indexed under unique index `uq_withdrawals_tx_hash`.
   - On-chain payout verification validates that destination address matches `withdrawals.destination_address` and transfer amount matches `withdrawals.net_amount`.
3. **Orphan & Ambiguous Transaction Detection**:
   - **Unregistered Direct On-Chain Transfers (Orphaned Deposits)**: When users send USDT directly to the treasury address without submitting through the web interface, the transaction exists on BSC but has no corresponding row in `deposits`.
     - *Detection*: Query BSC explorer for all incoming ERC-20 `Transfer` events to `BSC_DEPOSIT_WALLET_ADDRESS` and diff against `SELECT LOWER(TRIM(tx_hash)) FROM deposits`.
     - *Resolution*: Admin registers the deposit on behalf of the verified investor or tags it in treasury reserves.
   - **Mempool Dropped Payouts**: Payout transaction submitted with low gas drops from BSC mempool.
     - *Detection*: Withdrawal remains in `processing` for > 30 minutes with no on-chain receipt found on BSC RPC.
     - *Resolution*: Admin cancels/rejects the withdrawal to restore the user's balance, or re-broadcasts with updated gas price.
   - **Blockchain Reorganizations**: BSC has deterministic finality after 15 blocks. By enforcing `BSC_REQUIRED_CONFIRMATIONS = 12` (with full finality at 15), deposits are shielded from shallow reorganization forks.

---

## 7. Secrets & Access Recovery Procedures

When credentials or access keys are rotated or suspected compromised, follow these exact procedures:

### A. Rotating `SESSION_SECRET`
- **Impact**: Immediately invalidates all active session cookies across all running backend instances.
- **Data Integrity**: Zero database modification or user credential impact; stored passwords and 2FA secrets remain intact.
- **Procedure**:
  1. Generate a new cryptographically random 64-character secret: `openssl rand -hex 32`.
  2. Update `SESSION_SECRET` in production environment variables (Cloud Run, Vercel, or container configuration).
  3. Restart backend service instances.
  4. All connected users and administrators must log in again with password and 2FA.

### B. Rotating Supabase Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`)
- **Impact**: Backend database connection will be refused if old key is terminated before new key is deployed.
- **Procedure**:
  1. Generate a new Service Role Key in Supabase Dashboard > **Settings** > **API**.
  2. Update `SUPABASE_SERVICE_ROLE_KEY` in server environment configuration.
  3. Restart server instances.
  4. Revoke the old key in Supabase Dashboard once all instances confirm healthy connectivity on `/api/health`.

### C. Rotating Blockchain RPC Provider (`BSC_RPC_URL`)
- **Impact**: Zero downtime if fallback RPCs are configured.
- **Procedure**:
  1. Update `BSC_RPC_URL` and `BSC_FALLBACK_RPC_URLS` in server environment variables.
  2. Restart server. The system automatically verifies RPC latency and block height upon startup.

### D. Compromised Administrator Account Containment
- **Impact**: Prevents malicious administrative actions while preserving forensic history.
- **Procedure**:
  1. Immediately execute emergency account suspension:
     ```sql
     UPDATE users 
     SET status = 'suspended', two_factor_enabled = false 
     WHERE id = :compromised_admin_id;
     ```
  2. Invalidate all active sessions immediately by rotating `SESSION_SECRET`.
  3. Inspect forensic trail:
     ```sql
     SELECT id, action, actor_role, target_user_id, reason, reference_id, created_at 
     FROM audit_logs 
     WHERE actor_id = :compromised_admin_id 
     ORDER BY created_at DESC;
     ```
  4. Review `/api/admin/accounting/summary` to verify no unauthorized operational fund or user adjustments occurred. If unauthorized adjustments are found, log offsetting corrective entries with forensic notes.

---

## 8. Incident Response Protocol & Isolation Order

When an anomaly or security alert is detected, the **Isolation Order** determines what must be disabled or isolated FIRST:

### Emergency Isolation Priority Order
```text
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. HALT WITHDRAWAL PAYOUTS & PROCESSING (Protect Treasury Assets)       │
│    Set system_settings: withdrawals_enabled = false                    │
├─────────────────────────────────────────────────────────────────────────┤
│ 2. HALT BALANCE ADJUSTMENTS & PERFORMANCE DISTRIBUTION                 │
│    Suspend daily cron jobs; lock finexj_operational_ledger mutations    │
├─────────────────────────────────────────────────────────────────────────┤
│ 3. HALT INGRESS SESSIONS / ROTATE SESSION_SECRET (Block Attackers)      │
│    Terminate active sessions; isolate compromised IP/user accounts     │
├─────────────────────────────────────────────────────────────────────────┤
│ 4. EXECUTE FORENSIC AUDIT & RECONCILIATION QUERY (Assess State)        │
│    Run Section 4A query; verify reconciliationDifference == 0.0000     │
├─────────────────────────────────────────────────────────────────────────┤
│ 5. RESTORE OR REPAIR FROM IMMUTABLE LOGS / PITR (Repair)                │
│    Apply corrective journal entries or execute point-in-time restore    │
├─────────────────────────────────────────────────────────────────────────┤
│ 6. RE-ENABLE PROCESSING IN REVERSE ORDER (Careful Reopening)           │
│    Smoke test -> Deposits -> Compounding -> Withdrawals                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Data Retention & Immutability Guarantees

To ensure that financial history can never disappear through administrative error, accidental deletion, or user actions:

1. **Foreign Key Cascade Elimination**:
   - In Migration 021, all foreign keys from financial tables to `users` and between financial entities were converted to `ON DELETE RESTRICT`:
     - `fk_deposits_user_id`: `ON DELETE RESTRICT`
     - `fk_withdrawals_user_id`: `ON DELETE RESTRICT`
     - `fk_earnings_user_id`: `ON DELETE RESTRICT`
     - `fk_ledger_user_id`: `ON DELETE RESTRICT`
     - `fk_referral_rewards_referrer_id`: `ON DELETE RESTRICT`
     - `fk_referral_rewards_deposit_id`: `ON DELETE RESTRICT`
   - *Result*: Attempting to execute `DELETE FROM users WHERE id = :id` for any investor with transaction history will immediately fail with a foreign key violation.
2. **Zero HTTP DELETE Routes**:
   - An architectural audit confirms that the Express application defines **0 HTTP DELETE endpoints**. No user, deposit, withdrawal, transaction, referral, or ledger record can be deleted via any API route.
3. **PostgreSQL Trigger Immutability**:
   - `trg_immutable_ledger`, `trg_immutable_audit_logs`, and `trg_immutable_op_ledger` actively intercept any SQL `UPDATE` or `DELETE` statements and throw exceptions, guaranteeing that rows in these journals cannot be mutated even by database administrators executing direct SQL.
4. **Retention Policies**:
   - `cleanup.ts` only purges operational diagnostic logs (`system_logs`) according to configured retention settings (keeping `ERROR` logs for 90 days).
   - Financial journals, audit logs, referral rewards, and user balances are permanently retained.

---

## 10. Recovery Verification Test Suite

The FINEXJ automated test suite (`server/tests.ts`) executes 10 dedicated disaster-recovery and operation recovery tests as part of the authoritative verification pipeline:

1. **Migration Set Completeness & Sequential Integrity**: Verifies all 23 migration files exist, are readable, non-empty, and strictly sequential.
2. **Deposit Confirmation Lost Response Retry**: Confirms idempotency when client retries a confirmed deposit.
3. **Withdrawal Creation Timeout & Hold Integrity**: Confirms balance hold prevents double debit on retry, and cancellation restores hold cleanly.
4. **Payout Broadcast Success Post-Timeout**: Verifies that confirmed on-chain TxID reconciles post-timeout without duplicate payout.
5. **Payout vs Cancellation Race**: Proves mutual exclusion between terminal states `paid` and `cancelled`.
6. **Daily Performance Rollback & Idempotency**: Proves interrupted daily batch job leaves zero partial records and re-runs cleanly.
7. **Referral Reward Idempotent Retry**: Verifies `uq_referral_rewards_deposit_level` blocks duplicate commission while processing remaining levels.
8. **Post-Restoration Financial Reconciliation Invariant**: Proves authoritative double-entry reconciliation evaluates to exactly `0.0000` difference.
9. **Data Retention & Permanent Audit Immutability**: Verifies `ON DELETE RESTRICT` constraints and trigger protection.
10. **Secret Rotation Recovery**: Proves rotating `SESSION_SECRET` invalidates sessions without mutating database credentials.
