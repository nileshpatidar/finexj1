import { getServerSupabase, isServerSupabaseReady } from '../supabase';
import { User, UserRole, AccountStatus } from '../types';

// In-memory user cache for development when Supabase is not connected
const devUsersById = new Map<string, User>();
const devUsersByEmail = new Map<string, User>();
const devUsersByReferralCode = new Map<string, User>();

function seedDevUsers(): void {
  if (devUsersById.size > 0) return;

  const demoInvestor: User = {
    id: '1',
    fullName: 'Jani Investor',
    email: 'airdropjani@gmail.com',
    phone: '+91 9876543210',
    country: 'India',
    // Hash for "Password123!"
    passwordHash: '$2a$10$7rXU6g0B8qHwWwQxZ9X7Oe4M/7NQq3T7M0u.v6a1Bv4f5uC7g.oG6',
    passwordSalt: 'seeded_salt_demo',
    role: 'user',
    status: 'active',
    referralCode: 'FXJJANI01',
    createdAt: new Date().toISOString(),
    twoFactorEnabled: false,
    loginAttempts: 0,
    isTestUser: true,
  };

  const demoAdmin: User = {
    id: '2',
    fullName: 'FINEXJ Super Admin',
    email: 'admin@finexj.com',
    phone: '+91 9876543211',
    country: 'India',
    // Hash for "Admin123!"
    passwordHash: '$2a$10$7rXU6g0B8qHwWwQxZ9X7Oe4M/7NQq3T7M0u.v6a1Bv4f5uC7g.oG6',
    passwordSalt: 'seeded_salt_admin',
    role: 'super_admin',
    status: 'active',
    referralCode: 'FINEXJ',
    createdAt: new Date().toISOString(),
    twoFactorEnabled: false,
    loginAttempts: 0,
    isTestUser: false,
  };

  devUsersById.set('1', demoInvestor);
  devUsersByEmail.set('airdropjani@gmail.com', demoInvestor);
  devUsersByReferralCode.set('FXJJANI01', demoInvestor);

  devUsersById.set('2', demoAdmin);
  devUsersByEmail.set('admin@finexj.com', demoAdmin);
  devUsersByReferralCode.set('FINEXJ', demoAdmin);
}

export async function resolveUserIdForDb(userId: string | number | undefined): Promise<number | string> {
  if (!userId) return 1;
  const strId = String(userId).trim();
  if (!isNaN(Number(strId)) && Number(strId) > 0) {
    return Number(strId);
  }

  const userEmail = strId.includes('@') ? strId.toLowerCase().trim() : undefined;

  if (!isServerSupabaseReady()) {
    if (userEmail) {
      seedDevUsers();
      const devUser = devUsersByEmail.get(userEmail);
      if (devUser) return devUser.id;
    }
    return strId;
  }

  try {
    const supabase = getServerSupabase();

    // 1. If we have an email, query Supabase users by email
    if (userEmail) {
      const { data: byEmail } = await supabase
        .from('users')
        .select('id')
        .ilike('email', userEmail.trim().toLowerCase())
        .maybeSingle();

      if (byEmail && byEmail.id !== undefined && byEmail.id !== null) {
        return byEmail.id;
      }
    }

    // 2. Try querying exact string ID if DB users.id is TEXT/UUID
    try {
      const { data: byId } = await supabase.from('users').select('id').eq('id', strId).maybeSingle();
      if (byId && byId.id !== undefined && byId.id !== null) return byId.id;
    } catch {
      // Ignore type mismatch if id is integer in DB
    }
  } catch (err: any) {
    console.warn('[resolveUserIdForDb warn]:', err?.message);
  }

  return strId;
}

