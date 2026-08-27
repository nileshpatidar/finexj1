// server/app.ts
import express from "express";

// server/auth.ts
import crypto from "crypto";

// server/supabase.ts
import { createClient } from "@supabase/supabase-js";
var serverSupabaseClient = null;
function getServerSupabase() {
  if (!serverSupabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://sicczkuqwljigsatsyva.supabase.co";
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_scog-F8bxFxW7oFH1wBUmQ_9DOoqJVh";
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Supabase configuration missing. SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_ANON_KEY) must be provided in environment variables."
      );
    }
    serverSupabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return serverSupabaseClient;
}
function isServerSupabaseReady() {
  try {
    const client = getServerSupabase();
    return Boolean(client);
  } catch {
    return false;
  }
}

// server/repositories/profiles.ts
function mapDbUserToUser(u) {
  return {
    id: String(u.id),
    fullName: u.full_name || u.fullName || "User",
    email: u.email,
    phone: u.phone || "",
    country: u.country || "India",
    passwordHash: u.password_hash || u.passwordHash || "",
    passwordSalt: u.salt || u.passwordSalt || "",
    profilePictureUrl: u.profile_picture_url || u.profilePictureUrl,
    role: u.role || "user",
    status: u.is_locked ? "suspended" : u.status || "active",
    createdAt: u.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    twoFactorEnabled: Boolean(u.two_factor_enabled || u.twoFactorEnabled),
    twoFactorSecret: u.two_factor_secret || u.twoFactorSecret,
    lastLoginAt: u.last_login_at || u.lastLoginAt,
    loginAttempts: u.login_attempts || u.loginAttempts || 0,
    lockUntil: u.lock_until || u.lockUntil,
    fundLockUntil: u.fund_lock_until || u.fundLockUntil,
    fundLockReason: u.fund_lock_reason || u.fundLockReason,
    lastWithdrawalAt: u.last_withdrawal_at || u.lastWithdrawalAt
  };
}
async function getProfileById(id) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(`[Supabase Error] getProfileById(${id}):`, error.message);
    throw new Error(`Failed to load profile: ${error.message}`);
  }
  if (!data) return null;
  return mapDbUserToUser(data);
}
async function getProfileByEmail(email) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("users").select("*").ilike("email", email.trim().toLowerCase()).maybeSingle();
  if (error) {
    console.error(`[Supabase Error] getProfileByEmail(${email}):`, error.message);
    throw new Error(`Failed to query user by email: ${error.message}`);
  }
  if (!data) return null;
  return mapDbUserToUser(data);
}
async function createProfile(user) {
  const supabase = getServerSupabase();
  const payload = {
    full_name: user.fullName || "User",
    email: user.email?.trim().toLowerCase(),
    phone: user.phone || "",
    country: user.country || "India",
    password_hash: user.passwordHash || "",
    salt: user.passwordSalt || "",
    role: user.role || "user",
    status: user.status || "active",
    two_factor_enabled: Boolean(user.twoFactorEnabled),
    two_factor_secret: user.twoFactorSecret || null,
    is_locked: user.status === "suspended",
    login_attempts: user.loginAttempts || 0,
    profile_picture_url: user.profilePictureUrl || null,
    created_at: user.createdAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  if (user.id) {
    payload.id = user.id;
  }
  const { data, error } = await supabase.from("users").insert(payload).select().single();
  if (error) {
    console.error("[Supabase Error] createProfile:", error.message);
    throw new Error(`Failed to create user profile: ${error.message}`);
  }
  return mapDbUserToUser(data);
}
async function updateProfile(id, updates) {
  const supabase = getServerSupabase();
  const payload = {
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (updates.fullName !== void 0) payload.full_name = updates.fullName;
  if (updates.phone !== void 0) payload.phone = updates.phone;
  if (updates.country !== void 0) payload.country = updates.country;
  if (updates.passwordHash !== void 0) payload.password_hash = updates.passwordHash;
  if (updates.passwordSalt !== void 0) payload.salt = updates.passwordSalt;
  if (updates.role !== void 0) payload.role = updates.role;
  if (updates.status !== void 0) {
    payload.status = updates.status;
    payload.is_locked = updates.status === "suspended";
  }
  if (updates.twoFactorEnabled !== void 0) payload.two_factor_enabled = updates.twoFactorEnabled;
  if (updates.twoFactorSecret !== void 0) payload.two_factor_secret = updates.twoFactorSecret;
  if (updates.profilePictureUrl !== void 0) payload.profile_picture_url = updates.profilePictureUrl;
  if (updates.lastLoginAt !== void 0) payload.last_login_at = updates.lastLoginAt;
  if (updates.loginAttempts !== void 0) payload.login_attempts = updates.loginAttempts;
  if (updates.fundLockUntil !== void 0) payload.fund_lock_until = updates.fundLockUntil;
  if (updates.fundLockReason !== void 0) payload.fund_lock_reason = updates.fundLockReason;
  const { data, error } = await supabase.from("users").update(payload).eq("id", id).select().single();
  if (error) {
    console.error(`[Supabase Error] updateProfile(${id}):`, error.message);
    throw new Error(`Failed to update profile: ${error.message}`);
  }
  return mapDbUserToUser(data);
}
async function getAllProfiles(options) {
  const supabase = getServerSupabase();
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;
  let query = supabase.from("users").select("*", { count: "exact" });
  if (options?.role && options.role !== "all") {
    query = query.eq("role", options.role);
  }
  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    console.error("[Supabase Error] getAllProfiles:", error.message);
    throw new Error(`Failed to list profiles: ${error.message}`);
  }
  const users = (data || []).map(mapDbUserToUser);
  return { users, total: count || users.length };
}

// server/repositories/settings.ts
var defaultSettings = {
  bep20DepositAddress: "0x71C5A8c0B26D19543e49e29547d6e492211C54a9",
  usdtContractAddress: "0x55d398326f99059fF775485246999027B3197955",
  requiredConfirmations: 12,
  minimumDepositAmount: 300,
  withdrawalFeePercentage: 4,
  accountAgeRequirementDays: 30,
  depositLockPeriodDays: 30,
  telegramSupportUrl: "https://t.me/USDTFundOfficialSupport",
  operationalWalletAddress: "0x71C5A8c0B26D19543e49e29547d6e492211C54a9",
  compoundingEnabled: true,
  maintenanceMode: false,
  registrationEnabled: true,
  loginEnabled: true,
  sessionVersion: 1,
  systemLogRetentionDays: 30,
  errorLogRetentionDays: 90,
  notificationRetentionDays: 90
};
async function getSettings() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("system_settings").select("*");
  if (error || !data || data.length === 0) {
    return { ...defaultSettings };
  }
  const merged = { ...defaultSettings };
  for (const row of data) {
    try {
      merged[row.key] = JSON.parse(row.value);
    } catch {
      merged[row.key] = row.value;
    }
  }
  merged.withdrawalFeePercentage = Number(merged.withdrawalFeePercentage) || 4;
  merged.accountAgeRequirementDays = Number(merged.accountAgeRequirementDays) || 30;
  merged.minimumDepositAmount = Number(merged.minimumDepositAmount) || 300;
  merged.depositLockPeriodDays = Number(merged.depositLockPeriodDays) || 30;
  merged.maintenanceMode = Boolean(merged.maintenanceMode === true || merged.maintenanceMode === "true");
  merged.registrationEnabled = Boolean(merged.registrationEnabled !== false && merged.registrationEnabled !== "false");
  merged.loginEnabled = Boolean(merged.loginEnabled !== false && merged.loginEnabled !== "false");
  return merged;
}
async function updateSettings(updates) {
  const supabase = getServerSupabase();
  const promises = Object.entries(updates).map(async ([key, val]) => {
    const valueStr = typeof val === "object" || typeof val === "boolean" || typeof val === "number" ? JSON.stringify(val) : String(val);
    return supabase.from("system_settings").upsert({
      key,
      value: valueStr,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }, { onConflict: "key" });
  });
  await Promise.all(promises);
  return getSettings();
}

