import { getServerSupabase } from '../supabase';
import { Referral, ReferralReward } from '../types';
import { resolveUserIdForDb } from './profiles';

export function mapDbReferral(r: any): Referral {
  return {
    id: String(r.id),
    referrerId: String(r.referrer_id),
    referredId: String(r.referred_id),
    referralCodeUsed: r.referral_code_used || undefined,
    status: r.status || 'active',
    createdAt: r.created_at || new Date().toISOString(),
  };
}

export function mapDbReferralReward(rw: any): ReferralReward {
  return {
    id: String(rw.id),
    referralId: rw.referral_id ? String(rw.referral_id) : undefined,
    referrerId: String(rw.referrer_id),
    referredId: String(rw.referred_id),
    depositId: String(rw.deposit_id),
    amount: Number(rw.amount) || 0,
    percentage: Number(rw.percentage) || 0,
    reference: rw.reference,
    status: rw.status || 'credited',
    rewardLevel: rw.reward_level || (rw.reference?.includes('L2') ? 2 : 1),
    notes: rw.notes || undefined,
    createdAt: rw.created_at || new Date().toISOString(),
  };
}

export async function getReferralByReferredId(referredId: string): Promise<Referral | null> {
  try {
    const supabase = getServerSupabase();
    const dbReferredId = await resolveUserIdForDb(referredId);

    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('referred_id', dbReferredId)
      .maybeSingle();

    if (error || !data) return null;
    return mapDbReferral(data);
  } catch (err: any) {
    console.warn(`[Supabase Exception] getReferralByReferredId(${referredId}):`, err?.message);
    return null;
  }
}

export async function getReferralsByReferrerId(referrerId: string): Promise<Referral[]> {
  try {
    const supabase = getServerSupabase();
    const dbReferrerId = await resolveUserIdForDb(referrerId);

    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', dbReferrerId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(mapDbReferral);
  } catch (err: any) {
    console.warn(`[Supabase Exception] getReferralsByReferrerId(${referrerId}):`, err?.message);
    return [];
  }
}