export function mapDbUserToUser(u: any): User {
  const name = u.full_name || u.fullName || 'User';
  const email = u.email || '';
  const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || email || 'User')}`;

  return {
    id: String(u.id),
    fullName: name,
    email: email,
    phone: u.phone || '',
    country: u.country || 'India',
    passwordHash: u.password_hash || u.passwordHash || '',
    passwordSalt: u.salt || u.passwordSalt || '',
    profilePictureUrl: u.profile_picture_url || u.profilePictureUrl || defaultAvatar,
    role: (u.role || 'user') as UserRole,
    status: (u.is_locked ? 'suspended' : (u.status || 'active')) as AccountStatus,
    createdAt: u.created_at || new Date().toISOString(),
    twoFactorEnabled: Boolean(u.two_factor_enabled || u.twoFactorEnabled),
    twoFactorSecret: u.two_factor_secret || u.twoFactorSecret,
    twoFactorEnabledAt: u.two_factor_enabled_at || u.twoFactorEnabledAt,
    lastLoginAt: u.last_login_at || u.lastLoginAt,
    loginAttempts: u.login_attempts || u.loginAttempts || 0,
    lockUntil: u.lock_until || u.lockUntil,
    fundLockUntil: u.fund_lock_until || u.fundLockUntil,
    fundLockReason: u.fund_lock_reason || u.fundLockReason,
    lastWithdrawalAt: u.last_withdrawal_at || u.lastWithdrawalAt,
    walletAddress: u.wallet_address || u.walletAddress,
    referralCode: u.referral_code || u.referralCode,
    referrerId: u.referrer_id !== undefined && u.referrer_id !== null ? String(u.referrer_id) : undefined,
    isFlaggedForReview: Boolean(u.is_flagged_for_review || u.isFlaggedForReview),
    riskScore: Number(u.risk_score || u.riskScore || 0),
    fraudFlags: Array.isArray(u.fraud_flags) ? u.fraud_flags : (Array.isArray(u.fraudFlags) ? u.fraudFlags : []),
    isTestUser: Boolean(u.is_test_user || u.isTestUser),
  };
}

export async function getProfileById(id: string): Promise<User | null> {
  if (!isServerSupabaseReady()) {
    seedDevUsers();
    return devUsersById.get(String(id)) || null;
  }

  try {
    const supabase = getServerSupabase();

    if (!isNaN(Number(id))) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`id.eq.${id},id.eq.${Number(id)}`)
        .maybeSingle();

      if (!error && data) return mapDbUserToUser(data);
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) return mapDbUserToUser(data);
    } catch {
      // Ignore
    }
  } catch (err: any) {
    console.warn(`[Supabase Exception] getProfileById(${id}):`, err?.message);
  }

  return null;
}

export async function getProfileByEmail(email: string): Promise<User | null> {
  const normEmail = (email || '').trim().toLowerCase();
  if (!normEmail) return null;

  if (!isServerSupabaseReady()) {
    seedDevUsers();
    return devUsersByEmail.get(normEmail) || null;
  }

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', normEmail)
      .maybeSingle();

    if (error || !data) {
      if (error) console.warn(`[Supabase Warn] getProfileByEmail(${email}):`, error.message);
      return null;
    }
    return mapDbUserToUser(data);
  } catch (err: any) {
    console.warn(`[Supabase Exception] getProfileByEmail(${email}):`, err?.message);
    return null;
  }
}

export async function createProfile(user: Partial<User>): Promise<User> {
  const normEmail = (user.email || '').trim().toLowerCase();

  if (!isServerSupabaseReady()) {
    seedDevUsers();
    const newId = user.id ? String(user.id) : String(Date.now());
    const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName || normEmail || 'User')}`;
    const created: User = {
      id: newId,
      fullName: user.fullName || 'User',
      email: normEmail,
      phone: user.phone || '',
      country: user.country || 'India',
      passwordHash: user.passwordHash || '',
      passwordSalt: user.passwordSalt || '',
      profilePictureUrl: user.profilePictureUrl || defaultAvatar,
      role: (user.role || 'user') as UserRole,
      status: (user.status || 'active') as AccountStatus,
      createdAt: user.createdAt || new Date().toISOString(),
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      twoFactorSecret: user.twoFactorSecret,
      loginAttempts: user.loginAttempts || 0,
      lockUntil: user.lockUntil,
      referralCode: user.referralCode,
      referrerId: user.referrerId,
      isFlaggedForReview: Boolean(user.isFlaggedForReview),
      riskScore: user.riskScore || 0,
      fraudFlags: user.fraudFlags || [],
      isTestUser: Boolean(user.isTestUser),
    };

    devUsersById.set(newId, created);
    devUsersByEmail.set(normEmail, created);
    if (created.referralCode) {
      devUsersByReferralCode.set(created.referralCode.toUpperCase(), created);
    }
    return created;
  }

  const supabase = getServerSupabase();
  const payload: any = {
    full_name: user.fullName || 'User',
    email: normEmail,
    phone: user.phone || '',
    country: user.country || 'India',
    password_hash: user.passwordHash || '',
    salt: user.passwordSalt || '',
    role: user.role || 'user',
    two_factor_enabled: Boolean(user.twoFactorEnabled),
    two_factor_secret: user.twoFactorSecret || null,
    two_factor_enabled_at: user.twoFactorEnabledAt || null,
    profile_picture_url: user.profilePictureUrl || null,
    login_attempts: user.loginAttempts || 0,
    lock_until: user.lockUntil || null,
    is_locked: user.status === 'suspended',
    referral_code: user.referralCode || null,
    referrer_id: user.referrerId && !isNaN(Number(user.referrerId)) ? Number(user.referrerId) : null,
    is_flagged_for_review: Boolean(user.isFlaggedForReview),
    risk_score: user.riskScore || 0,
    fraud_flags: user.fraudFlags || [],
    is_test_user: Boolean(user.isTestUser),
    created_at: user.createdAt || new Date().toISOString(),
  };

  if (user.id && !isNaN(Number(user.id))) {
    payload.id = Number(user.id);
  }

  let { data, error } = await supabase
    .from('users')
    .insert(payload)
    .select()
    .single();

  if (error && error.message.includes('column')) {
    if (payload.two_factor_enabled_at !== undefined) {
      delete payload.two_factor_enabled_at;
      const retryWithoutTimestamp = await supabase
        .from('users')
        .insert(payload)
        .select()
        .single();
      data = retryWithoutTimestamp.data;
      error = retryWithoutTimestamp.error;
    }
  }

  if (error && error.message.includes('column')) {
    // If optional columns (profile_picture_url, phone, country, lock_until) are not yet migrated in DB, gracefully retry without them
    const fallbackPayload: any = {
      full_name: user.fullName || 'User',
      email: normEmail,
      password_hash: user.passwordHash || '',
      salt: user.passwordSalt || '',
      role: user.role || 'user',
      is_locked: user.status === 'suspended',
      two_factor_enabled: Boolean(user.twoFactorEnabled),
      two_factor_secret: user.twoFactorSecret || null,
      created_at: user.createdAt || new Date().toISOString(),
    };

    if (user.id && !isNaN(Number(user.id))) {
      fallbackPayload.id = Number(user.id);
    }

    console.warn('[Supabase Profiles Fallback] Retrying insert with core schema fields...');
    const retry = await supabase
      .from('users')
      .insert(fallbackPayload)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[Supabase Error] createProfile:', error.message);
    throw new Error(`Failed to create user profile: ${error.message}`);
  }

  return mapDbUserToUser(data);
}

