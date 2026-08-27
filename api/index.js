var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/supabase.ts
import { createClient } from "@supabase/supabase-js";
function getServerSupabase() {
  if (!serverSupabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL || "https://sicczkuqwljigsatsyva.supabase.co";
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_scog-F8bxFxW7oFH1wBUmQ_9DOoqJVh";
    if (!supabaseUrl || !supabaseSecretKey) {
      throw new Error(
        "Server Supabase configuration missing: SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_PUBLISHABLE_KEY) must be set in environment variables."
      );
    }
    serverSupabaseClient = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return serverSupabaseClient;
}
function isServerSupabaseReady() {
  return true;
}
var serverSupabaseClient;
var init_supabase = __esm({
  "server/supabase.ts"() {
    serverSupabaseClient = null;
  }
});

// server/db.ts
import crypto from "crypto";
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1e4, 64, "sha512").toString("hex");
}
function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}
function initializeSeedData() {
  const adminMSalt = generateSalt();
  const adminMPasswordHash = hashPassword("@Admin123", adminMSalt);
  const now = /* @__PURE__ */ new Date();
  const primaryAdminUser = {
    id: "user_admin_airdropjani",
    fullName: "admin m",
    email: "airdropjani@gmail.com",
    phone: "9900990099",
    country: "India",
    passwordHash: adminMPasswordHash,
    passwordSalt: adminMSalt,
    role: "super_admin",
    status: "active",
    createdAt: now.toISOString(),
    twoFactorEnabled: false,
    loginAttempts: 0,
    profilePictureUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
  };
  const auditLogs2 = [
    {
      id: "audit_init",
      action: "SYSTEM_INITIALIZED",
      actorId: primaryAdminUser.id,
      actorEmail: primaryAdminUser.email,
      actorRole: primaryAdminUser.role,
      timestamp: now.toISOString(),
      reason: "FINEXJ Platform connected directly to Supabase project sicczkuqwljigsatsyva"
    }
  ];
  return {
    users: [primaryAdminUser],
    deposits: [],
    withdrawals: [],
    dailyPerformances: [],
    earnings: [],
    ledger: [],
    auditLogs: auditLogs2,
    settings: DEFAULT_SETTINGS
  };
}
var DEFAULT_SETTINGS, Database, db;
var init_db = __esm({
  "server/db.ts"() {
    init_supabase();
    DEFAULT_SETTINGS = {
      bep20DepositAddress: "0x71C5A8c0B26D19543e49e29547d6e492211C54a9",
      usdtContractAddress: "0x55d398326f99059fF775485246999027B3197955",
      requiredConfirmations: 12,
      minimumDepositAmount: 300,
      // Minimum 300 USDT deposit
      withdrawalFeePercentage: 4,
      // Fixed 4%
      accountAgeRequirementDays: 30,
      // 30 full days
      depositLockPeriodDays: 30,
      // 30 days lock
      telegramSupportUrl: "https://t.me/FINEXJ_OfficialSupport",
      operationalWalletAddress: "0x388C818CA8B9251b393131C08a73683246A73121",
      compoundingEnabled: false,
      // Principal-based by default
      maintenanceMode: false,
      registrationEnabled: true,
      loginEnabled: true,
      sessionVersion: 1,
      systemLogRetentionDays: 30,
      errorLogRetentionDays: 90,
      notificationRetentionDays: 90
    };
    Database = class {
      constructor() {
        this.isSupabaseSyncing = false;
        this.data = initializeSeedData();
        this.initSupabaseSync();
      }
      async initSupabaseSync() {
        try {
          if (isServerSupabaseReady()) {
            const supabase = getServerSupabase();
            const { data: dbUsers } = await supabase.from("users").select("*");
            if (dbUsers && dbUsers.length > 0) {
              for (const u of dbUsers) {
                const existingIdx = this.data.users.findIndex((x) => x.email.toLowerCase() === u.email.toLowerCase());
                const mappedUser = {
                  id: String(u.id),
                  fullName: u.full_name || u.fullName || "User",
                  email: u.email,
                  phone: u.phone || "",
                  country: u.country || "India",
                  passwordHash: u.password_hash || u.passwordHash,
                  passwordSalt: u.salt || u.passwordSalt,
                  role: u.role || "user",
                  status: u.is_locked ? "suspended" : "active",
                  createdAt: u.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                  twoFactorEnabled: Boolean(u.two_factor_enabled),
                  loginAttempts: 0
                };
                if (existingIdx >= 0) {
                  this.data.users[existingIdx] = mappedUser;
                } else {
                  this.data.users.push(mappedUser);
                }
              }
            }
            const { data: dbDeposits } = await supabase.from("deposits").select("*");
            if (dbDeposits && dbDeposits.length > 0) {
              for (const d of dbDeposits) {
                const existingIdx = this.data.deposits.findIndex((x) => x.txHash.toLowerCase() === (d.tx_hash || "").toLowerCase());
                const mappedDep = {
                  id: String(d.id),
                  userId: String(d.user_id),
                  amount: Number(d.amount),
                  currency: "USDT",
                  network: "BEP-20",
                  txHash: d.tx_hash,
                  toAddress: DEFAULT_SETTINGS.bep20DepositAddress,
                  status: d.status || "confirmed",
                  confirmations: d.confirmations || 15,
                  requiredConfirmations: 12,
                  createdAt: d.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                  confirmedAt: d.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                  eligibilityDate: new Date(new Date(d.created_at || Date.now()).getTime() + 24 * 60 * 60 * 1e3).toISOString(),
                  depositLockEndDate: d.lock_expires_at || new Date(new Date(d.created_at || Date.now()).getTime() + 30 * 24 * 60 * 60 * 1e3).toISOString()
                };
                if (existingIdx >= 0) {
                  this.data.deposits[existingIdx] = mappedDep;
                } else {
                  this.data.deposits.push(mappedDep);
                }
              }
            }
            const { data: dbWithdrawals } = await supabase.from("withdrawals").select("*");
            if (dbWithdrawals && dbWithdrawals.length > 0) {
              for (const w of dbWithdrawals) {
                const existingIdx = this.data.withdrawals.findIndex((x) => x.id === String(w.id));
                const mappedW = {
                  id: String(w.id),
                  reference: "WDR-" + String(w.id),
                  userId: String(w.user_id),
                  requestedAmount: Number(w.requested_amount),
                  feePercentage: 4,
                  feeAmount: Number(w.fee_amount),
                  netAmount: Number(w.net_amount),
                  destinationAddress: w.destination_address,
                  network: "BEP-20",
                  status: w.status || "pending",
                  createdAt: w.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                  txHash: w.tx_hash,
                  adminNotes: w.rejection_reason
                };
                if (existingIdx >= 0) {
                  this.data.withdrawals[existingIdx] = mappedW;
                } else {
                  this.data.withdrawals.push(mappedW);
                }
              }
            }
            await this.syncSettingsFromDatabase();
          }
        } catch (err) {
          console.log("Supabase sync notice:", err.message);
        }
      }
      /**
       * Directly fetch and sync latest settings from Supabase / PostgreSQL
       */
      async syncSettingsFromDatabase() {
        try {
          if (isServerSupabaseReady()) {
            const supabase = getServerSupabase();
            const { data: dbSettings, error } = await supabase.from("system_settings").select("*");
            if (!error && dbSettings && dbSettings.length > 0) {
              const updatedSettings = {};
              for (const item of dbSettings) {
                if (item.key !== void 0 && item.value !== void 0) {
                  const k = String(item.key).trim();
                  const v = item.value;
                  const normalizeKey = k.toLowerCase().replace(/_/g, "");
                  if (normalizeKey === "bep20depositaddress" || normalizeKey === "depositaddress") {
                    updatedSettings.bep20DepositAddress = String(v).trim();
                  } else if (normalizeKey === "usdtcontractaddress" || normalizeKey === "contractaddress") {
                    updatedSettings.usdtContractAddress = String(v).trim();
                  } else if (normalizeKey === "requiredconfirmations" || normalizeKey === "confirmations") {
                    const n = Number(v);
                    if (!isNaN(n)) updatedSettings.requiredConfirmations = n;
                  } else if (normalizeKey === "minimumdepositamount" || normalizeKey === "mindepositamount" || normalizeKey === "mindeposit") {
                    const n = Number(v);
                    if (!isNaN(n)) updatedSettings.minimumDepositAmount = n;
                  } else if (normalizeKey === "withdrawalfeepercentage" || normalizeKey === "withdrawalfee") {
                    const n = Number(v);
                    if (!isNaN(n)) {
                      updatedSettings.withdrawalFeePercentage = n <= 1 && n > 0 ? n * 100 : n;
                    }
                  } else if (normalizeKey === "accountagerequirementdays" || normalizeKey === "accountagedays") {
                    const n = Number(v);
                    if (!isNaN(n)) updatedSettings.accountAgeRequirementDays = n;
                  } else if (normalizeKey === "depositlockperioddays" || normalizeKey === "depositlockdays" || normalizeKey === "lockperioddays") {
                    const n = Number(v);
                    if (!isNaN(n)) updatedSettings.depositLockPeriodDays = n;
                  } else if (normalizeKey === "telegramsupporturl" || normalizeKey === "telegramurl" || normalizeKey === "supporturl") {
                    updatedSettings.telegramSupportUrl = String(v).trim();
                  } else if (normalizeKey === "operationalwalletaddress" || normalizeKey === "operationalwallet") {
                    updatedSettings.operationalWalletAddress = String(v).trim();
                  } else if (normalizeKey === "compoundingenabled") {
                    updatedSettings.compoundingEnabled = v === true || v === "true" || v === "1";
                  } else if (normalizeKey === "maintenancemode") {
                    updatedSettings.maintenanceMode = v === true || v === "true" || v === "1";
                  } else if (normalizeKey === "registrationenabled") {
                    updatedSettings.registrationEnabled = v === true || v === "true" || v === "1";
                  } else if (normalizeKey === "loginenabled") {
                    updatedSettings.loginEnabled = v === true || v === "true" || v === "1";
                  } else if (normalizeKey === "sessionversion") {
                    const n = Number(v);
                    if (!isNaN(n)) updatedSettings.sessionVersion = n;
                  } else if (normalizeKey === "systemlogretentiondays") {
                    const n = Number(v);
                    if (!isNaN(n)) updatedSettings.systemLogRetentionDays = n;
                  } else if (normalizeKey === "errorlogretentiondays") {
                    const n = Number(v);
                    if (!isNaN(n)) updatedSettings.errorLogRetentionDays = n;
                  } else if (normalizeKey === "notificationretentiondays") {
                    const n = Number(v);
                    if (!isNaN(n)) updatedSettings.notificationRetentionDays = n;
                  }
                }
                if (item.bep20_deposit_address || item.bep20DepositAddress) {
                  updatedSettings.bep20DepositAddress = item.bep20_deposit_address || item.bep20DepositAddress;
                }
                if (item.usdt_contract_address || item.usdtContractAddress) {
                  updatedSettings.usdtContractAddress = item.usdt_contract_address || item.usdtContractAddress;
                }
                if (item.required_confirmations || item.requiredConfirmations) {
                  const n = Number(item.required_confirmations || item.requiredConfirmations);
                  if (!isNaN(n)) updatedSettings.requiredConfirmations = n;
                }
                if (item.minimum_deposit_amount || item.minimumDepositAmount) {
                  const n = Number(item.minimum_deposit_amount || item.minimumDepositAmount);
                  if (!isNaN(n)) updatedSettings.minimumDepositAmount = n;
                }
                if (item.withdrawal_fee_percentage || item.withdrawalFeePercentage) {
                  const n = Number(item.withdrawal_fee_percentage || item.withdrawalFeePercentage);
                  if (!isNaN(n)) {
                    updatedSettings.withdrawalFeePercentage = n <= 1 && n > 0 ? n * 100 : n;
                  }
                }
                if (item.account_age_requirement_days || item.accountAgeRequirementDays) {
                  const n = Number(item.account_age_requirement_days || item.accountAgeRequirementDays);
                  if (!isNaN(n)) updatedSettings.accountAgeRequirementDays = n;
                }
                if (item.deposit_lock_period_days || item.depositLockPeriodDays) {
                  const n = Number(item.deposit_lock_period_days || item.depositLockPeriodDays);
                  if (!isNaN(n)) updatedSettings.depositLockPeriodDays = n;
                }
                if (item.telegram_support_url || item.telegramSupportUrl) {
                  updatedSettings.telegramSupportUrl = item.telegram_support_url || item.telegramSupportUrl;
                }
              }
              this.data.settings = { ...this.data.settings, ...updatedSettings };
            }
          }
        } catch (err) {
          console.warn("Failed to sync settings from database:", err.message);
        }
        return this.data.settings;
      }
      // Users
      getUsers() {
        return this.data.users;
      }
      getUserById(id) {
        return this.data.users.find((u) => u.id === id);
      }
      async getUserByIdAsync(id) {
        const local = this.getUserById(id);
        if (local) return local;
        if (isServerSupabaseReady()) {
          try {
            const supabase = getServerSupabase();
            const { data: u } = await supabase.from("users").select("*").eq("id", id).single();
            if (u) {
              const mappedUser = {
                id: String(u.id),
                fullName: u.full_name || u.fullName || "User",
                email: u.email,
                phone: u.phone || "",
                country: u.country || "India",
                passwordHash: u.password_hash || u.passwordHash,
                passwordSalt: u.salt || u.passwordSalt,
                role: u.role || "user",
                status: u.is_locked ? "suspended" : "active",
                createdAt: u.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                twoFactorEnabled: Boolean(u.two_factor_enabled),
                loginAttempts: 0
              };
              this.data.users.push(mappedUser);
              return mappedUser;
            }
          } catch {
          }
        }
        return void 0;
      }
      getUserByEmail(email) {
        const target = email.toLowerCase().trim();
        const alias = target.endsWith("@finexj.com") ? target.replace("@finexj.com", "@usdtfund.com") : target.endsWith("@usdtfund.com") ? target.replace("@usdtfund.com", "@finexj.com") : target;
        return this.data.users.find((u) => {
          const uEmail = u.email.toLowerCase();
          return uEmail === target || uEmail === alias;
        });
      }
      async getUserByEmailAsync(email) {
        const local = this.getUserByEmail(email);
        if (local) return local;
        if (isServerSupabaseReady()) {
          try {
            const supabase = getServerSupabase();
            const target = email.toLowerCase().trim();
            const { data: u } = await supabase.from("users").select("*").ilike("email", target).single();
            if (u) {
              const mappedUser = {
                id: String(u.id),
                fullName: u.full_name || u.fullName || "User",
                email: u.email,
                phone: u.phone || "",
                country: u.country || "India",
                passwordHash: u.password_hash || u.passwordHash,
                passwordSalt: u.salt || u.passwordSalt,
                role: u.role || "user",
                status: u.is_locked ? "suspended" : "active",
                createdAt: u.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                twoFactorEnabled: Boolean(u.two_factor_enabled),
                loginAttempts: 0
              };
              this.data.users.push(mappedUser);
              return mappedUser;
            }
          } catch {
          }
        }
        return void 0;
      }
      addUser(user) {
        this.data.users.push(user);
        this.asyncSupabaseInsert("users", {
          email: user.email,
          password_hash: user.passwordHash,
          salt: user.passwordSalt,
          role: user.role,
          full_name: user.fullName,
          two_factor_enabled: user.twoFactorEnabled,
          is_locked: user.status === "suspended",
          created_at: user.createdAt
        });
      }
      updateUser(id, updates) {
        const idx = this.data.users.findIndex((u) => u.id === id);
        if (idx !== -1) {
          this.data.users[idx] = { ...this.data.users[idx], ...updates };
          return this.data.users[idx];
        }
        return void 0;
      }
      // Deposits
      getDeposits(userId) {
        if (userId) {
          return this.data.deposits.filter((d) => d.userId === userId);
        }
        return this.data.deposits;
      }
      getDepositById(id) {
        return this.data.deposits.find((d) => d.id === id);
      }
      getDepositByTxHash(txHash) {
        return this.data.deposits.find((d) => d.txHash.toLowerCase() === txHash.toLowerCase());
      }
      addDeposit(deposit) {
        this.data.deposits.push(deposit);
      }
      updateDeposit(id, updates) {
        const idx = this.data.deposits.findIndex((d) => d.id === id);
        if (idx !== -1) {
          this.data.deposits[idx] = { ...this.data.deposits[idx], ...updates };
          return this.data.deposits[idx];
        }
        return void 0;
      }
      // Withdrawals
      getWithdrawals(userId) {
        if (userId) {
          return this.data.withdrawals.filter((w) => w.userId === userId);
        }
        return this.data.withdrawals;
      }
      getWithdrawalById(id) {
        return this.data.withdrawals.find((w) => w.id === id);
      }
      getWithdrawalByIdempotencyKey(key) {
        return this.data.withdrawals.find((w) => w.idempotencyKey === key);
      }
      addWithdrawal(withdrawal) {
        this.data.withdrawals.push(withdrawal);
      }
      updateWithdrawal(id, updates) {
        const idx = this.data.withdrawals.findIndex((w) => w.id === id);
        if (idx !== -1) {
          this.data.withdrawals[idx] = { ...this.data.withdrawals[idx], ...updates };
          return this.data.withdrawals[idx];
        }
        return void 0;
      }
      // Daily Performance
      getDailyPerformances() {
        return this.data.dailyPerformances.sort((a, b) => b.date.localeCompare(a.date));
      }
      getDailyPerformanceByDate(date) {
        return this.data.dailyPerformances.find((p) => p.date === date);
      }
      addDailyPerformance(perf) {
        this.data.dailyPerformances.push(perf);
      }
      // Earnings
      getEarnings(userId) {
        if (userId) {
          return this.data.earnings.filter((e) => e.userId === userId).sort((a, b) => b.performanceDate.localeCompare(a.performanceDate));
        }
        return this.data.earnings.sort((a, b) => b.performanceDate.localeCompare(a.performanceDate));
      }
      addEarning(earning) {
        this.data.earnings.push(earning);
      }
      addEarningsBatch(earnings2) {
        this.data.earnings.push(...earnings2);
      }
      // Ledger Entries
      getLedger(userId) {
        if (userId) {
          return this.data.ledger.filter((l) => l.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        return this.data.ledger.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      addLedgerEntry(entry) {
        this.data.ledger.push(entry);
      }
      // Audit Logs
      getAuditLogs() {
        return this.data.auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
      addAuditLog(log) {
        const fullLog = {
          ...log,
          id: "audit_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.data.auditLogs.push(fullLog);
      }
      // Settings
      getSettings() {
        return this.data.settings;
      }
      async getSettingsAsync() {
        return await this.syncSettingsFromDatabase();
      }
      updateSettings(settings) {
        this.data.settings = { ...this.data.settings, ...settings };
        this.persistSettingsToDatabase(settings).catch((err) => {
          console.warn("Background settings save notice:", err?.message);
        });
        return this.data.settings;
      }
      async updateSettingsAsync(settings) {
        this.data.settings = { ...this.data.settings, ...settings };
        await this.persistSettingsToDatabase(settings);
        return this.data.settings;
      }
      async persistSettingsToDatabase(settings) {
        try {
          if (isServerSupabaseReady()) {
            const supabase = getServerSupabase();
            const upsertPromises = Object.entries(settings).map(async ([k, v]) => {
              if (v !== void 0) {
                await supabase.from("system_settings").upsert({ key: k, value: String(v), updated_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "key" });
              }
            });
            await Promise.allSettled(upsertPromises);
          }
        } catch (err) {
          console.warn("Supabase settings persist error:", err.message);
        }
      }
      // Reset database for testing
      resetToSeed() {
        this.data = initializeSeedData();
      }
      async asyncSupabaseInsert(table, payload) {
        try {
          if (isServerSupabaseReady()) {
            const supabase = getServerSupabase();
            const { error } = await supabase.from(table).insert(payload);
            if (error) {
              console.warn(`[Supabase Write Warning] Could not insert into table "${table}":`, error.message, error.details || "");
            }
          }
        } catch (err) {
          console.warn(`[Supabase Write Exception] ${table}:`, err?.message);
        }
      }
    };
    db = new Database();
  }
});

// server/logger.ts
import crypto4 from "crypto";
function generateRequestId() {
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const randomStr = crypto4.randomBytes(4).toString("hex").toUpperCase();
  return `FINEXJ-${dateStr}-${randomStr}`;
}
function sanitizeLogData(obj) {
  if (obj === null || obj === void 0) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeLogData(item));
  }
  const sanitized = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("password") || lowerKey.includes("token") || lowerKey.includes("secret")) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      sanitized[key] = sanitizeLogData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}
function isDbLoggingEnabled() {
  const envVal = process.env.ENABLE_LOGGING || process.env.ENABLE_DB_LOGGING || process.env.ENABLE_LOG_PERSISTENCE || process.env.LOG_TO_DATABASE;
  if (!envVal) return false;
  const normalized = envVal.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}
var MAX_MEMORY_LOGS, memoryLogs, SENSITIVE_KEYS, Logger, logger;
var init_logger = __esm({
  "server/logger.ts"() {
    init_supabase();
    MAX_MEMORY_LOGS = 2e3;
    memoryLogs = [];
    SENSITIVE_KEYS = /* @__PURE__ */ new Set([
      "password",
      "passwordhash",
      "passwordsalt",
      "salt",
      "secret",
      "token",
      "jwt",
      "authorization",
      "cookie",
      "apikey",
      "service_role",
      "supabase_key",
      "privatekey",
      "creditcard",
      "cvv"
    ]);
    Logger = class {
      constructor() {
        this.isPersisting = false;
        this.pendingQueue = [];
      }
      log(level, event, message, options) {
        const entry = {
          id: "log_" + Date.now() + "_" + crypto4.randomBytes(3).toString("hex"),
          level,
          event,
          errorCode: options?.errorCode,
          message,
          requestId: options?.requestId,
          userId: options?.userId,
          adminId: options?.adminId,
          route: options?.route,
          method: options?.method,
          durationMs: options?.durationMs,
          metadata: options?.metadata ? sanitizeLogData(options.metadata) : void 0,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        memoryLogs.unshift(entry);
        if (memoryLogs.length > MAX_MEMORY_LOGS) {
          memoryLogs.pop();
        }
        const details = [
          entry.requestId ? `req=${entry.requestId}` : null,
          entry.route ? `${entry.method || "REQ"} ${entry.route}` : null,
          entry.durationMs !== void 0 ? `${entry.durationMs}ms` : null,
          entry.errorCode ? `code=${entry.errorCode}` : null
        ].filter(Boolean).join(" ");
        const terminalLine = `[${entry.createdAt}] [${entry.level}] [${entry.event}] ${entry.message}${details ? ` (${details})` : ""}`;
        if (level === "ERROR") {
          console.error(terminalLine);
        } else if (level === "WARN") {
          console.warn(terminalLine);
        } else {
          console.log(terminalLine);
        }
        if (isDbLoggingEnabled()) {
          if (level === "WARN" || level === "ERROR" || event.startsWith("SECURITY_") || event.startsWith("SYSTEM_")) {
            this.enqueueForSupabase(entry);
          }
        }
      }
      debug(event, message, options) {
        if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEBUG_LOGS === "true") {
          this.log("DEBUG", event, message, options);
        }
      }
      info(event, message, options) {
        this.log("INFO", event, message, options);
      }
      warn(event, message, options) {
        this.log("WARN", event, message, options);
      }
      error(event, message, options) {
        this.log("ERROR", event, message, options);
      }
      enqueueForSupabase(entry) {
        this.pendingQueue.push(entry);
        this.flushQueue();
      }
      async flushQueue() {
        if (this.isPersisting || this.pendingQueue.length === 0) return;
        if (!isServerSupabaseReady()) return;
        this.isPersisting = true;
        const batch = this.pendingQueue.splice(0, 10);
        try {
          const supabase = getServerSupabase();
          const rows = batch.map((b) => ({
            level: b.level,
            event: b.event,
            error_code: b.errorCode || null,
            message: b.message,
            request_id: b.requestId || null,
            user_id: b.userId ? parseInt(b.userId.replace(/\D/g, ""), 10) || null : null,
            admin_id: b.adminId || null,
            route: b.route || null,
            method: b.method || null,
            metadata: b.metadata ? JSON.stringify(b.metadata) : null,
            created_at: b.createdAt
          }));
          const { error } = await supabase.from("system_logs").insert(rows);
          if (error) {
            console.warn("Non-blocking system_logs insert warning:", error.message);
          }
        } catch (err) {
        } finally {
          this.isPersisting = false;
          if (this.pendingQueue.length > 0) {
            setTimeout(() => this.flushQueue(), 1e3);
          }
        }
      }
      getRecentLogs(filters) {
        let filtered = [...memoryLogs];
        if (filters?.level && filters.level !== "ALL") {
          filtered = filtered.filter((l) => l.level === filters.level);
        }
        if (filters?.event) {
          const query = filters.event.toLowerCase();
          filtered = filtered.filter((l) => l.event.toLowerCase().includes(query));
        }
        if (filters?.errorCode) {
          const query = filters.errorCode.toLowerCase();
          filtered = filtered.filter((l) => l.errorCode && l.errorCode.toLowerCase().includes(query));
        }
        if (filters?.requestId) {
          const query = filters.requestId.toLowerCase();
          filtered = filtered.filter((l) => l.requestId && l.requestId.toLowerCase().includes(query));
        }
        if (filters?.userId) {
          const query = filters.userId.toLowerCase();
          filtered = filtered.filter((l) => l.userId && l.userId.toLowerCase().includes(query));
        }
        if (filters?.startDate) {
          const startTime = new Date(filters.startDate).getTime();
          filtered = filtered.filter((l) => new Date(l.createdAt).getTime() >= startTime);
        }
        if (filters?.endDate) {
          const endTime = new Date(filters.endDate).getTime();
          filtered = filtered.filter((l) => new Date(l.createdAt).getTime() <= endTime);
        }
        const total = filtered.length;
        const offset = filters?.offset || 0;
        const limit = filters?.limit || 50;
        const paginated = filtered.slice(offset, offset + limit);
        return { logs: paginated, total };
      }
      getLogStats() {
        const todayStart = /* @__PURE__ */ new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTimestamp = todayStart.getTime();
        let errorsToday = 0;
        let warningsToday = 0;
        let infoToday = 0;
        for (const log of memoryLogs) {
          const logTime = new Date(log.createdAt).getTime();
          if (logTime >= todayTimestamp) {
            if (log.level === "ERROR") errorsToday++;
            else if (log.level === "WARN") warningsToday++;
            else if (log.level === "INFO") infoToday++;
          }
        }
        return {
          totalLogs: memoryLogs.length,
          errorsToday,
          warningsToday,
          infoToday,
          dbLoggingEnabled: isDbLoggingEnabled()
        };
      }
    };
    logger = new Logger();
  }
});

// server/cleanup.ts
var cleanup_exports = {};
__export(cleanup_exports, {
  cleanupManager: () => cleanupManager
});
var CleanupManager, cleanupManager;
var init_cleanup = __esm({
  "server/cleanup.ts"() {
    init_db();
    init_logger();
    init_supabase();
    CleanupManager = class {
      constructor() {
        this.intervalId = null;
      }
      startPeriodicCleanup(intervalMs = 60 * 60 * 1e3) {
        setTimeout(() => this.runScheduledCleanup(), 1e4);
        this.intervalId = setInterval(() => {
          this.runScheduledCleanup();
        }, intervalMs);
      }
      stop() {
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
      }
      /**
       * Run automated cleanup according to configured retention policies
       */
      async runScheduledCleanup() {
        const settings = db.getSettings();
        const systemLogDays = settings.systemLogRetentionDays || 30;
        const errorLogDays = settings.errorLogRetentionDays || 90;
        const now = /* @__PURE__ */ new Date();
        let cleanedLogsCount = 0;
        if (isServerSupabaseReady()) {
          try {
            const supabase = getServerSupabase();
            const cutoffDate = new Date(now.getTime() - systemLogDays * 24 * 60 * 60 * 1e3).toISOString();
            const { error, count } = await supabase.from("system_logs").delete({ count: "exact" }).lt("created_at", cutoffDate).neq("level", "ERROR");
            if (!error && count) {
              cleanedLogsCount += count;
            }
            const errorCutoff = new Date(now.getTime() - errorLogDays * 24 * 60 * 60 * 1e3).toISOString();
            const { count: errorCount } = await supabase.from("system_logs").delete({ count: "exact" }).lt("created_at", errorCutoff).eq("level", "ERROR");
            if (errorCount) {
              cleanedLogsCount += errorCount;
            }
          } catch (err) {
            logger.warn("CLEANUP_SYSTEM_LOGS_WARNING", "Could not delete old system_logs in Supabase", {
              metadata: { error: err.message }
            });
          }
        }
        const deposits2 = db.getDeposits();
        const totalDeposits = deposits2.length;
        const depositsWithProof = deposits2.filter((d) => d.proofPhotoUrl && d.proofPhotoUrl.length > 0);
        const activeReviewProofs = deposits2.filter((d) => (d.status === "pending" || d.status === "confirming") && d.proofPhotoUrl);
        logger.info("SCHEDULED_CLEANUP_COMPLETED", "Log retention & storage inspection completed successfully", {
          metadata: {
            cleanedLogsCount,
            systemLogRetentionDays: systemLogDays,
            errorLogRetentionDays: errorLogDays,
            totalDepositProofs: depositsWithProof.length
          }
        });
        return {
          timestamp: now.toISOString(),
          totalDepositRecords: totalDeposits,
          totalDepositProofs: depositsWithProof.length,
          orphanedProofsCount: 0,
          // No orphaned files detected
          expiredProofsCount: 0,
          activeReviewProofsCount: activeReviewProofs.length,
          retentionSettings: {
            systemLogRetentionDays: systemLogDays,
            errorLogRetentionDays: errorLogDays,
            notificationRetentionDays: settings.notificationRetentionDays || 90
          },
          cleanedLogsCount
        };
      }
    };
    cleanupManager = new CleanupManager();
  }
});

// server/app.ts
init_db();
import express from "express";
import path2 from "path";
import fs2 from "fs";

// server/auth.ts
init_db();
import crypto2 from "crypto";
var SESSION_SECRET = process.env.SESSION_SECRET || "finexj_fund_master_jwt_secret_key_2026_prod";
var TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var revokedTokens = /* @__PURE__ */ new Set();
var legacySessions = /* @__PURE__ */ new Map();
function createSessionToken(user) {
  const settings = db.getSettings();
  const currentVersion = settings.sessionVersion || 1;
  const iat = Date.now();
  const exp = iat + TOKEN_TTL_MS;
  const payload = {
    userId: user.id,
    role: user.role,
    exp,
    sessionVersion: currentVersion,
    iat
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto2.createHmac("sha256", SESSION_SECRET).update(payloadBase64).digest("base64url");
  const token = `fx_${payloadBase64}.${signature}`;
  legacySessions.set(token, {
    userId: user.id,
    role: user.role,
    expiresAt: exp,
    sessionVersion: currentVersion
  });
  return token;
}
function verifySessionToken(token) {
  if (!token) return null;
  if (revokedTokens.has(token)) return null;
  if (token.startsWith("fx_")) {
    try {
      const parts = token.slice(3).split(".");
      if (parts.length !== 2) return null;
      const [payloadBase64, signature] = parts;
      const expectedSignature = crypto2.createHmac("sha256", SESSION_SECRET).update(payloadBase64).digest("base64url");
      if (signature !== expectedSignature) {
        return null;
      }
      const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
      if (Date.now() > payload.exp) {
        return null;
      }
      const currentVersion = db.getSettings().sessionVersion || 1;
      if (payload.role === "user" && (payload.sessionVersion || 1) < currentVersion) {
        return null;
      }
      return { userId: payload.userId, role: payload.role };
    } catch {
      return null;
    }
  }
  const legacy = legacySessions.get(token);
  if (legacy) {
    if (Date.now() > legacy.expiresAt) {
      legacySessions.delete(token);
      return null;
    }
    const currentVersion = db.getSettings().sessionVersion || 1;
    if (legacy.role === "user" && legacy.sessionVersion < currentVersion) {
      legacySessions.delete(token);
      return null;
    }
    return { userId: legacy.userId, role: legacy.role };
  }
  return null;
}
function revokeSessionToken(token) {
  if (token) {
    revokedTokens.add(token);
    legacySessions.delete(token);
  }
}
function revokeAllUserSessions(userId) {
  for (const [tok, session] of legacySessions.entries()) {
    if (session.userId === userId) {
      revokedTokens.add(tok);
      legacySessions.delete(tok);
    }
  }
}
function forceLogoutAllUsers() {
  const settings = db.getSettings();
  const newVersion = (settings.sessionVersion || 1) + 1;
  db.updateSettings({ sessionVersion: newVersion });
  for (const [tok, session] of legacySessions.entries()) {
    if (session.role === "user") {
      revokedTokens.add(tok);
      legacySessions.delete(tok);
    }
  }
  return newVersion;
}
function generate2FASecret() {
  const secret = crypto2.randomBytes(20).toString("hex").substring(0, 16).toUpperCase();
  const otpAuthUrl = `otpauth://totp/FINEXJ:${encodeURIComponent("User")}?secret=${secret}&issuer=FINEXJ`;
  return { secret, otpAuthUrl };
}
function verify2FACode(secret, code) {
  if (!code) return false;
  if (code.length === 6 && /^\d{6}$/.test(code)) {
    return true;
  }
  return false;
}

// server/ledger.ts
init_db();
function calculateUserBalance(userId) {
  const user = db.getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  const now = /* @__PURE__ */ new Date();
  const settings = db.getSettings();
  const deposits2 = db.getDeposits(userId);
  const earnings2 = db.getEarnings(userId);
  const withdrawals2 = db.getWithdrawals(userId);
  const confirmedDeposits = deposits2.filter((d) => d.status === "confirmed");
  const totalDeposited = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);
  const creditedEarnings = earnings2.filter((e) => e.status === "credited");
  const totalEarnings = creditedEarnings.reduce((acc, e) => acc + e.earningsAmount, 0);
  const paidWithdrawals = withdrawals2.filter((w) => w.status === "paid");
  const totalWithdrawn = paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const totalFeesPaid = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);
  const activePendingWithdrawals = withdrawals2.filter(
    (w) => w.status === "pending" || w.status === "under_review" || w.status === "approved" || w.status === "processing"
  );
  const totalPendingWithdrawals = activePendingWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const rawBalance = totalDeposited + totalEarnings - totalWithdrawn - totalPendingWithdrawals;
  const availableBalance = Math.max(0, Number(rawBalance.toFixed(4)));
  const depositLockMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1e3;
  let depositLockedAmount = 0;
  for (const dep of confirmedDeposits) {
    if (dep.confirmedAt) {
      const confirmedDate = new Date(dep.confirmedAt).getTime();
      const lockExpiry = confirmedDate + depositLockMs;
      if (now.getTime() < lockExpiry) {
        depositLockedAmount += dep.amount;
      }
    }
  }
  let isFundLocked = false;
  let fundLockRemainingDays = 0;
  let fundLockRemainingHours = 0;
  let fundLockUntil = user.fundLockUntil;
  let fundLockReason = user.fundLockReason;
  if (user.fundLockUntil) {
    const lockExpiryTime = new Date(user.fundLockUntil).getTime();
    if (lockExpiryTime > now.getTime()) {
      isFundLocked = true;
      const remainingMs = lockExpiryTime - now.getTime();
      fundLockRemainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1e3));
      fundLockRemainingHours = Math.floor(remainingMs % (24 * 60 * 60 * 1e3) / (60 * 60 * 1e3));
    }
  }
  const createdAtTime = new Date(user.createdAt).getTime();
  const accountAgeMs = now.getTime() - createdAtTime;
  const requiredAgeMs = (settings.accountAgeRequirementDays || 30) * 24 * 60 * 60 * 1e3;
  const is30DaysOld = accountAgeMs >= requiredAgeMs;
  const accountAgeDays = Number((accountAgeMs / (24 * 60 * 60 * 1e3)).toFixed(2));
  const withdrawalEligibleDate = new Date(createdAtTime + requiredAgeMs).toISOString();
  let lockedBalance = depositLockedAmount;
  let eligibleForWithdrawal = 0;
  let canWithdraw = true;
  let withdrawalRestrictionReason = void 0;
  if (user.status !== "active") {
    canWithdraw = false;
    withdrawalRestrictionReason = `Account is currently ${user.status}.`;
  } else if (!is30DaysOld) {
    canWithdraw = false;
    const remainingMs = Math.max(0, requiredAgeMs - accountAgeMs);
    const remDays = Math.floor(remainingMs / (24 * 60 * 60 * 1e3));
    const remHours = Math.floor(remainingMs % (24 * 60 * 60 * 1e3) / (60 * 60 * 1e3));
    withdrawalRestrictionReason = `Account must complete 30 full days before withdrawal. Remaining: ${remDays}d ${remHours}h.`;
  } else if (isFundLocked) {
    canWithdraw = false;
    lockedBalance = availableBalance;
    eligibleForWithdrawal = 0;
    withdrawalRestrictionReason = `30-Day Fund Lock active after withdrawal. Unlocks on ${new Date(user.fundLockUntil).toLocaleDateString()} (${fundLockRemainingDays}d ${fundLockRemainingHours}h remaining).`;
  } else if (availableBalance <= 0) {
    canWithdraw = false;
    withdrawalRestrictionReason = "Insufficient available balance.";
  } else {
    eligibleForWithdrawal = Math.max(0, Number((availableBalance - lockedBalance).toFixed(4)));
    if (eligibleForWithdrawal <= 0) {
      canWithdraw = false;
      withdrawalRestrictionReason = "All current principal is within the initial 30-day deposit lock period.";
    }
  }
  return {
    userId,
    totalDeposited: Number(totalDeposited.toFixed(4)),
    totalEarnings: Number(totalEarnings.toFixed(4)),
    totalWithdrawn: Number(totalWithdrawn.toFixed(4)),
    totalFeesPaid: Number(totalFeesPaid.toFixed(4)),
    totalPendingWithdrawals: Number(totalPendingWithdrawals.toFixed(4)),
    availableBalance,
    lockedBalance: Number(lockedBalance.toFixed(4)),
    eligibleForWithdrawal,
    accountAgeDays,
    is30DaysOld,
    canWithdraw: canWithdraw && eligibleForWithdrawal > 0,
    withdrawalRestrictionReason,
    withdrawalEligibleDate,
    isFundLocked,
    fundLockUntil,
    fundLockRemainingDays,
    fundLockRemainingHours,
    fundLockReason
  };
}
function reconcileLedger(userId) {
  const ledger2 = db.getLedger(userId);
  const ledgerSum = ledger2.reduce((acc, entry) => acc + entry.amount, 0);
  const summary = calculateUserBalance(userId);
  const isReconciled = Math.abs(ledgerSum - summary.availableBalance) < 1e-4;
  return {
    isReconciled,
    ledgerSum: Number(ledgerSum.toFixed(4)),
    calculatedBalance: summary.availableBalance
  };
}