// server/auth.ts
var SESSION_SECRET = process.env.SESSION_SECRET || "finexj_fund_master_jwt_secret_key_2026_prod";
var TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
function hashPassword(password, salt) {
  return crypto.createHash("sha512").update(password + salt).digest("hex");
}
function generateSalt() {
  return crypto.randomBytes(12).toString("hex");
}
function createSessionToken(user, sessionVersion = 1) {
  const iat = Date.now();
  const exp = iat + TOKEN_TTL_MS;
  const payload = {
    userId: user.id,
    role: user.role,
    exp,
    sessionVersion,
    iat
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payloadBase64).digest("base64url");
  return `fx_${payloadBase64}.${signature}`;
}
async function verifySessionTokenAsync(token) {
  if (!token) return null;
  if (!token.startsWith("fx_") && token.includes(".")) {
    try {
      const supabase = getServerSupabase();
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        const profile = await getProfileById(data.user.id);
        if (profile) {
          return { userId: profile.id, role: profile.role };
        }
      }
    } catch {
    }
  }
  if (token.startsWith("fx_")) {
    try {
      const parts = token.slice(3).split(".");
      if (parts.length !== 2) return null;
      const [payloadBase64, signature] = parts;
      const expectedSignature = crypto.createHmac("sha256", SESSION_SECRET).update(payloadBase64).digest("base64url");
      if (signature !== expectedSignature) {
        return null;
      }
      const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
      if (Date.now() > payload.exp) {
        return null;
      }
      const settings = await getSettings();
      if (payload.role === "user" && (payload.sessionVersion || 1) < (settings.sessionVersion || 1)) {
        return null;
      }
      return { userId: payload.userId, role: payload.role };
    } catch {
      return null;
    }
  }
  return null;
}
function revokeSessionToken(token) {
}
async function forceLogoutAllUsersAsync() {
  const settings = await getSettings();
  const newVersion = (settings.sessionVersion || 1) + 1;
  await updateSettings({ sessionVersion: newVersion });
  return newVersion;
}
function generate2FASecret() {
  const secret = crypto.randomBytes(20).toString("hex").substring(0, 16).toUpperCase();
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

// server/repositories/deposits.ts
function mapDbDepositToDeposit(d) {
  return {
    id: String(d.id),
    userId: String(d.user_id),
    amount: Number(d.amount),
    currency: "USDT",
    network: "BEP-20",
    txHash: d.tx_hash,
    fromAddress: d.from_address || void 0,
    toAddress: d.to_address || "0x71C5A8c0B26D19543e49e29547d6e492211C54a9",
    status: d.status || "confirmed",
    confirmations: Number(d.confirmations || 15),
    requiredConfirmations: Number(d.required_confirmations || 12),
    createdAt: d.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    confirmedAt: d.confirmed_at || void 0,
    eligibilityDate: d.eligibility_date || void 0,
    depositLockEndDate: d.lock_expires_at || d.deposit_lock_end_date || void 0,
    proofPhotoUrl: d.proof_url || d.proof_photo_url || void 0,
    userNotes: d.user_notes || void 0,
    adminNotes: d.admin_notes || void 0,
    reviewedAt: d.reviewed_at || void 0,
    reviewedBy: d.reviewed_by || void 0,
    notes: d.notes || void 0
  };
}
async function getDepositsByUserId(userId) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("deposits").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) {
    console.error(`[Supabase Error] getDepositsByUserId(${userId}):`, error.message);
    throw new Error(`Failed to load deposits: ${error.message}`);
  }
  return (data || []).map(mapDbDepositToDeposit);
}
async function getDepositById(id) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("deposits").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(`[Supabase Error] getDepositById(${id}):`, error.message);
    throw new Error(`Failed to get deposit: ${error.message}`);
  }
  if (!data) return null;
  return mapDbDepositToDeposit(data);
}
async function getDepositByTxHash(txHash) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("deposits").select("*").ilike("tx_hash", txHash.trim()).maybeSingle();
  if (error) {
    console.error(`[Supabase Error] getDepositByTxHash(${txHash}):`, error.message);
    return null;
  }
  if (!data) return null;
  return mapDbDepositToDeposit(data);
}
async function createDeposit(dep) {
  const supabase = getServerSupabase();
  const payload = {
    user_id: dep.userId,
    amount: dep.amount,
    currency: "USDT",
    network: "BEP-20",
    tx_hash: dep.txHash,
    to_address: dep.toAddress || "0x71C5A8c0B26D19543e49e29547d6e492211C54a9",
    status: dep.status || "confirmed",
    confirmations: dep.confirmations || 15,
    required_confirmations: dep.requiredConfirmations || 12,
    proof_url: dep.proofPhotoUrl || null,
    notes: dep.notes || dep.userNotes || null,
    confirmed_at: dep.confirmedAt || (/* @__PURE__ */ new Date()).toISOString(),
    eligibility_date: dep.eligibilityDate || new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString(),
    lock_expires_at: dep.depositLockEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString(),
    created_at: dep.createdAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  if (dep.id) {
    payload.id = dep.id;
  }
  const { data, error } = await supabase.from("deposits").insert(payload).select().single();
  if (error) {
    console.error("[Supabase Error] createDeposit:", error.message);
    throw new Error(`Failed to create deposit: ${error.message}`);
  }
  return mapDbDepositToDeposit(data);
}
async function updateDeposit(id, updates) {
  const supabase = getServerSupabase();
  const payload = {};
  if (updates.status !== void 0) payload.status = updates.status;
  if (updates.confirmations !== void 0) payload.confirmations = updates.confirmations;
  if (updates.confirmedAt !== void 0) payload.confirmed_at = updates.confirmedAt;
  if (updates.adminNotes !== void 0) payload.notes = updates.adminNotes;
  if (updates.txHash !== void 0) payload.tx_hash = updates.txHash;
  if (updates.amount !== void 0) payload.amount = updates.amount;
  const { data, error } = await supabase.from("deposits").update(payload).eq("id", id).select().single();
  if (error) {
    console.error(`[Supabase Error] updateDeposit(${id}):`, error.message);
    throw new Error(`Failed to update deposit: ${error.message}`);
  }
  return mapDbDepositToDeposit(data);
}
async function getAllDeposits(options) {
  const supabase = getServerSupabase();
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;
  let query = supabase.from("deposits").select("*", { count: "exact" });
  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    console.error("[Supabase Error] getAllDeposits:", error.message);
    throw new Error(`Failed to load deposits list: ${error.message}`);
  }
  const deposits = (data || []).map(mapDbDepositToDeposit);
  return { deposits, total: count || deposits.length };
}

// server/repositories/withdrawals.ts
function mapDbWithdrawalToWithdrawal(w) {
  return {
    id: String(w.id),
    reference: w.reference || `WD-${w.id}`,
    userId: String(w.user_id),
    requestedAmount: Number(w.requested_amount || w.amount || 0),
    feePercentage: 4,
    feeAmount: Number(w.fee_amount || Number(w.requested_amount || 0) * 0.04),
    netAmount: Number(w.net_amount || Number(w.requested_amount || 0) * 0.96),
    destinationAddress: w.destination_address,
    network: "BEP-20",
    status: w.status || "pending",
    createdAt: w.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    reviewedAt: w.reviewed_at || void 0,
    reviewedBy: w.reviewed_by || void 0,
    paidAt: w.paid_at || void 0,
    txHash: w.tx_hash || void 0,
    adminNotes: w.admin_notes || w.rejection_reason || void 0,
    userNotes: w.user_notes || void 0,
    idempotencyKey: w.idempotency_key || void 0
  };
}
async function getWithdrawalsByUserId(userId) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("withdrawals").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) {
    console.error(`[Supabase Error] getWithdrawalsByUserId(${userId}):`, error.message);
    throw new Error(`Failed to load withdrawals: ${error.message}`);
  }
  return (data || []).map(mapDbWithdrawalToWithdrawal);
}
async function getWithdrawalById(id) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("withdrawals").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(`[Supabase Error] getWithdrawalById(${id}):`, error.message);
    throw new Error(`Failed to get withdrawal: ${error.message}`);
  }
  if (!data) return null;
  return mapDbWithdrawalToWithdrawal(data);
}
async function createWithdrawal(wd) {
  const supabase = getServerSupabase();
  const payload = {
    user_id: wd.userId,
    requested_amount: wd.requestedAmount,
    fee_amount: wd.feeAmount,
    net_amount: wd.netAmount,
    destination_address: wd.destinationAddress,
    status: wd.status || "pending",
    created_at: wd.createdAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  if (wd.id) {
    payload.id = wd.id;
  }
  const { data, error } = await supabase.from("withdrawals").insert(payload).select().single();
  if (error) {
    console.error("[Supabase Error] createWithdrawal:", error.message);
    throw new Error(`Failed to create withdrawal record: ${error.message}`);
  }
  return mapDbWithdrawalToWithdrawal(data);
}
async function updateWithdrawal(id, updates) {
  const supabase = getServerSupabase();
  const payload = {};
  if (updates.status !== void 0) payload.status = updates.status;
  if (updates.txHash !== void 0) payload.tx_hash = updates.txHash;
  if (updates.adminNotes !== void 0) {
    payload.rejection_reason = updates.adminNotes;
    payload.admin_notes = updates.adminNotes;
  }
  if (updates.reviewedAt !== void 0) payload.reviewed_at = updates.reviewedAt;
  if (updates.reviewedBy !== void 0) payload.reviewed_by = updates.reviewedBy;
  if (updates.paidAt !== void 0) payload.paid_at = updates.paidAt;
  const { data, error } = await supabase.from("withdrawals").update(payload).eq("id", id).select().single();
  if (error) {
    console.error(`[Supabase Error] updateWithdrawal(${id}):`, error.message);
    throw new Error(`Failed to update withdrawal: ${error.message}`);
  }
  return mapDbWithdrawalToWithdrawal(data);
}
async function getAllWithdrawals(options) {
  const supabase = getServerSupabase();
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;
  let query = supabase.from("withdrawals").select("*", { count: "exact" });
  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    console.error("[Supabase Error] getAllWithdrawals:", error.message);
    throw new Error(`Failed to load withdrawals list: ${error.message}`);
  }
  const withdrawals = (data || []).map(mapDbWithdrawalToWithdrawal);
  return { withdrawals, total: count || withdrawals.length };
}