export async function getReferralsByReferrerIdPaginated(
  referrerId: string,
  page: number = 1,
  limit: number = 10
): Promise<{ referrals: Referral[]; total: number }> {
  try {
    const supabase = getServerSupabase();
    const dbReferrerId = await resolveUserIdForDb(referrerId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const offset = (safePage - 1) * safeLimit;

    const { data, count, error } = await supabase
      .from('referrals')
      .select('*', { count: 'exact' })
      .eq('referrer_id', dbReferrerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + safeLimit - 1);

    if (error || !data) return { referrals: [], total: 0 };
    return {
      referrals: data.map(mapDbReferral),
      total: count !== null && count !== undefined ? count : data.length,
    };
  } catch (err: any) {
    console.warn(`[Supabase Exception] getReferralsByReferrerIdPaginated(${referrerId}):`, err?.message);
    return { referrals: [], total: 0 };
  }
}

export async function getReferralsCountByReferrerId(referrerId: string): Promise<number> {
  try {
    const supabase = getServerSupabase();
    const dbReferrerId = await resolveUserIdForDb(referrerId);

    const { count, error } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', dbReferrerId);

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

export async function getRewardsSumForReferredUser(referrerId: string, referredId: string): Promise<number> {
  try {
    const supabase = getServerSupabase();
    const dbReferrerId = await resolveUserIdForDb(referrerId);
    const dbReferredId = await resolveUserIdForDb(referredId);

    const { data, error } = await supabase
      .from('referral_rewards')
      .select('amount')
      .eq('referrer_id', dbReferrerId)
      .eq('referred_id', dbReferredId)
      .eq('status', 'credited');

    if (error || !data) return 0;
    return Number(data.reduce((acc: number, item: any) => acc + (Number(item.amount) || 0), 0).toFixed(4));
  } catch {
    return 0;
  }
}

export async function createReferralRelationship(
  referrerId: string,
  referredId: string,
  referralCodeUsed?: string
): Promise<Referral> {
  const supabase = getServerSupabase();
  const dbReferrerId = await resolveUserIdForDb(referrerId);
  const dbReferredId = await resolveUserIdForDb(referredId);

  // Self-referral validation
  if (String(dbReferrerId) === String(dbReferredId)) {
    throw new Error('Self-referral is strictly prohibited.');
  }

  // Check if referred user already has an established referrer
  const existing = await getReferralByReferredId(referredId);
  if (existing) {
    return existing; // Immutable once established
  }

  const payload = {
    referrer_id: dbReferrerId,
    referred_id: dbReferredId,
    referral_code_used: referralCodeUsed || null,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('referrals')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.warn('[Supabase Warn] createReferralRelationship:', error.message);
    // If conflict, return existing
    const fallback = await getReferralByReferredId(referredId);
    if (fallback) return fallback;
    throw new Error(`Failed to bind referral relationship: ${error.message}`);
  }

  return mapDbReferral(data);
}

export async function getReferralRewardByDepositId(depositId: string | number): Promise<ReferralReward | null> {
  try {
    const supabase = getServerSupabase();
    const dbDepositId = !isNaN(Number(depositId)) ? Number(depositId) : depositId;

    const { data, error } = await supabase
      .from('referral_rewards')
      .select('*')
      .eq('deposit_id', dbDepositId)
      .maybeSingle();

    if (error || !data) return null;
    return mapDbReferralReward(data);
  } catch (err: any) {
    console.warn(`[Supabase Exception] getReferralRewardByDepositId(${depositId}):`, err?.message);
    return null;
  }
}

export async function createReferralReward(reward: Partial<ReferralReward>): Promise<ReferralReward> {
  const supabase = getServerSupabase();
  const dbReferrerId = await resolveUserIdForDb(reward.referrerId);
  const dbReferredId = await resolveUserIdForDb(reward.referredId);
  const dbDepositId = !isNaN(Number(reward.depositId)) ? Number(reward.depositId) : reward.depositId;

  if (String(dbReferrerId) === String(dbReferredId)) {
    throw new Error('Cannot reward self-referral.');
  }

  const payload = {
    referral_id: reward.referralId ? (!isNaN(Number(reward.referralId)) ? Number(reward.referralId) : reward.referralId) : null,
    referrer_id: dbReferrerId,
    referred_id: dbReferredId,
    deposit_id: dbDepositId,
    amount: reward.amount || 0,
    percentage: reward.percentage || 0,
    reference: reward.reference || `REF-REW-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
    status: reward.status || 'credited',
    notes: reward.notes || null,
    created_at: reward.createdAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('referral_rewards')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Supabase Error] createReferralReward:', error.message);
    throw new Error(`Failed to create referral reward record: ${error.message}`);
  }

  return mapDbReferralReward(data);
}

export async function getReferralRewardsByReferrerId(referrerId: string): Promise<ReferralReward[]> {
  try {
    const supabase = getServerSupabase();
    const dbReferrerId = await resolveUserIdForDb(referrerId);

    const { data, error } = await supabase
      .from('referral_rewards')
      .select('*')
      .eq('referrer_id', dbReferrerId)
      .eq('status', 'credited')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(mapDbReferralReward);
  } catch (err: any) {
    console.warn(`[Supabase Exception] getReferralRewardsByReferrerId(${referrerId}):`, err?.message);
    return [];
  }
}

export async function getAllReferralRewards(options?: { limit?: number; offset?: number }): Promise<{
  rewards: ReferralReward[];
  total: number;
}> {
  try {
    const supabase = getServerSupabase();
    const limit = options?.limit || 500;
    const offset = options?.offset || 0;

    const { data, count, error } = await supabase
      .from('referral_rewards')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      return { rewards: [], total: 0 };
    }

    return {
      rewards: data.map(mapDbReferralReward),
      total: count || data.length,
    };
  } catch (err: any) {
    console.warn('[Supabase Exception] getAllReferralRewards:', err?.message);
    return { rewards: [], total: 0 };
  }
}
