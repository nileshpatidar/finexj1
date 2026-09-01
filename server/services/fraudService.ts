import { getServerSupabase } from '../supabase';
import { FraudSignal, User } from '../types';
import { getProfilesByWalletAddress, flagUserForReview, getProfileById } from '../repositories/profiles';
import { createAuditLog } from '../repositories/auditLogs';
import { logger } from '../logger';

export function mapDbFraudSignal(f: any): FraudSignal {
  return {
    id: String(f.id),
    signalType: f.signal_type,
    severity: f.severity || 'medium',
    userId: f.user_id ? String(f.user_id) : undefined,
    targetUserId: f.target_user_id ? String(f.target_user_id) : undefined,
    walletAddress: f.wallet_address || undefined,
    txHash: f.tx_hash || undefined,
    details: f.details || undefined,
    status: f.status || 'open',
    reviewedBy: f.reviewed_by || undefined,
    reviewedAt: f.reviewed_at || undefined,
    resolutionNotes: f.resolution_notes || undefined,
    createdAt: f.created_at || new Date().toISOString(),
  };
}

/**
 * Record a detected fraud or abuse signal into the database and security logs
 */
export async function recordFraudSignal(signal: Partial<FraudSignal>): Promise<FraudSignal | null> {
  try {
    const supabase = getServerSupabase();
    const payload = {
      signal_type: signal.signalType || 'suspicious_activity',
      severity: signal.severity || 'medium',
      user_id: signal.userId && !isNaN(Number(signal.userId)) ? Number(signal.userId) : null,
      target_user_id: signal.targetUserId && !isNaN(Number(signal.targetUserId)) ? Number(signal.targetUserId) : null,
      wallet_address: signal.walletAddress ? signal.walletAddress.trim().toLowerCase() : null,
      tx_hash: signal.txHash ? signal.txHash.trim().toLowerCase() : null,
      details: signal.details || null,
      status: signal.status || 'open',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('fraud_signals')
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[Supabase Warn] recordFraudSignal:', error.message);
    }

    logger.warn('FRAUD_SIGNAL_DETECTED', `Signal: ${signal.signalType} (Severity: ${signal.severity})`, {
      userId: signal.userId,
      metadata: {
        signalType: signal.signalType,
        wallet: signal.walletAddress,
        txHash: signal.txHash,
        details: signal.details,
      },
    });

    if (signal.userId) {
      await flagUserForReview(
        signal.userId,
        true,
        signal.severity === 'critical' ? 50 : signal.severity === 'high' ? 25 : 10,
        signal.signalType
      );
    }

    return data ? mapDbFraudSignal(data) : null;
  } catch (err: any) {
    console.warn('[recordFraudSignal Exception]:', err?.message);
    return null;
  }
}

/**
 * Check if a wallet address (deposit source or withdrawal destination) is reused across multiple accounts.
 * Returns risk details without throwing an exception or blocking innocent users immediately.
 */
export async function checkWalletDuplication(
  walletAddress: string,
  currentUserId: string,
  context: 'deposit' | 'withdrawal'
): Promise<{ isReused: boolean; matchingUserIds: string[] }> {
  if (!walletAddress || !walletAddress.startsWith('0x')) {
    return { isReused: false, matchingUserIds: [] };
  }

  const normWallet = walletAddress.trim().toLowerCase();

  try {
    const supabase = getServerSupabase();
    // Query users with same wallet_address
    const { data: usersWithWallet } = await supabase
      .from('users')
      .select('id, email, wallet_address')
      .ilike('wallet_address', normWallet);

    const otherUsers = (usersWithWallet || []).filter((u: any) => String(u.id) !== String(currentUserId));

    if (otherUsers.length > 0) {
      const otherUserIds = otherUsers.map((u: any) => String(u.id));

      // Record fraud signal for admin awareness
      await recordFraudSignal({
        signalType: 'duplicate_wallet',
        severity: otherUsers.length > 2 ? 'high' : 'medium',
        userId: currentUserId,
        walletAddress: normWallet,
        details: {
          context,
          matchingUserIds: otherUserIds,
          duplicateCount: otherUsers.length + 1,
        },
      });

      return { isReused: true, matchingUserIds: otherUserIds };
    }
  } catch (err: any) {
    console.warn('[checkWalletDuplication Exception]:', err?.message);
  }

  return { isReused: false, matchingUserIds: [] };
}