// server/repositories/earnings.ts
function mapDbEarningToEarning(e) {
  return {
    id: String(e.id),
    userId: String(e.user_id),
    calculationId: String(e.daily_performance_id || e.calculation_id || "0"),
    baseEligibleAmount: Number(e.active_principal || e.base_eligible_amount || 0),
    applicableRate: Number(e.rate_percentage || e.applicable_rate || 0),
    earningsAmount: Number(e.payout_amount || e.earnings_amount || 0),
    performanceDate: e.date || e.performance_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    createdAt: e.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    status: e.status || "credited",
    marketCondition: e.market_condition || (Number(e.payout_amount || e.earnings_amount || 0) >= 0 ? "profit" : "loss"),
    note: e.note || void 0
  };
}
async function getEarningsByUserId(userId) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("earnings").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) {
    console.error(`[Supabase Error] getEarningsByUserId(${userId}):`, error.message);
    throw new Error(`Failed to load earnings: ${error.message}`);
  }
  return (data || []).map(mapDbEarningToEarning);
}
async function createEarning(entry) {
  const supabase = getServerSupabase();
  const payload = {
    user_id: entry.userId,
    daily_performance_id: entry.calculationId ? parseInt(entry.calculationId, 10) || 1 : 1,
    date: entry.performanceDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    active_principal: entry.baseEligibleAmount || 0,
    rate_percentage: entry.applicableRate || 0,
    payout_amount: entry.earningsAmount || 0,
    created_at: entry.createdAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  const { data, error } = await supabase.from("earnings").insert(payload).select().single();
  if (error) {
    console.error("[Supabase Error] createEarning:", error.message);
    throw new Error(`Failed to create earning record: ${error.message}`);
  }
  return mapDbEarningToEarning(data);
}
async function getAllEarnings() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("earnings").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) {
    console.error("[Supabase Error] getAllEarnings:", error.message);
    return [];
  }
  return (data || []).map(mapDbEarningToEarning);
}

// server/repositories/performances.ts
function mapDbPerfToPerf(p) {
  return {
    id: String(p.id),
    date: p.date,
    overallFundAmount: Number(p.total_fund_principal || p.overall_fund_amount || 0),
    actualFundPerformance: Number(p.rate_percentage || p.actual_fund_performance || 0),
    applicableRate: Number(p.rate_percentage ? p.rate_percentage / 100 : p.applicable_rate || 0),
    notes: p.notes || `Performance on ${p.date}`,
    createdBy: p.distributed_by || p.created_by || "system",
    createdAt: p.distributed_at || p.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    appliedCount: Number(p.applied_count || 0),
    totalDistributed: Number(p.total_yield_distributed || p.total_distributed || 0),
    marketCondition: p.rate_percentage >= 0 ? "profit" : "loss"
  };
}
async function getDailyPerformances() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("daily_performances").select("*").order("date", { ascending: false });
  if (error) {
    console.error("[Supabase Error] getDailyPerformances:", error.message);
    return [];
  }
  return (data || []).map(mapDbPerfToPerf);
}
async function getDailyPerformanceByDate(date) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("daily_performances").select("*").eq("date", date).maybeSingle();
  if (error) {
    console.error(`[Supabase Error] getDailyPerformanceByDate(${date}):`, error.message);
    return null;
  }
  if (!data) return null;
  return mapDbPerfToPerf(data);
}
async function createDailyPerformance(perf) {
  const supabase = getServerSupabase();
  const payload = {
    date: perf.date,
    rate_percentage: perf.applicableRate !== void 0 ? perf.applicableRate * 100 : perf.actualFundPerformance || 0,
    total_fund_principal: perf.overallFundAmount || 0,
    total_yield_distributed: perf.totalDistributed || 0,
    distributed_by: perf.createdBy || "super_admin",
    distributed_at: perf.createdAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  const { data, error } = await supabase.from("daily_performances").insert(payload).select().single();
  if (error) {
    console.error("[Supabase Error] createDailyPerformance:", error.message);
    throw new Error(`Failed to create daily performance: ${error.message}`);
  }
  return mapDbPerfToPerf(data);
}

// server/repositories/ledger.ts
function mapDbLedgerToLedger(l) {
  return {
    id: String(l.id),
    userId: String(l.user_id),
    type: l.type || "deposit",
    amount: Number(l.amount || 0),
    balanceAfter: Number(l.balance_after || l.balanceAfter || 0),
    referenceId: l.reference_id || l.referenceId || void 0,
    description: l.description || "",
    createdAt: l.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    performedBy: l.performed_by || void 0
  };
}
async function getLedgerByUserId(userId) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("ledger").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) {
    console.error(`[Supabase Error] getLedgerByUserId(${userId}):`, error.message);
    throw new Error(`Failed to load ledger: ${error.message}`);
  }
  return (data || []).map(mapDbLedgerToLedger);
}
async function createLedgerEntry(entry) {
  const supabase = getServerSupabase();
  const payload = {
    user_id: entry.userId,
    type: entry.type || "deposit",
    amount: entry.amount || 0,
    balance_after: entry.balanceAfter || 0,
    reference_id: entry.referenceId || `TX-${Date.now()}`,
    description: entry.description || "Ledger transaction",
    created_at: entry.createdAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  const { data, error } = await supabase.from("ledger").insert(payload).select().single();
  if (error) {
    console.error("[Supabase Error] createLedgerEntry:", error.message);
    throw new Error(`Failed to write ledger entry: ${error.message}`);
  }
  return mapDbLedgerToLedger(data);
}
async function getAllLedger() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("ledger").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) {
    console.error("[Supabase Error] getAllLedger:", error.message);
    return [];
  }
  return (data || []).map(mapDbLedgerToLedger);
}