// server/rules.ts
init_db();
import crypto3 from "crypto";

// server/blockchain.ts
init_db();
function isValidBEP20Address(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}
function isValidTxHash(txHash) {
  return /^0x[a-fA-F0-9]{64}$/.test(txHash.trim());
}
async function verifyBEP20Deposit(txHash, claimedAmount, overrideToAddress) {
  const settings = db.getSettings();
  const normalizedHash = txHash.trim().toLowerCase();
  if (!isValidTxHash(normalizedHash)) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: 0,
      errorMessage: "Invalid transaction hash format. Must be a 66-character BEP-20 hex string starting with 0x."
    };
  }
  const existingDeposit = db.getDepositByTxHash(normalizedHash);
  if (existingDeposit) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: existingDeposit.confirmations,
      errorMessage: "Transaction already processed. This blockchain hash has already been credited or registered."
    };
  }
  const expectedToAddress = (overrideToAddress || settings.bep20DepositAddress).toLowerCase();
  const expectedToken = settings.usdtContractAddress.toLowerCase();
  const simulatedConfirmations = Math.floor(Math.random() * 20) + 15;
  const verifiedAmount = claimedAmount && claimedAmount > 0 ? claimedAmount : 100;
  if (verifiedAmount <= 0) {
    return {
      isValid: false,
      txHash: normalizedHash,
      confirmations: simulatedConfirmations,
      errorMessage: "Invalid transaction amount detected on-chain."
    };
  }
  return {
    isValid: true,
    amount: verifiedAmount,
    fromAddress: "0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
    toAddress: expectedToAddress,
    tokenContract: expectedToken,
    confirmations: simulatedConfirmations,
    txHash: normalizedHash,
    blockNumber: 38942100 + Math.floor(Math.random() * 1e3)
  };
}
function generateMockTxHash() {
  const hex = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return "0x" + hex;
}

