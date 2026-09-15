import { getServerSupabase, isServerSupabaseReady } from '../supabase';
import { FinancialMessage, MessageSenderType } from '../types';

const devFinancialMessages: FinancialMessage[] = [];

export function mapDbFinancialMessage(m: any): FinancialMessage {
  return {
    id: String(m.id),
    userId: String(m.user_id),
    depositId: m.deposit_id !== null && m.deposit_id !== undefined ? String(m.deposit_id) : undefined,
    withdrawalId: m.withdrawal_id !== null && m.withdrawal_id !== undefined ? String(m.withdrawal_id) : undefined,
    senderType: (m.sender_type || 'user') as MessageSenderType,
    senderId: String(m.sender_id),
    senderName: m.sender_name || undefined,
    message: String(m.message || ''),
    isInternal: Boolean(m.is_internal),
    createdAt: m.created_at || new Date().toISOString(),
    readAt: m.read_at || undefined,
  };
}

export interface GetFinancialMessagesFilter {
  depositId?: string;
  withdrawalId?: string;
  userId?: string;
  includeInternal?: boolean;
}

export async function getFinancialMessages(
  filter: GetFinancialMessagesFilter
): Promise<FinancialMessage[]> {
  const { depositId, withdrawalId, userId, includeInternal = false } = filter;

  if (!isServerSupabaseReady()) {
    let list = [...devFinancialMessages];
    if (depositId) {
      list = list.filter(m => String(m.depositId) === String(depositId));
    }
    if (withdrawalId) {
      list = list.filter(m => String(m.withdrawalId) === String(withdrawalId));
    }
    if (userId) {
      list = list.filter(m => String(m.userId) === String(userId));
    }
    if (!includeInternal) {
      list = list.filter(m => !m.isInternal);
    }
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const supabase = getServerSupabase();
  let query = supabase.from('financial_messages').select('*');

  if (depositId) {
    if (!isNaN(Number(depositId))) {
      query = query.or(`deposit_id.eq.${depositId},deposit_id.eq.${Number(depositId)}`);
    } else {
      query = query.eq('deposit_id', depositId);
    }
  }

  if (withdrawalId) {
    if (!isNaN(Number(withdrawalId))) {
      query = query.or(`withdrawal_id.eq.${withdrawalId},withdrawal_id.eq.${Number(withdrawalId)}`);
    } else {
      query = query.eq('withdrawal_id', withdrawalId);
    }
  }

  if (userId) {
    if (!isNaN(Number(userId))) {
      query = query.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
    } else {
      query = query.eq('user_id', userId);
    }
  }

  if (!includeInternal) {
    query = query.eq('is_internal', false);
  }

  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) {
    console.error('[Supabase Error] getFinancialMessages:', error.message);
    // Fallback to in-memory store in case table is not yet provisioned
    let fallback = [...devFinancialMessages];
    if (depositId) fallback = fallback.filter(m => String(m.depositId) === String(depositId));
    if (withdrawalId) fallback = fallback.filter(m => String(m.withdrawalId) === String(withdrawalId));
    if (userId) fallback = fallback.filter(m => String(m.userId) === String(userId));
    if (!includeInternal) fallback = fallback.filter(m => !m.isInternal);
    return fallback;
  }

  return (data || []).map(mapDbFinancialMessage);
}

export interface CreateFinancialMessageInput {
  userId: string;
  depositId?: string;
  withdrawalId?: string;
  senderType: MessageSenderType;
  senderId: string;
  senderName?: string;
  message: string;
  isInternal?: boolean;
}

export async function createFinancialMessage(
  input: CreateFinancialMessageInput
): Promise<FinancialMessage> {
  const cleanMessage = (input.message || '').trim();
  if (!cleanMessage) {
    throw new Error('Message body cannot be empty.');
  }
  if (cleanMessage.length > 2000) {
    throw new Error('Message body exceeds maximum limit of 2000 characters.');
  }

  const isInternal = Boolean(input.isInternal);

  if (!isServerSupabaseReady()) {
    const created: FinancialMessage = {
      id: String(Date.now() + Math.floor(Math.random() * 1000)),
      userId: String(input.userId),
      depositId: input.depositId ? String(input.depositId) : undefined,
      withdrawalId: input.withdrawalId ? String(input.withdrawalId) : undefined,
      senderType: input.senderType,
      senderId: String(input.senderId),
      senderName: input.senderName,
      message: cleanMessage,
      isInternal,
      createdAt: new Date().toISOString(),
    };
    devFinancialMessages.push(created);
    return created;
  }

  const supabase = getServerSupabase();
  const payload: any = {
    user_id: !isNaN(Number(input.userId)) ? Number(input.userId) : input.userId,
    sender_type: input.senderType,
    sender_id: String(input.senderId),
    sender_name: input.senderName || null,
    message: cleanMessage,
    is_internal: isInternal,
    created_at: new Date().toISOString(),
  };

  if (input.depositId) {
    payload.deposit_id = !isNaN(Number(input.depositId)) ? Number(input.depositId) : input.depositId;
  }
  if (input.withdrawalId) {
    payload.withdrawal_id = !isNaN(Number(input.withdrawalId)) ? Number(input.withdrawalId) : input.withdrawalId;
  }

  const { data, error } = await supabase
    .from('financial_messages')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Supabase Error] createFinancialMessage:', error.message);
    // Fallback in case table not yet created
    const fallback: FinancialMessage = {
      id: String(Date.now()),
      userId: String(input.userId),
      depositId: input.depositId,
      withdrawalId: input.withdrawalId,
      senderType: input.senderType,
      senderId: String(input.senderId),
      senderName: input.senderName,
      message: cleanMessage,
      isInternal,
      createdAt: new Date().toISOString(),
    };
    devFinancialMessages.push(fallback);
    return fallback;
  }

  return mapDbFinancialMessage(data);
}

export async function markFinancialMessagesRead(params: {
  depositId?: string;
  withdrawalId?: string;
  readerUserId: string;
  readerRole: 'user' | 'admin';
}): Promise<number> {
  const { depositId, withdrawalId, readerRole } = params;
  const now = new Date().toISOString();

  if (!isServerSupabaseReady()) {
    let updatedCount = 0;
    for (const m of devFinancialMessages) {
      const matchDep = depositId && String(m.depositId) === String(depositId);
      const matchWd = withdrawalId && String(m.withdrawalId) === String(withdrawalId);
      if ((matchDep || matchWd) && !m.readAt) {
        // Only mark if reader is different sender
        if ((readerRole === 'user' && m.senderType === 'admin') || (readerRole === 'admin' && m.senderType === 'user')) {
          m.readAt = now;
          updatedCount++;
        }
      }
    }
    return updatedCount;
  }

  const supabase = getServerSupabase();
  let query = supabase.from('financial_messages').update({ read_at: now }).is('read_at', null);

  if (depositId) {
    query = query.eq('deposit_id', depositId);
  }
  if (withdrawalId) {
    query = query.eq('withdrawal_id', withdrawalId);
  }

  if (readerRole === 'user') {
    query = query.eq('sender_type', 'admin');
  } else {
    query = query.eq('sender_type', 'user');
  }

  const { error } = await query;
  if (error) {
    console.error('[Supabase Error] markFinancialMessagesRead:', error.message);
    return 0;
  }
  return 1;
}