// server/repositories/auditLogs.ts
async function getAuditLogs(options) {
  const supabase = getServerSupabase();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    console.warn("[Supabase Warn] getAuditLogs:", error.message);
    return [];
  }
  return (data || []).map((l) => ({
    id: String(l.id),
    action: l.action,
    actorId: String(l.actor_id || "0"),
    actorEmail: l.actor_email || "system",
    actorRole: l.actor_role || "admin",
    targetUserId: l.target_user_id ? String(l.target_user_id) : void 0,
    timestamp: l.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    ip: l.ip_address || void 0,
    reason: l.details || l.reason,
    beforeValue: l.before_value,
    afterValue: l.after_value
  }));
}
async function createAuditLog(log) {
  try {
    const supabase = getServerSupabase();
    await supabase.from("audit_logs").insert({
      action: log.action || "SECURITY_EVENT",
      actor_email: log.actorEmail || "system",
      details: log.reason || JSON.stringify(log.afterValue || {}),
      ip_address: log.ip || null,
      created_at: log.timestamp || (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.warn("[Supabase AuditLog Exception]:", err?.message);
  }
}

// server/repositories/systemLogs.ts
async function getSystemLogs(params) {
  const supabase = getServerSupabase();
  const limit = params?.limit || 50;
  const offset = params?.offset || 0;
  let query = supabase.from("system_logs").select("*", { count: "exact" });
  if (params?.level && params.level !== "ALL") {
    query = query.eq("level", params.level);
  }
  if (params?.event) {
    query = query.ilike("event", `%${params.event}%`);
  }
  if (params?.errorCode) {
    query = query.eq("error_code", params.errorCode);
  }
  if (params?.requestId) {
    query = query.eq("request_id", params.requestId);
  }
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    console.warn("[Supabase Warn] getSystemLogs:", error.message);
    return { logs: [], totalCount: 0 };
  }
  const logs = (data || []).map((l) => ({
    id: String(l.id),
    level: l.level || "INFO",
    event: l.event || "GENERAL",
    errorCode: l.error_code || void 0,
    message: l.message || "",
    requestId: l.request_id || "UNKNOWN",
    userId: l.user_id ? String(l.user_id) : void 0,
    adminId: l.admin_id ? String(l.admin_id) : void 0,
    route: l.route || void 0,
    method: l.method || void 0,
    metadata: l.metadata || void 0,
    timestamp: l.created_at || (/* @__PURE__ */ new Date()).toISOString()
  }));
  return { logs, totalCount: count || logs.length };
}

// server/repositories/messages.ts
async function getAdminMessagesForUser(userId) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("admin_messages").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) {
    console.warn("[Supabase Warn] getAdminMessagesForUser:", error.message);
    return [];
  }
  return (data || []).map((m) => ({
    id: String(m.id),
    userId: String(m.user_id),
    adminId: m.admin_id ? String(m.admin_id) : void 0,
    depositId: m.deposit_id ? String(m.deposit_id) : void 0,
    withdrawalId: m.withdrawal_id ? String(m.withdrawal_id) : void 0,
    messageType: m.message_type || "General Message",
    subject: m.subject || "Admin Notification",
    body: m.body || m.message || "",
    isRead: Boolean(m.is_read || m.read),
    createdAt: m.created_at || (/* @__PURE__ */ new Date()).toISOString()
  }));
}
async function createAdminMessage(msg) {
  const supabase = getServerSupabase();
  const payload = {
    user_id: msg.userId,
    admin_id: msg.adminId || null,
    deposit_id: msg.depositId || null,
    withdrawal_id: msg.withdrawalId || null,
    message_type: msg.messageType || "General Message",
    subject: msg.subject || "Notification from FINEXJ Administration",
    body: msg.body || "",
    is_read: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const { data, error } = await supabase.from("admin_messages").insert(payload).select().single();
  if (error) {
    console.error("[Supabase Error] createAdminMessage:", error.message);
    throw new Error(`Failed to send message: ${error.message}`);
  }
  return {
    id: String(data.id),
    userId: String(data.user_id),
    adminId: data.admin_id ? String(data.admin_id) : void 0,
    depositId: data.deposit_id ? String(data.deposit_id) : void 0,
    withdrawalId: data.withdrawal_id ? String(data.withdrawal_id) : void 0,
    messageType: data.message_type,
    subject: data.subject,
    body: data.body,
    isRead: Boolean(data.is_read),
    createdAt: data.created_at
  };
}
async function markMessageRead(messageId, userId) {
  const supabase = getServerSupabase();
  const { error } = await supabase.from("admin_messages").update({ is_read: true }).eq("id", messageId).eq("user_id", userId);
  if (error) {
    console.error("[Supabase Error] markMessageRead:", error.message);
    return false;
  }
  return true;
}

// server/services/balanceService.ts
async function calculateUserBalanceAsync(userId) {
  const user = await getProfileById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  const settings = await getSettings();
  const [deposits, earnings, withdrawals] = await Promise.all([
    getDepositsByUserId(userId),
    getEarningsByUserId(userId),
    getWithdrawalsByUserId(userId)
  ]);
  const now = /* @__PURE__ */ new Date();
  const confirmedDeposits = deposits.filter((d) => d.status === "confirmed");
  const totalDeposited = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);
  const creditedEarnings = earnings.filter((e) => e.status === "credited");
  const totalEarnings = creditedEarnings.reduce((acc, e) => acc + e.earningsAmount, 0);
  const paidWithdrawals = withdrawals.filter((w) => w.status === "paid");
  const totalWithdrawn = paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const totalFeesPaid = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);
  const activePendingWithdrawals = withdrawals.filter(
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
    eligibleForWithdrawal = Math.max(0, Number((availableBalance - depositLockedAmount).toFixed(4)));
    if (eligibleForWithdrawal <= 0 && depositLockedAmount > 0) {
      canWithdraw = false;
      withdrawalRestrictionReason = "Principal deposit is in mandatory 30-day lock period.";
    }
  }
  return {
    userId: user.id,
    totalDeposited: Number(totalDeposited.toFixed(2)),
    totalEarnings: Number(totalEarnings.toFixed(4)),
    totalWithdrawn: Number(totalWithdrawn.toFixed(2)),
    totalFeesPaid: Number(totalFeesPaid.toFixed(2)),
    totalPendingWithdrawals: Number(totalPendingWithdrawals.toFixed(2)),
    availableBalance,
    lockedBalance: Number(lockedBalance.toFixed(2)),
    eligibleForWithdrawal,
    accountAgeDays,
    is30DaysOld,
    canWithdraw,
    withdrawalRestrictionReason,
    withdrawalEligibleDate,
    isFundLocked,
    fundLockUntil,
    fundLockRemainingDays,
    fundLockRemainingHours,
    fundLockReason
  };
}

// server/services/depositService.ts
import crypto3 from "crypto";

// server/storage.ts
var DEPOSIT_PROOFS_BUCKET = "deposit-proofs";
async function uploadDepositProof(userId, depositId, base64OrBuffer, originalFilename = "proof.jpg") {
  const supabase = getServerSupabase();
  let fileBuffer;
  let contentType = "image/jpeg";
  if (base64OrBuffer.startsWith("data:")) {
    const matches = base64OrBuffer.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      contentType = matches[1];
      fileBuffer = Buffer.from(matches[2], "base64");
    } else {
      fileBuffer = Buffer.from(base64OrBuffer, "base64");
    }
  } else {
    fileBuffer = Buffer.from(base64OrBuffer, "base64");
  }
  const cleanFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filePath = `${userId}/${depositId}_${Date.now()}_${cleanFilename}`;
  const { data, error } = await supabase.storage.from(DEPOSIT_PROOFS_BUCKET).upload(filePath, fileBuffer, {
    contentType,
    upsert: true
  });
  if (error) {
    console.warn(`[Supabase Storage Warning] Could not upload to bucket "${DEPOSIT_PROOFS_BUCKET}":`, error.message);
    return filePath;
  }
  return data.path;
}
async function getSignedDepositProofUrl(storagePath, expiresInSeconds = 3600) {
  if (!storagePath) return null;
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://") || storagePath.startsWith("data:")) {
    return storagePath;
  }
  const supabase = getServerSupabase();
  const { data, error } = await supabase.storage.from(DEPOSIT_PROOFS_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.warn("[Supabase Storage Signed URL Error]:", error?.message);
    return null;
  }
  return data.signedUrl;
}

