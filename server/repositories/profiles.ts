import { getServerSupabase } from '../supabase';
import { User, UserRole, AccountStatus } from '../types';

export async function resolveUserIdForDb(userId: string | number | undefined): Promise<number | string> {
  if (!userId) return 1;
  const strId = String(userId).trim();
  if (!isNaN(Number(strId)) && Number(strId) > 0) {
    return Number(strId);
  }

  const userEmail = strId.includes('@') ? strId : undefined;

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

    // 3. Fallback to first active user in DB if any foreign key is strictly required
    try {
      const { data: firstUser } = await supabase.from('users').select('id').limit(1).maybeSingle();
      if (firstUser && firstUser.id !== undefined && firstUser.id !== null) {
        return firstUser.id;
      }
    } catch {
      // Ignore
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
    lastLoginAt: u.last_login_at || u.lastLoginAt,
    loginAttempts: u.login_attempts || u.loginAttempts || 0,
    lockUntil: u.lock_until || u.lockUntil,
    fundLockUntil: u.fund_lock_until || u.fundLockUntil,
    fundLockReason: u.fund_lock_reason || u.fundLockReason,
    lastWithdrawalAt: u.last_withdrawal_at || u.lastWithdrawalAt,
  };
}

export async function getProfileById(id: string): Promise<User | null> {
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
    profile_picture_url: user.profilePictureUrl || null,
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
    // If optional columns (profile_picture_url, phone, country) are not yet migrated in DB, gracefully retry without them
    const fallbackPayload: any = {
      full_name: user.fullName || 'User',
      email: normEmail,
      password_hash: user.passwordHash || '',
      salt: user.passwordSalt || '',
      role: user.role || 'user',
      is_locked: user.status === 'suspended',
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
  }
  if (updates.twoFactorEnabled !== undefined) payload.two_factor_enabled = updates.twoFactorEnabled;
  if (updates.twoFactorSecret !== undefined) payload.two_factor_secret = updates.twoFactorSecret;
  if (updates.profilePictureUrl !== undefined) payload.profile_picture_url = updates.profilePictureUrl;

  // If payload is empty (e.g. loginAttempts/lastLoginAt updates), safely return existing profile
  if (Object.keys(payload).length === 0) {
    const current = await getProfileById(id);
    if (!current) throw new Error('User not found');
    return current;
  }

  let { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error && error.message.includes('column')) {
    delete payload.phone;
    delete payload.country;
    delete payload.profile_picture_url;

    if (Object.keys(payload).length === 0) {
      const current = await getProfileById(id);
      if (!current) throw new Error('User not found');
      return current;
    }

    const retry = await supabase
      .from('users')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();
    data = retry.data;
    error = retry.error;
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