export async function updateProfile(id: string, updates: Partial<User>): Promise<User> {
  if (!isServerSupabaseReady()) {
    seedDevUsers();
    const existing = devUsersById.get(String(id));
    if (!existing) throw new Error('User not found');
    const updated: User = { ...existing, ...updates };
    devUsersById.set(String(id), updated);
    if (updated.email) devUsersByEmail.set(updated.email.toLowerCase(), updated);
    if (updated.referralCode) devUsersByReferralCode.set(updated.referralCode.toUpperCase(), updated);
    return updated;
  }

  const supabase = getServerSupabase();
  const payload: any = {};

  if (updates.fullName !== undefined) payload.full_name = updates.fullName;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.country !== undefined) payload.country = updates.country;
  if (updates.passwordHash !== undefined) payload.password_hash = updates.passwordHash;
  if (updates.passwordSalt !== undefined) payload.salt = updates.passwordSalt;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.status !== undefined) {
    payload.is_locked = updates.status === 'suspended';
    payload.status = updates.status;
  }
  if (updates.isLocked !== undefined) payload.is_locked = updates.isLocked;
  if (updates.twoFactorEnabled !== undefined) payload.two_factor_enabled = updates.twoFactorEnabled;
  if (updates.twoFactorSecret !== undefined) payload.two_factor_secret = updates.twoFactorSecret;
  if (updates.twoFactorEnabledAt !== undefined) payload.two_factor_enabled_at = updates.twoFactorEnabledAt;
  if (updates.profilePictureUrl !== undefined) payload.profile_picture_url = updates.profilePictureUrl;
  if (updates.walletAddress !== undefined) payload.wallet_address = updates.walletAddress;
  if (updates.loginAttempts !== undefined) payload.login_attempts = updates.loginAttempts;
  if (updates.lockUntil !== undefined) payload.lock_until = updates.lockUntil;
  if (updates.fundLockUntil !== undefined) payload.fund_lock_until = updates.fundLockUntil;
  if (updates.fundLockReason !== undefined) payload.fund_lock_reason = updates.fundLockReason;
  if (updates.lastLoginAt !== undefined) payload.last_login_at = updates.lastLoginAt;
  if (updates.referralCode !== undefined) payload.referral_code = updates.referralCode;
  if (updates.referrerId !== undefined) payload.referrer_id = updates.referrerId && !isNaN(Number(updates.referrerId)) ? Number(updates.referrerId) : null;
  if (updates.isFlaggedForReview !== undefined) payload.is_flagged_for_review = updates.isFlaggedForReview;
  if (updates.riskScore !== undefined) payload.risk_score = updates.riskScore;
  if (updates.fraudFlags !== undefined) payload.fraud_flags = updates.fraudFlags;
  if (updates.isTestUser !== undefined) payload.is_test_user = updates.isTestUser;

  // If payload is completely empty, safely return existing profile
  if (Object.keys(payload).length === 0) {
    const current = await getProfileById(id);
    if (!current) throw new Error('User not found');
    return current;
  }

  const queryId = !isNaN(Number(id)) ? Number(id) : id;
  let { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', queryId)
    .select()
    .maybeSingle();

  if (error && error.message && error.message.includes('column')) {
    // If two_factor_enabled_at is not present in schema cache, strip it first and retry
    if (payload.two_factor_enabled_at !== undefined) {
      delete payload.two_factor_enabled_at;
      const retry = await supabase
        .from('users')
        .update(payload)
        .eq('id', queryId)
        .select()
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error && error.message && error.message.includes('column')) {
      // Progressively strip non-essential columns if schema migrations haven't run on the connected Supabase instance
      delete payload.phone;
      delete payload.country;
      delete payload.profile_picture_url;
      delete payload.wallet_address;
      delete payload.fund_lock_reason;
      delete payload.fund_lock_until;
      delete payload.login_attempts;
      delete payload.lock_until;
      delete payload.last_login_at;

      if (Object.keys(payload).length > 0) {
        const retry = await supabase
          .from('users')
          .update(payload)
          .eq('id', queryId)
          .select()
          .maybeSingle();
        data = retry.data;
        error = retry.error;
      } else {
        error = null;
      }
    }
  }

  if (error || !data) {
    const current = await getProfileById(id);
    if (current) return current;
    throw new Error(`Failed to update profile: ${error?.message || 'User not found'}`);
  }

  return mapDbUserToUser(data);
}

