import { getServerSupabase } from '../supabase';
import { User, UserRole, AccountStatus } from '../types';

export function mapDbUserToUser(u: any): User {
  return {
    id: String(u.id),
    fullName: u.full_name || u.fullName || 'User',
    email: u.email,
    phone: u.phone || '',
    country: u.country || 'India',
    passwordHash: u.password_hash || u.passwordHash || '',
    passwordSalt: u.salt || u.passwordSalt || '',
    profilePictureUrl: u.profile_picture_url || u.profilePictureUrl,
    role: (u.role || 'user') as UserRole,
    status: (u.is_locked ? 'suspended' : (u.status || 'active')) as AccountStatus,
    createdAt: u.created_at || new Date().toISOString(),
    twoFactorEnabled: Boolean(u.two_factor_enabled || u.twoFactorEnabled),
    twoFactorSecret: u.two_factor_secret || u.twoFactorSecret,
    lastLoginAt: u.last_login_at || u.lastLoginAt,
    loginAttempts: u.login_attempts || u.loginAttempts || 0,
    lockUntil: u.lock_until || u.lockUntil,
    fundLockUntil: u.fund_lock_until || u.fundLockUntil,
    fundLockReason: u.fund_lock_reason || u.fundLockReason,
    lastWithdrawalAt: u.last_withdrawal_at || u.lastWithdrawalAt,
  };
}

export async function getProfileById(id: string): Promise<User | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error(`[Supabase Error] getProfileById(${id}):`, error.message);
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  if (!data) return null;
  return mapDbUserToUser(data);
}

export async function getProfileByEmail(email: string): Promise<User | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', email.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    console.error(`[Supabase Error] getProfileByEmail(${email}):`, error.message);
    throw new Error(`Failed to query user by email: ${error.message}`);
  }

  if (!data) return null;
  return mapDbUserToUser(data);
}

export async function createProfile(user: Partial<User>): Promise<User> {
  const supabase = getServerSupabase();
  const payload: any = {
    full_name: user.fullName || 'User',
    email: user.email?.trim().toLowerCase(),
    phone: user.phone || '',
    country: user.country || 'India',
    password_hash: user.passwordHash || '',
    salt: user.passwordSalt || '',
    role: user.role || 'user',
    status: user.status || 'active',
    two_factor_enabled: Boolean(user.twoFactorEnabled),
    two_factor_secret: user.twoFactorSecret || null,
    is_locked: user.status === 'suspended',
    login_attempts: user.loginAttempts || 0,
    profile_picture_url: user.profilePictureUrl || null,
    created_at: user.createdAt || new Date().toISOString(),
  };

  if (user.id) {
    payload.id = user.id;
  }

  const { data, error } = await supabase
    .from('users')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Supabase Error] createProfile:', error.message);
    throw new Error(`Failed to create user profile: ${error.message}`);
  }

  return mapDbUserToUser(data);
}

export async function updateProfile(id: string, updates: Partial<User>): Promise<User> {
  const supabase = getServerSupabase();
  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.fullName !== undefined) payload.full_name = updates.fullName;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.country !== undefined) payload.country = updates.country;
  if (updates.passwordHash !== undefined) payload.password_hash = updates.passwordHash;
  if (updates.passwordSalt !== undefined) payload.salt = updates.passwordSalt;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.status !== undefined) {
    payload.status = updates.status;
    payload.is_locked = updates.status === 'suspended';
  }
  if (updates.twoFactorEnabled !== undefined) payload.two_factor_enabled = updates.twoFactorEnabled;
  if (updates.twoFactorSecret !== undefined) payload.two_factor_secret = updates.twoFactorSecret;
  if (updates.profilePictureUrl !== undefined) payload.profile_picture_url = updates.profilePictureUrl;
  if (updates.lastLoginAt !== undefined) payload.last_login_at = updates.lastLoginAt;
  if (updates.loginAttempts !== undefined) payload.login_attempts = updates.loginAttempts;
  if (updates.fundLockUntil !== undefined) payload.fund_lock_until = updates.fundLockUntil;
  if (updates.fundLockReason !== undefined) payload.fund_lock_reason = updates.fundLockReason;

  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`[Supabase Error] updateProfile(${id}):`, error.message);
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  return mapDbUserToUser(data);
}

export async function getAllProfiles(options?: {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
}): Promise<{ users: User[]; total: number }> {
  const supabase = getServerSupabase();
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase.from('users').select('*', { count: 'exact' });

  if (options?.role && options.role !== 'all') {
    query = query.eq('role', options.role);
  }
  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[Supabase Error] getAllProfiles:', error.message);
    throw new Error(`Failed to list profiles: ${error.message}`);
  }

  const users = (data || []).map(mapDbUserToUser);
  return { users, total: count || users.length };
}