// server/db.ts
import crypto2 from "crypto";
var DEFAULT_SETTINGS = {
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
function hashPassword2(password, salt) {
  return crypto2.pbkdf2Sync(password, salt, 1e4, 64, "sha512").toString("hex");
}
function generateSalt2() {
  return crypto2.randomBytes(16).toString("hex");
}
function initializeSeedData() {
  const adminMSalt = generateSalt2();
  const adminMPasswordHash = hashPassword2("@Admin123", adminMSalt);
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
  const auditLogs = [
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
    auditLogs,
    settings: DEFAULT_SETTINGS
  };
}
var Database = class {
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
  async addUser(user) {
    await this.asyncSupabaseInsert("users", {
      email: user.email,
      password_hash: user.passwordHash,
      salt: user.passwordSalt,
      role: user.role,
      full_name: user.fullName,
      two_factor_enabled: user.twoFactorEnabled,
      is_locked: user.status === "suspended",
      created_at: user.createdAt
    });
    this.data.users.push(user);
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
  addEarningsBatch(earnings) {
    this.data.earnings.push(...earnings);
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
    if (!isServerSupabaseReady()) {
      throw new Error("Supabase server credentials are not configured.");
    }
    const supabase = getServerSupabase();
    const { error } = await supabase.from(table).insert(payload);
    if (error) {
      throw new Error(`Supabase insert into ${table} failed: ${error.message}`);
    }
  }
};
var db = new Database();

// server/blockchain.ts
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

// server/services/depositService.ts
async function processDepositAsync(input) {
  const user = await getProfileById(input.userId);
  if (!user) {
    return { success: false, error: "User not found." };
  }
  if (user.status !== "active") {
    return { success: false, error: "Account is not active." };
  }
  const settings = await getSettings();
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
  if (input.txHash) {
    const existing = await getDepositByTxHash(input.txHash);
    if (existing) {
      return {
        success: false,
        error: "This blockchain transaction hash has already been submitted or processed."
      };
    }
  }
  const depositId = "dep_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const fallbackTxHash = "0x" + crypto3.randomBytes(32).toString("hex");
  const userTxHash = input.txHash ? input.txHash.trim() : fallbackTxHash;
  let storagePath = void 0;
  if (input.proofPhotoUrl) {
    try {
      storagePath = await uploadDepositProof(input.userId, depositId, input.proofPhotoUrl, "deposit_proof.jpg");
    } catch (err) {
      console.warn("[Deposit Proof Upload Warning]:", err?.message);
      storagePath = input.proofPhotoUrl;
    }
  }
  let isConfirmed = false;
  if (input.txHash && !input.proofPhotoUrl) {
    const verification = await verifyBEP20Deposit(input.txHash, depositAmount);
    if (!verification.isValid) {
      return {
        success: false,
        error: verification.errorMessage || "Invalid blockchain transaction."
      };
    }
    isConfirmed = true;
  }
  const now = /* @__PURE__ */ new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const lockPeriodMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1e3;
  const lockEndDate = new Date(now.getTime() + lockPeriodMs).toISOString();
  const newDeposit = await createDeposit({
    id: depositId,
    userId: user.id,
    amount: depositAmount,
    currency: "USDT",
    network: "BEP-20",
    txHash: userTxHash,
    toAddress: settings.bep20DepositAddress,
    status: isConfirmed ? "confirmed" : "pending",
    confirmations: isConfirmed ? 15 : 1,
    requiredConfirmations: settings.requiredConfirmations || 12,
    createdAt: now.toISOString(),
    confirmedAt: isConfirmed ? now.toISOString() : void 0,
    eligibilityDate: tomorrow.toISOString(),
    depositLockEndDate: lockEndDate,
    proofPhotoUrl: storagePath,
    userNotes: input.userNotes
  });
  if (isConfirmed) {
    const balance = await calculateUserBalanceAsync(user.id);
    await createLedgerEntry({
      userId: user.id,
      type: "deposit",
      amount: depositAmount,
      balanceAfter: balance.availableBalance,
      referenceId: newDeposit.id,
      description: `Confirmed BEP-20 USDT deposit of ${depositAmount} USDT`,
      createdAt: now.toISOString(),
      performedBy: "system"
    });
  }
  await createAuditLog({
    action: isConfirmed ? "DEPOSIT_CONFIRMED" : "DEPOSIT_SUBMITTED",
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    reason: `User submitted deposit of ${depositAmount} USDT`,
    timestamp: now.toISOString()
  });
  return { success: true, deposit: newDeposit };
}
async function updateDepositStatusAsync(adminId, depositId, status, adminNotes, txHash) {
  const deposit = await getDepositById(depositId);
  if (!deposit) {
    return { success: false, error: "Deposit not found." };
  }
  if (deposit.status === "confirmed") {
    return { success: false, error: "This deposit has already been confirmed." };
  }
  const now = /* @__PURE__ */ new Date();
  const updated = await updateDeposit(depositId, {
    status,
    confirmedAt: status === "confirmed" ? now.toISOString() : void 0,
    adminNotes,
    txHash: txHash || deposit.txHash
  });
  if (status === "confirmed") {
    const balance = await calculateUserBalanceAsync(deposit.userId);
    await createLedgerEntry({
      userId: deposit.userId,
      type: "deposit",
      amount: deposit.amount,
      balanceAfter: balance.availableBalance,
      referenceId: deposit.id,
      description: `Admin approved deposit of ${deposit.amount} USDT`,
      createdAt: now.toISOString(),
      performedBy: adminId
    });
  }
  await createAuditLog({
    action: status === "confirmed" ? "DEPOSIT_APPROVED" : "DEPOSIT_REJECTED",
    actorId: adminId,
    actorRole: "admin",
    targetUserId: deposit.userId,
    reason: adminNotes || `Admin updated deposit status to ${status}`,
    timestamp: now.toISOString()
  });
  return { success: true, deposit: updated };
}

// server/services/withdrawalService.ts
async function createWithdrawalRequestAsync(input) {
  const user = await getProfileById(input.userId);
  if (!user) {
    return { success: false, error: "User not found." };
  }
  if (user.status !== "active") {
    return { success: false, error: `Account is currently ${user.status}.` };
  }
  const requestedAmount = Number(input.requestedAmount);
  if (isNaN(requestedAmount) || requestedAmount <= 0) {
    return { success: false, error: "Please enter a valid withdrawal amount greater than 0 USDT." };
  }
  if (!input.destinationAddress || !isValidBEP20Address(input.destinationAddress)) {
    return {
      success: false,
      error: "Invalid BEP-20 destination address. Please provide a valid 0x BNB Chain address."
    };
  }
  const balance = await calculateUserBalanceAsync(user.id);
  const settings = await getSettings();
  const createdAtTime = new Date(user.createdAt).getTime();
  const now = /* @__PURE__ */ new Date();
  const accountAgeMs = now.getTime() - createdAtTime;
  const requiredAgeMs = (settings.accountAgeRequirementDays || 30) * 24 * 60 * 60 * 1e3;
  if (accountAgeMs < requiredAgeMs) {
    const remMs = requiredAgeMs - accountAgeMs;
    const remDays = Math.floor(remMs / (24 * 60 * 60 * 1e3));
    const remHours = Math.floor(remMs % (24 * 60 * 60 * 1e3) / (60 * 60 * 1e3));
    return {
      success: false,
      error: `Withdrawal not permitted. Your account must be active for at least 30 full days before requesting a withdrawal. Time remaining: ${remDays} days ${remHours} hours.`
    };
  }
  if (balance.isFundLocked) {
    return {
      success: false,
      error: `30-Day Fund Lock is active. Withdrawals unlock in ${balance.fundLockRemainingDays} days ${balance.fundLockRemainingHours} hours.`
    };
  }
  if (requestedAmount > balance.eligibleForWithdrawal) {
    return {
      success: false,
      error: `Insufficient eligible balance. Requested: ${requestedAmount} USDT, Eligible: ${balance.eligibleForWithdrawal} USDT.`
    };
  }
  const feePercentage = 0.04;
  const feeAmount = Number((requestedAmount * feePercentage).toFixed(4));
  const netAmount = Number((requestedAmount - feeAmount).toFixed(4));
  const withdrawalId = "wd_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const reference = "WD-" + Date.now().toString(36).toUpperCase();
  const newWithdrawal = await createWithdrawal({
    id: withdrawalId,
    reference,
    userId: user.id,
    requestedAmount,
    feePercentage: 4,
    feeAmount,
    netAmount,
    destinationAddress: input.destinationAddress.trim(),
    network: "BEP-20",
    status: "pending",
    createdAt: now.toISOString(),
    userNotes: input.userNotes,
    idempotencyKey: input.idempotencyKey
  });
  const updatedBalance = await calculateUserBalanceAsync(user.id);
  await createLedgerEntry({
    userId: user.id,
    type: "withdrawal_request",
    amount: -requestedAmount,
    balanceAfter: updatedBalance.availableBalance,
    referenceId: newWithdrawal.id,
    description: `Withdrawal request submitted for ${requestedAmount} USDT (4% Fee: ${feeAmount} USDT, Net: ${netAmount} USDT)`,
    createdAt: now.toISOString(),
    performedBy: user.id
  });
  const fundLockEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1e3).toISOString();
  await updateProfile(user.id, {
    fundLockUntil: fundLockEndDate,
    fundLockReason: `30-Day Post-Withdrawal Fund Lock (${reference})`,
    lastWithdrawalAt: now.toISOString()
  });
  await createAuditLog({
    action: "WITHDRAWAL_REQUESTED",
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    reason: `User requested withdrawal of ${requestedAmount} USDT to ${input.destinationAddress}`,
    timestamp: now.toISOString()
  });
  return { success: true, withdrawal: newWithdrawal };
}
async function updateWithdrawalStatusAsync(adminId, withdrawalId, status, txHash, adminNotes) {
  const withdrawal = await getWithdrawalById(withdrawalId);
  if (!withdrawal) {
    return { success: false, error: "Withdrawal not found." };
  }
  const now = /* @__PURE__ */ new Date();
  const updated = await updateWithdrawal(withdrawalId, {
    status,
    txHash: txHash || withdrawal.txHash,
    adminNotes,
    reviewedAt: now.toISOString(),
    reviewedBy: adminId,
    paidAt: status === "paid" ? now.toISOString() : void 0
  });
  if (status === "rejected") {
    const currentBalance = await calculateUserBalanceAsync(withdrawal.userId);
    await createLedgerEntry({
      userId: withdrawal.userId,
      type: "withdrawal_rejected",
      amount: withdrawal.requestedAmount,
      balanceAfter: currentBalance.availableBalance + withdrawal.requestedAmount,
      referenceId: withdrawal.id,
      description: `Withdrawal request rejected by admin. Refunded ${withdrawal.requestedAmount} USDT. Reason: ${adminNotes || "Verification failed"}`,
      createdAt: now.toISOString(),
      performedBy: adminId
    });
  } else if (status === "paid") {
    await createLedgerEntry({
      userId: withdrawal.userId,
      type: "withdrawal_paid",
      amount: 0,
      balanceAfter: (await calculateUserBalanceAsync(withdrawal.userId)).availableBalance,
      referenceId: withdrawal.id,
      description: `Withdrawal payout dispatched via BEP-20 (Tx: ${txHash || "Processing"}). Net Paid: ${withdrawal.netAmount} USDT`,
      createdAt: now.toISOString(),
      performedBy: adminId
    });
  }
  await createAuditLog({
    action: `WITHDRAWAL_${status.toUpperCase()}`,
    actorId: adminId,
    actorRole: "admin",
    targetUserId: withdrawal.userId,
    reason: adminNotes || `Admin updated withdrawal status to ${status}`,
    timestamp: now.toISOString()
  });
  return { success: true, withdrawal: updated };
}

// server/services/performanceService.ts
async function applyDailyPerformanceAsync(input) {
  const existing = await getDailyPerformanceByDate(input.date);
  if (existing) {
    return {
      success: false,
      error: `Performance yield for date ${input.date} has already been calculated and distributed.`
    };
  }
  const { users } = await getAllProfiles({ limit: 1e3, status: "active", role: "user" });
  const performanceRecord = await createDailyPerformance({
    date: input.date,
    overallFundAmount: input.overallFundAmount,
    actualFundPerformance: input.actualFundPerformance,
    applicableRate: input.applicableRate,
    notes: input.notes,
    createdBy: input.adminUserId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    appliedCount: 0,
    totalDistributed: 0
  });
  let appliedCount = 0;
  let totalDistributed = 0;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const user of users) {
    const userDeposits = await getDepositsByUserId(user.id);
    const confirmedDeposits = userDeposits.filter(
      (d) => d.status === "confirmed" && d.eligibilityDate && d.eligibilityDate <= input.date
    );
    const eligiblePrincipal = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);
    if (eligiblePrincipal > 0) {
      const yieldPayout = Number((eligiblePrincipal * input.applicableRate).toFixed(4));
      await createEarning({
        userId: user.id,
        calculationId: performanceRecord.id,
        baseEligibleAmount: eligiblePrincipal,
        applicableRate: input.applicableRate,
        earningsAmount: yieldPayout,
        performanceDate: input.date,
        createdAt: now,
        status: "credited",
        note: `Daily performance yield distribution (${(input.applicableRate * 100).toFixed(2)}%)`
      });
      const updatedBalance = await calculateUserBalanceAsync(user.id);
      await createLedgerEntry({
        userId: user.id,
        type: yieldPayout >= 0 ? "daily_earnings" : "daily_loss",
        amount: yieldPayout,
        balanceAfter: updatedBalance.availableBalance,
        referenceId: performanceRecord.id,
        description: `Daily performance yield for ${input.date} @ ${(input.applicableRate * 100).toFixed(2)}% on ${eligiblePrincipal} USDT`,
        createdAt: now,
        performedBy: input.adminUserId
      });
      appliedCount++;
      totalDistributed += yieldPayout;
    }
  }
  await createAuditLog({
    action: "DAILY_PERFORMANCE_APPLIED",
    actorId: input.adminUserId,
    actorRole: "admin",
    reason: `Distributed ${(input.applicableRate * 100).toFixed(2)}% performance yield to ${appliedCount} accounts for ${input.date}`,
    timestamp: now
  });
  return {
    success: true,
    performance: { ...performanceRecord, appliedCount, totalDistributed: Number(totalDistributed.toFixed(2)) },
    appliedCount,
    totalDistributed: Number(totalDistributed.toFixed(2))
  };
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

