import { getServerSupabase } from '../supabase';
import { User, UserRole, AccountStatus } from '../types';

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
    password_hash: user.passwordHash || '',
    salt: user.passwordSalt || '',
    role: user.role || 'user',
    two_factor_enabled: Boolean(user.twoFactorEnabled),
    two_factor_secret: user.twoFactorSecret || null,
    is_locked: user.status === 'suspended',
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
    // If optional column like phone does not exist in schema, retry without it
    delete payload.phone;
    const retry = await supabase
      .from('users')
      .insert(payload)
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
  const supabase = getServerSupabase();
  const payload: any = {};

  if (updates.fullName !== undefined) payload.full_name = updates.fullName;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.passwordHash !== undefined) payload.password_hash = updates.passwordHash;
  if (updates.passwordSalt !== undefined) payload.salt = updates.passwordSalt;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.status !== undefined) {
    payload.is_locked = updates.status === 'suspended';
  }
  if (updates.twoFactorEnabled !== undefined) payload.two_factor_enabled = updates.twoFactorEnabled;
  if (updates.twoFactorSecret !== undefined) payload.two_factor_secret = updates.twoFactorSecret;

  let { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error && error.message.includes('phone')) {
    delete payload.phone;
    const retry = await supabase
      .from('users')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

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
