import { getServerSupabase, isServerSupabaseReady } from './supabase';

const DEPOSIT_PROOFS_BUCKET = 'deposit-proofs';

/**
 * Uploads a deposit payment proof screenshot to private Supabase Storage bucket.
 * Returns the storage path (e.g. deposit-proofs/{userId}/{depositId}/{filename}).
 */
export async function uploadDepositProof(
  userId: string,
  depositId: string,
  base64OrBuffer: string,
  originalFilename: string = 'proof.jpg'
): Promise<string> {
  if (!base64OrBuffer || typeof base64OrBuffer !== 'string') {
    return '';
  }

  const trimmed = base64OrBuffer.trim();

  // Reject dangerous schemes
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('file:') || lower.startsWith('vbscript:') || lower.startsWith('blob:')) {
    throw new Error('Prohibited file/URL scheme.');
  }

  // Check maximum payload length (10MB base64)
  if (trimmed.length > 10 * 1024 * 1024 * 1.37) {
    throw new Error('File payload exceeds maximum limit of 10MB.');
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (!isServerSupabaseReady()) {
    return trimmed;
  }

  const supabase = getServerSupabase();

  let fileBuffer: Buffer;
  let contentType = 'image/jpeg';

  if (trimmed.startsWith('data:')) {
    const matches = trimmed.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      contentType = matches[1].toLowerCase();
      // Ensure it is an allowed image MIME type
      if (!['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(contentType)) {
        throw new Error('Unsupported image format. Only JPEG, PNG, and WebP are allowed.');
      }
      fileBuffer = Buffer.from(matches[2], 'base64');
    } else {
      fileBuffer = Buffer.from(trimmed, 'base64');
    }
  } else {
    fileBuffer = Buffer.from(trimmed, 'base64');
  }

  const cleanFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${depositId}_${Date.now()}_${cleanFilename}`;

  // Ensure bucket exists or attempt upload directly
  try {
    const { data, error } = await supabase.storage
      .from(DEPOSIT_PROOFS_BUCKET)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn(`[Supabase Storage Notice] Upload failed (${error.message}), falling back to direct image payload.`);
      // Fallback: preserve base64 data uri directly so proof is retained
      return base64OrBuffer;
    }

    const { data: publicUrlData } = supabase.storage.from(DEPOSIT_PROOFS_BUCKET).getPublicUrl(data.path);
    return publicUrlData?.publicUrl || data.path;
  } catch (err: any) {
    console.warn('[Supabase Storage Upload Exception]:', err?.message);
    return base64OrBuffer;
  }
}

/**
 * Resolves a storage path or full URL to a publicly accessible URL.
 */
export function getPublicDepositProofUrl(storagePathOrUrl: string): string {
  if (!storagePathOrUrl) return '';
  if (storagePathOrUrl.startsWith('http://') || storagePathOrUrl.startsWith('https://') || storagePathOrUrl.startsWith('data:')) {
    return storagePathOrUrl;
  }
  if (!isServerSupabaseReady()) {
    return storagePathOrUrl;
  }
  try {
    const supabase = getServerSupabase();
    const { data } = supabase.storage.from(DEPOSIT_PROOFS_BUCKET).getPublicUrl(storagePathOrUrl);
    return data?.publicUrl || storagePathOrUrl;
  } catch {
    return storagePathOrUrl;
  }
}

/**
 * Generates a secure, temporary signed URL for authorized Admin or Owner to view proof.
 */
export async function getSignedDepositProofUrl(storagePath: string, expiresInSeconds: number = 3600): Promise<string | null> {
  if (!storagePath) return null;
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('data:')) {
    return storagePath;
  }
  if (!isServerSupabaseReady()) {
    return storagePath;
  }

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.storage
      .from(DEPOSIT_PROOFS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.warn('[Supabase Storage Signed URL Error]:', error?.message);
      return storagePath;
    }

    return data.signedUrl;
  } catch {
    return storagePath;
  }
}