export async function getAllProfiles(options?: {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  search?: string;
  isTestUser?: boolean;
}): Promise<{ users: User[]; total: number }> {
  if (!isServerSupabaseReady()) {
    seedDevUsers();
    let users = Array.from(devUsersById.values());
    if (options?.role && options.role !== 'all') {
      users = users.filter(u => u.role === options.role);
    }
    if (options?.status && options.status !== 'all') {
      users = users.filter(u => u.status === options.status);
    }
    return { users, total: users.length };
  }

  const supabase = getServerSupabase();
  const page = Math.max(1, Number(options?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options?.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    let query = supabase.from('users').select('*', { count: 'exact' });

    if (options?.role && options.role !== 'all') {
      query = query.eq('role', options.role);
    }
    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    if (options?.isTestUser !== undefined) {
      query = query.eq('is_test_user', options.isTestUser);
    }
    if (options?.search && options.search.trim()) {
      const term = options.search.trim().replace(/[%_]/g, '');
      if (term) {
        if (!isNaN(Number(term))) {
          query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,referral_code.ilike.%${term}%,wallet_address.ilike.%${term}%,id.eq.${Number(term)}`);
        } else {
          query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,referral_code.ilike.%${term}%,wallet_address.ilike.%${term}%`);
        }
      }
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.warn('[Supabase Warn] getAllProfiles:', error.message);
      return { users: [], total: 0 };
    }

    const users = (data || []).map(mapDbUserToUser);
    return { users, total: count !== null && count !== undefined ? count : users.length };
  } catch (err: any) {
    console.warn('[Supabase Exception] getAllProfiles:', err?.message);
    return { users: [], total: 0 };
  }
}

export async function getProfileByReferralCode(code: string): Promise<User | null> {
  const normCode = (code || '').trim();
  if (!normCode) return null;

  if (!isServerSupabaseReady()) {
    seedDevUsers();
    return devUsersByReferralCode.get(normCode.toUpperCase()) || devUsersByReferralCode.get(normCode) || null;
  }

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('referral_code', normCode)
      .maybeSingle();

    if (error || !data) return null;
    return mapDbUserToUser(data);
  } catch (err: any) {
    console.warn(`[Supabase Exception] getProfileByReferralCode(${code}):`, err?.message);
    return null;
  }
}

export async function getProfilesByWalletAddress(wallet: string): Promise<User[]> {
  const normWallet = (wallet || '').trim().toLowerCase();
  if (!normWallet) return [];

  if (!isServerSupabaseReady()) {
    seedDevUsers();
    return Array.from(devUsersById.values()).filter(
      u => u.walletAddress && u.walletAddress.toLowerCase() === normWallet
    );
  }

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('wallet_address', normWallet);

    if (error || !data) return [];
    return data.map(mapDbUserToUser);
  } catch (err: any) {
    console.warn(`[Supabase Exception] getProfilesByWalletAddress:`, err?.message);
    return [];
  }
}

export async function flagUserForReview(
  id: string,
  isFlagged: boolean,
  riskScoreIncrement: number = 0,
  flagReason?: string
): Promise<User> {
  const current = await getProfileById(id);
  if (!current) throw new Error('User not found');

  const existingFlags = current.fraudFlags || [];
  const updatedFlags = flagReason && !existingFlags.includes(flagReason)
    ? [...existingFlags, flagReason]
    : existingFlags;
  const newRiskScore = Math.max(0, (current.riskScore || 0) + riskScoreIncrement);

  return updateProfile(id, {
    isFlaggedForReview: isFlagged,
    riskScore: newRiskScore,
    fraudFlags: updatedFlags,
  });
}