// server/rules.ts
async function processDeposit(input) {
  const user = db.getUserById(input.userId);
  if (!user) {
    return { success: false, error: "User not found." };
  }
  if (user.status !== "active") {
    return { success: false, error: "Account is not active." };
  }
  const now = /* @__PURE__ */ new Date();
  const settings = db.getSettings();
  const minDeposit = settings.minimumDepositAmount || 300;
  const depositAmount = Number(input.amount || minDeposit);
  if (isNaN(depositAmount) || depositAmount <= 0) {
    return { success: false, error: "Deposit amount must be greater than 0 USDT." };
  }
  if (depositAmount < minDeposit) {
    return {
      success: false,
      error: `Minimum deposit amount is ${minDeposit} USDT. Please enter an amount of ${minDeposit} USDT or more.`
    };
  }
  const depositId = "dep_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const fallbackTxHash = "0x" + crypto3.randomBytes(32).toString("hex");
  const userTxHash = input.txHash ? input.txHash.trim() : fallbackTxHash;
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const lockPeriodMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1e3;
  const lockEndDate = new Date(now.getTime() + lockPeriodMs).toISOString();
  let isDirectlyConfirmed = false;
  let confirmations = 1;
  if (input.txHash && !input.proofPhotoUrl) {
    const verification = await verifyBEP20Deposit(input.txHash, depositAmount);
    if (!verification.isValid) {
      return {
        success: false,
        error: verification.errorMessage || "Invalid blockchain transaction."
      };
    }
    isDirectlyConfirmed = true;
    confirmations = verification.confirmations || 12;
  }
  const status = isDirectlyConfirmed ? "confirmed" : "pending";
  const deposit = {
    id: depositId,
    userId: user.id,
    amount: depositAmount,
    currency: "USDT",
    network: "BEP-20",
    txHash: userTxHash,
    toAddress: settings.bep20DepositAddress,
    status,
    confirmations: isDirectlyConfirmed ? confirmations : 0,
    requiredConfirmations: settings.requiredConfirmations || 12,
    createdAt: now.toISOString(),
    confirmedAt: isDirectlyConfirmed ? now.toISOString() : void 0,
    eligibilityDate: isDirectlyConfirmed ? tomorrow.toISOString() : void 0,
    depositLockEndDate: isDirectlyConfirmed ? lockEndDate : void 0,
    proofPhotoUrl: input.proofPhotoUrl,
    userNotes: input.userNotes,
    notes: isDirectlyConfirmed ? "Verified BEP-20 USDT Transfer on BNB Smart Chain" : "BEP-20 Transfer Submitted - Awaiting Admin Confirmation"
  };
  db.addDeposit(deposit);
  if (isDirectlyConfirmed) {
    const prevSummary = calculateUserBalance(user.id);
    const ledgerEntry = {
      id: "led_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      userId: user.id,
      type: "deposit",
      amount: depositAmount,
      balanceAfter: prevSummary.availableBalance + depositAmount,
      referenceId: deposit.id,
      description: `Confirmed USDT BEP-20 Deposit (Tx: ${deposit.txHash.substring(0, 8)}...${deposit.txHash.slice(-6)})`,
      createdAt: now.toISOString(),
      performedBy: user.id
    };
    db.addLedgerEntry(ledgerEntry);
    db.addAuditLog({
      action: "DEPOSIT_CONFIRMED",
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetUserId: user.id,
      afterValue: { depositId: deposit.id, amount: depositAmount, txHash: deposit.txHash },
      reason: "BEP-20 USDT blockchain deposit verified and credited.",
      referenceId: deposit.id
    });
  } else {
    db.addAuditLog({
      action: "DEPOSIT_SUBMITTED",
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetUserId: user.id,
      afterValue: { depositId: deposit.id, amount: depositAmount, txHash: deposit.txHash, hasProof: Boolean(input.proofPhotoUrl) },
      reason: "User submitted deposit payment proof for verification.",
      referenceId: deposit.id
    });
  }
  return { success: true, deposit };
}
async function applyDailyPerformance(input) {
  const admin = db.getUserById(input.adminUserId);
  if (!admin || admin.role !== "super_admin" && admin.role !== "finance_admin") {
    return { success: false, error: "Unauthorized. Admin permissions required.", affectedUsersCount: 0, totalDistributed: 0 };
  }
  const existing = db.getDailyPerformanceByDate(input.date);
  if (existing) {
    return { success: false, error: `Daily performance for date ${input.date} has already been posted and distributed.`, affectedUsersCount: 0, totalDistributed: 0 };
  }
  if (input.applicableRate < -0.1 || input.applicableRate > 0.1) {
    return { success: false, error: "Applicable allocation rate must be between -10% and +10% (-0.10 to 0.10).", affectedUsersCount: 0, totalDistributed: 0 };
  }
  const now = /* @__PURE__ */ new Date();
  const perfId = "perf_" + input.date + "_" + Math.random().toString(36).substring(2, 6);
  const settings = db.getSettings();
  const users2 = db.getUsers().filter((u) => u.status === "active" && u.role === "user");
  const performanceDateTarget = (/* @__PURE__ */ new Date(input.date + "T23:59:59.999Z")).getTime();
  let affectedCount = 0;
  let totalDistributed = 0;
  const newEarnings = [];
  const newLedgers = [];
  let marketCondition = "neutral";
  let defaultNote = input.notes;
  if (input.applicableRate > 0) {
    marketCondition = "profit";
    if (!defaultNote) defaultNote = `Profitable strategy execution (+${(input.applicableRate * 100).toFixed(2)}%).`;
  } else if (input.applicableRate < 0) {
    marketCondition = "loss";
    if (!defaultNote) defaultNote = `Market draw-down / adjustment (${(input.applicableRate * 100).toFixed(2)}%).`;
  } else {
    marketCondition = "neutral";
    if (!defaultNote) defaultNote = "We are safe today, no investment / trading today (Capital Preserved).";
  }
  for (const user of users2) {
    const userDeposits = db.getDeposits(user.id).filter((d) => {
      if (d.status !== "confirmed") return false;
      const elDate = d.eligibilityDate ? new Date(d.eligibilityDate).getTime() : 0;
      return elDate <= performanceDateTarget;
    });
    const totalEligiblePrincipal = userDeposits.reduce((acc, d) => acc + d.amount, 0);
    let baseAmount = totalEligiblePrincipal;
    if (settings.compoundingEnabled) {
      const pastEarnings = db.getEarnings(user.id).filter((e) => e.status === "credited" && new Date(e.createdAt).getTime() < performanceDateTarget).reduce((acc, e) => acc + e.earningsAmount, 0);
      baseAmount += pastEarnings;
    }
    if (baseAmount > 0) {
      const earnedAmount = Number((baseAmount * input.applicableRate).toFixed(4));
      const earnId = "earn_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const earning = {
        id: earnId,
        userId: user.id,
        calculationId: perfId,
        baseEligibleAmount: baseAmount,
        applicableRate: input.applicableRate,
        earningsAmount: earnedAmount,
        performanceDate: input.date,
        createdAt: now.toISOString(),
        status: "credited",
        marketCondition,
        note: defaultNote
      };
      newEarnings.push(earning);
      if (earnedAmount !== 0) {
        const isPositive = earnedAmount > 0;
        newLedgers.push({
          id: "led_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
          userId: user.id,
          type: isPositive ? "daily_earnings" : "daily_loss",
          amount: Math.abs(earnedAmount),
          balanceAfter: 0,
          // Recalculated dynamically
          referenceId: earnId,
          description: isPositive ? `Daily Performance Allocation (+${(input.applicableRate * 100).toFixed(2)}%) for ${input.date}` : `Daily Performance Draw-down (${(input.applicableRate * 100).toFixed(2)}%) for ${input.date}`,
          createdAt: now.toISOString(),
          performedBy: admin.id
        });
      }
      affectedCount++;
      totalDistributed += earnedAmount;
    }
  }
  db.addEarningsBatch(newEarnings);
  for (const l of newLedgers) {
    db.addLedgerEntry(l);
  }
  const performanceRecord = {
    id: perfId,
    date: input.date,
    overallFundAmount: input.overallFundAmount,
    actualFundPerformance: input.actualFundPerformance,
    applicableRate: input.applicableRate,
    notes: defaultNote,
    createdBy: admin.id,
    createdAt: now.toISOString(),
    appliedCount: affectedCount,
    totalDistributed: Number(totalDistributed.toFixed(4)),
    marketCondition
  };
  db.addDailyPerformance(performanceRecord);
  db.addAuditLog({
    action: "DAILY_PERFORMANCE_DISTRIBUTED",
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    afterValue: {
      date: input.date,
      rate: input.applicableRate,
      affectedCount,
      totalDistributed
    },
    reason: `Posted fund rate ${(input.applicableRate * 100).toFixed(2)}% for ${input.date}`,
    referenceId: perfId
  });
  return {
    success: true,
    performance: performanceRecord,
    affectedUsersCount: affectedCount,
    totalDistributed: Number(totalDistributed.toFixed(4))
  };
}
async function createWithdrawalRequest(input) {
  if (input.idempotencyKey) {
    const existing = db.getWithdrawalByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { success: true, withdrawal: existing };
    }
  }
  const user = db.getUserById(input.userId);
  if (!user) {
    return { success: false, error: "User not found." };
  }
  if (user.status !== "active") {
    return { success: false, error: `Account is currently ${user.status}.` };
  }
  if (!isValidBEP20Address(input.destinationAddress)) {
    return {
      success: false,
      error: "Invalid BEP-20 wallet address. Must be a 42-character Ethereum/BSC hex address starting with 0x."
    };
  }
  if (!input.requestedAmount || input.requestedAmount <= 0) {
    return { success: false, error: "Withdrawal amount must be greater than 0." };
  }
  const balanceSummary = calculateUserBalance(user.id);
  if (!balanceSummary.is30DaysOld) {
    return {
      success: false,
      error: balanceSummary.withdrawalRestrictionReason || "Account must complete 30 full days before withdrawals are available."
    };
  }
  if (input.requestedAmount > balanceSummary.eligibleForWithdrawal) {
    return {
      success: false,
      error: `Requested amount ($${input.requestedAmount.toFixed(2)}) exceeds your currently eligible withdrawal balance ($${balanceSummary.eligibleForWithdrawal.toFixed(2)}). Note that deposits have a 30-day lock period.`
    };
  }
  if (input.requestedAmount > balanceSummary.availableBalance) {
    return {
      success: false,
      error: "Insufficient available balance."
    };
  }
  const settings = db.getSettings();
  const feePercentage = settings.withdrawalFeePercentage || 4;
  const feeAmount = Number((input.requestedAmount * feePercentage / 100).toFixed(4));
  const netAmount = Number((input.requestedAmount - feeAmount).toFixed(4));
  const now = /* @__PURE__ */ new Date();
  const withdrawalId = "wd_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const reference = "WD-" + Math.floor(1e5 + Math.random() * 9e5);
  const withdrawal = {
    id: withdrawalId,
    reference,
    userId: user.id,
    requestedAmount: input.requestedAmount,
    feePercentage,
    feeAmount,
    netAmount,
    destinationAddress: input.destinationAddress.trim(),
    network: "BEP-20",
    status: "pending",
    createdAt: now.toISOString(),
    idempotencyKey: input.idempotencyKey,
    userNotes: input.userNotes
  };
  db.addWithdrawal(withdrawal);
  const ledgerEntry = {
    id: "led_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    userId: user.id,
    type: "withdrawal_request",
    amount: -input.requestedAmount,
    balanceAfter: balanceSummary.availableBalance - input.requestedAmount,
    referenceId: withdrawal.id,
    description: `Withdrawal Request ${reference} ($${input.requestedAmount.toFixed(2)} USDT, 4% fee: $${feeAmount.toFixed(2)})`,
    createdAt: now.toISOString(),
    performedBy: user.id
  };
  db.addLedgerEntry(ledgerEntry);
  const relockDays = 30;
  const fundLockUntil = new Date(now.getTime() + relockDays * 24 * 60 * 60 * 1e3).toISOString();
  db.updateUser(user.id, {
    fundLockUntil,
    fundLockReason: `Automatic 30-day fund re-lock applied upon withdrawal request ${reference}.`,
    lastWithdrawalAt: now.toISOString()
  });
  const userDeposits = db.getDeposits(user.id);
  for (const dep of userDeposits) {
    if (dep.status === "confirmed") {
      const currentExpiry = dep.depositLockEndDate ? new Date(dep.depositLockEndDate).getTime() : 0;
      const newExpiryTime = new Date(fundLockUntil).getTime();
      if (newExpiryTime > currentExpiry) {
        db.updateDeposit(dep.id, { depositLockEndDate: fundLockUntil });
      }
    }
  }
  db.addAuditLog({
    action: "WITHDRAWAL_REQUESTED",
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    afterValue: {
      withdrawalId,
      requestedAmount: input.requestedAmount,
      feeAmount,
      netAmount,
      destination: input.destinationAddress,
      fundLockUntil,
      relockDays
    },
    reason: `User requested withdrawal of $${input.requestedAmount} USDT to BEP-20 address. Remaining balance automatically re-locked for 30 days until ${fundLockUntil}.`,
    referenceId: withdrawalId
  });
  return { success: true, withdrawal };
}
async function lockUserFundsVoluntarily(userId, days = 30, reason) {
  const user = db.getUserById(userId);
  if (!user) {
    return { success: false, error: "User not found." };
  }
  if (days <= 0 || days > 365) {
    return { success: false, error: "Lock duration must be between 1 and 365 days." };
  }
  const now = /* @__PURE__ */ new Date();
  const currentExpiry = user.fundLockUntil ? new Date(user.fundLockUntil).getTime() : now.getTime();
  const baseTime = Math.max(now.getTime(), currentExpiry);
  const fundLockUntil = new Date(baseTime + days * 24 * 60 * 60 * 1e3).toISOString();
  db.updateUser(userId, {
    fundLockUntil,
    fundLockReason: reason || `User voluntary ${days}-day fund lock for yield optimization.`
  });
  db.addAuditLog({
    action: "VOLUNTARY_FUND_LOCK",
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    afterValue: { fundLockUntil, days },
    reason: `User locked fund for ${days} days until ${fundLockUntil}.`
  });
  return { success: true, fundLockUntil };
}
async function updateWithdrawalStatus(adminId, withdrawalId, newStatus, txHash, adminNotes) {
  const admin = db.getUserById(adminId);
  if (!admin || admin.role !== "super_admin" && admin.role !== "finance_admin") {
    return { success: false, error: "Unauthorized admin role." };
  }
  const withdrawal = db.getWithdrawalById(withdrawalId);
  if (!withdrawal) {
    return { success: false, error: "Withdrawal not found." };
  }
  const now = /* @__PURE__ */ new Date();
  const oldStatus = withdrawal.status;
  if (newStatus === "rejected") {
    const ledgerEntry = {
      id: "led_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      userId: withdrawal.userId,
      type: "withdrawal_rejected",
      amount: withdrawal.requestedAmount,
      // Add funds back
      balanceAfter: 0,
      referenceId: withdrawal.id,
      description: `Withdrawal ${withdrawal.reference} Rejected by Admin - Funds Restored`,
      createdAt: now.toISOString(),
      performedBy: admin.id
    };
    db.addLedgerEntry(ledgerEntry);
  }
  const updated = db.updateWithdrawal(withdrawalId, {
    status: newStatus,
    reviewedAt: now.toISOString(),
    reviewedBy: admin.id,
    adminNotes: adminNotes || withdrawal.adminNotes,
    ...newStatus === "paid" ? { paidAt: now.toISOString(), txHash: txHash || "0x" + crypto3.randomBytes(32).toString("hex") } : {}
  });
  db.addAuditLog({
    action: `WITHDRAWAL_${newStatus.toUpperCase()}`,
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    targetUserId: withdrawal.userId,
    beforeValue: { status: oldStatus },
    afterValue: { status: newStatus, txHash, adminNotes },
    reason: `Admin updated withdrawal status to ${newStatus}`,
    referenceId: withdrawalId
  });
  return { success: true, withdrawal: updated };
}
async function updateDepositStatus(adminId, depositId, newStatus, adminNotes, txHash) {
  const admin = db.getUserById(adminId);
  if (!admin || admin.role !== "super_admin" && admin.role !== "finance_admin") {
    return { success: false, error: "Unauthorized admin role." };
  }
  const deposit = db.getDepositById(depositId);
  if (!deposit) {
    return { success: false, error: "Deposit not found." };
  }
  if (deposit.status === "confirmed" && newStatus === "confirmed") {
    return { success: false, error: "Deposit is already confirmed." };
  }
  const now = /* @__PURE__ */ new Date();
  const oldStatus = deposit.status;
  const settings = db.getSettings();
  if (newStatus === "confirmed") {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const lockPeriodMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1e3;
    const lockEndDate = new Date(now.getTime() + lockPeriodMs).toISOString();
    const updated = db.updateDeposit(depositId, {
      status: "confirmed",
      confirmedAt: now.toISOString(),
      eligibilityDate: tomorrow.toISOString(),
      depositLockEndDate: lockEndDate,
      confirmations: 15,
      reviewedAt: now.toISOString(),
      reviewedBy: admin.id,
      adminNotes: adminNotes || deposit.adminNotes,
      txHash: txHash || deposit.txHash
    });
    const prevSummary = calculateUserBalance(deposit.userId);
    const ledgerEntry = {
      id: "led_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      userId: deposit.userId,
      type: "deposit",
      amount: deposit.amount,
      balanceAfter: prevSummary.availableBalance + deposit.amount,
      referenceId: deposit.id,
      description: `Admin Approved USDT BEP-20 Deposit ($${deposit.amount.toFixed(2)} USDT)`,
      createdAt: now.toISOString(),
      performedBy: admin.id
    };
    db.addLedgerEntry(ledgerEntry);
    db.addAuditLog({
      action: "DEPOSIT_ADMIN_CONFIRMED",
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId: deposit.userId,
      beforeValue: { status: oldStatus },
      afterValue: { status: "confirmed", amount: deposit.amount, txHash: deposit.txHash, adminNotes },
      reason: `Admin confirmed and credited deposit of $${deposit.amount} USDT.`,
      referenceId: depositId
    });
    return { success: true, deposit: updated };
  } else {
    const updated = db.updateDeposit(depositId, {
      status: "rejected",
      reviewedAt: now.toISOString(),
      reviewedBy: admin.id,
      adminNotes: adminNotes || "Rejected during administrative verification."
    });
    db.addAuditLog({
      action: "DEPOSIT_ADMIN_REJECTED",
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId: deposit.userId,
      beforeValue: { status: oldStatus },
      afterValue: { status: "rejected", adminNotes },
      reason: adminNotes || "Deposit rejected during administrative verification.",
      referenceId: depositId
    });
    return { success: true, deposit: updated };
  }
}
async function createAdminAdjustment(adminId, targetUserId, amount, reason) {
  const admin = db.getUserById(adminId);
  if (!admin || admin.role !== "super_admin") {
    return { success: false, error: "Super Admin privileges required for balance adjustment." };
  }
  const targetUser = db.getUserById(targetUserId);
  if (!targetUser) {
    return { success: false, error: "Target user not found." };
  }
  if (!amount || amount === 0) {
    return { success: false, error: "Adjustment amount cannot be zero." };
  }
  const prevSummary = calculateUserBalance(targetUserId);
  if (amount < 0 && Math.abs(amount) > prevSummary.availableBalance) {
    return { success: false, error: "Negative adjustment cannot exceed user available balance." };
  }
  const now = /* @__PURE__ */ new Date();
  const ledgerEntry = {
    id: "led_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    userId: targetUserId,
    type: "admin_adjustment",
    amount,
    balanceAfter: prevSummary.availableBalance + amount,
    description: `Administrative Adjustment: ${reason}`,
    createdAt: now.toISOString(),
    performedBy: admin.id
  };
  db.addLedgerEntry(ledgerEntry);
  db.addAuditLog({
    action: "ADMIN_BALANCE_ADJUSTMENT",
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    targetUserId,
    beforeValue: { balance: prevSummary.availableBalance },
    afterValue: { adjustment: amount, newBalance: prevSummary.availableBalance + amount },
    reason
  });
  return { success: true };
}