/**
 * Detect rapid deposit -> immediate withdrawal cycling
 */
export async function checkRapidWithdrawalCycle(
  userId: string,
  requestedAmount: number
): Promise<{ isRapidCycle: boolean; reason?: string }> {
  try {
    const supabase = getServerSupabase();
    const dbUserId = !isNaN(Number(userId)) ? Number(userId) : userId;

    // Check confirmed deposits in last 48 hours
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recentDeposits } = await supabase
      .from('deposits')
      .select('id, amount, confirmed_at')
      .eq('user_id', dbUserId)
      .eq('status', 'confirmed')
      .gte('confirmed_at', twoDaysAgo);

    if (recentDeposits && recentDeposits.length > 0) {
      const recentTotal = recentDeposits.reduce((acc: number, d: any) => acc + (Number(d.amount) || 0), 0);

      // If user is requesting to withdraw a large portion of a deposit made less than 48h ago
      if (requestedAmount >= recentTotal * 0.5) {
        await recordFraudSignal({
          signalType: 'rapid_cycle',
          severity: 'medium',
          userId,
          details: {
            recentDepositsCount: recentDeposits.length,
            recentDepositTotal: recentTotal,
            requestedWithdrawalAmount: requestedAmount,
          },
        });

        return {
          isRapidCycle: true,
          reason: 'Withdrawal requested within 48h of a recent deposit.',
        };
      }
    }
  } catch (err: any) {
    console.warn('[checkRapidWithdrawalCycle Exception]:', err?.message);
  }

  return { isRapidCycle: false };
}

/**
 * Retrieve open / unreviewed fraud signals for the admin panel
 */
export async function getFraudSignals(options?: {
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}): Promise<{ signals: FraudSignal[]; total: number }> {
  try {
    const supabase = getServerSupabase();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let query = supabase.from('fraud_signals').select('*', { count: 'exact' });

    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    if (options?.severity && options.severity !== 'all') {
      query = query.eq('severity', options.severity);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.warn('[Supabase Warn] getFraudSignals:', error.message);
      return { signals: [], total: 0 };
    }

    const signals = (data || []).map(mapDbFraudSignal);
    return { signals, total: count || signals.length };
  } catch (err: any) {
    console.warn('[getFraudSignals Exception]:', err?.message);
    return { signals: [], total: 0 };
  }
}

/**
 * Admin resolves a fraud signal with an audit record
 */
export async function resolveFraudSignal(
  signalId: string | number,
  admin: User,
  action: 'dismissed' | 'action_taken',
  notes?: string
): Promise<void> {
  const supabase = getServerSupabase();
  const dbSignalId = !isNaN(Number(signalId)) ? Number(signalId) : signalId;

  const { data: existing } = await supabase
    .from('fraud_signals')
    .select('*')
    .eq('id', dbSignalId)
    .maybeSingle();

  if (!existing) throw new Error('Fraud signal not found');

  await supabase
    .from('fraud_signals')
    .update({
      status: action,
      reviewed_by: admin.email,
      reviewed_at: new Date().toISOString(),
      resolution_notes: notes || null,
    })
    .eq('id', dbSignalId);

  await createAuditLog({
    action: 'FRAUD_SIGNAL_RESOLVED',
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    targetUserId: existing.user_id ? String(existing.user_id) : undefined,
    reason: notes || `Fraud signal ${existing.signal_type} marked as ${action}`,
    beforeValue: { status: existing.status },
    afterValue: { status: action, resolutionNotes: notes },
  });
}
