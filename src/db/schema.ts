import { pgTable, serial, text, timestamp, numeric, integer, boolean } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  role: text('role').notNull().default('user'), // 'user' | 'super_admin' | 'finance_admin' | 'support_admin'
  fullName: text('full_name').notNull(),
  walletAddress: text('wallet_address'),
  twoFactorSecret: text('two_factor_secret'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
  isLocked: boolean('is_locked').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Deposits table
export const deposits = pgTable('deposits', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  txHash: text('tx_hash').notNull().unique(),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  netAmount: numeric('net_amount', { precision: 18, scale: 4 }).notNull(),
  status: text('status').notNull().default('confirmed'), // 'pending' | 'confirmed' | 'rejected'
  confirmations: integer('confirmations').default(15).notNull(),
  lockExpiresAt: timestamp('lock_expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Withdrawals table
export const withdrawals = pgTable('withdrawals', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  requestedAmount: numeric('requested_amount', { precision: 18, scale: 4 }).notNull(),
  feeAmount: numeric('fee_amount', { precision: 18, scale: 4 }).notNull(),
  netAmount: numeric('net_amount', { precision: 18, scale: 4 }).notNull(),
  destinationAddress: text('destination_address').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected' | 'completed'
  txHash: text('tx_hash'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
  reviewedBy: text('reviewed_by'),
});

// Daily Performance distribution
export const dailyPerformances = pgTable('daily_performances', {
  id: serial('id').primaryKey(),
  date: text('date').notNull().unique(), // YYYY-MM-DD
  ratePercentage: numeric('rate_percentage', { precision: 8, scale: 4 }).notNull(),
  totalFundPrincipal: numeric('total_fund_principal', { precision: 18, scale: 4 }).notNull(),
  totalYieldDistributed: numeric('total_yield_distributed', { precision: 18, scale: 4 }).notNull(),
  distributedAt: timestamp('distributed_at').defaultNow().notNull(),
  distributedBy: text('distributed_by').notNull(),
});

// Earnings records
export const earnings = pgTable('earnings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  dailyPerformanceId: integer('daily_performance_id').references(() => dailyPerformances.id).notNull(),
  date: text('date').notNull(),
  activePrincipal: numeric('active_principal', { precision: 18, scale: 4 }).notNull(),
  ratePercentage: numeric('rate_percentage', { precision: 8, scale: 4 }).notNull(),
  payoutAmount: numeric('payout_amount', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Financial Ledger table (Double-entry accounting journal)
export const ledger = pgTable('ledger', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  type: text('type').notNull(), // 'DEPOSIT_CREDIT' | 'YIELD_CREDIT' | 'WITHDRAWAL_LOCK' | 'WITHDRAWAL_FEE' | 'ADMIN_ADJUSTMENT' | 'REFUND'
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 18, scale: 4 }).notNull(),
  referenceId: text('reference_id').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Audit logs
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  action: text('action').notNull(),
  actorEmail: text('actor_email').notNull(),
  details: text('details').notNull(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// System Settings
export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