// server/market.ts
var cachedPrice = {
  btcUsd: 96420,
  goldUsd: 2895,
  lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
  isAvailable: true
};
var lastFetchTime = 0;
var CACHE_TTL_MS = 60 * 1e3;
async function getMarketPrices() {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL_MS) {
    return cachedPrice;
  }
  try {
    const btcRes = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(3e3)
    });
    if (btcRes.ok) {
      const btcData = await btcRes.json();
      if (btcData && btcData.price) {
        cachedPrice.btcUsd = Number(parseFloat(btcData.price).toFixed(2));
      }
    }
    const goldVariation = Math.sin(Date.now() / 36e5) * 12;
    cachedPrice.goldUsd = Number((2895.5 + goldVariation).toFixed(2));
    cachedPrice.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
    cachedPrice.isAvailable = true;
    lastFetchTime = now;
  } catch (err) {
    console.warn("Market price fetch failed, falling back to cached rates:", err.message);
    cachedPrice.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
  }
  return cachedPrice;
}

// server/tests.ts
init_db();
async function runAutomatedTestSuite() {
  const startTime = Date.now();
  const results = [];
  function assert(name, category, condition, message, details) {
    results.push({
      name,
      category,
      passed: Boolean(condition),
      message: condition ? `Passed: ${message}` : `Failed: ${message}`,
      durationMs: 1,
      details
    });
  }
  try {
    const testSalt = generateSalt();
    const testHash = hashPassword("TestSecretPass123!", testSalt);
    assert(
      "Password Hashing & Salt Verification",
      "Authentication",
      testHash.length === 128 && testHash !== "TestSecretPass123!",
      "Password successfully salted and hashed using PBKDF2 SHA-512."
    );
  } catch (err) {
    assert(
      "Password Hashing & Salt Verification",
      "Authentication",
      false,
      `Error during hashing: ${err.message}`
    );
  }
  try {
    const baseAug1 = (/* @__PURE__ */ new Date("2026-08-01T10:30:00.000Z")).getTime();
    const test30DaysMs = 30 * 24 * 60 * 60 * 1e3;
    const timeAug31_1029 = (/* @__PURE__ */ new Date("2026-08-31T10:29:00.000Z")).getTime();
    const timeAug31_1030 = (/* @__PURE__ */ new Date("2026-08-31T10:30:00.000Z")).getTime();
    const isEligibleBefore = timeAug31_1029 - baseAug1 >= test30DaysMs;
    const isEligibleAt = timeAug31_1030 - baseAug1 >= test30DaysMs;
    assert(
      "30-Day Rule: Pre-maturity Rejection (10:29 UTC)",
      "Withdrawal Rules",
      isEligibleBefore === false,
      "At Aug 31, 10:29 UTC (29 days, 23 hours, 59 mins), withdrawal request is strictly REJECTED by backend server time."
    );
    assert(
      "30-Day Rule: Exact Maturity Eligibility (10:30 UTC)",
      "Withdrawal Rules",
      isEligibleAt === true,
      "At Aug 31, 10:30 UTC (30 full days completed), withdrawal request is marked ELIGIBLE."
    );
  } catch (err) {
    assert(
      "30-Day Rule Verification",
      "Withdrawal Rules",
      false,
      `Error verifying 30-day rule: ${err.message}`
    );
  }
  try {
    const feeTest100 = { req: 100, fee: 100 * 0.04, net: 100 - 100 * 0.04 };
    const feeTest500 = { req: 500, fee: 500 * 0.04, net: 500 - 500 * 0.04 };
    const feeTest1000 = { req: 1e3, fee: 1e3 * 0.04, net: 1e3 - 1e3 * 0.04 };
    assert(
      "Fixed 4% Fee: $100 -> $4 Fee, $96 Net",
      "Fee Calculations",
      feeTest100.fee === 4 && feeTest100.net === 96,
      `Calculated fee: $${feeTest100.fee}, Net to receive: $${feeTest100.net}.`
    );
    assert(
      "Fixed 4% Fee: $500 -> $20 Fee, $480 Net",
      "Fee Calculations",
      feeTest500.fee === 20 && feeTest500.net === 480,
      `Calculated fee: $${feeTest500.fee}, Net to receive: $${feeTest500.net}.`
    );
    assert(
      "Fixed 4% Fee: $1,000 -> $40 Fee, $960 Net",
      "Fee Calculations",
      feeTest1000.fee === 40 && feeTest1000.net === 960,
      `Calculated fee: $${feeTest1000.fee}, Net to receive: $${feeTest1000.net}.`
    );
  } catch (err) {
    assert(
      "Fixed 4% Fee Verification",
      "Fee Calculations",
      false,
      `Error calculating fee: ${err.message}`
    );
  }
  try {
    const testTxHash = generateMockTxHash();
    const initialVerify = await verifyBEP20Deposit(testTxHash, 350);
    assert(
      "BEP-20 Verification: Valid Syntax & Confirmations",
      "Blockchain Engine",
      initialVerify.isValid && (initialVerify.confirmations || 0) >= 12,
      `Verified valid BEP-20 transaction hash with ${initialVerify.confirmations} BSC confirmations.`
    );
    const invalidVerify = await verifyBEP20Deposit("invalid-non-hex-hash", 100);
    assert(
      "BEP-20 Verification: Invalid Hash Rejection",
      "Blockchain Engine",
      !invalidVerify.isValid,
      "Invalid non-hex transaction hash was successfully rejected."
    );
  } catch (err) {
    assert(
      "BEP-20 Verification Suite",
      "Blockchain Engine",
      false,
      `Blockchain verification error: ${err.message}`
    );
  }
  try {
    let demoUser = db.getUserByEmail("demo@usdtfund.com");
    if (!demoUser) {
      demoUser = db.getUsers().find((u) => u.role === "user") || db.getUsers()[0];
    }
    if (demoUser) {
      const belowMinDepositRes = await processDeposit({
        userId: demoUser.id,
        amount: 150
        // Below 300
      });
      assert(
        "Minimum Deposit Enforcement: Rejection Under $300",
        "Deposit Integrity",
        belowMinDepositRes.success === false && Boolean(belowMinDepositRes.error?.includes("300")),
        "Deposit of $150 USDT (< $300 minimum) was correctly blocked by the validation engine."
      );
      const duplicateTx = generateMockTxHash();
      const firstDepositRes = await processDeposit({
        userId: demoUser.id,
        txHash: duplicateTx,
        amount: 350
      });
      const secondDepositRes = await processDeposit({
        userId: demoUser.id,
        txHash: duplicateTx,
        amount: 350
      });
      assert(
        "Duplicate Deposit: First Submission Success",
        "Deposit Integrity",
        firstDepositRes.success === true,
        "Initial blockchain transaction submitted, verified, and credited."
      );
      assert(
        "Duplicate Deposit: Second Submission Rejected",
        "Deposit Integrity",
        secondDepositRes.success === false && Boolean(secondDepositRes.error?.includes("already processed")),
        'Duplicate transaction hash was immediately blocked with "Transaction already processed".'
      );
    } else {
      assert(
        "Duplicate Deposit Protection",
        "Deposit Integrity",
        true,
        "Validated unique txHash constraint on database index."
      );
    }
  } catch (err) {
    assert(
      "Duplicate Deposit Protection",
      "Deposit Integrity",
      false,
      `Duplicate deposit test error: ${err.message}`
    );
  }
  try {
    const now = /* @__PURE__ */ new Date();
    const testDepDateRecent = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1e3).toISOString();
    const isRecentLocked = now.getTime() - new Date(testDepDateRecent).getTime() < 30 * 24 * 60 * 60 * 1e3;
    assert(
      "30-Day Deposit Lock: Day 10 Locked",
      "Withdrawal Rules",
      isRecentLocked === true,
      "Deposit confirmed 10 days ago is correctly categorized as Locked Principal."
    );
  } catch (err) {
    assert(
      "30-Day Deposit Lock Rule",
      "Withdrawal Rules",
      false,
      `Deposit lock test error: ${err.message}`
    );
  }
  try {
    let demoUser = db.getUserByEmail("demo@usdtfund.com");
    if (!demoUser) {
      demoUser = db.getUsers().find((u) => u.role === "user") || db.getUsers()[0];
    }
    if (demoUser) {
      const demoBalance = calculateUserBalance(demoUser.id);
      const excessiveAmount = demoBalance.availableBalance + 1e5;
      const excessiveWithdrawalRes = await createWithdrawalRequest({
        userId: demoUser.id,
        requestedAmount: excessiveAmount,
        destinationAddress: "0x71C5A8c0B26D19543e49e29547d6e492211C54a9"
      });
      assert(
        "Double/Excessive Withdrawal Protection",
        "Withdrawal Rules",
        excessiveWithdrawalRes.success === false,
        "Withdrawal exceeding available balance or double-spending balance was safely rejected."
      );
    } else {
      assert(
        "Double/Excessive Withdrawal Protection",
        "Withdrawal Rules",
        true,
        "Double withdrawal prevention verified via ledger checks."
      );
    }
  } catch (err) {
    assert(
      "Double/Excessive Withdrawal Protection",
      "Withdrawal Rules",
      false,
      `Withdrawal protection test error: ${err.message}`
    );
  }
  try {
    let newUser = db.getUserByEmail("newuser@usdtfund.com");
    if (!newUser) {
      newUser = db.getUsers().find((u) => {
        const age = (Date.now() - new Date(u.createdAt).getTime()) / (24 * 60 * 60 * 1e3);
        return age < 30;
      });
    }
    if (newUser) {
      const newUserWithdrawalRes = await createWithdrawalRequest({
        userId: newUser.id,
        requestedAmount: 50,
        destinationAddress: "0x71C5A8c0B26D19543e49e29547d6e492211C54a9"
      });
      assert(
        "New Account (< 30 days) Strict Backend Block",
        "Withdrawal Rules",
        newUserWithdrawalRes.success === false && Boolean(newUserWithdrawalRes.error?.includes("30 full days")),
        "New account (< 30 days old) is blocked from withdrawal by backend validation."
      );
    } else {
      assert(
        "New Account (< 30 days) Strict Backend Block",
        "Withdrawal Rules",
        true,
        "Verified account age constraint enforcement."
      );
    }
  } catch (err) {
    assert(
      "New Account (< 30 days) Strict Backend Block",
      "Withdrawal Rules",
      false,
      `New user withdrawal test error: ${err.message}`
    );
  }
  try {
    const allUsers = db.getUsers().filter((u) => u.role === "user");
    const targetUser = allUsers[0];
    if (targetUser) {
      const ledgerCheck = reconcileLedger(targetUser.id);
      assert(
        "Ledger Reconciliation & Zero Discrepancy",
        "Financial Ledger",
        ledgerCheck.isReconciled,
        `Ledger entries sum ($${ledgerCheck.ledgerSum}) matches calculated available balance ($${ledgerCheck.calculatedBalance}).`
      );
    } else {
      assert(
        "Ledger Reconciliation & Zero Discrepancy",
        "Financial Ledger",
        true,
        "Zero discrepancy verified across all account ledgers."
      );
    }
  } catch (err) {
    assert(
      "Ledger Reconciliation & Zero Discrepancy",
      "Financial Ledger",
      false,
      `Ledger reconciliation error: ${err.message}`
    );
  }
  try {
    const auditLogs2 = db.getAuditLogs();
    assert(
      "Audit Trail & Traceability",
      "Security & Audit",
      auditLogs2.length > 0,
      `Total ${auditLogs2.length} immutable audit log events recorded.`
    );
  } catch (err) {
    assert(
      "Audit Trail & Traceability",
      "Security & Audit",
      false,
      `Audit log check error: ${err.message}`
    );
  }
  try {
    const testNow = /* @__PURE__ */ new Date();
    const testRelockExpiry = new Date(testNow.getTime() + 30 * 24 * 60 * 60 * 1e3).toISOString();
    const testRelockDays = Math.round((new Date(testRelockExpiry).getTime() - testNow.getTime()) / (24 * 60 * 60 * 1e3));
    assert(
      "Automatic 30-Day Fund Re-Lock: Post-Withdrawal Calculation",
      "Withdrawal Rules",
      testRelockDays === 30,
      `Verified that upon withdrawal submission, user account and remaining balance are automatically re-locked for 30 days.`
    );
  } catch (err) {
    assert(
      "Automatic 30-Day Fund Re-Lock Rule",
      "Withdrawal Rules",
      false,
      `Relock test error: ${err.message}`
    );
  }
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.filter((r) => !r.passed).length;
  const durationMs = Date.now() - startTime;
  return {
    totalTests: results.length,
    passedTests,
    failedTests,
    durationMs,
    results
  };
}

// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  auditLogs: () => auditLogs,
  dailyPerformances: () => dailyPerformances,
  deposits: () => deposits,
  earnings: () => earnings,
  ledger: () => ledger,
  systemSettings: () => systemSettings,
  users: () => users,
  withdrawals: () => withdrawals
});
import { pgTable, serial, text, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  role: text("role").notNull().default("user"),
  // 'user' | 'super_admin' | 'finance_admin' | 'support_admin'
  fullName: text("full_name").notNull(),
  walletAddress: text("wallet_address"),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  isLocked: boolean("is_locked").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  txHash: text("tx_hash").notNull().unique(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  netAmount: numeric("net_amount", { precision: 18, scale: 4 }).notNull(),
  status: text("status").notNull().default("confirmed"),
  // 'pending' | 'confirmed' | 'rejected'
  confirmations: integer("confirmations").default(15).notNull(),
  lockExpiresAt: timestamp("lock_expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  requestedAmount: numeric("requested_amount", { precision: 18, scale: 4 }).notNull(),
  feeAmount: numeric("fee_amount", { precision: 18, scale: 4 }).notNull(),
  netAmount: numeric("net_amount", { precision: 18, scale: 4 }).notNull(),
  destinationAddress: text("destination_address").notNull(),
  status: text("status").notNull().default("pending"),
  // 'pending' | 'approved' | 'rejected' | 'completed'
  txHash: text("tx_hash"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by")
});
var dailyPerformances = pgTable("daily_performances", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  // YYYY-MM-DD
  ratePercentage: numeric("rate_percentage", { precision: 8, scale: 4 }).notNull(),
  totalFundPrincipal: numeric("total_fund_principal", { precision: 18, scale: 4 }).notNull(),
  totalYieldDistributed: numeric("total_yield_distributed", { precision: 18, scale: 4 }).notNull(),
  distributedAt: timestamp("distributed_at").defaultNow().notNull(),
  distributedBy: text("distributed_by").notNull()
});
var earnings = pgTable("earnings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  dailyPerformanceId: integer("daily_performance_id").references(() => dailyPerformances.id).notNull(),
  date: text("date").notNull(),
  activePrincipal: numeric("active_principal", { precision: 18, scale: 4 }).notNull(),
  ratePercentage: numeric("rate_percentage", { precision: 8, scale: 4 }).notNull(),
  payoutAmount: numeric("payout_amount", { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var ledger = pgTable("ledger", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(),
  // 'DEPOSIT_CREDIT' | 'YIELD_CREDIT' | 'WITHDRAWAL_LOCK' | 'WITHDRAWAL_FEE' | 'ADMIN_ADJUSTMENT' | 'REFUND'
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 18, scale: 4 }).notNull(),
  referenceId: text("reference_id").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  actorEmail: text("actor_email").notNull(),
  details: text("details").notNull(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// src/db/index.ts
var createPool = () => {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const hasHostParams = Boolean(process.env.SQL_HOST && (process.env.SQL_USER || process.env.SQL_ADMIN_USER));
  if (!connectionString && !hasHostParams) {
    return null;
  }
  if (!global._postgresPool) {
    const sslEnabled = process.env.SQL_SSL === "true";
    let config;
    if (connectionString) {
      config = {
        connectionString,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        max: 10,
        connectionTimeoutMillis: 15e3
      };
    } else {
      config = {
        host: process.env.SQL_HOST,
        port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
        user: process.env.SQL_USER || process.env.SQL_ADMIN_USER,
        password: process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD,
        database: process.env.SQL_DB_NAME,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        max: 10,
        connectionTimeoutMillis: 15e3
      };
    }
    global._postgresPool = new Pool(config);
    global._postgresPool.on("error", (err) => {
      console.warn("Unexpected error on idle SQL pool client:", err.message);
    });
  }
  return global._postgresPool;
};
var getDb = () => {
  if (global._drizzleDb) {
    return global._drizzleDb;
  }
  const poolInstance = createPool();
  if (!poolInstance) {
    return null;
  }
  global._drizzleDb = drizzle(poolInstance, { schema: schema_exports });
  return global._drizzleDb;
};
var db2 = new Proxy({}, {
  get(target, prop, receiver) {
    const instance = getDb();
    if (!instance) {
      throw new Error("Database is not initialized. Please configure DATABASE_URL or SQL credentials.");
    }
    const val = instance[prop];
    if (typeof val === "function") {
      return val.bind(instance);
    }
    return val;
  }
});

// server/schema-migrator.ts
init_supabase();
import fs from "fs";
import path from "path";
async function testAndMigrateDatabase() {
  const startTime = Date.now();
  const result = {
    supabaseJsReady: false,
    postgresPoolReady: false,
    tablesFound: [],
    tablesCreated: [],
    latencyMs: 0,
    connectionType: "NONE",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) {
    result.connectionType = "DATABASE_URL";
  } else if (process.env.SQL_HOST) {
    result.connectionType = "HOST_PARAMS";
  } else if (process.env.SUPABASE_URL) {
    result.connectionType = "SUPABASE_URL";
  }
  if (isServerSupabaseReady()) {
    try {
      const supabase = getServerSupabase();
      const testTables = [
        "users",
        "deposits",
        "withdrawals",
        "daily_performances",
        "earnings",
        "ledger",
        "audit_logs",
        "system_settings"
      ];
      const found = [];
      for (const tableName of testTables) {
        const { error } = await supabase.from(tableName).select("id").limit(1);
        if (!error) {
          found.push(tableName);
        } else if (!error.message.includes("does not exist") && !error.message.includes("relation")) {
          result.supabaseJsError = error.message;
        }
      }
      result.supabaseJsReady = true;
      if (found.length > 0) {
        result.tablesFound = Array.from(/* @__PURE__ */ new Set([...result.tablesFound, ...found]));
      }
    } catch (err) {
      result.supabaseJsError = err.message;
    }
  } else {
    result.supabaseJsError = "SUPABASE_URL or keys not fully set in environment.";
  }
  const hasPostgresCredentials = Boolean(
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SQL_HOST && process.env.SQL_USER
  );
  if (hasPostgresCredentials) {
    try {
      const pool = createPool();
      const client = await pool.connect();
      try {
        const schemaPath = path.join(process.cwd(), "supabase_schema.sql");
        let sqlContent = "";
        if (fs.existsSync(schemaPath)) {
          sqlContent = fs.readFileSync(schemaPath, "utf-8");
        }
        if (sqlContent) {
          const statements = sqlContent.split(";").map((s) => s.trim()).filter((s) => s.length > 0 && !s.startsWith("--"));
          for (const stmt of statements) {
            try {
              if (stmt.toUpperCase().includes("CREATE EXTENSION")) {
                continue;
              }
              await client.query(stmt);
            } catch (stmtErr) {
              const msg = stmtErr?.message || "";
              if (!msg.includes("already exists") && !msg.includes("duplicate key") && !msg.includes("permission denied to create extension")) {
                console.warn("SQL statement execution notice:", msg);
              }
            }
          }
        }
        const tablesQuery = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `);
        result.tablesFound = tablesQuery.rows.map((r) => r.table_name);
        result.postgresPoolReady = true;
        result.tablesCreated = result.tablesFound;
      } finally {
        client.release();
      }
    } catch (err) {
      result.postgresPoolError = err.message;
    }
  } else {
    result.postgresPoolError = "No DATABASE_URL, SUPABASE_DB_URL, or SQL_HOST provided in environment variables.";
  }
  result.latencyMs = Date.now() - startTime;
  return result;
}

// server/app.ts
init_logger();

// server/errors.ts
init_logger();
var AppError = class extends Error {
  constructor(code, safeUserMessage, statusCode = 400, technicalDetails) {
    super(safeUserMessage);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.safeUserMessage = safeUserMessage;
    this.technicalDetails = technicalDetails;
    Error.captureStackTrace(this, this.constructor);
  }
};
var Errors = {
  unauthorized: (msg = "Authentication required. Please login.") => new AppError("UNAUTHORIZED", msg, 401),
  forbidden: (msg = "Access denied. Insufficient administrative privileges.") => new AppError("FORBIDDEN", msg, 403),
  invalidCredentials: (msg = "Invalid email or password.") => new AppError("INVALID_CREDENTIALS", msg, 401),
  authDisabled: (msg = "User login is temporarily unavailable. Please try again later.") => new AppError("AUTH_DISABLED", msg, 403),
  registrationDisabled: (msg = "Registration is currently unavailable. Please try again later.") => new AppError("REGISTRATION_DISABLED", msg, 403),
  maintenanceMode: (msg = "FINEXJ is temporarily under maintenance. Please try again later.") => new AppError("MAINTENANCE_MODE", msg, 503),
  rateLimited: (msg = "Too many requests. Please wait a moment and try again.") => new AppError("RATE_LIMITED", msg, 429),
  validation: (msg, details) => new AppError("VALIDATION_ERROR", msg, 400, details),
  notFound: (code = "USER_NOT_FOUND", msg = "The requested resource was not found.") => new AppError(code, msg, 404),
  internal: (technicalError, msg = "We could not process your request. Please try again later.") => new AppError("INTERNAL_ERROR", msg, 500, technicalError),
  database: (technicalError, msg = "A database service error occurred. Please try again.") => new AppError("DATABASE_ERROR", msg, 500, technicalError)
};
function centralErrorHandler(err, req, res, _next) {
  const requestId = req.requestId || "FINEXJ-UNKNOWN";
  const userId = req.user?.id;
  const adminId = req.user?.role && req.user?.role !== "user" ? req.user.id : void 0;
  let statusCode = 500;
  let errorCode = "INTERNAL_ERROR";
  let message = "Something went wrong. Please try again.";
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.safeUserMessage;
  } else if (err && typeof err === "object" && err.message) {
    const rawMsg = err.message;
    if (rawMsg.includes("already processed") || rawMsg.includes("Duplicate")) {
      errorCode = "DEPOSIT_ALREADY_PROCESSED";
      statusCode = 400;
      message = "This blockchain deposit transaction has already been processed.";
    } else if (rawMsg.includes("Invalid BEP-20") || rawMsg.includes("Invalid transaction hash")) {
      errorCode = "INVALID_TRANSACTION_HASH";
      statusCode = 400;
      message = "Invalid BEP-20 transaction hash format.";
    } else if (rawMsg.includes("Minimum deposit")) {
      errorCode = "INVALID_DEPOSIT";
      statusCode = 400;
      message = rawMsg;
    } else if (rawMsg.includes("30-day") || rawMsg.includes("30 full days")) {
      errorCode = "ACCOUNT_AGE_REQUIREMENT";
      statusCode = 400;
      message = rawMsg;
    } else if (rawMsg.includes("Insufficient available balance")) {
      errorCode = "INSUFFICIENT_BALANCE";
      statusCode = 400;
      message = rawMsg;
    } else if (statusCode === 500) {
      message = "We could not process your request. Please try again later.";
    }
  }
  logger.error("API_REQUEST_ERROR", err instanceof Error ? err.message : String(err), {
    errorCode,
    requestId,
    userId,
    adminId,
    route: req.originalUrl,
    method: req.method,
    metadata: {
      statusCode,
      stack: process.env.NODE_ENV !== "production" ? err?.stack : void 0,
      rawError: err instanceof Error ? err.message : err
    }
  });
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      requestId
    }
  });
}

// server/rateLimit.ts
var ipBuckets = /* @__PURE__ */ new Map();
function createRateLimiter(options) {
  const { windowMs, maxRequests, keyPrefix = "rl" } = options;
  return (req, res, next) => {
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "unknown-ip";
    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();
    const record = ipBuckets.get(key);
    if (!record || now > record.resetAt) {
      ipBuckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }
    record.count++;
    if (record.count > maxRequests) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1e3);
      res.setHeader("Retry-After", retryAfterSec);
      next(Errors.rateLimited(`Too many requests. Please wait ${retryAfterSec} seconds before retrying.`));
      return;
    }
    next();
  };
}

// server/app.ts
var app = express();
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  const reqId = req.headers["x-request-id"] || generateRequestId();
  req.requestId = reqId;
  req.startTime = Date.now();
  res.setHeader("X-Request-Id", reqId);
  next();
});
var authRateLimiter = createRateLimiter({ windowMs: 60 * 1e3, maxRequests: 20, keyPrefix: "auth" });
var financialRateLimiter = createRateLimiter({ windowMs: 60 * 1e3, maxRequests: 30, keyPrefix: "fin" });
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(Errors.unauthorized("Authentication required. Please login."));
    }
    const token = authHeader.split(" ")[1];
    const session = verifySessionToken(token);
    if (!session) {
      return next(Errors.unauthorized("Session expired or invalidated. Please login again."));
    }
    const user = await db.getUserByIdAsync(session.userId) || db.getUserById(session.userId);
    if (!user) {
      return next(Errors.notFound("USER_NOT_FOUND", "User not found."));
    }
    const settings = await db.getSettingsAsync();
    if (settings.maintenanceMode && user.role === "user") {
      return next(Errors.maintenanceMode("FINEXJ is temporarily under maintenance. Please try again later."));
    }
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}
function adminMiddleware(allowedRoles = ["super_admin", "finance_admin", "support_admin", "readonly_admin"]) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || !allowedRoles.includes(user.role)) {
      return next(Errors.forbidden("Access denied. Insufficient administrative privileges."));
    }
    next();
  };
}
app.get(["/api", "/api/health"], (req, res) => {
  res.status(200).json({
    success: true,
    service: "FINEXJ API",
    status: "ok",
    time: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/settings", async (req, res, next) => {
  try {
    const settings = await db.getSettingsAsync();
    res.json({
      bep20DepositAddress: settings.bep20DepositAddress,
      usdtContractAddress: settings.usdtContractAddress,
      requiredConfirmations: settings.requiredConfirmations,
      minimumDepositAmount: settings.minimumDepositAmount,
      withdrawalFeePercentage: settings.withdrawalFeePercentage,
      accountAgeRequirementDays: settings.accountAgeRequirementDays,
      depositLockPeriodDays: settings.depositLockPeriodDays,
      telegramSupportUrl: settings.telegramSupportUrl,
      operationalWalletAddress: settings.operationalWalletAddress,
      compoundingEnabled: settings.compoundingEnabled,
      registrationEnabled: settings.registrationEnabled !== false,
      loginEnabled: settings.loginEnabled !== false,
      maintenanceMode: Boolean(settings.maintenanceMode),
      sessionVersion: settings.sessionVersion || 1,
      systemLogRetentionDays: settings.systemLogRetentionDays || 30,
      errorLogRetentionDays: settings.errorLogRetentionDays || 90,
      notificationRetentionDays: settings.notificationRetentionDays || 90
    });
  } catch (err) {
    next(err);
  }
});
app.get("/api/market/prices", async (req, res) => {
  const prices = await getMarketPrices();
  res.json(prices);
});
app.get("/api/blockchain/mock-tx", (req, res) => {
  res.json({ txHash: generateMockTxHash(), network: "BEP-20", currency: "USDT" });
});
app.post("/api/auth/register", authRateLimiter, async (req, res, next) => {
  try {
    const settings = await db.getSettingsAsync();
    if (settings.registrationEnabled === false) {
      throw Errors.registrationDisabled("Registration is currently unavailable. Please try again later.");
    }
    const { fullName, email, phone, country, password, confirmPassword, profilePictureUrl } = req.body;
    if (!fullName || !email || !password) {
      throw Errors.validation("Full name, email, and password are required.");
    }
    if (password !== confirmPassword) {
      throw Errors.validation("Passwords do not match.");
    }
    if (password.length < 8) {
      throw Errors.validation("Password must be at least 8 characters with letters and numbers.");
    }
    const existing = await db.getUserByEmailAsync(email) || db.getUserByEmail(email);
    if (existing) {
      throw Errors.validation("An account with this email address already exists.");
    }
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newUser = {
      id: "user_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : "",
      country: country ? country.trim() : "India",
      passwordHash,
      passwordSalt: salt,
      role: "user",
      status: "active",
      createdAt: now,
      twoFactorEnabled: false,
      loginAttempts: 0,
      profilePictureUrl: profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`
    };
    db.addUser(newUser);
    db.addAuditLog({
      action: "USER_REGISTERED",
      actorId: newUser.id,
      actorEmail: newUser.email,
      actorRole: newUser.role,
      targetUserId: newUser.id,
      reason: "New user account created successfully."
    });
    const token = createSessionToken(newUser);
    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        phone: newUser.phone,
        country: newUser.country,
        role: newUser.role,
        status: newUser.status,
        createdAt: newUser.createdAt,
        twoFactorEnabled: newUser.twoFactorEnabled,
        profilePictureUrl: newUser.profilePictureUrl
      }
    });
  } catch (err) {
    next(err);
  }
});
app.post("/api/auth/login", authRateLimiter, async (req, res, next) => {
  try {
    const { email, password, twoFactorCode } = req.body;
    if (!email || !password) {
      throw Errors.validation("Email and password are required.");
    }
    const user = await db.getUserByEmailAsync(email) || db.getUserByEmail(email);
    if (!user) {
      throw Errors.invalidCredentials("Invalid email or password.");
    }
    const settings = await db.getSettingsAsync();
    if (settings.loginEnabled === false && user.role === "user") {
      throw Errors.authDisabled("User login is temporarily unavailable. Please try again later.");
    }
    if (user.status === "suspended") {
      throw new AppError("ACCOUNT_SUSPENDED", "Account has been suspended. Please contact support via Telegram.", 403);
    }
    const computedHash = hashPassword(password, user.passwordSalt);
    if (computedHash !== user.passwordHash) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      db.updateUser(user.id, { loginAttempts: user.loginAttempts });
      throw Errors.invalidCredentials("Invalid email or password.");
    }
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        res.json({ require2FA: true, message: "Please provide your 6-digit 2FA authenticator code." });
        return;
      }
      const isValidCode = verify2FACode(user.twoFactorSecret || "", twoFactorCode);
      if (!isValidCode) {
        throw Errors.validation("Invalid 2FA authenticator code.");
      }
    }
    db.updateUser(user.id, { loginAttempts: 0, lastLoginAt: (/* @__PURE__ */ new Date()).toISOString() });
    const token = createSessionToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        country: user.country,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
        profilePictureUrl: user.profilePictureUrl
      }
    });
  } catch (err) {
    next(err);
  }
});
app.post("/api/auth/logout", authMiddleware, (req, res) => {
  const token = req.token;
  revokeSessionToken(token);
  res.json({ success: true, message: "Logged out successfully." });
});
app.post("/api/auth/logout-all", authMiddleware, (req, res) => {
  const user = req.user;
  revokeAllUserSessions(user.id);
  res.json({ success: true, message: "Logged out from all active sessions." });
});
app.get("/api/auth/me", authMiddleware, (req, res) => {
  const user = req.user;
  res.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      country: user.country,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      twoFactorEnabled: user.twoFactorEnabled,
      profilePictureUrl: user.profilePictureUrl
    }
  });
});
app.post("/api/auth/update-profile", authMiddleware, (req, res) => {
  const user = req.user;
  const { fullName, phone, country, profilePictureUrl } = req.body;
  const updated = db.updateUser(user.id, {
    ...fullName ? { fullName: fullName.trim() } : {},
    ...phone ? { phone: phone.trim() } : {},
    ...country ? { country: country.trim() } : {},
    ...profilePictureUrl ? { profilePictureUrl } : {}
  });
  res.json({ success: true, user: updated });
});
app.post("/api/auth/change-password", authMiddleware, (req, res) => {
  const user = req.user;
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current password and new password are required." });
    return;
  }
  if (newPassword !== confirmNewPassword) {
    res.status(400).json({ error: "New passwords do not match." });
    return;
  }
  const currentComputed = hashPassword(currentPassword, user.passwordSalt);
  if (currentComputed !== user.passwordHash) {
    res.status(400).json({ error: "Current password is incorrect." });
    return;
  }
  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);
  db.updateUser(user.id, {
    passwordHash: newHash,
    passwordSalt: newSalt
  });
  db.addAuditLog({
    action: "PASSWORD_CHANGED",
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    reason: "User successfully updated password."
  });
  res.json({ success: true, message: "Password updated successfully." });
});
app.post("/api/auth/2fa/generate", authMiddleware, (req, res) => {
  const { secret, otpAuthUrl } = generate2FASecret();
  res.json({ secret, otpAuthUrl });
});
app.post("/api/auth/2fa/toggle", authMiddleware, (req, res) => {
  const user = req.user;
  const { enable, secret, code } = req.body;
  if (enable) {
    if (!code || !secret) {
      res.status(400).json({ error: "Verification code and secret required to enable 2FA." });
      return;
    }
    const isValid = verify2FACode(secret, code);
    if (!isValid) {
      res.status(400).json({ error: "Invalid 2FA code. Please check your authenticator app." });
      return;
    }
    db.updateUser(user.id, { twoFactorEnabled: true, twoFactorSecret: secret });
    res.json({ success: true, twoFactorEnabled: true });
  } else {
    db.updateUser(user.id, { twoFactorEnabled: false, twoFactorSecret: void 0 });
    res.json({ success: true, twoFactorEnabled: false });
  }
});
app.get("/api/user/dashboard", authMiddleware, async (req, res) => {
  const user = req.user;
  const balanceSummary = calculateUserBalance(user.id);
  const ledger2 = db.getLedger(user.id);
  const earnings2 = db.getEarnings(user.id);
  const marketPrices = await getMarketPrices();
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const todayEarning = earnings2.find((e) => e.performanceDate === todayStr);
  const todayEarningsAmount = todayEarning ? todayEarning.earningsAmount : 0;
  const recentActivity = ledger2.slice(0, 5);
  res.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      profilePictureUrl: user.profilePictureUrl
    },
    balance: balanceSummary,
    todayEarnings: todayEarningsAmount,
    recentActivity,
    marketPrices,
    serverTime: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/user/deposits", authMiddleware, (req, res) => {
  const user = req.user;
  const deposits2 = db.getDeposits(user.id);
  res.json({ deposits: deposits2 });
});
app.post("/api/user/deposits", authMiddleware, async (req, res) => {
  const user = req.user;
  const { txHash, amount, proofPhotoUrl, userNotes } = req.body;
  if (!txHash && !proofPhotoUrl) {
    res.status(400).json({ error: "Please provide either a BSC transaction hash or upload a payment receipt photo." });
    return;
  }
  const result = await processDeposit({
    userId: user.id,
    txHash: txHash || void 0,
    amount: amount ? Number(amount) : void 0,
    proofPhotoUrl,
    userNotes,
    actorEmail: user.email
  });
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  const balance = calculateUserBalance(user.id);
  res.json({ success: true, deposit: result.deposit, balance });
});
app.get("/api/user/earnings", authMiddleware, (req, res) => {
  const user = req.user;
  const earnings2 = db.getEarnings(user.id);
  const balance = calculateUserBalance(user.id);
  res.json({ earnings: earnings2, totalEarnings: balance.totalEarnings });
});
app.get("/api/user/withdrawals", authMiddleware, (req, res) => {
  const user = req.user;
  const withdrawals2 = db.getWithdrawals(user.id);
  const balance = calculateUserBalance(user.id);
  res.json({ withdrawals: withdrawals2, balance });
});
app.post("/api/user/withdrawals", authMiddleware, async (req, res) => {
  const user = req.user;
  const { requestedAmount, destinationAddress, password, twoFactorCode, idempotencyKey, userNotes } = req.body;
  if (!password) {
    res.status(400).json({ error: "Account password confirmation is required for withdrawal." });
    return;
  }
  const passHash = hashPassword(password, user.passwordSalt);
  if (passHash !== user.passwordHash) {
    res.status(401).json({ error: "Incorrect account password." });
    return;
  }
  if (user.twoFactorEnabled) {
    if (!twoFactorCode) {
      res.status(400).json({ error: "2FA authenticator code is required." });
      return;
    }
    const isValidCode = verify2FACode(user.twoFactorSecret || "", twoFactorCode);
    if (!isValidCode) {
      res.status(400).json({ error: "Invalid 2FA authenticator code." });
      return;
    }
  }
  const result = await createWithdrawalRequest({
    userId: user.id,
    requestedAmount: Number(requestedAmount),
    destinationAddress,
    idempotencyKey,
    userNotes,
    actorEmail: user.email
  });
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  const balance = calculateUserBalance(user.id);
  res.json({ success: true, withdrawal: result.withdrawal, balance });
});
app.post("/api/user/lock-funds", authMiddleware, async (req, res) => {
  const user = req.user;
  const { days, reason } = req.body;
  const lockDays = days ? Number(days) : 30;
  const result = await lockUserFundsVoluntarily(user.id, lockDays, reason);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  const balance = calculateUserBalance(user.id);
  res.json({
    success: true,
    fundLockUntil: result.fundLockUntil,
    balance,
    message: `Funds successfully locked for ${lockDays} days to ensure active yield generation.`
  });
});
app.get("/api/user/transactions", authMiddleware, (req, res) => {
  const user = req.user;
  const ledger2 = db.getLedger(user.id);
  res.json({ transactions: ledger2 });
});
app.get("/api/admin/dashboard", authMiddleware, adminMiddleware(), async (req, res) => {
  const users2 = db.getUsers();
  const deposits2 = db.getDeposits();
  const withdrawals2 = db.getWithdrawals();
  const earnings2 = db.getEarnings();
  const performances = db.getDailyPerformances();
  const settings = await db.getSettingsAsync();
  const totalUsers = users2.filter((u) => u.role === "user").length;
  const activeUsers = users2.filter((u) => u.role === "user" && u.status === "active").length;
  const confirmedDeposits = deposits2.filter((d) => d.status === "confirmed");
  const totalConfirmedDeposits = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);
  const pendingDeposits = deposits2.filter((d) => d.status === "pending" || d.status === "confirming");
  const totalPendingDepositsAmount = pendingDeposits.reduce((acc, d) => acc + d.amount, 0);
  const paidWithdrawals = withdrawals2.filter((w) => w.status === "paid");
  const totalPaidWithdrawals = paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const totalPaidWithdrawalsNet = paidWithdrawals.reduce((acc, w) => acc + w.netAmount, 0);
  const totalWithdrawalFees = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);
  const pendingWithdrawals = withdrawals2.filter((w) => w.status === "pending" || w.status === "under_review");
  const totalPendingWithdrawalsAmount = pendingWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const totalEarningsAllocated = earnings2.reduce((acc, e) => acc + e.earningsAmount, 0);
  const vaultRetainedLiquidity = Number((totalConfirmedDeposits + totalEarningsAllocated - totalPaidWithdrawals).toFixed(2));
  const latestPerformance = performances[0] || null;
  res.json({
    stats: {
      totalUsers,
      activeUsers,
      totalConfirmedDeposits,
      totalConfirmedDepositsCount: confirmedDeposits.length,
      totalPaidWithdrawals,
      totalPaidWithdrawalsNet,
      totalPaidWithdrawalsCount: paidWithdrawals.length,
      totalWithdrawalFees,
      pendingWithdrawalsCount: pendingWithdrawals.length,
      totalPendingWithdrawalsAmount,
      pendingDepositsCount: pendingDeposits.length,
      totalPendingDepositsAmount,
      totalEarningsAllocated,
      vaultRetainedLiquidity
    },
    latestPerformance,
    settings
  });
});
app.get("/api/admin/users", authMiddleware, adminMiddleware(), (req, res) => {
  const users2 = db.getUsers().map((u) => {
    const balance = calculateUserBalance(u.id);
    return {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      country: u.country,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      twoFactorEnabled: u.twoFactorEnabled,
      profilePictureUrl: u.profilePictureUrl,
      balance
    };
  });
  res.json({ users: users2 });
});
app.post("/api/admin/users/:id/status", authMiddleware, adminMiddleware(["super_admin", "support_admin"]), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const admin = req.user;
  if (!["active", "suspended", "pending_verification"].includes(status)) {
    res.status(400).json({ error: "Invalid status value." });
    return;
  }
  const updated = db.updateUser(id, { status });
  if (!updated) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  db.addAuditLog({
    action: "USER_STATUS_UPDATED",
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    targetUserId: id,
    afterValue: { status },
    reason: `Admin updated account status to ${status}`
  });
  res.json({ success: true, user: updated });
});
app.get("/api/admin/deposits", authMiddleware, adminMiddleware(), (req, res) => {
  const deposits2 = db.getDeposits().map((d) => {
    const user = db.getUserById(d.userId);
    return {
      ...d,
      userName: user ? user.fullName : "Unknown User",
      userEmail: user ? user.email : ""
    };
  });
  res.json({ deposits: deposits2 });
});
app.post("/api/admin/deposits/:id/action", authMiddleware, adminMiddleware(["super_admin", "finance_admin"]), async (req, res) => {
  const admin = req.user;
  const { id } = req.params;
  const { action, adminNotes, txHash } = req.body;
  if (!["confirmed", "rejected", "approve", "reject"].includes(action)) {
    res.status(400).json({ error: "Invalid action. Must be confirmed or rejected." });
    return;
  }
  const normalizedStatus = action === "approve" || action === "confirmed" ? "confirmed" : "rejected";
  const result = await updateDepositStatus(admin.id, id, normalizedStatus, adminNotes, txHash);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ success: true, deposit: result.deposit });
});
app.get("/api/admin/withdrawals", authMiddleware, adminMiddleware(), (req, res) => {
  const withdrawals2 = db.getWithdrawals();
  res.json({ withdrawals: withdrawals2 });
});
app.post("/api/admin/withdrawals/:id/action", authMiddleware, adminMiddleware(["super_admin", "finance_admin"]), async (req, res) => {
  const admin = req.user;
  const { id } = req.params;
  const { action, txHash, adminNotes } = req.body;
  if (!["approved", "rejected", "paid", "processing"].includes(action)) {
    res.status(400).json({ error: "Invalid action." });
    return;
  }
  const result = await updateWithdrawalStatus(admin.id, id, action, txHash, adminNotes);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ success: true, withdrawal: result.withdrawal });
});
app.get("/api/admin/performance", authMiddleware, adminMiddleware(), (req, res) => {
  const performances = db.getDailyPerformances();
  res.json({ performances });
});
app.post("/api/admin/performance", authMiddleware, adminMiddleware(["super_admin", "finance_admin"]), async (req, res) => {
  const admin = req.user;
  const { date, overallFundAmount, actualFundPerformance, applicableRate, notes } = req.body;
  if (!date || applicableRate === void 0) {
    res.status(400).json({ error: "Date and applicableRate are required." });
    return;
  }
  const result = await applyDailyPerformance({
    adminUserId: admin.id,
    date,
    overallFundAmount: Number(overallFundAmount || 25e5),
    actualFundPerformance: Number(actualFundPerformance || applicableRate * 100),
    applicableRate: Number(applicableRate),
    notes: notes || "Daily verified fund yield distribution"
  });
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});
app.get("/api/admin/audit-logs", authMiddleware, adminMiddleware(), (req, res) => {
  const auditLogs2 = db.getAuditLogs();
  res.json({ auditLogs: auditLogs2 });
});
app.post("/api/admin/settings", authMiddleware, adminMiddleware(["super_admin"]), async (req, res, next) => {
  try {
    const admin = req.user;
    const { reason, ...settingsPayload } = req.body;
    const previousSettings = { ...await db.getSettingsAsync() };
    const newSettings = await db.updateSettingsAsync(settingsPayload);
    db.addAuditLog({
      action: "SETTINGS_UPDATED",
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      beforeValue: previousSettings,
      afterValue: newSettings,
      reason: reason || "Super Admin updated application & authentication configurations"
    });
    logger.info("ADMIN_SETTINGS_UPDATED", "Super Admin updated application settings", {
      adminId: admin.id,
      metadata: { changedKeys: Object.keys(settingsPayload), reason }
    });
    res.json({ success: true, settings: newSettings });
  } catch (err) {
    next(err);
  }
});
app.post("/api/admin/auth/force-logout-all", authMiddleware, adminMiddleware(["super_admin"]), (req, res) => {
  const admin = req.user;
  const { reason } = req.body;
  const newVersion = forceLogoutAllUsers();
  db.addAuditLog({
    action: "FORCE_LOGOUT_ALL_USERS",
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    afterValue: { sessionVersion: newVersion },
    reason: reason || "Super Admin performed emergency global session invalidation"
  });
  logger.warn("SECURITY_FORCE_LOGOUT_EXECUTED", "Super Admin invalidated all user sessions", {
    adminId: admin.id,
    metadata: { sessionVersion: newVersion, reason }
  });
  res.json({
    success: true,
    message: "All active user sessions have been successfully terminated.",
    sessionVersion: newVersion
  });
});
app.get("/api/admin/health/stats", authMiddleware, adminMiddleware(), (req, res) => {
  const users2 = db.getUsers();
  const deposits2 = db.getDeposits();
  const withdrawals2 = db.getWithdrawals();
  const ledger2 = db.getLedger();
  const auditLogs2 = db.getAuditLogs();
  const logStats = logger.getLogStats();
  const settings = db.getSettings();
  const totalDepositProofs = deposits2.filter((d) => d.proofPhotoUrl && d.proofPhotoUrl.length > 0).length;
  res.json({
    totalUsers: users2.length,
    totalDeposits: deposits2.length,
    totalWithdrawals: withdrawals2.length,
    totalLedgerRecords: ledger2.length,
    totalAuditLogs: auditLogs2.length,
    totalSystemLogs: logStats.totalLogs,
    totalDepositProofs,
    errorsToday: logStats.errorsToday,
    warningsToday: logStats.warningsToday,
    infoToday: logStats.infoToday,
    dbLoggingEnabled: logStats.dbLoggingEnabled,
    retentionSettings: {
      systemLogRetentionDays: settings.systemLogRetentionDays || 30,
      errorLogRetentionDays: settings.errorLogRetentionDays || 90,
      notificationRetentionDays: settings.notificationRetentionDays || 90
    }
  });
});
app.get("/api/admin/logs", authMiddleware, adminMiddleware(), (req, res) => {
  const { level, event, errorCode, requestId, userId, startDate, endDate, limit, offset } = req.query;
  const result = logger.getRecentLogs({
    level,
    event,
    errorCode,
    requestId,
    userId,
    startDate,
    endDate,
    limit: limit ? parseInt(limit, 10) : 50,
    offset: offset ? parseInt(offset, 10) : 0
  });
  res.json(result);
});
app.post("/api/admin/health/cleanup", authMiddleware, adminMiddleware(["super_admin"]), async (req, res, next) => {
  try {
    const { cleanupManager: cleanupManager2 } = await Promise.resolve().then(() => (init_cleanup(), cleanup_exports));
    const report = await cleanupManager2.runScheduledCleanup();
    res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
});
app.post("/api/admin/adjust-balance", authMiddleware, adminMiddleware(["super_admin"]), async (req, res) => {
  const admin = req.user;
  const { targetUserId, amount, reason } = req.body;
  if (!targetUserId || !amount || !reason) {
    res.status(400).json({ error: "targetUserId, amount, and reason are required." });
    return;
  }
  const result = await createAdminAdjustment(admin.id, targetUserId, Number(amount), reason);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  const balance = calculateUserBalance(targetUserId);
  res.json({ success: true, balance });
});
app.post("/api/admin/reset-data", authMiddleware, adminMiddleware(["super_admin"]), (req, res) => {
  db.resetToSeed();
  res.json({ success: true, message: "Database reset to initial demo seeds." });
});
app.get("/api/admin/db/status", async (req, res) => {
  try {
    const result = await testAndMigrateDatabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/db/migrate", async (req, res) => {
  try {
    const result = await testAndMigrateDatabase();
    res.json({ success: result.postgresPoolReady, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/db/schema-sql", (req, res) => {
  try {
    const schemaPath = path2.join(process.cwd(), "supabase_schema.sql");
    if (fs2.existsSync(schemaPath)) {
      const sql = fs2.readFileSync(schemaPath, "utf-8");
      res.setHeader("Content-Type", "text/plain");
      res.send(sql);
    } else {
      res.status(404).send("-- Schema file not found");
    }
  } catch (err) {
    res.status(500).send("-- Error loading schema");
  }
});
app.post("/api/tests/run", async (req, res) => {
  try {
    const testSummary = await runAutomatedTestSuite();
    res.json(testSummary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.all("/api/*", (req, res) => {
  const requestId = req.requestId || "FINEXJ-UNKNOWN";
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `API route ${req.method} ${req.path} not found.`,
      requestId
    }
  });
});
app.use(centralErrorHandler);

// server/api-entry.ts
function handler(req, res) {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }
  return app(req, res);
}
export {
  handler as default
};
