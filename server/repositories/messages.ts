import { getServerSupabase } from '../supabase';

export interface AdminMessage {
  id: string;
  userId: string;
  adminId?: string;
  depositId?: string;
  withdrawalId?: string;
  messageType: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export async function getAdminMessagesForUser(userId: string): Promise<AdminMessage[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('admin_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[Supabase Warn] getAdminMessagesForUser:', error.message);
    return [];
  }

  return (data || []).map((m: any) => ({
    id: String(m.id),
    userId: String(m.user_id),
    adminId: m.admin_id ? String(m.admin_id) : undefined,
    depositId: m.deposit_id ? String(m.deposit_id) : undefined,
    withdrawalId: m.withdrawal_id ? String(m.withdrawal_id) : undefined,
    messageType: m.message_type || 'General Message',
    subject: m.subject || 'Admin Notification',
    body: m.body || m.message || '',
    isRead: Boolean(m.is_read || m.read),
    createdAt: m.created_at || new Date().toISOString(),
  }));
}

export async function createAdminMessage(msg: Partial<AdminMessage>): Promise<AdminMessage> {
  const supabase = getServerSupabase();
  const payload: any = {
    user_id: msg.userId,
    admin_id: msg.adminId || null,
    deposit_id: msg.depositId || null,
    withdrawal_id: msg.withdrawalId || null,
    message_type: msg.messageType || 'General Message',
    subject: msg.subject || 'Notification from FINEXJ Administration',
    body: msg.body || '',
    is_read: false,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('admin_messages')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Supabase Error] createAdminMessage:', error.message);
    throw new Error(`Failed to send message: ${error.message}`);
  }

  return {
    id: String(data.id),
    userId: String(data.user_id),
    adminId: data.admin_id ? String(data.admin_id) : undefined,
    depositId: data.deposit_id ? String(data.deposit_id) : undefined,
    withdrawalId: data.withdrawal_id ? String(data.withdrawal_id) : undefined,
    messageType: data.message_type,
    subject: data.subject,
    body: data.body,
    isRead: Boolean(data.is_read),
    createdAt: data.created_at,
  };
}

export async function markMessageRead(messageId: string, userId: string): Promise<boolean> {
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from('admin_messages')
    .update({ is_read: true })
    .eq('id', messageId)
    .eq('user_id', userId);

  if (error) {
    console.error('[Supabase Error] markMessageRead:', error.message);
    return false;
  }
  return true;
}