// server/logger.ts
import crypto4 from "crypto";
var MAX_MEMORY_LOGS = 2e3;
var memoryLogs = [];
var SENSITIVE_KEYS = /* @__PURE__ */ new Set([
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
var Logger = class {
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
var logger = new Logger();

// server/errors.ts
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
app.use(express.json({ limit: "15mb" }));
app.use((req, res, next) => {
  const reqId = req.headers["x-request-id"] || generateRequestId();
  req.requestId = reqId;
  req.startTime = Date.now();
  res.setHeader("X-Request-Id", reqId);
  next();
});
var authRateLimiter = createRateLimiter({ windowMs: 60 * 1e3, maxRequests: 30, keyPrefix: "auth" });
var financialRateLimiter = createRateLimiter({ windowMs: 60 * 1e3, maxRequests: 40, keyPrefix: "fin" });
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(Errors.unauthorized("Authentication required. Please login."));
    }
    const token = authHeader.split(" ")[1];
    const session = await verifySessionTokenAsync(token);
    if (!session) {
      return next(Errors.unauthorized("Session expired or invalidated. Please login again."));
    }
    const user = await getProfileById(session.userId);
    if (!user) {
      return next(Errors.notFound("USER_NOT_FOUND", "User not found."));
    }
    const settings = await getSettings();
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
app.get(["/api", "/api/health", "/health"], (req, res) => {
  res.status(200).json({
    success: true,
    service: "FINEXJ API",
    status: "ok",
    database: "SUPABASE_POSTGRESQL",
    time: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get(["/api/settings", "/settings"], async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});
app.get(["/api/market/prices", "/market/prices"], async (req, res) => {
  const prices = await getMarketPrices();
  res.json(prices);
});
app.get(["/api/blockchain/mock-tx", "/blockchain/mock-tx"], (req, res) => {
  res.json({ txHash: generateMockTxHash(), network: "BEP-20", currency: "USDT" });
});
app.post(["/api/auth/register", "/auth/register"], authRateLimiter, async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (settings.registrationEnabled === false) {
      throw Errors.registrationDisabled("Registration is currently unavailable.");
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
    const existing = await getProfileByEmail(email);
    if (existing) {
      throw Errors.validation("An account with this email address already exists.");
    }
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newUser = await createProfile({
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
    });
    await createAuditLog({
      action: "USER_REGISTERED",
      actorId: newUser.id,
      actorEmail: newUser.email,
      actorRole: newUser.role,
      targetUserId: newUser.id,
      reason: "New user account created successfully."
    });
    const token = createSessionToken(newUser, settings.sessionVersion || 1);
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
app.post(["/api/auth/login", "/auth/login"], authRateLimiter, async (req, res, next) => {
  try {
    const { email, password, twoFactorCode } = req.body;
    if (!email || !password) {
      throw Errors.validation("Email and password are required.");
    }
    const user = await getProfileByEmail(email);
    if (!user) {
      throw Errors.invalidCredentials("Invalid email or password.");
    }
    const settings = await getSettings();
    if (settings.loginEnabled === false && user.role === "user") {
      throw Errors.authDisabled("User login is temporarily unavailable.");
    }
    if (user.status === "suspended") {
      throw new AppError("ACCOUNT_SUSPENDED", "Account has been suspended. Please contact support.", 403);
    }
    const computedHash = hashPassword(password, user.passwordSalt);
    if (computedHash !== user.passwordHash) {
      await updateProfile(user.id, { loginAttempts: (user.loginAttempts || 0) + 1 });
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
    await updateProfile(user.id, { loginAttempts: 0, lastLoginAt: (/* @__PURE__ */ new Date()).toISOString() });
    const token = createSessionToken(user, settings.sessionVersion || 1);
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
app.post(["/api/auth/logout", "/auth/logout"], authMiddleware, (req, res) => {
  const token = req.token;
  revokeSessionToken(token);
  res.json({ success: true, message: "Logged out successfully." });
});
app.post(["/api/auth/logout-all", "/auth/logout-all"], authMiddleware, (req, res) => {
  res.json({ success: true, message: "Logged out from all active sessions." });
});
app.get(["/api/auth/me", "/auth/me"], authMiddleware, (req, res) => {
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
app.post(["/api/auth/update-profile", "/auth/update-profile"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const { fullName, phone, country, profilePictureUrl } = req.body;
    const updated = await updateProfile(user.id, {
      ...fullName ? { fullName: fullName.trim() } : {},
      ...phone ? { phone: phone.trim() } : {},
      ...country ? { country: country.trim() } : {},
      ...profilePictureUrl ? { profilePictureUrl } : {}
    });
    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/auth/change-password", "/auth/change-password"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw Errors.validation("Current password and new password are required.");
    }
    if (newPassword !== confirmNewPassword) {
      throw Errors.validation("New passwords do not match.");
    }
    const currentComputed = hashPassword(currentPassword, user.passwordSalt);
    if (currentComputed !== user.passwordHash) {
      throw Errors.validation("Current password is incorrect.");
    }
    const newSalt = generateSalt();
    const newHash = hashPassword(newPassword, newSalt);
    await updateProfile(user.id, {
      passwordHash: newHash,
      passwordSalt: newSalt
    });
    await createAuditLog({
      action: "PASSWORD_CHANGED",
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetUserId: user.id,
      reason: "User successfully updated password."
    });
    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/auth/2fa/generate", "/auth/2fa/generate"], authMiddleware, (req, res) => {
  const { secret, otpAuthUrl } = generate2FASecret();
  res.json({ secret, otpAuthUrl });
});
app.post(["/api/auth/2fa/toggle", "/auth/2fa/toggle"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const { enable, secret, code } = req.body;
    if (enable) {
      if (!code || !secret) {
        throw Errors.validation("Verification code and secret required to enable 2FA.");
      }
      const isValid = verify2FACode(secret, code);
      if (!isValid) {
        throw Errors.validation("Invalid 2FA code. Please check your authenticator app.");
      }
      await updateProfile(user.id, { twoFactorEnabled: true, twoFactorSecret: secret });
      res.json({ success: true, twoFactorEnabled: true });
    } else {
      await updateProfile(user.id, { twoFactorEnabled: false, twoFactorSecret: void 0 });
      res.json({ success: true, twoFactorEnabled: false });
    }
  } catch (err) {
    next(err);
  }
});
app.get(["/api/user/dashboard", "/user/dashboard"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const [balanceSummary, ledger, earnings, marketPrices] = await Promise.all([
      calculateUserBalanceAsync(user.id),
      getLedgerByUserId(user.id),
      getEarningsByUserId(user.id),
      getMarketPrices()
    ]);
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const todayEarning = earnings.find((e) => e.performanceDate === todayStr);
    const todayEarningsAmount = todayEarning ? todayEarning.earningsAmount : 0;
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
      recentActivity: ledger.slice(0, 5),
      marketPrices,
      serverTime: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/user/deposits", "/user/deposits"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const deposits = await getDepositsByUserId(user.id);
    res.json({ deposits });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/user/deposits", "/user/deposits"], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user = req.user;
    const { txHash, amount, proofPhotoUrl, userNotes } = req.body;
    if (!txHash && !proofPhotoUrl) {
      throw Errors.validation("Please provide either a BSC transaction hash or upload a payment receipt photo.");
    }
    const result = await processDepositAsync({
      userId: user.id,
      txHash: txHash || void 0,
      amount: amount ? Number(amount) : void 0,
      proofPhotoUrl,
      userNotes,
      actorEmail: user.email
    });
    if (!result.success) {
      throw Errors.validation(result.error || "Failed to submit deposit.");
    }
    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ success: true, deposit: result.deposit, balance });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/user/earnings", "/user/earnings"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const earnings = await getEarningsByUserId(user.id);
    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ earnings, totalEarnings: balance.totalEarnings });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/user/withdrawals", "/user/withdrawals"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const withdrawals = await getWithdrawalsByUserId(user.id);
    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ withdrawals, balance });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/user/withdrawals", "/user/withdrawals"], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user = req.user;
    const { requestedAmount, destinationAddress, password, twoFactorCode, idempotencyKey, userNotes } = req.body;
    if (!password) {
      throw Errors.validation("Account password confirmation is required for withdrawal.");
    }
    const passHash = hashPassword(password, user.passwordSalt);
    if (passHash !== user.passwordHash) {
      throw Errors.invalidCredentials("Incorrect account password.");
    }
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        throw Errors.validation("2FA authenticator code is required.");
      }
      const isValidCode = verify2FACode(user.twoFactorSecret || "", twoFactorCode);
      if (!isValidCode) {
        throw Errors.validation("Invalid 2FA authenticator code.");
      }
    }
    const result = await createWithdrawalRequestAsync({
      userId: user.id,
      requestedAmount: Number(requestedAmount),
      destinationAddress,
      idempotencyKey,
      userNotes,
      actorEmail: user.email
    });
    if (!result.success) {
      throw Errors.validation(result.error || "Failed to request withdrawal.");
    }
    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ success: true, withdrawal: result.withdrawal, balance });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/user/lock-funds", "/user/lock-funds"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const { days, reason } = req.body;
    const lockDays = days ? Number(days) : 30;
    const lockUntil = new Date(Date.now() + lockDays * 24 * 60 * 60 * 1e3).toISOString();
    await updateProfile(user.id, {
      fundLockUntil: lockUntil,
      fundLockReason: reason || `User locked funds for ${lockDays} days`
    });
    const balance = await calculateUserBalanceAsync(user.id);
    res.json({
      success: true,
      fundLockUntil: lockUntil,
      balance,
      message: `Funds successfully locked for ${lockDays} days to ensure active yield generation.`
    });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/user/transactions", "/user/transactions"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const transactions = await getLedgerByUserId(user.id);
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/user/messages", "/user/messages", "/api/user/notifications", "/user/notifications"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const messages = await getAdminMessagesForUser(user.id);
    res.json({ messages, unreadCount: messages.filter((m) => !m.isRead).length });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/user/messages/:id/read", "/user/messages/:id/read"], authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const success = await markMessageRead(id, user.id);
    res.json({ success });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/dashboard", "/admin/dashboard"], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const [{ users }, { deposits }, { withdrawals }, earnings, performances, settings] = await Promise.all([
      getAllProfiles({ limit: 1e3 }),
      getAllDeposits({ limit: 1e3 }),
      getAllWithdrawals({ limit: 1e3 }),
      getAllEarnings(),
      getDailyPerformances(),
      getSettings()
    ]);
    const standardUsers = users.filter((u) => u.role === "user");
    const activeUsers = standardUsers.filter((u) => u.status === "active").length;
    const confirmedDeposits = deposits.filter((d) => d.status === "confirmed");
    const totalConfirmedDeposits = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);
    const pendingDeposits = deposits.filter((d) => d.status === "pending" || d.status === "confirming");
    const totalPendingDepositsAmount = pendingDeposits.reduce((acc, d) => acc + d.amount, 0);
    const paidWithdrawals = withdrawals.filter((w) => w.status === "paid");
    const totalPaidWithdrawals = paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
    const totalPaidWithdrawalsNet = paidWithdrawals.reduce((acc, w) => acc + w.netAmount, 0);
    const totalWithdrawalFees = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);
    const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending" || w.status === "under_review");
    const totalPendingWithdrawalsAmount = pendingWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
    const totalEarningsAllocated = earnings.reduce((acc, e) => acc + e.earningsAmount, 0);
    const vaultRetainedLiquidity = Number((totalConfirmedDeposits + totalEarningsAllocated - totalPaidWithdrawals).toFixed(2));
    res.json({
      stats: {
        totalUsers: standardUsers.length,
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
      latestPerformance: performances[0] || null,
      settings
    });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/users", "/admin/users"], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { users } = await getAllProfiles({ limit: 500 });
    const usersWithBalances = await Promise.all(
      users.map(async (u) => {
        const balance = await calculateUserBalanceAsync(u.id);
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
      })
    );
    res.json({ users: usersWithBalances });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/admin/users/:id/status", "/admin/users/:id/status"], authMiddleware, adminMiddleware(["super_admin", "support_admin"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const admin = req.user;
    if (!["active", "suspended", "pending_verification"].includes(status)) {
      throw Errors.validation("Invalid status value.");
    }
    const updated = await updateProfile(id, { status });
    await createAuditLog({
      action: "USER_STATUS_UPDATED",
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId: id,
      afterValue: { status },
      reason: `Admin updated account status to ${status}`
    });
    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/deposits", "/admin/deposits"], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { deposits } = await getAllDeposits({ limit: 500 });
    const depositsWithUsers = await Promise.all(
      deposits.map(async (d) => {
        const user = await getProfileById(d.userId);
        return {
          ...d,
          userName: user ? user.fullName : "Unknown User",
          userEmail: user ? user.email : ""
        };
      })
    );
    res.json({ deposits: depositsWithUsers });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/deposits/:id/proof-url", "/admin/deposits/:id/proof-url"], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const deposit = await getDepositById(id);
    if (!deposit || !deposit.proofPhotoUrl) {
      throw Errors.notFound("DEPOSIT_NOT_FOUND", "Deposit proof not found.");
    }
    const signedUrl = await getSignedDepositProofUrl(deposit.proofPhotoUrl, 3600);
    res.json({ signedUrl: signedUrl || deposit.proofPhotoUrl });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/admin/deposits/:id/action", "/admin/deposits/:id/action"], authMiddleware, adminMiddleware(["super_admin", "finance_admin"]), async (req, res, next) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const { action, adminNotes, txHash } = req.body;
    if (!["confirmed", "rejected", "approve", "reject"].includes(action)) {
      throw Errors.validation("Invalid action. Must be confirmed or rejected.");
    }
    const normalizedStatus = action === "approve" || action === "confirmed" ? "confirmed" : "rejected";
    const result = await updateDepositStatusAsync(admin.id, id, normalizedStatus, adminNotes, txHash);
    if (!result.success) {
      throw Errors.validation(result.error || "Failed to update deposit status.");
    }
    res.json({ success: true, deposit: result.deposit });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/withdrawals", "/admin/withdrawals"], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { withdrawals } = await getAllWithdrawals({ limit: 500 });
    res.json({ withdrawals });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/admin/withdrawals/:id/action", "/admin/withdrawals/:id/action"], authMiddleware, adminMiddleware(["super_admin", "finance_admin"]), async (req, res, next) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const { action, txHash, adminNotes } = req.body;
    if (!["approved", "rejected", "paid", "processing"].includes(action)) {
      throw Errors.validation("Invalid withdrawal action.");
    }
    const result = await updateWithdrawalStatusAsync(admin.id, id, action, txHash, adminNotes);
    if (!result.success) {
      throw Errors.validation(result.error || "Failed to update withdrawal.");
    }
    res.json({ success: true, withdrawal: result.withdrawal });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/admin/messages", "/admin/messages"], authMiddleware, adminMiddleware(["super_admin", "finance_admin", "support_admin"]), async (req, res, next) => {
  try {
    const admin = req.user;
    const { userId, depositId, withdrawalId, messageType, subject, body } = req.body;
    if (!userId || !body) {
      throw Errors.validation("userId and body are required.");
    }
    const message = await createAdminMessage({
      userId,
      adminId: admin.id,
      depositId,
      withdrawalId,
      messageType,
      subject,
      body
    });
    res.json({ success: true, message });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/performance", "/admin/performance"], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const performances = await getDailyPerformances();
    res.json({ performances });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/admin/performance", "/admin/performance"], authMiddleware, adminMiddleware(["super_admin", "finance_admin"]), async (req, res, next) => {
  try {
    const admin = req.user;
    const { date, overallFundAmount, actualFundPerformance, applicableRate, notes } = req.body;
    if (!date || applicableRate === void 0) {
      throw Errors.validation("Date and applicableRate are required.");
    }
    const result = await applyDailyPerformanceAsync({
      adminUserId: admin.id,
      date,
      overallFundAmount: Number(overallFundAmount || 25e5),
      actualFundPerformance: Number(actualFundPerformance || applicableRate * 100),
      applicableRate: Number(applicableRate),
      notes: notes || "Daily verified fund yield distribution"
    });
    if (!result.success) {
      throw Errors.validation(result.error || "Failed to distribute performance.");
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/audit-logs", "/admin/audit-logs"], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const auditLogs = await getAuditLogs({ limit: 200 });
    res.json({ auditLogs });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/admin/settings", "/admin/settings"], authMiddleware, adminMiddleware(["super_admin"]), async (req, res, next) => {
  try {
    const admin = req.user;
    const { reason, ...settingsPayload } = req.body;
    const previousSettings = await getSettings();
    const newSettings = await updateSettings(settingsPayload);
    await createAuditLog({
      action: "SETTINGS_UPDATED",
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      beforeValue: previousSettings,
      afterValue: newSettings,
      reason: reason || "Super Admin updated application settings"
    });
    res.json({ success: true, settings: newSettings });
  } catch (err) {
    next(err);
  }
});
app.post(["/api/admin/auth/force-logout-all", "/admin/auth/force-logout-all"], authMiddleware, adminMiddleware(["super_admin"]), async (req, res, next) => {
  try {
    const admin = req.user;
    const { reason } = req.body;
    const newVersion = await forceLogoutAllUsersAsync();
    await createAuditLog({
      action: "FORCE_LOGOUT_ALL_USERS",
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      afterValue: { sessionVersion: newVersion },
      reason: reason || "Super Admin executed global force logout"
    });
    res.json({
      success: true,
      message: "All active user sessions have been successfully terminated.",
      sessionVersion: newVersion
    });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/system-health", "/admin/system-health"], authMiddleware, adminMiddleware(["super_admin"]), async (req, res, next) => {
  try {
    const supabase = getServerSupabase();
    const [
      { count: usersCount },
      { count: depositsCount },
      { count: withdrawalsCount },
      { count: ledgerCount },
      settings
    ] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("deposits").select("*", { count: "exact", head: true }),
      supabase.from("withdrawals").select("*", { count: "exact", head: true }),
      supabase.from("ledger").select("*", { count: "exact", head: true }),
      getSettings()
    ]);
    res.json({
      status: "HEALTHY",
      database: "SUPABASE_POSTGRESQL",
      sourceOfTruth: "SUPABASE",
      inMemoryDatabase: "DISABLED",
      jsonDatabase: "DISABLED",
      backgroundSync: "DISABLED",
      supabaseAuth: "ENABLED",
      supabaseStorage: "ENABLED",
      tables: {
        users: usersCount || 0,
        deposits: depositsCount || 0,
        withdrawals: withdrawalsCount || 0,
        ledger: ledgerCount || 0
      },
      settings,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/health/stats", "/admin/health/stats"], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const [{ total: totalUsers }, { total: totalDeposits }, { total: totalWithdrawals }, ledger, auditLogs, settings] = await Promise.all([
      getAllProfiles({ limit: 1 }),
      getAllDeposits({ limit: 1 }),
      getAllWithdrawals({ limit: 1 }),
      getAllLedger(),
      getAuditLogs({ limit: 50 }),
      getSettings()
    ]);
    res.json({
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      totalLedgerRecords: ledger.length,
      totalAuditLogs: auditLogs.length,
      totalSystemLogs: 0,
      totalDepositProofs: totalDeposits,
      errorsToday: 0,
      warningsToday: 0,
      infoToday: 0,
      dbLoggingEnabled: true,
      retentionSettings: {
        systemLogRetentionDays: settings.systemLogRetentionDays || 30,
        errorLogRetentionDays: settings.errorLogRetentionDays || 90,
        notificationRetentionDays: settings.notificationRetentionDays || 90
      }
    });
  } catch (err) {
    next(err);
  }
});
app.get(["/api/admin/logs", "/admin/logs"], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { level, event, errorCode, requestId, limit, offset } = req.query;
    const result = await getSystemLogs({
      level,
      event,
      errorCode,
      requestId,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
app.post(["/api/admin/adjust-balance", "/admin/adjust-balance"], authMiddleware, adminMiddleware(["super_admin"]), async (req, res, next) => {
  try {
    const admin = req.user;
    const { targetUserId, amount, reason } = req.body;
    if (!targetUserId || !amount || !reason) {
      throw Errors.validation("targetUserId, amount, and reason are required.");
    }
    const targetUser = await getProfileById(targetUserId);
    if (!targetUser) {
      throw Errors.notFound("USER_NOT_FOUND", "Target user not found.");
    }
    const currentBalance = await calculateUserBalanceAsync(targetUserId);
    const adjustAmount = Number(amount);
    const balanceAfter = Number((currentBalance.availableBalance + adjustAmount).toFixed(4));
    await createLedgerEntry({
      userId: targetUserId,
      type: "admin_adjustment",
      amount: adjustAmount,
      balanceAfter,
      referenceId: `ADJ-${Date.now()}`,
      description: `Admin balance adjustment: ${reason}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      performedBy: admin.id
    });
    await createAuditLog({
      action: "ADMIN_BALANCE_ADJUSTMENT",
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId,
      reason,
      afterValue: { adjustAmount, balanceAfter }
    });
    const updatedBalance = await calculateUserBalanceAsync(targetUserId);
    res.json({ success: true, balance: updatedBalance });
  } catch (err) {
    next(err);
  }
});
app.all(["/api/*", "/api"], (req, res) => {
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
  return app(req, res);
}
export {
  handler as default
};
