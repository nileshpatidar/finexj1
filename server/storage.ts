import { getServerSupabase } from './supabase';

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
  const supabase = getServerSupabase();

  let fileBuffer: Buffer;
  let contentType = 'image/jpeg';

  if (base64OrBuffer.startsWith('data:')) {
    const matches = base64OrBuffer.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      contentType = matches[1];
      fileBuffer = Buffer.from(matches[2], 'base64');
    } else {
      fileBuffer = Buffer.from(base64OrBuffer, 'base64');
    }
  } else if (base64OrBuffer.startsWith('http://') || base64OrBuffer.startsWith('https://')) {
    return base64OrBuffer;
  } else {
    fileBuffer = Buffer.from(base64OrBuffer, 'base64');
  }

  const cleanFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${depositId}_${Date.now()}_${cleanFilename}`;

  // Ensure bucket exists or attempt upload directly
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
}

/**
 * Resolves a storage path or full URL to a publicly accessible URL.
 */
export function getPublicDepositProofUrl(storagePathOrUrl: string): string {
  if (!storagePathOrUrl) return '';
  if (storagePathOrUrl.startsWith('http://') || storagePathOrUrl.startsWith('https://') || storagePathOrUrl.startsWith('data:')) {
    return storagePathOrUrl;
  }
  const supabase = getServerSupabase();
  const { data } = supabase.storage.from(DEPOSIT_PROOFS_BUCKET).getPublicUrl(storagePathOrUrl);
  return data?.publicUrl || storagePathOrUrl;
}

/**
 * Generates a secure, temporary signed URL for authorized Admin or Owner to view proof.
 */
export async function getSignedDepositProofUrl(storagePath: string, expiresInSeconds: number = 3600): Promise<string | null> {
  if (!storagePath) return null;
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('data:')) {
    return storagePath;
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase.storage
    .from(DEPOSIT_PROOFS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.warn('[Supabase Storage Signed URL Error]:', error?.message);
    return null;
  }

  return data.signedUrl;
}
